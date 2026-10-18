import http from "node:http";

function probe(port) {
  return new Promise((resolve) => {
    const r = http.get({ host: "127.0.0.1", port, path: "/api/graph?projectName=evalX", timeout: 800 }, (res) => {
      let chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ port, status: res.statusCode, body: Buffer.concat(chunks).toString("utf8").slice(0, 120) }));
    });
    r.on("error", (e) => resolve({ port, error: e.code }));
    r.on("timeout", () => { r.destroy(); resolve({ port, error: "timeout" }); });
  });
}

const results = await Promise.all(Array.from({ length: 12 }, (_, i) => probe(5000 + i)));
for (const r of results) console.log(r);