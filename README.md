<<<<<<< HEAD
# DevRecall — Session-Aware Project Copilot
> **WeMakeDevs × FalkorDB Graph Hacks 2026 Submission**  
> **Selected Track:** Track 02 — Agent Memory and Coordination

[![FalkorDB](https://img.shields.io/badge/Graph_Database-FalkorDB_Cloud-orange?style=flat-square)](https://falkordb.com/)
[![Gemini](https://img.shields.io/badge/LLM-Google_Gemini-blue?style=flat-square)](https://ai.google.dev/)
[![React](https://img.shields.io/badge/Frontend-React_19_|_Vite-61dafb?style=flat-square)](https://vitejs.dev/)
[![Express](https://img.shields.io/badge/Backend-Node.js_|_Express_5-green?style=flat-square)](https://expressjs.com/)

---

## Demo Video

> **TODO: Demo Video Link**  
> `[TODO: Insert link to 3-5 minute demo video demonstration here once recorded and uploaded]`

---

## Overview

Software development projects suffer from **context rot**: developers forget what occurred in previous work sessions, which tasks were left pending, what architectural decisions were finalized, and who is assigned to critical bugs. Conventional chatbots lack persistent memory and produce hallucinations or disconnected advice.

**DevRecall** solves this as a **Session-Aware Project Copilot** backed by **FalkorDB Cloud** as its persistent graph memory and evidence layer:
1. **Graph Memory**: Stores developer sessions, tasks, bugs, decisions, team members, and their explicit graph relationships in FalkorDB.
2. **Evidence-Grounded Answering**: Retrieves connected memories using scoped Cypher traversals and answers questions grounded strictly in graph evidence.
3. **Structured Facts vs. Suggestions**: Explicitly separates verified **Recorded Graph Facts** from actionable **Suggested Next Actions**.
4. **Interactive Evidence Trail**: Exposes the exact graph relationship hops supporting every answer, linked directly to an interactive in-browser **Graph Memory Explorer**.
5. **Robust Local Fallback**: When external LLM rate limits (e.g. Gemini 429) occur, DevRecall switches to deterministic, graph-grounded responses without failing or hallucinating.
6. **Strict Negative Constraints**: Rejects false assertions. For example, if a decision and a bug share a project but have no direct link, DevRecall refuses to claim the decision governs the bug.

---

## Selected Track

- **Track 02: Agent Memory and Coordination**  
  DevRecall implements persistent, structured agent memory using FalkorDB knowledge graph relationships (`MENTIONED`, `HAS_TASK`, `HAS_BUG`, `HAS_DECISION`, `ASSIGNED_TO`) to coordinate project state across sessions and guide developer priorities.

---

## Knowledge Graph Schema & Architecture

DevRecall structures memory as an interconnected property graph in FalkorDB:

### Node Labels
| Label | Description | Key Properties |
| :--- | :--- | :--- |
| `Project` | Root project entity | `name` |
| `Session` | Developer work session | `date` (ISO `YYYY-MM-DD`), `summary` |
| `Task` | Development task | `title`, `task`, `status` (`pending` / `completed`), `summary`, `date` |
| `Bug` | Identified defect/bug | `title`, `status` (`assigned` / `open`) |
| `Person` | Team member | `name` |
| `Decision` | Architectural/technical choice | `title`, `decision`, `status` (`recorded`), `summary`, `date` |

### Relationship Types
| Relationship | Source Node | Target Node | Semantics |
| :--- | :--- | :--- | :--- |
| `:HAS_TASK` | `Project` | `Task` | Project owns the development task |
| `:HAS_BUG` | `Project` | `Bug` | Project tracks the unresolved bug |
| `:HAS_DECISION` | `Project` | `Decision` | Project records an architectural or technical decision |
| `:MENTIONED` | `Session` | `Task` | Session explicitly flagged or created the task |
| `:RECORDED` | `Session` | `Decision` | Session formalized the technical decision |
| `:ASSIGNED_TO` | `Bug` | `Person` | Bug is assigned to a team member |

### Knowledge Graph Topology Diagram

```
       ┌────────────────────────────────────────────────────────┐
       │                 Project: DevRecall                     │
       └────┬───────────────────┬──────────────────────┬────────┘
            │:HAS_TASK          │:HAS_BUG              │:HAS_DECISION
            ▼                   ▼                      ▼
      ┌───────────┐       ┌───────────┐          ┌───────────┐
      │   Task    │       │    Bug    │          │ Decision  │
      └─────▲─────┘       └─────┬─────┘          └───────────┘
            │:MENTIONED         │:ASSIGNED_TO
            │                   ▼
      ┌─────┴─────┐       ┌───────────┐
      │  Session  │       │  Person   │
      └───────────┘       └───────────┘
```

---

## Core Features Verified in Code

### 1. Scoped Evidence Retrieval & Cartesian-Product Elimination
Unlike naive graph joins with multiple unconstrained `OPTIONAL MATCH` clauses that cause Cartesian row explosion and duplicate combinations, DevRecall executes focused single-pattern queries in parallel (`Promise.all`) and merges relationships deterministically in Node.js.
- **Result**: No duplicate rows, no false combinations, and evidence trails containing *only* true relationships returned by FalkorDB.

### 2. Relevant Evidence Only
- **Unrelated Decision Exclusion**: If a user asks *"Which decisions affect the unresolved login bug?"*, the system checks `MATCH (b:Bug)-[r]-(d:Decision)`. If no direct edge exists, unrelated project decisions (such as `"myproject"` or general storage decisions) are **excluded** from the evidence trail and answer.
- **Last Session Isolation**: When asking *"What happened in our last session?"*, unlinked project tasks are omitted from the session's evidence trail. Only tasks with genuine `:MENTIONED` links to that session are returned.

### 3. Clear Distinction: Recorded Facts vs. Suggestions
Every response partitions output into:
- `recordedFacts`: Summary strictly limited to explicit FalkorDB records (dates, summaries, statuses, assignments).
- `suggestedAction`: Advisory recommendation explicitly tagged as `Suggestion: ...`. DevRecall refuses to claim a task resolves a bug unless an explicit graph edge or session record confirms that relationship.

### 4. Date Robustness
- Supported date formats: ISO `YYYY-MM-DD`, full ISO `YYYY-MM-DDTHH:mm:ssZ`, or valid millisecond timestamps.
- Sessions are sorted by valid timestamp descending (`tB - tA`).
- Sessions with invalid or missing dates are safely sorted to the bottom and explicitly labeled as undated (`Session #<id>`), preventing missing dates from being treated as recent.

### 5. Zero-Hallucination Unsupported Queries
- When queries fall outside supported graph domains (e.g., *"What is our Kubernetes deployment status?"*), intent resolution classifies them as `unknown`.
- DevRecall bypasses LLM generation, returning 0 records, 0 evidence hops, and:
  > *"No matching record exists in the project memory graph."*

### 6. Interactive Graph Memory Explorer & Evidence Trail
- The React frontend provides an interactive **Topology Map** and **Relationship Card Explorer**.
- Every response renders clickable **Evidence Trail Chips** (`Session -[MENTIONED]-> Task`). Clicking any node chip automatically selects and highlights that entity in the Graph Explorer inspector panel.

### 7. Explicit Memory Creation & Duplicate Protection
- DevRecall allows developers to record new `Task` or `Decision` nodes directly via `/api/memory`.
- **Duplicate Prevention**: If a task or decision with the same title already exists under the project, the backend rejects it with an HTTP `409 Conflict`, requiring `allowUpdate: true` or a `PUT` request to update properties.

---

## Real Cypher Queries Used in Implementation

The following queries are actively implemented in [`backend/server.js`](backend/server.js):

### 1. Graph Explorer Topology
```cypher
-- Fetch all nodes with labels and properties
MATCH (n)
RETURN id(n) AS id, labels(n) AS labels, properties(n) AS props;

-- Fetch all directional edges with labels and properties
MATCH (a)-[r]->(b)
RETURN id(a) AS fromId,
       labels(a) AS fromLabels,
       type(r) AS type,
       id(b) AS toId,
       labels(b) AS toLabels,
       properties(r) AS props;
```

### 2. Latest Session & Session Mentions
```cypher
-- Retrieve all sessions for chronological date sorting
MATCH (s:Session)
RETURN id(s) AS id, s.date AS date, s.summary AS summary;

-- Scoped retrieval of tasks mentioned in a specific session
MATCH (s:Session)-[r:MENTIONED]->(t:Task)
WHERE id(s) = $sessionId
RETURN id(s) AS sessionId,
       s.date AS sessionDate,
       s.summary AS sessionSummary,
       id(t) AS taskId,
       COALESCE(t.title, t.task, '') AS taskTitle,
       COALESCE(t.status, 'pending') AS taskStatus,
       type(r) AS rel;
```

### 3. Pending Tasks & Scoped Traversal
```cypher
-- 1. Fetch pending tasks
MATCH (t:Task)
WHERE toLower(toString(t.status)) = 'pending'
RETURN id(t) AS id,
       COALESCE(t.title, t.task, '') AS title,
       COALESCE(t.status, 'pending') AS status,
       t.summary AS summary,
       t.date AS date;

-- 2. Fetch project ownership
MATCH (p:Project)-[r:HAS_TASK]->(t:Task)
WHERE toLower(toString(t.status)) = 'pending'
RETURN id(t) AS taskId, p.name AS project, type(r) AS projectRel;

-- 3. Fetch session origin
MATCH (s:Session)-[r:MENTIONED]->(t:Task)
WHERE toLower(toString(t.status)) = 'pending'
RETURN id(t) AS taskId, s.date AS sessionDate, s.summary AS sessionSummary, type(r) AS sessionRel;
```

### 4. Direct Bug-Decision Relevance Check
```cypher
-- Strict verification of direct relationships between bugs and decisions
MATCH (b:Bug)
MATCH (d:Decision)
MATCH (b)-[r]-(d)
RETURN b.title AS bug, d.title AS decision, type(r) AS rel;
```

### 5. Bug Assignments
```cypher
-- Fetch bugs with project and assignee edges
MATCH (b:Bug)
RETURN id(b) AS id,
       COALESCE(b.title, b.name, '') AS title,
       COALESCE(b.status, 'assigned') AS status;

MATCH (b:Bug)-[r:ASSIGNED_TO]->(pers:Person)
RETURN id(b) AS bugId, pers.name AS assignee, type(r) AS assignRel;

MATCH (p:Project)-[r:HAS_BUG]->(b:Bug)
RETURN id(b) AS bugId, p.name AS project, type(r) AS bugRel;
```

### 6. Duplicate Protection & Memory Creation
```cypher
-- Duplicate memory detection
MATCH (p:Project {name: $projectName})-[]->(m)
WHERE (m:Task OR m:Decision) AND toLower(COALESCE(m.title, m.task, m.decision, '')) = toLower($title)
RETURN labels(m) AS labels, COALESCE(m.title, m.task, m.decision, '') AS title, m.status AS status;

-- Creating Task linked to Project
MERGE (p:Project {name: $projectName})
CREATE (t:Task {title: $title, task: $title, status: $status, summary: $summary, date: $date})
CREATE (p)-[:HAS_TASK]->(t)
RETURN t.title AS title, t.status AS status, t.summary AS summary, t.date AS date;
```

---

## Supported Copilot Questions & Behaviors

DevRecall is validated against the following standard developer inquiries:

1. **"What happened in our last session?"**
   - *Behavior*: Identifies latest session (e.g. `2026-10-16`), returns session summary (`"Login bug identified; fix is pending"`), and retrieves only tasks linked via `:MENTIONED` (`'Fix login token expiry'`).
   - *Evidence Trail*: `(Session: Session 2026-10-16) -[MENTIONED]-> (Task: Fix login token expiry)`.
2. **"What is still pending from the previous session?"**
   - *Behavior*: Returns `'Fix login token expiry'` as session-linked (`sessionLinked: true`) and notes project-level `'Implement session tagging'` as unlinked (`sessionLinked: false`).
   - *Evidence Trail*: `Project -[HAS_TASK]-> Task 2`, `Session -[MENTIONED]-> Task 2`, `Project -[HAS_TASK]-> Task 6`.
3. **"Which decisions affect the unresolved login bug?"**
   - *Behavior*: Checks for direct edges between `Bug` and `Decision`. Since 0 direct edges exist, it excludes unrelated decisions (such as `"myproject"`) and explicitly states that no decisions affect this bug.
   - *Evidence Trail*: `Project -[HAS_BUG]-> Bug`, `Bug -[ASSIGNED_TO]-> Person (Rahul)`.
4. **"What should I work on next, based on our recorded project context?"**
   - *Behavior*: Evaluates pending tasks, session context, and bug assignments. Suggests prioritizing `'Fix login token expiry'` while explicitly clarifying that the graph contains no edge confirming the task resolves Rahul's assigned bug.
5. **"What did we decide earlier, and what related task remains unfinished?"**
   - *Behavior*: Returns recorded project decisions (`'Adopt FalkorDB Cloud for Graph Memory'`) alongside unfinished tasks, explicitly clarifying that no direct relationship links the decisions to the tasks.
6. **"What is our Kubernetes deployment status?"** *(Unsupported)*
   - *Behavior*: Classified as `unknown`. Returns zero memories, zero evidence hops, and confirms that no matching record exists in the memory graph.

---

## Tech Stack

- **Graph Database**: [FalkorDB Cloud](https://falkordb.com/) (Redis-based Graph Database using Cypher)
- **Database Client**: `falkordb` v6.8.0
- **Backend**: Node.js (v20+) with Express v5.3.0, `cors`, `dotenv`
- **LLM Grounding**: Google Gemini (`gemini-3.8-flash` via Google Generative AI REST API)
- **Frontend**: React 19, Vite 8, Lucide React icons, Vanilla CSS Design System

---

## Local Setup & Installation

### Prerequisites
- **Node.js**: v20.x or higher
- **npm**: v9.x or higher
- **FalkorDB Instance**: A FalkorDB Cloud database or local FalkorDB Docker container
- **Google Gemini API Key**: *(Optional)* Required for LLM answer synthesis; if omitted or rate-limited, DevRecall automatically falls back to deterministic graph responses.

### 1. Clone the Repository
```bash
git clone https://github.com/<your-username>/devrecall.git
cd devrecall
```

### 2. Configure Backend Environment
Navigate to the `backend/` directory and create a `.env` file:
```bash
cd backend
cp .env.example .env # or create .env directly
```

Populate `backend/.env` with your credentials:
```env
# FalkorDB Connection (Cloud or Local)
# Option A: Single Connection URL
FALKORDB_URL=falkor://your_username:your_password@your_falkordb_host:port

# Option B: Host/Port parameters (used if FALKORDB_URL is omitted)
# FALKORDB_HOST=127.0.0.1
# FALKORDB_PORT=6379
# FALKORDB_USERNAME=default
# FALKORDB_PASSWORD=your_password

# Graph Name (default: devrecall)
FALKORDB_GRAPH=devrecall

# Server Port (default: 5000)
PORT=5000

# Google Gemini API Configuration (Optional)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.8-flash
```

> **Security Notice**: Never commit `.env` or paste real database passwords and API keys into version control.

### 3. Install Dependencies
```bash
# Install backend dependencies
cd ../backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 4. Start the Application
Run both servers in separate terminal windows:

**Terminal 1 — Backend Server:**
```bash
cd backend
npm start
# Server starts on http://localhost:5000
```

**Terminal 2 — Frontend Dev Server:**
```bash
cd frontend
npm run dev
# Frontend starts on http://localhost:5173
```

Open your browser at `http://localhost:5173` to explore DevRecall.

---

## API Documentation

| Method | Endpoint | Description | Sample Request / Query |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Backend healthcheck and database connectivity | `GET /` |
| `GET` | `/api/graph` | Returns complete graph topology for Explorer | `GET /api/graph` |
| `GET` | `/api/recall` | Recalls memories and generates grounded copilot answer | `GET /api/recall?q=What happened in our last session?` |
| `POST` | `/api/recall` | Recalls memories via JSON body | `POST /api/recall` `{"question": "..."}` |
| `POST` | `/api/memory` | Creates a new task or decision with duplicate check | `POST /api/memory` `{"type": "task", "title": "Fix token", "status": "pending"}` |
| `PUT` | `/api/memory` | Updates an existing task or decision | `PUT /api/memory` `{"type": "task", "title": "Fix token", "status": "completed"}` |

---

## Code Quality & Verification Commands

All lint and production build commands have been verified locally:

```bash
# Run ESLint on the frontend
cd frontend
npm run lint

# Run Vite production bundle build
npm run build
```

---

## Troubleshooting

1. **FalkorDB Connection Timeout (`ECONNRESET` / `ETIMEDOUT`)**:
   - Ensure your FalkorDB Cloud instance is active.
   - Verify that your IP address is allowed in your FalkorDB Cloud security settings.
   - Check that `FALKORDB_URL` contains the correct protocol prefix (`falkor://` or `falkors://` for SSL).
2. **Gemini API 429 Rate Limits**:
   - Free tier keys may trigger temporary rate limits under frequent requests.
   - DevRecall detects HTTP 429 / 503 automatically and switches to graph-grounded deterministic template answers without breaking the user experience.
3. **Frontend Port Conflict**:
   - If port `5173` is occupied, Vite will select the next available port (e.g. `5174`). Ensure backend CORS allows requests from your local frontend URL.

---

## AI Assistant Disclosure

In the spirit of hackathon transparency:
- **AI Tooling Used**: Google DeepMind's Antigravity agentic coding assistant was utilized during the development process to assist with code navigation, Cypher query optimization, bug auditing, and documentation drafting.
- **Human Responsibility**: The submitter is responsible for testing, verifying the graph data, validating all responses against FalkorDB, and understanding the entire submitted codebase.

---

## Items Requiring Submitter Manual Verification

Before submitting to the hackathon portal, please manually check the following:
- [ ] **Demo Video**: Record a 3-5 minute demonstration of DevRecall, upload to YouTube/Loom, and replace the `[TODO]` demo video placeholder above.
- [ ] **Repository Visibility**: Verify that your GitHub repository is public or shared with hackathon evaluators.
- [ ] **FalkorDB Credentials**: Ensure no real credentials or `.env` files are tracked in git (`git status`).
- [ ] **Submission Portal**: Confirm submission under **Track 02: Agent Memory and Coordination** on Devfolio/WeMakeDevs.
=======
# DevRecall
Graph-powered AI memory agent using FalkorDB for persistent recall and explainable evidence trails.
>>>>>>> 7ac56c6e07ba24ac118dc1aef57ec4379edd5c81
