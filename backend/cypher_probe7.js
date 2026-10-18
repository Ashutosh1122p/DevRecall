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

// Restore the evalX Project(8) -> Task(9) HAS_TASK edge that was removed by earlier probes.
await run("restore 8->9 HAS_TASK", `
  MATCH (a),(b) WHERE id(a) = 8 AND id(b) = 9
  CREATE (a)-[r:HAS_TASK]->(b) RETURN type(r) AS type
`);

await run("verify 8->9 exists", `MATCH (a)-[r]->(b) WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK' RETURN type(r) AS type`);

// Now test WHERE pattern as boolean (p)-[]->(a)
await run("WHERE (p)-[]->(a) a=8", `
  MATCH (a)-[r]->(b) WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  MATCH (p:Project {name: 'evalX'})
  WHERE p = a OR (p)-[]->(a)
  RETURN type(r) AS type, id(a) AS aId
`);

await run("WHERE (p)-[]->(a) a=9", `
  MATCH (a)-[r]->(b) WHERE id(a) = 9 AND id(b) = 10 AND type(r) = 'HAS_TASK'
  MATCH (p:Project {name: 'evalX'})
  WHERE p = a OR (p)-[]->(a)
  RETURN type(r) AS type, id(a) AS aId
`);

await run("WHERE (p)-[]->(a) a=13 person", `
  MATCH (a)-[r]->(b) WHERE id(a) = 13 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  MATCH (p:Project {name: 'evalX'})
  WHERE p = a OR (p)-[]->(a)
  RETURN type(r) AS type, id(a) AS aId
`);

await run("WHERE (p)-[]->(a) a=0 devrecall", `
  MATCH (a)-[r]->(b) WHERE id(a) = 0 AND id(b) = 2 AND type(r) = 'HAS_TASK'
  MATCH (p:Project {name: 'evalX'})
  WHERE p = a OR (p)-[]->(a)
  RETURN type(r) AS type, id(a) AS aId
`);

// Comma-join form for a=8 (project node itself)
await run("comma join a=8", `
  MATCH (p:Project {name: 'evalX'})-[]->(a), (a)-[r]->(b)
  WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  RETURN type(r) AS type, id(a) AS aId
`);

// Comma-join form for a=9 (task owned by project)
await run("comma join a=9", `
  MATCH (p:Project {name: 'evalX'})-[]->(a), (a)-[r]->(b)
  WHERE id(a) = 9 AND id(b) = 10 AND type(r) = 'HAS_TASK'
  RETURN type(r) AS type, id(a) AS aId
`);

// OPTIONAL with p = a OR p IS NOT NULL
await run("OPTIONAL p=a OR p IS NOT NULL a=8", `
  MATCH (a)-[r]->(b) WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  WHERE p = a OR p IS NOT NULL
  RETURN type(r) AS type, id(a) AS aId, id(p) AS pId
`);

await run("OPTIONAL p=a OR p IS NOT NULL a=9", `
  MATCH (a)-[r]->(b) WHERE id(a) = 9 AND id(b) = 10 AND type(r) = 'HAS_TASK'
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  WHERE p = a OR p IS NOT NULL
  RETURN type(r) AS type, id(a) AS aId, id(p) AS pId
`);

await run("OPTIONAL p=a OR p IS NOT NULL a=13", `
  MATCH (a)-[r]->(b) WHERE id(a) = 13 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  WHERE p = a OR p IS NOT NULL
  RETURN type(r) AS type, id(a) AS aId, id(p) AS pId
`);

await db.close();