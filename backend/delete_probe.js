import http from "node:http";

function raw(method, path, bodyStr, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, "http://localhost:5000");
    const opts = { method, headers: { ...extraHeaders, Connection: "close" } };
    const r = http.request(url, opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    r.on("error", (e) => resolve({ status: null, error: e.code || e.message }));
    if (bodyStr) r.write(bodyStr);
    r.end();
  });
}

const cases = [
  ["DELETE body json", "DELETE", "/api/relationship", JSON.stringify({ fromId: 8, toId: 9, type: "HAS_TASK", projectName: "evalX" }), { "Content-Type": "application/json" }],
  ["DELETE body text/plain", "DELETE", "/api/relationship", JSON.stringify({ fromId: 8, toId: 9, type: "HAS_TASK", projectName: "evalX" }), { "Content-Type": "text/plain" }],
  ["DELETE empty body", "DELETE", "/api/relationship", "", { "Content-Type": "application/json" }],
  ["DELETE query params", "DELETE", "/api/relationship?fromId=8&toId=9&type=HAS_TASK&projectName=evalX", "", {}],
  ["DELETE form-urlencoded", "DELETE", "/api/relationship", "fromId=8&toId=9&type=HAS_TASK&projectName=evalX", { "Content-Type": "application/x-www-form-urlencoded" }],
  ["POST rel valid", "POST", "/api/relationships", JSON.stringify({ fromId: 8, toId: 9, type: "HAS_TASK", projectName: "evalX" }), { "Content-Type": "application/json" }],
  ["POST rel bad type", "POST", "/api/relationships", JSON.stringify({ fromId: 8, toId: 9, type: "BANANA", projectName: "evalX" }), { "Content-Type": "application/json" }],
];

for (const [label, method, path, body, headers] of cases) {
  const r = await raw(method, path, body, headers);
  console.log(`${label.padEnd(28)} -> ${r.status ?? "ERR"} ${r.error ?? ""} ${r.body?.slice(0, 160) ?? ""}`);
}