// DevRecall API test helper. Runs against http://localhost:5000.
// Usage: node test_api.js <name> [args...]
import http from "node:http";

const BASE = process.env.BASE || "http://localhost:5000";

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (data) opts["Content-Length"] = Buffer.byteLength(data);
    const r = http.request(url, opts, (res) => {
      let chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed = text;
        try { parsed = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, body: parsed, raw: text });
      });
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

async function graph(projectName) {
  const q = projectName ? `?projectName=${encodeURIComponent(projectName)}` : "";
  const r = await req("GET", `/api/graph${q}`);
  return r.body;
}

const tests = {
  async graph_evalx() { return await graph("evalX"); },

  async edit_suresh() {
    return await req("PATCH", "/api/memory/13", { projectName: "evalX", updates: { name: "suresh2" } });
  },

  async edit_suresh_wrongproject() {
    return await req("PATCH", "/api/memory/13", { projectName: "DevRecall", updates: { name: "suresh3" } });
  },

  async create_rel_invalid_source() {
    // Person -> Task via MENTIONED (source must be Session)
    return await req("POST", "/api/relationships", { fromId: 13, toId: 9, type: "MENTIONED", projectName: "evalX" });
  },

  async create_rel_invalid_type() {
    return await req("POST", "/api/relationships", { fromId: 13, toId: 9, type: "BANANA", projectName: "evalX" });
  },

  async create_rel_valid() {
    // Project -> Task via HAS_TASK is valid per REL_ENDPOINT_RULES
    return await req("POST", "/api/relationships", { fromId: 8, toId: 9, type: "HAS_TASK", projectName: "evalX" });
  },

  async remove_rel() {
    return await req("DELETE", "/api/relationship", { fromId: 8, toId: 9, type: "HAS_TASK", projectName: "evalX" });
  },

  async remove_rel_missing() {
    return await req("DELETE", "/api/relationship", { fromId: 8, toId: 10, type: "HAS_TASK", projectName: "evalX" });
  },

  async recall() {
    return await req("GET", "/api/recall?projectName=evalX");
  },
};

const [name, ...rest] = process.argv.slice(2);
const fn = tests[name];
if (!fn) {
  console.error("Unknown test:", name, "\nAvailable:", Object.keys(tests).join(", "));
  process.exit(1);
}
try {
  const out = await fn(rest);
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  console.error("TEST ERROR:", e.message);
  process.exit(1);
}