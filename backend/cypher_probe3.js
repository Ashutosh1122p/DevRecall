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

// a is the Project node itself (8). Need p = a to pass.
await run("opt p=a OR p IS NOT NULL", `
  MATCH (a)-[r]->(b) WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  WHERE p IS NOT NULL OR p = a
  RETURN type(r) AS type, id(a) AS aId
`);

// WHERE clause pattern (p)-[]->(a) as boolean
await run("WHERE pattern (p)-[]->(a)", `
  MATCH (a)-[r]->(b) WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  MATCH (p:Project {name: 'evalX'})
  WHERE p = a OR (p)-[]->(a)
  RETURN type(r) AS type
`);

// a is a project-owned node (Task 9). p IS NOT NULL should pass.
await run("opt for task node", `
  MATCH (a)-[r]->(b) WHERE id(a) = 9 AND id(b) = 10 AND type(r) = 'HAS_TASK'
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  WHERE p IS NOT NULL OR p = a
  RETURN type(r) AS type, id(a) AS aId
`);

// a is a shared Person node (13). Neither p=a nor edge. Should be 0 rows.
await run("opt for person node", `
  MATCH (a)-[r]->(b) WHERE id(a) = 13 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  WHERE p IS NOT NULL OR p = a
  RETURN type(r) AS type, id(a) AS aId
`);

// Verify p=a works when a IS the project node
await run("p = a identity", `
  MATCH (a)-[r]->(b) WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  MATCH (p:Project {name: 'evalX'})
  WHERE p = a
  RETURN type(r) AS type
`);

await db.close();