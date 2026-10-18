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

// Confirm edge exists
await run("edge exists", `MATCH (a)-[r]->(b) WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK' RETURN type(r) AS type`);

// OPTIONAL MATCH scope check for a=8 (project node)
await run("opt a=8", `
  MATCH (a)-[r]->(b) WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  WHERE p IS NOT NULL
  RETURN type(r) AS type, id(a) AS aId
`);

// OPTIONAL MATCH scope check for a=9 (task node owned by evalX)
await run("opt a=9", `
  MATCH (a)-[r]->(b) WHERE id(a) = 9 AND id(b) = 10 AND type(r) = 'HAS_TASK'
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  WHERE p IS NOT NULL
  RETURN type(r) AS type, id(a) AS aId
`);

// OPTIONAL MATCH scope check for a=13 (person, shared)
await run("opt a=13", `
  MATCH (a)-[r]->(b) WHERE id(a) = 13 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  WHERE p IS NOT NULL
  RETURN type(r) AS type, id(a) AS aId
`);

// OPTIONAL MATCH scope check for a=0 (DevRecall project) with projectName=evalX
await run("opt a=0 evalX", `
  MATCH (a)-[r]->(b) WHERE id(a) = 0 AND id(b) = 2 AND type(r) = 'HAS_TASK'
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  WHERE p IS NOT NULL
  RETURN type(r) AS type, id(a) AS aId
`);

// Comma join form
await run("comma join", `
  MATCH (p:Project {name: 'evalX'})-[]->(a), (a)-[r]->(b)
  WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  RETURN type(r) AS type
`);

// Two separate MATCH lines
await run("two match lines", `
  MATCH (p:Project {name: 'evalX'})-[]->(a)
  MATCH (a)-[r]->(b)
  WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  RETURN type(r) AS type
`);

await db.close();