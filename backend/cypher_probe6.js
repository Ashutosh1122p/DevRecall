import { FalkorDB } from "falkordb";
import { readFileSync } from "node:fs";

for (const line of readFileSync("D:/devrecall/backend/.env", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const db = await FalkorDB.connect({
  url: process.env.FALKORDB_URL,
  username: process.env.FALKORDB_USERNAME,
  password: process.env.FALKORDB_PASSWORD,
  socket: { connectTimeout: 10000 },
});
const graph = db.selectGraph(process.env.FALKORDB_GRAPH || "devrecall");

async function run(label, q, params = {}) {
  try {
    const res = await graph.query(q, { params });
    const rows = Array.isArray(res.data) ? res.data : [];
    console.log(`\n### ${label}\nOK rows=${rows.length}`);
    if (rows.length) console.log(JSON.stringify(rows.slice(0, 5), null, 2));
  } catch (e) {
    console.log(`\n### ${label}\nFAIL: ${e.message}`);
  }
}

await run("all edges", `MATCH (a)-[r]->(b) RETURN id(a) AS a, id(b) AS b, type(r) AS t`);
await run("param id(a)=8", `MATCH (a)-[r]->(b) WHERE id(a) = $x RETURN id(a) AS a, id(b) AS b, type(r) AS t`, { x: 8 });
await run("literal id(a)=8", `MATCH (a)-[r]->(b) WHERE id(a) = 8 RETURN id(a) AS a, id(b) AS b, type(r) AS t`);
await run("literal id(a)=0", `MATCH (a)-[r]->(b) WHERE id(a) = 0 RETURN id(a) AS a, id(b) AS b, type(r) AS t`);
await run("param id(a)=0", `MATCH (a)-[r]->(b) WHERE id(a) = $x RETURN id(a) AS a, id(b) AS b, type(r) AS t`, { x: 0 });
await run("all nodes ids", `MATCH (n) RETURN id(n) AS id, labels(n) AS labels`);

await db.close();