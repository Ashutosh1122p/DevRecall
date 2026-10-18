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
    if (rows.length) console.log(JSON.stringify(rows.slice(0, 3), null, 2));
  } catch (e) {
    console.log(`\n### ${label}\nFAIL: ${e.message}`);
  }
}

// Pattern used in handleSaveMemory line 1347
await run("save-memory target pattern", `
  MATCH (p:Project {name: 'evalX'})-[]->(target)
  WHERE (target:Task OR target:Bug)
    AND toLower(coalesce(target.title, target.task, target.decision, target.name, '')) = toLower('authentication')
  RETURN id(target) AS id LIMIT 1
`);

// Pattern used in move endpoint line 1888
await run("move optional pattern", `
  MATCH (m)-[r]-(other) WHERE id(m) = 9
  OPTIONAL MATCH (p:Project)-[]->(other)
  RETURN type(r) AS type, labels(other) AS labels, id(other) AS id,
         coalesce(other.title, other.name, other.task, other.decision) AS title,
         collect(DISTINCT p.name) AS projects
  LIMIT 3
`);

// Create relationship with param interpolation (type from allowlist)
await run("create rel param", `
  MATCH (a),(b) WHERE id(a) = 8 AND id(b) = 9
  CREATE (a)-[r:HAS_TASK]->(b) RETURN type(r) AS type
`);

// DELETE with OPTIONAL pattern
await run("delete rel optional", `
  MATCH (a)-[r]->(b) WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  WHERE p IS NOT NULL
  DELETE r RETURN type(r) AS type
`);

// Check both endpoints in project via OPTIONAL
await run("both endpoints optional", `
  MATCH (a)-[r]->(b) WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  OPTIONAL MATCH (q:Project {name: 'evalX'})-[]->(b)
  WHERE p IS NOT NULL AND q IS NOT NULL
  RETURN type(r) AS type
`);

// Test label OR in MATCH clause (FalkorDB may reject)
await run("label OR in match", `
  MATCH (p:Project {name: 'evalX'})-[]->(target:Task|Bug)
  RETURN id(target) AS id LIMIT 5
`);

await db.close();