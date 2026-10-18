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

// WHERE p IS NOT NULL as a standalone predicate on a node with no OPTIONAL
await run("WHERE p IS NOT NULL no opt a=3 evalX", `
  MATCH (a) WHERE id(a) = 3
  WHERE (p:Project {name: 'evalX'})-[]->(a)
  RETURN id(a) AS a
`);

await run("WHERE p IS NOT NULL no opt a=3 devrecall", `
  MATCH (a) WHERE id(a) = 3
  WHERE (p:Project {name: 'DevRecall'})-[]->(a)
  RETURN id(a) AS a
`);

// WHERE pattern as predicate
await run("WHERE pattern a=8 evalX", `
  MATCH (a) WHERE id(a) = 8
  WHERE (p:Project {name: 'evalX'})-[]->(a)
  RETURN id(a) AS a
`);

await run("WHERE pattern a=9 evalX", `
  MATCH (a) WHERE id(a) = 9
  WHERE (p:Project {name: 'evalX'})-[]->(a)
  RETURN id(a) AS a
`);

await run("WHERE pattern a=13 evalX", `
  MATCH (a) WHERE id(a) = 13
  WHERE (p:Project {name: 'evalX'})-[]->(a)
  RETURN id(a) AS a
`);

await run("WHERE pattern a=3 evalX", `
  MATCH (a) WHERE id(a) = 3
  WHERE (p:Project {name: 'evalX'})-[]->(a)
  RETURN id(a) AS a
`);

// OPTIONAL MATCH with WHERE inside
await run("opt WHERE inside a=3 evalX", `
  MATCH (a) WHERE id(a) = 3
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a) WHERE p IS NOT NULL
  RETURN id(a) AS a, id(p) AS p
`);

await run("opt WHERE inside a=9 evalX", `
  MATCH (a) WHERE id(a) = 9
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a) WHERE p IS NOT NULL
  RETURN id(a) AS a, id(p) AS p
`);

await run("opt WHERE inside a=8 evalX", `
  MATCH (a) WHERE id(a) = 8
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a) WHERE p IS NOT NULL
  RETURN id(a) AS a, id(p) AS p
`);

// Two OPTIONAL MATCHs
await run("two opt a=3 evalX", `
  MATCH (a) WHERE id(a) = 3
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  OPTIONAL MATCH (q:Project {name: 'evalX'})-[]->(a)
  RETURN id(a) AS a, id(p) AS p, id(q) AS q
`);

await run("two opt a=3 devrecall", `
  MATCH (a) WHERE id(a) = 3
  OPTIONAL MATCH (p:Project {name: 'DevRecall'})-[]->(a)
  OPTIONAL MATCH (q:Project {name: 'DevRecall'})-[]->(a)
  RETURN id(a) AS a, id(p) AS p, id(q) AS q
`);

await db.close();