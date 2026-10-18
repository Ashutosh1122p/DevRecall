
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { FalkorDB } from "falkordb";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

let db;
let graph;

async function startServer() {
  console.log("Connecting to FalkorDB Cloud...");

  let connectOptions = {};

  if (process.env.FALKORDB_URL) {
    let url = process.env.FALKORDB_URL;
    try {
      const parsedUrl = new URL(url.replace(/^falkor(s)?:/, "http:"));
      const username = process.env.FALKORDB_USERNAME || parsedUrl.username;
      const password = process.env.FALKORDB_PASSWORD || parsedUrl.password;
      const protocol = url.startsWith("falkors:") ? "falkors:" : "falkor:";

      if (username && password) {
        url = `${protocol}//${encodeURIComponent(username)}:${encodeURIComponent(password)}@${parsedUrl.host}`;
      }
    } catch {
      // Keep original url
    }

    connectOptions = {
      url,
      username: process.env.FALKORDB_USERNAME,
      password: process.env.FALKORDB_PASSWORD,
      socket: {
        connectTimeout: 10000,
      },
    };
  } else {
    connectOptions = {
      host: process.env.FALKORDB_HOST,
      port: process.env.FALKORDB_PORT ? Number(process.env.FALKORDB_PORT) : undefined,
      username: process.env.FALKORDB_USERNAME,
      password: process.env.FALKORDB_PASSWORD,
      socket: {
        connectTimeout: 10000,
      },
    };
  }

  db = await FalkorDB.connect(connectOptions);
  db.on("error", (err) => {
    console.warn("FalkorDB background event:", err.message);
  });

  const graphName = process.env.FALKORDB_GRAPH || "devrecall";
  graph = db.selectGraph(graphName);

  console.log(`FalkorDB connected successfully! Selected graph: "${graphName}"`);

  app.get("/", (req, res) => {
    res.json({
      message: "DevRecall backend is running!",
      database: "FalkorDB Cloud connected",
      graph: graphName
    });
  });

  app.get("/api/graph", async (req, res) => {
    try {
      const nodesRes = await graph.query(`
        MATCH (n)
        RETURN id(n) AS id, labels(n) AS labels, properties(n) AS props
      `);

      const edgesRes = await graph.query(`
        MATCH (a)-[r]->(b)
        RETURN id(a) AS fromId,
               labels(a) AS fromLabels,
               type(r) AS type,
               id(b) AS toId,
               labels(b) AS toLabels,
               properties(r) AS props
      `);

      let rawNodes = Array.isArray(nodesRes.data) ? nodesRes.data : [];
      let rawEdges = Array.isArray(edgesRes.data) ? edgesRes.data : [];

      // Scope Graph Explorer to one project when requested. Keep other projects
      // and their memories untouched in FalkorDB; only filter this response.
      const requestedProject = typeof req.query.projectName === "string"
        ? req.query.projectName.trim()
        : "";
      if (requestedProject) {
        const projectRow = rawNodes.find((row) =>
          (row.labels || []).includes("Project") &&
          String(row.props?.name || "").toLowerCase() === requestedProject.toLowerCase()
        );
        if (!projectRow) {
          return res.json({ nodes: [], edges: [], stats: { nodeCount: 0, edgeCount: 0, labels: [], relationshipTypes: [] } });
        }
        const byId = new Map(rawNodes.map((row) => [row.id, row]));
        const adjacency = new Map();
        for (const edge of rawEdges) {
          if (!adjacency.has(edge.fromId)) adjacency.set(edge.fromId, []);
          if (!adjacency.has(edge.toId)) adjacency.set(edge.toId, []);
          adjacency.get(edge.fromId).push(edge.toId);
          adjacency.get(edge.toId).push(edge.fromId);
        }
        const keep = new Set([projectRow.id]);
        const queue = [projectRow.id];
        while (queue.length) {
          const current = queue.shift();
          const currentNode = byId.get(current);
          // Person nodes may be shared by multiple projects. Show the assignment
          // edge in this project, but never traverse through a person into another project tree.
          if (current !== projectRow.id && (currentNode?.labels || []).includes("Person")) continue;
          for (const nextId of adjacency.get(current) || []) {
            if (keep.has(nextId)) continue;
            const nextNode = byId.get(nextId);
            // Never traverse into a different project root.
            if ((nextNode?.labels || []).includes("Project")) continue;
            keep.add(nextId);
            queue.push(nextId);
          }
        }
        rawNodes = rawNodes.filter((row) => keep.has(row.id));
        rawEdges = rawEdges.filter((edge) => keep.has(edge.fromId) && keep.has(edge.toId));
      }

      const nodeMap = new Map();
      const labelsSet = new Set();
      const nodes = rawNodes.map((row) => {
        const primaryLabel = row.labels?.[0] || "Entity";
        labelsSet.add(primaryLabel);
        const props = row.props || {};
        const title = props.title || props.name || (primaryLabel === "Session" && props.date ? `Session ${props.date}` : null) || props.task || props.decision || props.summary || `${primaryLabel} #${row.id}`;
        const nodeObj = {
          id: row.id,
          label: primaryLabel,
          labels: row.labels || [primaryLabel],
          title,
          properties: props
        };
        nodeMap.set(row.id, nodeObj);
        return nodeObj;
      });

      const relTypesSet = new Set();
      const edges = rawEdges.map((row, idx) => {
        relTypesSet.add(row.type);
        const fromNode = nodeMap.get(row.fromId);
        const toNode = nodeMap.get(row.toId);
        return {
          id: `edge-${idx}-${row.fromId}-${row.toId}`,
          from: row.fromId,
          to: row.toId,
          type: row.type,
          fromLabel: row.fromLabels?.[0] || fromNode?.label || "",
          toLabel: row.toLabels?.[0] || toNode?.label || "",
          fromTitle: fromNode?.title || `Node #${row.fromId}`,
          toTitle: toNode?.title || `Node #${row.toId}`,
          properties: row.props || {}
        };
      });

      res.json({
        nodes,
        edges,
        stats: {
          nodeCount: nodes.length,
          edgeCount: edges.length,
          labels: Array.from(labelsSet),
          relationshipTypes: Array.from(relTypesSet)
        }
      });
    } catch (error) {
      console.error("Graph explorer error:", error.message);
      res.status(500).json({
        error: "Could not retrieve graph topology",
        details: error.message
      });
    }
  });

  const geminiModel = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  // Gemini free-tier quota is exhausted and the API keeps returning HTTP 429.
  // Once observed, skip further API calls for a cooldown so the app stays usable
  // and does not repeatedly burn the retry budget. Reset after 5 minutes.
  let geminiQuotaExhaustedAt = 0;
  const GEMINI_QUOTA_COOLDOWN_MS = 5 * 60 * 1000;

  function geminiAvailable() {
    if (!process.env.GEMINI_API_KEY) return false;
    if (geminiQuotaExhaustedAt && Date.now() - geminiQuotaExhaustedAt < GEMINI_QUOTA_COOLDOWN_MS) return false;
    return true;
  }

  async function callGeminiAPI(prompt, options = {}) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || !geminiAvailable()) return null;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const body = {
      contents: [{
        role: "user",
        parts: [{ text: prompt }]
      }]
    };

    if (options.systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: options.systemInstruction }]
      };
    }

    if (options.responseMimeType) {
      body.generationConfig = {
        responseMimeType: options.responseMimeType
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr = "";
      try {
        parsedErr = JSON.parse(errText)?.error?.message || errText;
      } catch {
        parsedErr = errText;
      }
      const err = new Error(`Gemini API error (${response.status}): ${parsedErr}`);
      err.httpStatus = response.status;
      err.geminiQuotaExhausted = response.status === 429;
      if (err.geminiQuotaExhausted) {
        geminiQuotaExhaustedAt = Date.now();
        console.warn("Gemini free-tier quota exhausted (HTTP 429). Falling back to template answers for the next 5 minutes.");
      }
      throw err;
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  }

  function extractPersonName(text) {
    const patterns = [
      /(?:assigned to|assigned for)\s+([a-zA-Z]+)/i,
      /(?:for|by)\s+([a-zA-Z]+)/i,
      /([a-zA-Z]+)'s\s+(?:bug|bugs|task|tasks|work|issue|issues)/i,
      /(?:is|does)\s+([a-zA-Z]+)\s+(?:working|have|assigned)/i
    ];

    for (const regex of patterns) {
      const match = text.match(regex);
      if (match && match[1]) {
        const candidate = match[1].trim();
        const stopWords = ["the", "a", "an", "this", "that", "any", "which", "what", "who", "all", "me", "us", "him", "her", "them"];
        if (!stopWords.includes(candidate.toLowerCase())) {
          return candidate;
        }
      }
    }
    return null;
  }

  function detectIntentRuleBased(question) {
    const q = question.toLowerCase().trim();

    // Default to pending tasks if question is blank
    if (!q) {
      return { type: "pending_tasks" };
    }

    // Copilot: session questions
    if (q.includes("last session") || q.includes("previous session") || q.includes("earlier session") || q.includes("recent session")) {
      if (q.includes("pending") || q.includes("task") || q.includes("unfinished") || q.includes("work") || q.includes("todo") || q.includes("remain")) {
        return { type: "session_pending_tasks" };
      }
      return { type: "last_session" };
    }

    // Copilot: next action / recommendation based on context
    if ((q.includes("next") || q.includes("should i") || q.includes("should we") || q.includes("recommend") || q.includes("priority") || q.includes("prioritize") || q.includes("what to do")) &&
        (q.includes("work") || q.includes("do") || q.includes("task") || q.includes("action") || q.includes("focus") || q.includes("context") || q.includes("project"))) {
      return { type: "next_action" };
    }

    // Copilot: decisions affecting bug
    if ((q.includes("decision") || q.includes("decide")) && (q.includes("bug") || q.includes("issue"))) {
      return { type: "decisions_affecting_bug" };
    }

    // Copilot: decisions and unfinished tasks
    if ((q.includes("decision") || q.includes("decide")) && (q.includes("task") || q.includes("unfinished") || q.includes("pending") || q.includes("remain"))) {
      return { type: "decisions_and_tasks" };
    }

    // General session questions
    if (q.includes("session")) {
      if (q.includes("pending") || q.includes("task") || q.includes("unfinished") || q.includes("remain")) {
        return { type: "session_pending_tasks" };
      }
      return { type: "last_session" };
    }

    // Bug assignment intent
    if (q.includes("bug") || q.includes("issue") || (q.includes("assign") && !q.includes("decision"))) {
      const person = extractPersonName(question);
      return { type: "bug_assignment", person };
    }

    // Decisions intent
    if (q.includes("decision") || q.includes("decide") || q.includes("decided") || q.includes("agreed") || q.includes("conclusion")) {
      return { type: "decisions" };
    }

    // Pending tasks / work intent
    if (q.includes("pending") || q.includes("work") || q.includes("task") || q.includes("todo") || q.includes("to-do") || q.includes("remaining")) {
      return { type: "pending_tasks" };
    }

    return { type: "unknown" };
  }

  async function interpretQuestion(question) {
    if (!question.trim()) {
      return { type: "pending_tasks", person: null, llmUsed: false };
    }

    // Fast-path: if clear rule-based match exists, save quota for answer generation
    const ruleResult = detectIntentRuleBased(question);
    if (ruleResult.type !== "unknown") {
      return { ...ruleResult, llmUsed: false };
    }

    // For nuanced/unrecognized natural-language queries, ask Gemini
    if (geminiAvailable()) {
      try {
        const prompt = `You are a query interpreter for DevRecall's project memory graph.
The graph contains:
- Sessions with date and summary
- Tasks with status (e.g. pending, completed)
- Bugs with titles, assigned to Person nodes (e.g. Rahul)
- Decisions with summaries and dates

Analyze this user question: "${question}"
Classify the intent into one of:
- "last_session" (asking what happened in previous or last session)
- "session_pending_tasks" (asking what is pending from previous or last session)
- "decisions_affecting_bug" (asking which decisions relate to or affect a bug)
- "decisions_and_tasks" (asking about decisions and related unfinished/pending tasks)
- "next_action" (asking what to work on next, priority, or recommendations based on project context)
- "pending_tasks" (asking about pending work, tasks, to-dos)
- "bug_assignment" (asking about bugs or issues assigned to someone or general bugs)
- "decisions" (asking about decisions made)
- "other" (none of the above)

If a specific person's name is mentioned in relation to assignments (e.g. "Rahul"), extract the name.
Respond ONLY with a valid JSON object matching this schema:
{"intent": "last_session" | "session_pending_tasks" | "decisions_affecting_bug" | "decisions_and_tasks" | "next_action" | "pending_tasks" | "bug_assignment" | "decisions" | "other", "person": string | null}`;

        const raw = await callGeminiAPI(prompt, { responseMimeType: "application/json" });
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.intent) {
            return {
              type: parsed.intent === "other" ? "unknown" : parsed.intent,
              person: parsed.person || null,
              llmUsed: true
            };
          }
        }
      } catch (err) {
        console.warn("LLM question interpretation fallback:", err.message);
      }
    }

    return { ...ruleResult, llmUsed: false };
  }

  async function generateGroundedAnswer(question, intentType, memories, fallbackAnswer, fallbackFacts, fallbackSuggestion) {
    if (intentType === "unknown" || !memories || memories.length === 0) {
      return {
        answer: fallbackAnswer || "No matching record exists in the project memory graph.",
        recordedFacts: fallbackFacts || "No matching record exists in the project memory graph.",
        suggestedAction: null,
        llmUsed: false,
        error: null
      };
    }

    if (process.env.GEMINI_API_KEY && geminiAvailable()) {
      try {
        const systemInstruction = `You are DevRecall's Session-Aware Project Copilot.
You answer questions using ONLY the provided FalkorDB graph evidence.

STRICT EVIDENCE-GROUNDING RULES:
1. Base all factual claims strictly on the facts in the Retrieved Evidence.
2. If evidence is missing, conflicting, or does not contain the answer, explicitly state that no matching record exists in the project memory graph. Do not assume or fabricate facts.
3. RELEVANT EVIDENCE ONLY: Never state or imply that a decision affects or guides a bug simply because both belong to the same project. Only claim a direct relationship if an explicit edge connects them in the graph. If no direct connection exists, state clearly that no recorded decisions directly affect the bug, and exclude unrelated project decisions from bug answers.
4. SESSION-LINKED VS UNLINKED TASKS: Clearly distinguish tasks mentioned in a previous session from project-level tasks lacking a session relationship.
5. NEXT-ACTION RECOMMENDATIONS: Base recommendations strictly on explicit task status, session context, and relevant bug information. Label recommendations as suggestions, not recorded facts. Do not claim a task resolves a bug unless the graph or recorded session explicitly supports that connection. If relevance cannot be established, state that the graph lacks sufficient evidence to choose confidently.
6. CLEARLY DISTINGUISH RECORDED FACTS FROM SUGGESTIONS:
   - "recordedFacts": Summarize ONLY what is explicitly recorded in FalkorDB (dates, summaries, statuses, assignments, decisions).
   - "suggestedAction": Provide an actionable recommendation explicitly labelled as a suggestion based on the retrieved evidence. If the user only asked a factual question without asking for advice, set this to null.
7. "answer": Concise 1-3 sentence direct answer combining the core facts and any recommendation.
8. Respond ONLY with a valid JSON object matching this schema:
{"recordedFacts": string, "suggestedAction": string | null, "answer": string}`;

        const userPrompt = `User Question: "${question || 'What work is still pending?'}"
Retrieved Evidence: ${JSON.stringify(memories)}

Provide the JSON response:`;

        const raw = await callGeminiAPI(userPrompt, {
          systemInstruction,
          responseMimeType: "application/json"
        });

        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.answer || parsed.recordedFacts)) {
            return {
              answer: parsed.answer || parsed.recordedFacts,
              recordedFacts: parsed.recordedFacts || null,
              suggestedAction: parsed.suggestedAction || null,
              llmUsed: true,
              error: null
            };
          }
        }
      } catch (err) {
        console.warn("LLM answer generation fallback to template:", err.message);
        return {
          answer: fallbackAnswer,
          recordedFacts: fallbackFacts || fallbackAnswer,
          suggestedAction: fallbackSuggestion || null,
          llmUsed: false,
          error: err.geminiQuotaExhausted
            ? "Gemini free-tier quota exhausted (HTTP 429). Using deterministic graph-grounded template."
            : err.message
        };
      }
    }

    return {
      answer: fallbackAnswer,
      recordedFacts: fallbackFacts || fallbackAnswer,
      suggestedAction: fallbackSuggestion || null,
      llmUsed: false,
      error: null
    };
  }

  function parseSessionDate(dateVal) {
    if (dateVal === null || dateVal === undefined) return null;
    if (typeof dateVal === "number" && !isNaN(dateVal) && dateVal > 0) return dateVal;
    const str = String(dateVal).trim();
    if (!str || str.toLowerCase() === "null" || str.toLowerCase() === "undefined") return null;
    if (/^\d{10,13}$/.test(str)) {
      const num = Number(str);
      if (!isNaN(num) && num > 0) return num;
    }
    const ts = Date.parse(str);
    return isNaN(ts) ? null : ts;
  }

  async function getSessions(projectName = null) {
    try {
      const res = projectName
        ? await graph.query(`
            MATCH (p:Project {name: $projectName})-[:HAS_TASK]->(t:Task)<-[:MENTIONED]-(s:Session)
            RETURN DISTINCT id(s) AS id, s.date AS date, s.summary AS summary
          `, { params: { projectName } })
        : await graph.query(`
            MATCH (s:Session)
            RETURN id(s) AS id, s.date AS date, s.summary AS summary
          `);
      const data = Array.isArray(res.data) ? res.data : [];
      return data.slice().sort((a, b) => {
        const tA = parseSessionDate(a.date);
        const tB = parseSessionDate(b.date);
        if (tA !== null && tB !== null) return tB - tA;
        if (tA !== null && tB === null) return -1;
        if (tA === null && tB !== null) return 1;
        return (b.id ?? 0) - (a.id ?? 0);
      });
    } catch (err) {
      console.error("getSessions query error:", err.message);
      return [];
    }
  }

  async function getSessionMentions(sessionId = null) {
    try {
      const query = sessionId !== null
        ? `MATCH (s:Session)-[r:MENTIONED]->(t:Task) WHERE id(s) = $sessionId RETURN id(s) AS sessionId, s.date AS sessionDate, s.summary AS sessionSummary, id(t) AS taskId, COALESCE(t.title, t.task, '') AS taskTitle, COALESCE(t.status, 'pending') AS taskStatus, type(r) AS rel`
        : `MATCH (s:Session)-[r:MENTIONED]->(t:Task) RETURN id(s) AS sessionId, s.date AS sessionDate, s.summary AS sessionSummary, id(t) AS taskId, COALESCE(t.title, t.task, '') AS taskTitle, COALESCE(t.status, 'pending') AS taskStatus, type(r) AS rel`;
      const res = await graph.query(query, sessionId !== null ? { params: { sessionId } } : {});
      return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
      console.error("getSessionMentions query error:", err.message);
      return [];
    }
  }

  async function getPendingTasks(projectName = null) {
    try {
      const tasksRes = await graph.query(`
        MATCH (t:Task)
        WHERE toLower(toString(t.status)) = 'pending'
        RETURN id(t) AS id,
               COALESCE(t.title, t.task, '') AS title,
               COALESCE(t.status, 'pending') AS status,
               t.summary AS summary,
               t.date AS date
      `);
      const tasks = Array.isArray(tasksRes.data) ? tasksRes.data : [];
      if (tasks.length === 0) return [];

      const [projRes, sessRes] = await Promise.all([
        graph.query(`
          MATCH (p:Project)-[r:HAS_TASK]->(t:Task)
          WHERE toLower(toString(t.status)) = 'pending'
          RETURN id(t) AS taskId, p.name AS project, type(r) AS projectRel
        `),
        graph.query(`
          MATCH (s:Session)-[r:MENTIONED]->(t:Task)
          WHERE toLower(toString(t.status)) = 'pending'
          RETURN id(t) AS taskId, s.date AS sessionDate, s.summary AS sessionSummary, type(r) AS sessionRel
        `)
      ]);

      const projMap = new Map();
      (Array.isArray(projRes.data) ? projRes.data : []).forEach((row) => {
        if (!projMap.has(row.taskId)) {
          projMap.set(row.taskId, { project: row.project, projectRel: row.projectRel });
        }
      });

      const sessMap = new Map();
      (Array.isArray(sessRes.data) ? sessRes.data : []).forEach((row) => {
        if (!sessMap.has(row.taskId)) {
          sessMap.set(row.taskId, {
            sessionDate: row.sessionDate,
            sessionSummary: row.sessionSummary,
            sessionRel: row.sessionRel
          });
        }
      });

      const filteredTasks = projectName
        ? tasks.filter((t) => {
            const proj = projMap.get(t.id);
            return proj && proj.project === projectName;
          })
        : tasks;

      return filteredTasks.map((t) => {
        const proj = projMap.get(t.id) || {};
        const sess = sessMap.get(t.id) || {};
        return {
          id: t.id,
          title: t.title,
          status: t.status,
          summary: t.summary,
          date: t.date,
          project: proj.project || null,
          projectRel: proj.projectRel || null,
          sessionDate: sess.sessionDate || null,
          sessionSummary: sess.sessionSummary || null,
          sessionRel: sess.sessionRel || null
        };
      });
    } catch (err) {
      console.error("getPendingTasks query error:", err.message);
      return [];
    }
  }

  async function getBugs(filterPerson = null, projectName = null) {
    try {
      const bugsRes = await graph.query(`
        MATCH (b:Bug)
        RETURN id(b) AS id,
               COALESCE(b.title, b.name, '') AS title,
               COALESCE(b.status, 'assigned') AS status
      `);
      const bugs = Array.isArray(bugsRes.data) ? bugsRes.data : [];
      if (bugs.length === 0) return [];

      const [persRes, projRes] = await Promise.all([
        graph.query(`
          MATCH (b:Bug)-[r:ASSIGNED_TO]->(pers:Person)
          RETURN id(b) AS bugId, pers.name AS assignee, type(r) AS assignRel
        `),
        graph.query(`
          MATCH (p:Project)-[r:HAS_BUG]->(b:Bug)
          RETURN id(b) AS bugId, p.name AS project, type(r) AS bugRel
        `)
      ]);

      const persMap = new Map();
      (Array.isArray(persRes.data) ? persRes.data : []).forEach((row) => {
        if (!persMap.has(row.bugId)) {
          persMap.set(row.bugId, { assignee: row.assignee, assignRel: row.assignRel });
        }
      });

      const projMap = new Map();
      (Array.isArray(projRes.data) ? projRes.data : []).forEach((row) => {
        if (!projMap.has(row.bugId)) {
          projMap.set(row.bugId, { project: row.project, bugRel: row.bugRel });
        }
      });

      const combined = bugs.map((b) => {
        const pers = persMap.get(b.id) || {};
        const proj = projMap.get(b.id) || {};
        return {
          id: b.id,
          title: b.title,
          status: b.status,
          assignee: pers.assignee || null,
          assignRel: pers.assignRel || null,
          project: proj.project || null,
          bugRel: proj.bugRel || null
        };
      }).filter((b) => !projectName || b.project === projectName);

      if (filterPerson) {
        const fp = filterPerson.toLowerCase().trim();
        return combined.filter((b) => (b.assignee || "").toLowerCase().trim() === fp);
      }
      return combined;
    } catch (err) {
      console.error("getBugs query error:", err.message);
      return [];
    }
  }

  async function getDecisions(projectName = null) {
    try {
      const decRes = await graph.query(`
        MATCH (d:Decision)
        RETURN id(d) AS id,
               COALESCE(d.title, d.decision, '') AS title,
               d.summary AS summary,
               d.date AS date,
               COALESCE(d.status, 'recorded') AS status
      `);
      const decisions = Array.isArray(decRes.data) ? decRes.data : [];
      if (decisions.length === 0) return [];

      const [projRes, sessRes] = await Promise.all([
        graph.query(`
          MATCH (p:Project)-[r:HAS_DECISION]->(d:Decision)
          RETURN id(d) AS decisionId, p.name AS project, type(r) AS projectRel
        `),
        graph.query(`
          MATCH (s:Session)-[r:RECORDED]->(d:Decision)
          RETURN id(d) AS decisionId, s.date AS sessionDate, s.summary AS sessionSummary, type(r) AS sessionRel
        `)
      ]);

      const projMap = new Map();
      (Array.isArray(projRes.data) ? projRes.data : []).forEach((row) => {
        if (!projMap.has(row.decisionId)) {
          projMap.set(row.decisionId, { project: row.project, projectRel: row.projectRel });
        }
      });

      const sessMap = new Map();
      (Array.isArray(sessRes.data) ? sessRes.data : []).forEach((row) => {
        if (!sessMap.has(row.decisionId)) {
          sessMap.set(row.decisionId, {
            sessionDate: row.sessionDate,
            sessionSummary: row.sessionSummary,
            sessionRel: row.sessionRel
          });
        }
      });

      const filteredDecisions = projectName
        ? decisions.filter((d) => {
            const proj = projMap.get(d.id);
            return proj && proj.project === projectName;
          })
        : decisions;

      return filteredDecisions.map((d) => {
        const proj = projMap.get(d.id) || {};
        const sess = sessMap.get(d.id) || {};
        return {
          id: d.id,
          title: d.title,
          summary: d.summary,
          date: d.date,
          status: d.status,
          project: proj.project || null,
          projectRel: proj.projectRel || null,
          sessionDate: sess.sessionDate || null,
          sessionSummary: sess.sessionSummary || null,
          sessionRel: sess.sessionRel || null
        };
      });
    } catch (err) {
      console.error("getDecisions query error:", err.message);
      return [];
    }
  }

  async function checkDirectBugDecisionLink() {
    try {
      const res = await graph.query(`
        MATCH (b:Bug)
        MATCH (d:Decision)
        MATCH (b)-[r]-(d)
        RETURN b.title AS bug, d.title AS decision, type(r) AS rel
      `);
      return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
      console.error("checkDirectBugDecisionLink error:", err.message);
      return [];
    }
  }

  async function handleRecall(req, res) {
    const rawQuestion = req.query.q || req.query.question || req.body?.question || "";
    const question = typeof rawQuestion === "string" ? rawQuestion.trim() : "";
    const projectName = (typeof req.query.projectName === "string" ? req.query.projectName.trim() : (typeof req.body?.projectName === "string" ? req.body.projectName.trim() : "")) || null;

    try {
      const intent = await interpretQuestion(question);
      let fallbackAnswer = "";
      let fallbackFacts = "";
      let fallbackSuggestion = null;
      let memories = [];
      const evidenceTrail = [];
      const uniqueTrailKeys = new Set();

      function addEvidenceHop(from, relationship, to) {
        const key = `${from.label}:${from.title}->${relationship}->${to.label}:${to.title}`;
        if (!uniqueTrailKeys.has(key)) {
          uniqueTrailKeys.add(key);
          evidenceTrail.push({ from, relationship, to });
        }
      }

      if (intent.type === "last_session") {
        const sessions = await getSessions(projectName);
        if (sessions.length > 0) {
          const latestSession = sessions[0];
          const sessionId = latestSession.id;
          const sessionDate = latestSession.date;
          const sessionSummary = latestSession.summary || "Recorded developer session";
          const hasValidDate = parseSessionDate(sessionDate) !== null;

          const sessionMentions = await getSessionMentions(sessionId);

          memories.push({
            type: "Session",
            title: hasValidDate ? `Session ${sessionDate}` : `Session #${sessionId}`,
            summary: sessionSummary,
            date: hasValidDate ? sessionDate : ""
          });

          const sessionTaskTitles = [];
          sessionMentions.forEach((m) => {
            sessionTaskTitles.push(`'${m.taskTitle}' (${m.taskStatus})`);
            addEvidenceHop(
              { label: "Session", title: hasValidDate ? `Session ${sessionDate}` : `Session #${sessionId}`, summary: sessionSummary },
              m.rel || "MENTIONED",
              { label: "Task", title: m.taskTitle, status: m.taskStatus }
            );
            memories.push({
              type: "Task",
              title: m.taskTitle,
              task: m.taskTitle,
              status: m.taskStatus,
              summary: `Mentioned in session ${hasValidDate ? sessionDate : `#${sessionId}`}`,
              date: hasValidDate ? sessionDate : "",
              sessionLinked: true
            });
          });

          fallbackFacts = hasValidDate
            ? `In our last session (${sessionDate}): "${sessionSummary}". Mentioned task: ${sessionTaskTitles.join(", ") || "None"}.`
            : `In recorded session (#${sessionId}): "${sessionSummary}". Mentioned task: ${sessionTaskTitles.join(", ") || "None"}. Note: Session record has no valid date timestamp.`;

          const pendingSessionTasks = sessionMentions.filter((m) => m.taskStatus === "pending");
          fallbackSuggestion = pendingSessionTasks.length > 0
            ? `Suggestion: Follow up on '${pendingSessionTasks[0].taskTitle}', which was identified in this session and remains pending.`
            : null;

          fallbackAnswer = fallbackFacts + (fallbackSuggestion ? " " + fallbackSuggestion : "");
        } else {
          fallbackFacts = "No session records found in the project memory graph.";
          fallbackAnswer = fallbackFacts;
        }
      } else if (intent.type === "session_pending_tasks") {
        const pendingTasks = await getPendingTasks(projectName);
        const sessionLinked = pendingTasks.filter((t) => Boolean(t.sessionRel));
        const unlinked = pendingTasks.filter((t) => !t.sessionRel);

        if (pendingTasks.length > 0) {
          sessionLinked.forEach((t) => {
            if (t.project) {
              addEvidenceHop(
                { label: "Project", title: t.project },
                t.projectRel || "HAS_TASK",
                { label: "Task", title: t.title, status: t.status }
              );
            }
            addEvidenceHop(
              { label: "Session", title: t.sessionDate ? `Session ${t.sessionDate}` : "Previous Session", summary: t.sessionSummary || "" },
              t.sessionRel || "MENTIONED",
              { label: "Task", title: t.title, status: t.status }
            );
            memories.push({
              type: "Task",
              title: t.title,
              task: t.title,
              status: t.status,
              summary: `Mentioned in session ${t.sessionDate || ""}: ${t.sessionSummary || ""}`,
              date: t.sessionDate || "",
              sessionLinked: true,
              project: t.project || ""
            });
          });

          unlinked.forEach((t) => {
            if (t.project) {
              addEvidenceHop(
                { label: "Project", title: t.project },
                t.projectRel || "HAS_TASK",
                { label: "Task", title: t.title, status: t.status }
              );
            }
            memories.push({
              type: "Task",
              title: t.title,
              task: t.title,
              status: t.status,
              summary: t.summary || "Project-level pending task (unlinked to session)",
              date: t.date || "",
              sessionLinked: false,
              project: t.project || ""
            });
          });

          const sessionTaskStr = sessionLinked.map((t) => `'${t.title}' (from session ${t.sessionDate || "undated"})`).join(", ");
          const unlinkedTaskStr = unlinked.map((t) => `'${t.title}'`).join(", ");

          fallbackFacts = (sessionLinked.length > 0
            ? `Pending task linked to session memory: ${sessionTaskStr}.`
            : `No pending tasks are directly linked to previous sessions.`) +
            (unlinked.length > 0
              ? ` Additional project-level pending task: ${unlinkedTaskStr} (unlinked to any session).`
              : "");

          fallbackSuggestion = sessionLinked.length > 0
            ? `Suggestion: Focus on resolving '${sessionLinked[0].title}' first, as it was directly flagged in the previous session.`
            : unlinked.length > 0
            ? `Suggestion: Complete project-level task '${unlinked[0].title}'.`
            : null;

          fallbackAnswer = sessionLinked.length > 0
            ? `From the previous session (${sessionLinked[0].sessionDate || "recorded"}), the pending task is '${sessionLinked[0].title}'.` +
              (unlinked.length > 0 ? ` Note: Project-level task '${unlinked[0].title}' is also pending, but has no session relationship.` : "")
            : `No pending tasks are linked to the previous session.` +
              (unlinked.length > 0 ? ` Project-level task '${unlinked[0].title}' remains pending without a session relationship.` : "");
        } else {
          fallbackFacts = "No pending tasks found in the project memory graph.";
          fallbackAnswer = fallbackFacts;
        }
      } else if (intent.type === "decisions_affecting_bug") {
        const bugs = await getBugs(null, projectName);
        const directLinks = await checkDirectBugDecisionLink();

        if (bugs.length > 0) {
          const targetBug = bugs[0];
          if (targetBug.project) {
            addEvidenceHop(
              { label: "Project", title: targetBug.project },
              targetBug.bugRel || "HAS_BUG",
              { label: "Bug", title: targetBug.title, status: targetBug.status }
            );
          }
          if (targetBug.assignee) {
            addEvidenceHop(
              { label: "Bug", title: targetBug.title, status: targetBug.status },
              targetBug.assignRel || "ASSIGNED_TO",
              { label: "Person", title: targetBug.assignee }
            );
          }
          memories.push({
            type: "Bug",
            title: targetBug.title,
            task: targetBug.title,
            status: targetBug.status,
            assignee: targetBug.assignee,
            project: targetBug.project,
            summary: `Unresolved bug assigned to ${targetBug.assignee || "unassigned"} in project ${targetBug.project || "DevRecall"}`
          });

          if (directLinks.length > 0) {
            directLinks.forEach((link) => {
              addEvidenceHop(
                { label: "Bug", title: link.bug },
                link.rel,
                { label: "Decision", title: link.decision }
              );
              memories.push({
                type: "Decision",
                title: link.decision,
                task: link.decision,
                summary: `Directly connected to bug '${link.bug}' via ${link.rel}`,
                directBugConnection: true
              });
            });
            const linkedDecTitles = directLinks.map((l) => `'${l.decision}'`).join(", ");
            fallbackFacts = `Unresolved bug '${targetBug.title}' (assigned to ${targetBug.assignee || "unassigned"}) is directly affected by decision(s): ${linkedDecTitles}.`;
            fallbackSuggestion = `Suggestion: Review decision(s) ${linkedDecTitles} when resolving '${targetBug.title}'.`;
            fallbackAnswer = `The following decision(s) directly affect '${targetBug.title}': ${linkedDecTitles}.`;
          } else {
            // ZERO decisions connected to this bug in the graph. Exclude all unrelated project decisions!
            fallbackFacts = `Unresolved bug '${targetBug.title}' (assigned to ${targetBug.assignee || "unassigned"}) exists in project ${targetBug.project || "DevRecall"}. The graph contains zero recorded decisions linked to or affecting this bug.`;
            fallbackSuggestion = `Suggestion: Record an explicit decision or resolution policy in the graph if guidance is needed for '${targetBug.title}'.`;
            fallbackAnswer = `No recorded decisions in the graph affect the unresolved login bug ('${targetBug.title}'). The graph contains no direct or verified relationship linking any decision to this bug, and project-level records (such as 'myproject') have no established connection.`;
          }
        } else {
          fallbackFacts = "No unresolved bugs found in the project memory graph.";
          fallbackAnswer = fallbackFacts;
        }
      } else if (intent.type === "decisions_and_tasks") {
        const decisions = await getDecisions(projectName);
        const pendingTasks = await getPendingTasks(projectName);

        if (decisions.length > 0 || pendingTasks.length > 0) {
          decisions.forEach((d) => {
            if (d.project) {
              addEvidenceHop(
                { label: "Project", title: d.project },
                d.projectRel || "HAS_DECISION",
                { label: "Decision", title: d.title }
              );
            }
            memories.push({
              type: "Decision",
              title: d.title,
              task: d.title,
              summary: d.summary || "Recorded project decision",
              date: d.date || "",
              project: d.project || ""
            });
          });

          pendingTasks.forEach((t) => {
            if (t.project) {
              addEvidenceHop(
                { label: "Project", title: t.project },
                t.projectRel || "HAS_TASK",
                { label: "Task", title: t.title, status: t.status }
              );
            }
            if (t.sessionRel) {
              addEvidenceHop(
                { label: "Session", title: t.sessionDate ? `Session ${t.sessionDate}` : "Session", summary: t.sessionSummary || "" },
                t.sessionRel,
                { label: "Task", title: t.title, status: t.status }
              );
            }
            memories.push({
              type: "Task",
              title: t.title,
              task: t.title,
              status: t.status,
              summary: t.summary || (t.sessionRel ? `Mentioned in session ${t.sessionDate || ""}` : "Pending project task"),
              date: t.date || t.sessionDate || "",
              sessionLinked: Boolean(t.sessionRel),
              project: t.project || ""
            });
          });

          const decTitles = decisions.map((d) => `'${d.title}'`).join(", ");
          const taskTitles = pendingTasks.map((t) => `'${t.title}' (${t.sessionRel ? `linked to session ${t.sessionDate || "recorded"}` : "project-level unlinked"})`).join(", ");

          fallbackFacts = `Recorded decisions: ${decTitles || "None"}. Unfinished tasks in project: ${taskTitles || "None"}. Note: The graph records no direct relationship linking these tasks specifically to the decisions.`;
          fallbackSuggestion = pendingTasks.length > 0 && decisions.length > 0
            ? `Suggestion: When implementing unfinished task '${pendingTasks[0].title}', review relevant project decision '${decisions[0].title}'.`
            : null;
          fallbackAnswer = `Recorded decisions: ${decTitles || "None"}. Unfinished tasks: ${taskTitles || "None"}. Note that the graph records no direct connection between these decisions and tasks.`;
        } else {
          fallbackFacts = "No decisions or pending tasks found in the project memory graph.";
          fallbackAnswer = fallbackFacts;
        }
      } else if (intent.type === "next_action") {
        const [sessions, pendingTasks, bugs] = await Promise.all([
          getSessions(projectName),
          getPendingTasks(projectName),
          getBugs(null, projectName)
        ]);

        const latestSession = sessions[0];
        const hasValidDate = latestSession && parseSessionDate(latestSession.date) !== null;
        if (latestSession) {
          memories.push({
            type: "Session",
            title: hasValidDate ? `Session ${latestSession.date}` : `Session #${latestSession.id}`,
            summary: latestSession.summary || "Last recorded session",
            date: hasValidDate ? latestSession.date : ""
          });
        }

        pendingTasks.forEach((t) => {
          if (t.project) {
            addEvidenceHop(
              { label: "Project", title: t.project },
              t.projectRel || "HAS_TASK",
              { label: "Task", title: t.title, status: t.status }
            );
          }
          if (t.sessionRel) {
            addEvidenceHop(
              { label: "Session", title: t.sessionDate ? `Session ${t.sessionDate}` : "Session", summary: t.sessionSummary || "" },
              t.sessionRel,
              { label: "Task", title: t.title, status: t.status }
            );
          }
          memories.push({
            type: "Task",
            title: t.title,
            task: t.title,
            status: t.status,
            summary: t.summary || (t.sessionRel ? `Mentioned in session ${t.sessionDate || ""}` : "Project pending task"),
            sessionLinked: Boolean(t.sessionRel),
            project: t.project || ""
          });
        });

        bugs.forEach((b) => {
          if (b.project) {
            addEvidenceHop(
              { label: "Project", title: b.project },
              b.bugRel || "HAS_BUG",
              { label: "Bug", title: b.title, status: b.status }
            );
          }
          if (b.assignee) {
            addEvidenceHop(
              { label: "Bug", title: b.title, status: b.status },
              b.assignRel || "ASSIGNED_TO",
              { label: "Person", title: b.assignee }
            );
          }
          memories.push({
            type: "Bug",
            title: b.title,
            task: b.title,
            status: b.status,
            assignee: b.assignee,
            project: b.project,
            summary: `Unresolved bug assigned to ${b.assignee || "unassigned"}`
          });
        });

        const sessionTask = pendingTasks.find((t) => t.sessionRel);
        const unlinkedTask = pendingTasks.find((t) => !t.sessionRel);
        const activeBug = bugs[0];

        fallbackFacts = `Recorded context: ${pendingTasks.length} pending task(s) (` +
          (sessionTask ? `session-linked: '${sessionTask.title}'; ` : "") +
          (unlinkedTask ? `project-level: '${unlinkedTask.title}'; ` : "") +
          `)` + (activeBug ? `, 1 unresolved bug ('${activeBug.title}' assigned to ${activeBug.assignee || "unassigned"})` : "") +
          (latestSession ? `, and last session (${hasValidDate ? latestSession.date : "undated"}): "${latestSession.summary}".` : ".");

        fallbackSuggestion = sessionTask
          ? `Suggestion: Prioritize pending task '${sessionTask.title}', as it directly follows up on the previous session (${hasValidDate ? latestSession.date : "recorded"}). Note: While the session notes a login bug and Bug '${activeBug ? activeBug.title : "Login token expiry"}' is assigned to ${activeBug ? activeBug.assignee : "Rahul"}, the graph contains no explicit edge confirming that this task directly resolves that bug.`
          : unlinkedTask
          ? `Suggestion: Work on project-level task '${unlinkedTask.title}'.`
          : `Suggestion: The graph lacks sufficient pending work evidence to recommend a specific next task.`;

        fallbackAnswer = `Recorded context shows ${pendingTasks.length} pending task(s)` +
          (activeBug ? ` and 1 unresolved bug ('${activeBug.title}').` : ".") +
          (fallbackSuggestion ? ` ${fallbackSuggestion}` : "");
      } else if (intent.type === "pending_tasks") {
        const pendingTasks = await getPendingTasks(projectName);
        if (pendingTasks.length > 0) {
          const taskTitles = pendingTasks.map((r) => `'${r.title}'`).join(", ");
          fallbackFacts = `Found ${pendingTasks.length} pending task${pendingTasks.length > 1 ? "s" : ""}: ${taskTitles}.`;
          fallbackAnswer = fallbackFacts;
          pendingTasks.forEach((r) => {
            if (r.project) {
              addEvidenceHop(
                { label: "Project", title: r.project },
                r.projectRel || "HAS_TASK",
                { label: "Task", title: r.title, status: r.status }
              );
            }
            if (r.sessionRel) {
              addEvidenceHop(
                { label: "Session", title: r.sessionDate ? `Session ${r.sessionDate}` : "Session", summary: r.sessionSummary || "" },
                r.sessionRel,
                { label: "Task", title: r.title, status: r.status }
              );
            }
            memories.push({
              type: "Task",
              task: r.title,
              title: r.title,
              summary: r.summary || (r.sessionRel ? `Mentioned in session ${r.sessionDate}` : "Pending task in project memory"),
              date: r.date || r.sessionDate || "",
              status: r.status,
              sessionLinked: !!r.sessionRel,
              project: r.project || ""
            });
          });
        } else {
          fallbackFacts = "No pending tasks found in the graph.";
          fallbackAnswer = fallbackFacts;
        }
      } else if (intent.type === "bug_assignment") {
        const bugs = await getBugs(intent.person, projectName);
        if (bugs.length > 0) {
          const bugTitles = bugs.map((r) => `'${r.title}' (assigned to ${r.assignee || "unassigned"})`).join(", ");
          fallbackFacts = `Found ${bugs.length} bug${bugs.length > 1 ? "s" : ""}: ${bugTitles}.`;
          fallbackAnswer = fallbackFacts;
          bugs.forEach((r) => {
            if (r.project) {
              addEvidenceHop(
                { label: "Project", title: r.project },
                r.bugRel || "HAS_BUG",
                { label: "Bug", title: r.title, status: r.status }
              );
            }
            if (r.assignee) {
              addEvidenceHop(
                { label: "Bug", title: r.title, status: r.status },
                r.assignRel || "ASSIGNED_TO",
                { label: "Person", title: r.assignee }
              );
            }
            memories.push({
              type: "Bug",
              task: r.title,
              title: r.title,
              summary: `Assigned to ${r.assignee || "unassigned"}${r.project ? ` in project ${r.project}` : ""}`,
              date: "",
              status: r.status,
              assignee: r.assignee,
              project: r.project || ""
            });
          });
        } else {
          fallbackFacts = intent.person
            ? `No bugs found assigned to ${intent.person} in the graph.`
            : "No assigned bugs found in the graph.";
          fallbackAnswer = fallbackFacts;
        }
      } else if (intent.type === "decisions") {
        const decisions = await getDecisions(projectName);
        if (decisions.length > 0) {
          const decTitles = decisions.map((r) => `'${r.title}'`).join(", ");
          fallbackFacts = `Found ${decisions.length} recorded decision${decisions.length > 1 ? "s" : ""}: ${decTitles}.`;
          fallbackAnswer = fallbackFacts;
          decisions.forEach((r) => {
            if (r.project) {
              addEvidenceHop(
                { label: "Project", title: r.project },
                r.projectRel || "HAS_DECISION",
                { label: "Decision", title: r.title, status: r.status }
              );
            }
            if (r.sessionRel) {
              addEvidenceHop(
                { label: "Session", title: r.sessionDate ? `Session ${r.sessionDate}` : "Session", summary: r.sessionSummary || "" },
                r.sessionRel,
                { label: "Decision", title: r.title, status: r.status }
              );
            }
            memories.push({
              type: "Decision",
              task: r.title,
              title: r.title,
              summary: r.summary || "Recorded decision in project memory",
              date: r.date || "",
              status: r.status,
              project: r.project || ""
            });
          });
        } else {
          fallbackFacts = "No recorded decisions found in the graph.";
          fallbackAnswer = fallbackFacts;
        }
      } else {
        fallbackFacts = "No relevant memories found in the project memory graph for this query.";
        fallbackAnswer = "No matching record exists in the project memory graph.";
      }

      // Generate evidence-grounded answer using LLM
      const { answer, recordedFacts, suggestedAction, llmUsed: answerLlmUsed, error: llmError } = await generateGroundedAnswer(
        question,
        intent.type,
        memories,
        fallbackAnswer,
        fallbackFacts,
        fallbackSuggestion
      );

      const hasApiKey = Boolean(process.env.GEMINI_API_KEY);
      const quotaExhausted = Boolean(llmError && llmError.includes("429"));

      res.json({
        question,
        intent: intent.type,
        answer,
        recordedFacts: recordedFacts || fallbackFacts,
        suggestedAction: suggestedAction || fallbackSuggestion || null,
        memories,
        evidence: {
          source: "FalkorDB Graph",
          recordCount: memories.length,
          grounded: true,
          llmAssisted: intent.llmUsed || answerLlmUsed,
          model: (intent.llmUsed || answerLlmUsed) ? geminiModel : null,
          hasApiKey,
          quotaExhausted,
          trail: evidenceTrail,
          relationships: evidenceTrail.map((t) => `${t.from.label} (${t.from.title}) -[${t.relationship}]-> ${t.to.label} (${t.to.title})`),
          ...(llmError ? { note: quotaExhausted ? "Gemini free-tier quota exhausted (HTTP 429); used deterministic graph-grounded template." : "LLM fallback used" } : {})
        },
        data: memories
      });
    } catch (error) {
      console.error("Recall error:", error.message);
      res.status(500).json({
        error: "Could not retrieve project memory",
        details: error.message
      });
    }
  }

  async function handleSaveMemory(req, res) {
    const body = req.body || {};
    const allowedTypes = {
      task: { label: 'Task', rel: 'HAS_TASK', defaultStatus: 'todo' },
      decision: { label: 'Decision', rel: 'HAS_DECISION', defaultStatus: 'recorded' },
      session: { label: 'Session', rel: 'HAS_SESSION', defaultStatus: 'recorded' },
      bug: { label: 'Bug', rel: 'HAS_BUG', defaultStatus: 'open' },
      person: { label: 'Person', rel: 'HAS_PERSON', defaultStatus: 'recorded' },
      note: { label: 'Note', rel: 'HAS_NOTE', defaultStatus: 'recorded' },
      milestone: { label: 'Milestone', rel: 'HAS_MILESTONE', defaultStatus: 'todo' },
      question: { label: 'Question', rel: 'HAS_ISSUE', defaultStatus: 'open' },
    };
    const type = String(body.type || '').trim().toLowerCase();
    const config = allowedTypes[type];
    if (!config) return res.status(400).json({ error: `Invalid memory type. Allowed: ${Object.keys(allowedTypes).join(', ')}.` });
    if (typeof body.title !== 'string' || body.title.trim().length < 2) {
      return res.status(400).json({ error: 'Title is required and must be at least 2 characters long.' });
    }

    const title = body.title.trim();
    const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
    const projectName = typeof body.projectName === 'string' && body.projectName.trim() ? body.projectName.trim() : 'DevRecall';
    const assignee = typeof body.assignee === 'string' ? body.assignee.trim() : '';
    const relatedTitle = typeof body.relatedTitle === 'string' ? body.relatedTitle.trim() : '';
    const relation = String(body.relation || '').trim().toUpperCase();
    const allowedRelations = ['MENTIONED', 'RECORDED', 'DEPENDS_ON', 'RESOLVED_BY'];
    const statusOptions = {
      task: ['todo', 'in_progress', 'blocked', 'completed'],
      bug: ['open', 'in_progress', 'blocked', 'resolved'],
      milestone: ['todo', 'in_progress', 'blocked', 'completed'],
      question: ['open', 'in_progress', 'blocked', 'resolved'],
      decision: ['recorded', 'approved'],
      session: ['recorded', 'approved'],
      person: ['recorded'],
      note: ['recorded', 'approved'],
    };
    const requestedStatus = String(body.status || config.defaultStatus).trim().toLowerCase();
    const status = (statusOptions[type] || [config.defaultStatus]).includes(requestedStatus) ? requestedStatus : config.defaultStatus;
    const now = new Date().toISOString();
    const date = typeof body.date === 'string' && body.date.trim() ? body.date.trim() : now.slice(0, 10);
    const nodeLabel = config.label;
    const titleProperty = type === 'task' ? 'task' : type === 'decision' ? 'decision' : 'title';

    try {
      // Ensure a real project root exists; do not silently attach memories to a missing project.
      const projectCheck = await graph.query('MATCH (p:Project {name: $projectName}) RETURN p.name AS name LIMIT 1', { params: { projectName } });
      if (!projectCheck.data?.length) {
        return res.status(404).json({ error: `Project "${projectName}" was not found. Create/select the project first.` });
      }

      // Duplicate check is scoped to the selected project and node type.
      const duplicate = await graph.query(`
        MATCH (p:Project {name: $projectName})-[:${config.rel}]->(m:${nodeLabel})
        WHERE toLower(coalesce(m.title, m.task, m.decision, m.name, '')) = toLower($title)
        RETURN id(m) AS id, m.status AS status LIMIT 1
      `, { params: { projectName, title } });
      if (duplicate.data?.length) {
        if (req.method !== 'PUT' && body.allowUpdate !== true) {
          return res.status(409).json({ error: `A ${type} named "${title}" already exists in project ${projectName}.`, duplicate: true });
        }
        const update = await graph.query(`
          MATCH (p:Project {name: $projectName})-[:${config.rel}]->(m:${nodeLabel})
          WHERE toLower(coalesce(m.title, m.task, m.decision, m.name, '')) = toLower($title)
          SET m.status = $status, m.summary = CASE WHEN $summary <> '' THEN $summary ELSE m.summary END,
              m.updatedAt = $now, m.date = $date,
              m.completedAt = CASE WHEN $status = 'completed' THEN coalesce(m.completedAt, $now) ELSE null END
          RETURN coalesce(m.title, m.task, m.decision, m.name) AS title, m.status AS status
        `, { params: { projectName, title, status, summary, now, date } });
        return res.json({ success: true, action: 'updated', memory: { type, title: update.data?.[0]?.title || title, status, project: projectName } });
      }

      const create = await graph.query(`
        MATCH (p:Project {name: $projectName})
        CREATE (m:${nodeLabel} {title: $title, summary: $summary, status: $status, date: $date, createdAt: $now, updatedAt: $now})
        CREATE (p)-[:${config.rel}]->(m)
        RETURN id(m) AS id, coalesce(m.title, m.task, m.decision, m.name) AS title, m.status AS status
      `, { params: { projectName, title, summary, status, date, now } });

      const newId = create.data?.[0]?.id;
      if (type === 'task' && newId != null) {
        await graph.query(`MATCH (m:Task) WHERE id(m) = $id SET m.task = $title`, { params: { id: newId, title } });
        if (status === 'completed') await graph.query(`MATCH (m:Task) WHERE id(m) = $id SET m.completedAt = $now`, { params: { id: newId, now } });
      }
      if (type === 'decision' && newId != null) {
        await graph.query(`MATCH (m:Decision) WHERE id(m) = $id SET m.decision = $title`, { params: { id: newId, title } });
      }
      if (type === 'person' && newId != null) {
        await graph.query(`MATCH (m:Person) WHERE id(m) = $id SET m.name = $title`, { params: { id: newId, title } });
      }
      if (type === 'milestone' && newId != null && status === 'completed') {
        await graph.query(`MATCH (m:Milestone) WHERE id(m) = $id SET m.completedAt = $now`, { params: { id: newId, now } });
      }

      // Optional explicit graph relationships, always resolved inside the selected project.
      if (relation && relatedTitle) {
        if (!allowedRelations.includes(relation)) {
          return res.status(400).json({ error: 'Unsupported relationship. Use MENTIONED, RECORDED, DEPENDS_ON, or RESOLVED_BY.' });
        }
        const labelByRelation = { MENTIONED: ['Session', ['Task', 'Bug']], RECORDED: ['Session', ['Decision']], DEPENDS_ON: ['Task', ['Task']], RESOLVED_BY: ['Bug', ['Task']] };
        const [sourceLabel, targetLabels] = labelByRelation[relation];
        let sourceTitle = title, targetTitle = relatedTitle;
        if (relation === 'MENTIONED' || relation === 'RECORDED') {
          sourceTitle = title; targetTitle = relatedTitle;
        } else {
          sourceTitle = title; targetTitle = relatedTitle;
        }
        if (nodeLabel !== sourceLabel) {
          return res.status(400).json({ error: `${relation} requires the newly created item to be a ${sourceLabel}.` });
        }
        const targetLabel = targetLabels[0];
        const targetLabelCondition = relation === 'MENTIONED' ? '(target:Task OR target:Bug)' : `target:${targetLabel}`;
        const target = await graph.query(`
          MATCH (p:Project {name: $projectName})-[]->(target)
          WHERE ${targetLabelCondition}
            AND toLower(coalesce(target.title, target.task, target.decision, target.name, '')) = toLower($relatedTitle)
          RETURN id(target) AS id LIMIT 1
        `, { params: { projectName, relatedTitle } });
        if (!target.data?.length) {
          return res.status(400).json({ error: `Related ${targetLabel} "${relatedTitle}" was not found in project ${projectName}. The new memory was saved without that extra relationship.` });
        }
        await graph.query(`
          MATCH (source:${sourceLabel}), (target)
          WHERE id(source) = $sourceId AND id(target) = $targetId
          CREATE (source)-[:${relation}]->(target)
        `, { params: { sourceId: create.data?.[0]?.id, targetId: target.data[0].id } });
      }

      // ASSIGNED_TO is a relationship between a Bug/Task and a Person node.
      if (assignee && (type === 'bug' || type === 'task')) {
        await graph.query(`
          MATCH (p:Project {name: $projectName})-[]->(item:${nodeLabel})
          WHERE id(item) = $itemId
          MERGE (person:Person {name: $assignee})
          MERGE (item)-[:ASSIGNED_TO]->(person)
        `, { params: { projectName, itemId: create.data?.[0]?.id, assignee } });
      }

      return res.status(201).json({ success: true, action: 'created', memory: { type, title, status, summary, project: projectName, relationship: config.rel } });
    } catch (error) {
      console.error('Save memory error:', error.message);
      return res.status(500).json({ error: 'Failed to save memory to graph', details: error.message });
    }
  }

  // Project management: list projects already stored in FalkorDB.
  app.get("/api/projects", async (req, res) => {
    try {
      const result = await graph.query(`
        MATCH (p:Project)
        RETURN p.name AS name, p.description AS description, p.createdAt AS createdAt,
               coalesce(p.archived, false) AS archived, p.archivedAt AS archivedAt
        ORDER BY toLower(p.name)
      `);
      const projects = Array.isArray(result.data) ? result.data : [];
      res.json({ projects });
    } catch (error) {
      console.error("List projects error:", error.message);
      res.status(500).json({ error: "Could not load projects", details: error.message });
    }
  });

  // Create a new Project node without deleting or changing existing project data.
  app.post("/api/projects", async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const description =
      typeof req.body?.description === "string" ? req.body.description.trim() : "";

    if (name.length < 2) {
      return res.status(400).json({ error: "Project name must be at least 2 characters long." });
    }

    try {
      const existing = await graph.query(`
        MATCH (p:Project)
        WHERE toLower(p.name) = toLower($name)
        RETURN p.name AS name, p.description AS description
        LIMIT 1
      `, { params: { name } });

      if (Array.isArray(existing.data) && existing.data.length > 0) {
        return res.status(409).json({
          error: `A project named "${existing.data[0].name}" already exists.`,
          project: existing.data[0],
          duplicate: true
        });
      }

      const createdAt = new Date().toISOString();
      const result = await graph.query(`
        CREATE (p:Project {name: $name, description: $description, createdAt: $createdAt})
        RETURN p.name AS name, p.description AS description, p.createdAt AS createdAt
      `, { params: { name, description, createdAt } });

      const project = result.data?.[0] || { name, description, createdAt };
      return res.status(201).json({ success: true, project });
    } catch (error) {
      console.error("Create project error:", error.message);
      return res.status(500).json({ error: "Could not create project", details: error.message });
    }
  });

  // Archive or restore a project without deleting its node or any connected memory.
  app.patch("/api/projects/:name/archive", async (req, res) => {
    const name = typeof req.params.name === "string" ? req.params.name.trim() : "";
    const archived = req.body?.archived;

    if (!name) return res.status(400).json({ error: "Project name is required." });
    if (typeof archived !== "boolean") {
      return res.status(400).json({ error: "The 'archived' field must be true or false." });
    }

    try {
      const found = await graph.query(`
        MATCH (p:Project {name: $name})
        RETURN p.name AS name, p.description AS description,
               coalesce(p.archived, false) AS archived
        LIMIT 1
      `, { params: { name } });
      const existing = found.data?.[0];
      if (!existing) return res.status(404).json({ error: `Project "${name}" was not found.` });

      if (Boolean(existing.archived) === archived) {
        return res.json({ success: true, project: { ...existing, archived } });
      }

      if (archived) {
        const activeCountResult = await graph.query(`
          MATCH (p:Project)
          WHERE coalesce(p.archived, false) = false
          RETURN count(p) AS activeCount
        `);
        const activeCount = Number(activeCountResult.data?.[0]?.activeCount ?? 0);
        if (activeCount <= 1) {
          return res.status(409).json({ error: "At least one active project must remain. Restore or create another project first." });
        }
      }

      const archivedAt = archived ? new Date().toISOString() : null;
      const updated = await graph.query(`
        MATCH (p:Project {name: $name})
        SET p.archived = $archived,
            p.archivedAt = $archivedAt
        RETURN p.name AS name, p.description AS description, p.createdAt AS createdAt,
               coalesce(p.archived, false) AS archived, p.archivedAt AS archivedAt
      `, { params: { name, archived, archivedAt } });

      return res.json({ success: true, project: updated.data?.[0] || { ...existing, archived, archivedAt } });
    } catch (error) {
      console.error("Archive/restore project error:", error.message);
      return res.status(500).json({ error: "Could not update project archive status", details: error.message });
    }
  });

  app.get("/api/tasks", async (req, res) => {
    const projectName = (req.query.projectName || "").trim();
    const statusFilter = (req.query.status || "").trim().toLowerCase();
    const q = (req.query.q || "").trim().toLowerCase();
    try {
      let query = `MATCH (p:Project {name: $projectName})-[:HAS_TASK]->(t:Task) RETURN id(t) AS id, t.title AS title, t.task AS task, COALESCE(t.status,'todo') AS status, COALESCE(t.priority,'medium') AS priority, t.summary AS summary, t.description AS description, t.dueDate AS dueDate, t.createdAt AS createdAt, t.updatedAt AS updatedAt, t.completedAt AS completedAt, COALESCE(t.archived,false) AS archived ORDER BY id(t)`;
      const result = await graph.query(query, { params: { projectName } });
      let tasks = Array.isArray(result.data) ? result.data : [];
      if (statusFilter) tasks = tasks.filter(t => String(t.status).toLowerCase() === statusFilter);
      if (q) tasks = tasks.filter(t => String(t.title||t.task||"").toLowerCase().includes(q) || String(t.summary||"").toLowerCase().includes(q));
      // attach assignees
      const ids = tasks.map(t=>t.id);
      const assignMap = new Map();
      if (ids.length) {
        const ares = await graph.query(`MATCH (t:Task)-[:ASSIGNED_TO]->(per:Person) WHERE id(t) IN $ids RETURN id(t) AS taskId, per.name AS assignee`, { params: { ids } });
        (Array.isArray(ares.data)?ares.data:[]).forEach(r => assignMap.set(r.taskId, r.assignee));
      }
      const out = tasks.map(t => ({ ...t, assignee: assignMap.get(t.id) || null }));
      res.json({ tasks: out });
    } catch (e) {
      res.status(500).json({ error: "Could not load tasks", details: e.message });
    }
  });

  // List shared Person nodes for assignment dropdowns. Person nodes may be
  // shared by multiple projects; this endpoint never creates or mutates them.
  app.get("/api/persons", async (req, res) => {
    try {
      const result = await graph.query(`MATCH (per:Person) RETURN id(per) AS id, per.name AS name ORDER BY per.name`);
      const persons = Array.isArray(result.data) ? result.data : [];
      res.json({ persons });
    } catch (error) {
      console.error("List persons error:", error.message);
      res.status(500).json({ error: "Could not load people", details: error.message });
    }
  });

  // Shared constants for memory editing, relationship validation, and moves.
  const PROJECT_REL_TYPES = ['HAS_TASK', 'HAS_BUG', 'HAS_DECISION', 'HAS_SESSION', 'HAS_PERSON', 'HAS_NOTE', 'HAS_MILESTONE', 'HAS_ISSUE'];
  const REL_ALLOWLIST = ['HAS_TASK', 'HAS_DECISION', 'HAS_SESSION', 'HAS_BUG', 'ASSIGNED_TO', 'MENTIONED', 'RECORDED', 'DEPENDS_ON', 'RESOLVED_BY'];
  const REL_ENDPOINT_RULES = {
    HAS_TASK: { sources: ['Project'], targets: ['Task'] },
    HAS_DECISION: { sources: ['Project'], targets: ['Decision'] },
    HAS_SESSION: { sources: ['Project'], targets: ['Session'] },
    HAS_BUG: { sources: ['Project'], targets: ['Bug'] },
    ASSIGNED_TO: { sources: ['Task', 'Bug'], targets: ['Person'] },
    MENTIONED: { sources: ['Session'], targets: ['Task', 'Bug'] },
    RECORDED: { sources: ['Session'], targets: ['Decision'] },
    DEPENDS_ON: { sources: ['Task'], targets: ['Task'] },
    RESOLVED_BY: { sources: ['Bug'], targets: ['Task'] },
  };
  const EDITABLE_FIELDS = {
    Task: ['title', 'summary', 'description', 'status', 'priority', 'dueDate', 'date', 'archived'],
    Bug: ['title', 'summary', 'description', 'status', 'archived'],
    Decision: ['title', 'summary', 'description', 'status', 'date', 'archived'],
    Session: ['summary', 'date', 'archived'],
    Person: ['name'],
  };
  const STATUS_OPTIONS = {
    task: ['todo', 'in_progress', 'blocked', 'completed'],
    bug: ['open', 'in_progress', 'blocked', 'resolved'],
    decision: ['recorded', 'approved'],
    session: ['recorded', 'approved'],
    person: ['recorded'],
  };
  const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];
  const OWNERSHIP_REL = { Task: 'HAS_TASK', Bug: 'HAS_BUG', Decision: 'HAS_DECISION', Session: 'HAS_SESSION' };

  app.patch("/api/tasks/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid task id" });
    const body = req.body || {};
    const projectName = (body.projectName || req.query.projectName || "").trim();
    const title = typeof body.title === "string" ? body.title.trim() : null;
    const description = typeof body.description === "string" ? body.description.trim() : null;
    const summary = typeof body.summary === "string" ? body.summary.trim() : null;
    const status = typeof body.status === "string" ? body.status.trim().toLowerCase() : null;
    const priority = typeof body.priority === "string" ? body.priority.trim().toLowerCase() : null;
    const dueDate = typeof body.dueDate === "string" ? body.dueDate.trim() : null;
    const assignee = typeof body.assignee === "string" ? body.assignee.trim() : null;
    const validStatuses = ["todo","in_progress","blocked","completed"];
    const validPriorities = ["low","medium","high","critical"];
    if (status && !validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });
    if (priority && !validPriorities.includes(priority)) return res.status(400).json({ error: "Invalid priority" });

    try {
      // verify ownership
      const own = await graph.query(`MATCH (p:Project {name:$projectName})-[:HAS_TASK]->(t:Task) WHERE id(t)=$id RETURN id(t) AS id`, { params: { projectName, id } });
      if (!Array.isArray(own.data) || !own.data.length) return res.status(404).json({ error: "Task not found in project" });

      const sets = [];
      const params = { id, now: new Date().toISOString() };
      if (title !== null) { sets.push("t.title = $title", "t.task = $title"); params.title = title; }
      if (description !== null) { sets.push("t.description = $description"); params.description = description; }
      if (summary !== null) { sets.push("t.summary = $summary"); params.summary = summary; }
      if (status !== null) { sets.push("t.status = $status"); params.status = status; if (status === "completed") sets.push("t.completedAt = $now"); else sets.push("t.completedAt = null"); }
      if (priority !== null) { sets.push("t.priority = $priority"); params.priority = priority; }
      if (dueDate !== null) { sets.push("t.dueDate = $dueDate"); params.dueDate = dueDate || null; }
      sets.push("t.updatedAt = $now");
      await graph.query(`MATCH (t:Task) WHERE id(t) = $id SET ${sets.join(", ")}`, { params });

      if (assignee !== null) {
        // remove existing assignment
        await graph.query(`MATCH (t:Task)-[r:ASSIGNED_TO]->(:Person) WHERE id(t)=$id DELETE r`, { params: { id } });
        if (assignee) {
          await graph.query(`MATCH (t:Task) WHERE id(t)=$id MERGE (per:Person {name:$assignee}) MERGE (t)-[:ASSIGNED_TO]->(per)`, { params: { id, assignee } });
        }
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Could not update task", details: e.message });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid task id" });
    const confirm = req.query.confirm === "true" || req.body?.confirm === true;
    if (!confirm) return res.status(400).json({ error: "Confirmation required" });
    const projectName = (req.query.projectName || req.body?.projectName || "").trim();
    try {
      const own = await graph.query(`MATCH (p:Project {name:$projectName})-[:HAS_TASK]->(t:Task) WHERE id(t)=$id RETURN id(t) AS id`, { params: { projectName, id } });
      if (!Array.isArray(own.data) || !own.data.length) return res.status(404).json({ error: "Task not found in project" });
      // remove relationships
      await graph.query(`MATCH (t:Task) WHERE id(t)=$id DETACH DELETE t`, { params: { id } });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Could not delete task", details: e.message });
    }
  });

  app.get("/api/recall", handleRecall);
  app.post("/api/recall", handleRecall);
  app.post("/api/memory", handleSaveMemory);
  app.put("/api/memory", handleSaveMemory);

  // Edit a memory node in place (never creates a duplicate). Scoped to one
  // project and one node ID; all Cypher is parameterized.
  app.patch("/api/memory/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid memory id" });
    const body = req.body || {};
    const projectName = typeof body.projectName === "string" ? body.projectName.trim() : "";
    const updates = typeof body.updates === "object" && body.updates !== null ? body.updates : {};
    if (!projectName) return res.status(400).json({ error: "Project name is required." });

    try {
      const nodeRes = await graph.query(
        `MATCH (m) WHERE id(m) = $id
         MATCH (p:Project {name: $projectName})-[r]->(m)
         WHERE type(r) IN ['HAS_TASK','HAS_BUG','HAS_DECISION','HAS_SESSION','HAS_PERSON','HAS_NOTE','HAS_MILESTONE','HAS_ISSUE']
         RETURN m, labels(m) AS labels LIMIT 1`,
        { params: { id, projectName } }
      );
      const row = nodeRes.data?.[0];
      if (!row) return res.status(404).json({ error: "Memory not found in the selected project." });

      const labels = Array.isArray(row.labels) ? row.labels : [];
      const primaryLabel = labels[0] || "Entity";
      const allowedFields = EDITABLE_FIELDS[primaryLabel] || [];
      const statuses = STATUS_OPTIONS[String(primaryLabel).toLowerCase()] || [];

      const setClauses = [];
      const params = { id, now: new Date().toISOString() };

      function setProp(prop, paramName, value) {
        setClauses.push(`m.${prop} = $${paramName}`);
        params[paramName] = value;
      }

      let titleChanged = false;
      for (const [key, rawValue] of Object.entries(updates)) {
        if (!allowedFields.includes(key)) continue;
        if (rawValue === undefined || rawValue === null) {
          if (key === "dueDate") setProp("dueDate", "dueDate", null);
          continue;
        }
        if (key === "archived") {
          setProp("archived", "archived", Boolean(rawValue) === true);
          continue;
        }
        if (typeof rawValue !== "string") continue;
        const trimmed = rawValue.trim();
        if (trimmed === "") {
          if (key === "dueDate") setProp("dueDate", "dueDate", null);
          continue;
        }
        if (key === "status") {
          const normalized = String(trimmed).toLowerCase();
          if (!statuses.includes(normalized)) continue;
          setProp("status", "status", normalized);
          setProp("completedAt", normalized === "completed" ? "completedAtSet" : "completedAtClear", normalized === "completed" ? params.now : null);
          continue;
        }
        if (key === "priority") {
          const normalized = String(trimmed).toLowerCase();
          if (!VALID_PRIORITIES.includes(normalized)) continue;
          setProp("priority", "priority", normalized);
          continue;
        }
        if (key === "dueDate") {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return res.status(400).json({ error: "Due date must be YYYY-MM-DD." });
          setProp("dueDate", "dueDate", trimmed);
          continue;
        }
        if (key === "title" || key === "name" || key === "summary" || key === "description" || key === "date") {
          if (key === "title") titleChanged = true;
          const prop = key === "name" ? "name" : key;
          setProp(prop, key, trimmed);
          continue;
        }
      }

      if (titleChanged && params.title != null) {
        if (primaryLabel === "Task") setProp("task", "taskTitle", params.title);
        if (primaryLabel === "Decision") setProp("decision", "decisionTitle", params.title);
      }

      let assigneeOut = null;
      if (Object.prototype.hasOwnProperty.call(updates, "assignee") && (primaryLabel === "Task" || primaryLabel === "Bug")) {
        const assignee = typeof updates.assignee === "string" ? String(updates.assignee).trim() : "";
        // Only the ASSIGNED_TO edge is touched; shared Person nodes are never deleted.
        await graph.query(`MATCH (m) WHERE id(m) = $id MATCH (m)-[r:ASSIGNED_TO]->(:Person) DELETE r`, { params: { id } });
        if (assignee) {
          await graph.query(`MATCH (m) WHERE id(m) = $id MERGE (per:Person {name: $assignee}) MERGE (m)-[:ASSIGNED_TO]->(per)`, { params: { id, assignee } });
        }
        assigneeOut = assignee || null;
      }

      if (setClauses.length) {
        setClauses.push("m.updatedAt = $now");
        await graph.query(`MATCH (m) WHERE id(m) = $id SET ${setClauses.join(", ")}`, { params });
      }

      const fresh = await graph.query(`MATCH (m) WHERE id(m) = $id RETURN m, labels(m) AS labels`, { params: { id } });
      const updated = fresh.data?.[0];
      return res.json({ success: true, action: "updated", memory: { id, type: String(primaryLabel).toLowerCase(), project: projectName, properties: updated ? updated.m : {}, labels: updated ? updated.labels : labels, assignee: assigneeOut } });
    } catch (error) {
      console.error("Edit memory error:", error.message);
      return res.status(500).json({ error: "Could not update memory", details: error.message });
    }
  });

  // Permanently delete a memory node. Never deletes shared Person nodes.
  app.delete("/api/memory/:id", async (req, res) => {
    const id = Number(req.params.id);
    const confirm = req.query.confirm === "true" || req.body?.confirm === true;
    const projectName = typeof req.query.projectName === "string" ? req.query.projectName.trim() : (typeof req.body?.projectName === "string" ? req.body.projectName.trim() : "");
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid memory id" });
    if (!confirm) return res.status(400).json({ error: "Confirmation required" });
    if (!projectName) return res.status(400).json({ error: "Project name is required" });

    try {
      const nodeRes = await graph.query(
        `MATCH (m) WHERE id(m) = $id
         MATCH (p:Project {name: $projectName})-[r]->(m)
         WHERE type(r) IN ['HAS_TASK','HAS_BUG','HAS_DECISION','HAS_SESSION','HAS_PERSON','HAS_NOTE','HAS_MILESTONE','HAS_ISSUE']
         RETURN labels(m) AS labels LIMIT 1`,
        { params: { id, projectName } }
      );
      const row = nodeRes.data?.[0];
      if (!row) return res.status(404).json({ error: "Memory not found in the selected project." });
      const labels = Array.isArray(row.labels) ? row.labels : [];
      if (labels.includes("Person")) {
        return res.status(403).json({ error: "Person nodes are shared across projects and cannot be deleted." });
      }
      await graph.query(`MATCH (m) WHERE id(m) = $id DETACH DELETE m`, { params: { id } });
      return res.json({ success: true, action: "deleted", id, labels });
    } catch (error) {
      console.error("Delete memory error:", error.message);
      return res.status(500).json({ error: "Could not delete memory", details: error.message });
    }
  });

  // Remove a single relationship. Nodes are never deleted by this endpoint.
  app.delete("/api/relationship", async (req, res) => {
    const body = req.body || {};
    const fromId = Number(body.fromId);
    const toId = Number(body.toId);
    const type = String(body.type || "").trim().toUpperCase();
    const projectName = typeof body.projectName === "string" ? body.projectName.trim() : "";
    if (!Number.isInteger(fromId) || !Number.isInteger(toId)) return res.status(400).json({ error: "Invalid node ids." });
    if (!REL_ALLOWLIST.includes(type)) return res.status(400).json({ error: "Unsupported relationship type." });
    if (!projectName) return res.status(400).json({ error: "Project name is required." });

    try {
      // FalkorDB's embedded Cypher engine rejects EXISTS((p)-[]->(a)) with
      // "Unable to resolve filtered alias '(p)-[]->(a)'" and also rejects
      // pattern predicates in WHERE. Use OPTIONAL MATCH + IS NOT NULL instead.
      // Both endpoints must belong to the selected project; shared Person nodes
      // therefore cannot be the source/target of a project-scoped removal unless
      // the project actually owns them.
      const result = await graph.query(
        `MATCH (a)-[r]->(b) WHERE id(a) = $fromId AND id(b) = $toId AND type(r) = $type
         OPTIONAL MATCH (p:Project {name: $projectName})-[]->(a) WHERE p IS NOT NULL
         OPTIONAL MATCH (q:Project {name: $projectName})-[]->(b) WHERE q IS NOT NULL
         DELETE r RETURN type(r) AS type`,
        { params: { fromId, toId, type, projectName } }
      );
      if (!Array.isArray(result.data) || result.data.length === 0) {
        return res.status(404).json({ error: "Relationship not found or not within the selected project." });
      }
      return res.json({ success: true, action: "relationshipRemoved", fromId, toId, type });
    } catch (error) {
      console.error("Remove relationship error:", error.message);
      return res.status(500).json({ error: "Could not remove relationship", details: error.message });
    }
  });

  // Create a valid relationship between two existing nodes, scoped to a project.
  app.post("/api/relationships", async (req, res) => {
    const body = req.body || {};
    const fromId = Number(body.fromId);
    const toId = Number(body.toId);
    const type = String(body.type || "").trim().toUpperCase();
    const projectName = typeof body.projectName === "string" ? body.projectName.trim() : "";
    if (!Number.isInteger(fromId) || !Number.isInteger(toId)) return res.status(400).json({ error: "Invalid node ids." });
    if (!REL_ALLOWLIST.includes(type)) return res.status(400).json({ error: "Unsupported relationship type." });
    if (!projectName) return res.status(400).json({ error: "Project name is required." });
    const rule = REL_ENDPOINT_RULES[type];
    if (!rule) return res.status(400).json({ error: "Unsupported relationship type." });

    try {
      const endpoints = await graph.query(
        `MATCH (a),(b) WHERE id(a) = $fromId AND id(b) = $toId RETURN labels(a) AS aLabels, labels(b) AS bLabels`,
        { params: { fromId, toId } }
      );
      const ep = endpoints.data?.[0];
      if (!ep) return res.status(404).json({ error: "One or both endpoint nodes were not found." });
      const aLabels = Array.isArray(ep.aLabels) ? ep.aLabels : [];
      const bLabels = Array.isArray(ep.bLabels) ? ep.bLabels : [];
      if (!rule.sources.some((s) => aLabels.includes(s))) return res.status(400).json({ error: `Source endpoint must be one of: ${rule.sources.join(", ")}.` });
      if (!rule.targets.some((t) => bLabels.includes(t))) return res.status(400).json({ error: `Target endpoint must be one of: ${rule.targets.join(", ")}.` });

      // FalkorDB rejects EXISTS((p)-[]->(a)); use OPTIONAL MATCH + IS NOT NULL.
      // Both endpoints must belong to the selected project.
      const scope = await graph.query(
        `MATCH (a),(b) WHERE id(a) = $fromId AND id(b) = $toId
         OPTIONAL MATCH (p:Project {name: $projectName})-[]->(a) WHERE p IS NOT NULL
         OPTIONAL MATCH (q:Project {name: $projectName})-[]->(b) WHERE q IS NOT NULL
         RETURN (p IS NOT NULL OR q IS NOT NULL) AS inScope LIMIT 1`,
        { params: { fromId, toId, projectName } }
      );
      const scopeRow = scope.data?.[0];
      if (!scopeRow || scopeRow.inScope !== true) {
        return res.status(403).json({ error: "Relationship endpoints are not within the selected project." });
      }

      const existing = await graph.query(
        `MATCH (a)-[r]->(b) WHERE id(a) = $fromId AND id(b) = $toId AND type(r) = $type RETURN r LIMIT 1`,
        { params: { fromId, toId, type } }
      );
      if (Array.isArray(existing.data) && existing.data.length > 0) {
        return res.status(409).json({ error: "This relationship already exists." });
      }

      await graph.query(`MATCH (a),(b) WHERE id(a) = $fromId AND id(b) = $toId CREATE (a)-[r:${type}]->(b) RETURN type(r) AS type`, { params: { fromId, toId } });
      return res.status(201).json({ success: true, action: "relationshipCreated", fromId, toId, type });
    } catch (error) {
      console.error("Create relationship error:", error.message);
      return res.status(500).json({ error: "Could not create relationship", details: error.message });
    }
  });

  // Move a memory node's project ownership to another project. The node itself
  // is not cloned; non-ownership relationships are preserved and reported.
  app.post("/api/memory/:id/move", async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body || {};
    const projectName = typeof body.projectName === "string" ? body.projectName.trim() : "";
    const targetProjectName = typeof body.targetProjectName === "string" ? body.targetProjectName.trim() : "";
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid memory id" });
    if (!projectName || !targetProjectName) return res.status(400).json({ error: "Source and target project names are required." });
    if (projectName.toLowerCase() === targetProjectName.toLowerCase()) return res.status(400).json({ error: "Target project must differ from the current project." });

    try {
      const nodeRes = await graph.query(`MATCH (m) WHERE id(m) = $id RETURN m, labels(m) AS labels`, { params: { id } });
      const row = nodeRes.data?.[0];
      if (!row) return res.status(404).json({ error: "Memory not found." });
      const labels = Array.isArray(row.labels) ? row.labels : [];
      const primaryLabel = labels[0];
      if (primaryLabel === "Project") return res.status(403).json({ error: "Project nodes cannot be moved." });
      const relType = OWNERSHIP_REL[primaryLabel];
      if (!relType) return res.status(400).json({ error: `Node type "${primaryLabel}" has no project ownership relationship.` });

      const owner = await graph.query(
        `MATCH (p:Project {name: $projectName})-[r:${relType}]->(m) WHERE id(m) = $id RETURN p.name AS project LIMIT 1`,
        { params: { projectName, id } }
      );
      if (!Array.isArray(owner.data) || owner.data.length === 0) {
        return res.status(404).json({ error: `Memory is not owned by project "${projectName}".` });
      }

      const target = await graph.query(`MATCH (p:Project {name: $targetProjectName}) RETURN p.name AS name LIMIT 1`, { params: { targetProjectName } });
      if (!Array.isArray(target.data) || target.data.length === 0) {
        return res.status(404).json({ error: `Target project "${targetProjectName}" was not found.` });
      }

      // Repoint project ownership: remove old edge, create new one. No clone.
      await graph.query(
        `MATCH (p:Project {name: $projectName})-[r:${relType}]->(m) WHERE id(m) = $id DELETE r`,
        { params: { projectName, id } }
      );
      await graph.query(
        `MATCH (p:Project {name: $targetProjectName}), (m) WHERE id(m) = $id CREATE (p)-[:${relType}]->(m)`,
        { params: { targetProjectName, id } }
      );

      // Report remaining relationships and which projects own their other ends.
      const rels = await graph.query(
        `MATCH (m)-[r]-(other) WHERE id(m) = $id
         OPTIONAL MATCH (p:Project)-[]->(other)
         RETURN type(r) AS type, labels(other) AS labels, id(other) AS id,
                coalesce(other.title, other.name, other.task, other.decision) AS title,
                collect(DISTINCT p.name) AS projects`,
        { params: { id } }
      );
      const preservedRelationships = (Array.isArray(rels.data) ? rels.data : []).map((r) => ({
        type: r.type,
        to: r.title || `Node #${r.id}`,
        toLabel: Array.isArray(r.labels) ? r.labels[0] : "Entity",
        projects: Array.isArray(r.projects) ? r.projects : [],
      }));

      return res.json({ success: true, action: "moved", id, label: primaryLabel, from: projectName, to: targetProjectName, relationship: relType, preservedRelationships });
    } catch (error) {
      console.error("Move memory error:", error.message);
      return res.status(500).json({ error: "Could not move memory", details: error.message });
    }
  });

  app.listen(process.env.PORT || 5000, () => {
    console.log(
      `DevRecall server running on http://localhost:${process.env.PORT || 5000}`
    );
  });
}

startServer().catch((error) => {
  console.error("FalkorDB connection failed:", error);
  process.exit(1);
});

