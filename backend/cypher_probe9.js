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

// Real edges to test ownership of the SOURCE endpoint `a`:
//   8->9  HAS_TASK   (a=8 is the evalX project node itself)
//   3->4  ASSIGNED_TO (a=3 is a Bug owned by DevRecall project 0)
//   0->2  HAS_TASK   (a=0 is the DevRecall project node itself)

await run("opt p=a OR p IS NOT NULL | a=8 evalX", `
  MATCH (a)-[r]->(b) WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  WHERE p = a OR p IS NOT NULL
  RETURN type(r) AS type, id(a) AS aId, id(p) AS pId
`);

await run("opt p=a OR p IS NOT NULL | a=3 devrecall", `
  MATCH (a)-[r]->(b) WHERE id(a) = 3 AND id(b) = 4 AND type(r) = 'ASSIGNED_TO'
  OPTIONAL MATCH (p:Project {name: 'DevRecall'})-[]->(a)
  WHERE p = a OR p IS NOT NULL
  RETURN type(r) AS type, id(a) AS aId, id(p) AS pId
`);

await run("opt p=a OR p IS NOT NULL | a=0 devrecall", `
  MATCH (a)-[r]->(b) WHERE id(a) = 0 AND id(b) = 2 AND type(r) = 'HAS_TASK'
  OPTIONAL MATCH (p:Project {name: 'DevRecall'})-[]->(a)
  WHERE p = a OR p IS NOT NULL
  RETURN type(r) AS type, id(a) AS aId, id(p) AS pId
`);

// Cross-project: a=3 (DevRecall bug) checked against evalX -> should be 0 rows
await run("opt p=a OR p IS NOT NULL | a=3 evalX (cross)", `
  MATCH (a)-[r]->(b) WHERE id(a) = 3 AND id(b) = 4 AND type(r) = 'ASSIGNED_TO'
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  WHERE p = a OR p IS NOT NULL
  RETURN type(r) AS type, id(a) AS aId, id(p) AS pId
`);

// DELETE version
await run("DELETE opt p=a OR p IS NOT NULL | a=8 evalX", `
  MATCH (a)-[r]->(b) WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  WHERE p = a OR p IS NOT NULL
  DELETE r RETURN type(r) AS type
`);

// Re-create the edge
await run("recreate 8->9", `
  MATCH (a),(b) WHERE id(a) = 8 AND id(b) = 9
  CREATE (a)-[r:HAS_TASK]->(b) RETURN type(r) AS type
`);

// Verify both endpoints owned (for create relationship scope check)
await run("both endpoints owned | 8->9 evalX", `
  MATCH (a)-[r]->(b) WHERE id(a) = 8 AND id(b) = 9
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  OPTIONAL MATCH (q:Project {name: 'evalX'})-[]->(b)
  WHERE (p = a OR p IS NOT NULL) AND (q = b OR q IS NOT NULL)
  RETURN id(a) AS a, id(b) AS b, id(p) AS p, id(q) AS q
`);

await run("both endpoints owned | 3->4 devrecall", `
  MATCH (a)-[r]->(b) WHERE id(a) = 3 AND id(b) = 4
  OPTIONAL MATCH (p:Project {name: 'DevRecall'})-[]->(a)
  OPTIONAL MATCH (q:Project {name: 'DevRecall'})-[]->(b)
  WHERE (p = a OR p IS NOT NULL) AND (q = b OR q IS NOT NULL)
  RETURN id(a) AS a, id(b) AS b, id(p) AS p, id(q) AS q
`);

await run("both endpoints owned | 3->4 evalX (cross)", `
  MATCH (a)-[r]->(b) WHERE id(a) = 3 AND id(b) = 4
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  OPTIONAL MATCH (q:Project {name: 'evalX'})-[]->(b)
  WHERE (p = a OR p IS NOT NULL) AND (q = b OR q IS NOT NULL)
  RETURN id(a) AS a, id(b) AS b, id(p) AS p, id(q) AS q
`);

await db.close();