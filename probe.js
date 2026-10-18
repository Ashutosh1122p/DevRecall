import http from "node:http";

function req(method, path, body, base = "http://localhost:5000") {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const data = body ? JSON.stringify(body) : null;
    const opts = { method, headers: { "Content-Type": "application/json" } };
    if (data) opts["Content-Length"] = Buffer.byteLength(data);
    const r = http.request(url, opts, (res) => {
      const chunks = [];
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

const tests = {
  async graph_evalx() { return await req("GET", "/api/graph?projectName=evalX"); },
  async graph_devrecall() { return await req("GET", "/api/graph?projectName=DevRecall"); },
  async delete_rel() { return await req("DELETE", "/api/relationship", { fromId: 8, toId: 9, type: "HAS_TASK", projectName: "evalX" }); },
  async post_rel_valid() { return await req("POST", "/api/relationships", { fromId: 8, toId: 9, type: "HAS_TASK", projectName: "evalX" }); },
  async post_rel_invalid_type() { return await req("POST", "/api/relationships", { fromId: 8, toId: 9, type: "BANANA", projectName: "evalX" }); },
  async post_rel_invalid_source() { return await req("POST", "/api/relationships", { fromId: 13, toId: 9, type: "MENTIONED", projectName: "evalX" }); },
  async patch_mem_suresh() { return await req("PATCH", "/api/memory/13", { projectName: "evalX", updates: { name: "suresh2" } }); },
  async patch_mem_suresh_wrongproj() { return await req("PATCH", "/api/memory/13", { projectName: "DevRecall", updates: { name: "suresh3" } }); },
  async patch_mem_missing() { return await req("PATCH", "/api/memory/99999", { projectName: "evalX", updates: { name: "x" } }); },
  async recall() { return await req("GET", "/api/recall?projectName=evalX"); },
};

const [name] = process.argv.slice(2);
const fn = tests[name];
if (!fn) { console.error("Unknown:", name, Object.keys(tests).join(",")); process.exit(1); }
const out = await fn();
console.log(JSON.stringify(out, null, 2));