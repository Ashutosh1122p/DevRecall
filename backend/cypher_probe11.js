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

// Isolate: OPTIONAL MATCH then WHERE with no prior MATCH
await run("opt only a=3 evalX", `
  MATCH (a) WHERE id(a) = 3
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  WHERE p = a OR p IS NOT NULL
  RETURN id(a) AS a, id(p) AS p
`);

await run("opt only a=3 devrecall", `
  MATCH (a) WHERE id(a) = 3
  OPTIONAL MATCH (p:Project {name: 'DevRecall'})-[]->(a)
  WHERE p = a OR p IS NOT NULL
  RETURN id(a) AS a, id(p) AS p
`);

// WHERE p IS NOT NULL only
await run("opt WHERE p IS NOT NULL a=3 evalX", `
  MATCH (a) WHERE id(a) = 3
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  WHERE p IS NOT NULL
  RETURN id(a) AS a, id(p) AS p
`);

// WHERE p = a only
await run("opt WHERE p = a a=3 evalX", `
  MATCH (a) WHERE id(a) = 3
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  WHERE p = a
  RETURN id(a) AS a, id(p) AS p
`);

// WHERE p = a only a=0 devrecall
await run("opt WHERE p = a a=0 devrecall", `
  MATCH (a) WHERE id(a) = 0
  OPTIONAL MATCH (p:Project {name: 'DevRecall'})-[]->(a)
  WHERE p = a
  RETURN id(a) AS a, id(p) AS p
`);

// WHERE p IS NOT NULL only a=3 devrecall
await run("opt WHERE p IS NOT NULL a=3 devrecall", `
  MATCH (a) WHERE id(a) = 3
  OPTIONAL MATCH (p:Project {name: 'DevRecall'})-[]->(a)
  WHERE p IS NOT NULL
  RETURN id(a) AS a, id(p) AS p
`);

// WHERE p IS NOT NULL only a=8 evalX
await run("opt WHERE p IS NOT NULL a=8 evalX", `
  MATCH (a) WHERE id(a) = 8
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  WHERE p IS NOT NULL
  RETURN id(a) AS a, id(p) AS p
`);

// WHERE p IS NOT NULL only a=9 evalX (task owned by project)
await run("opt WHERE p IS NOT NULL a=9 evalX", `
  MATCH (a) WHERE id(a) = 9
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  WHERE p IS NOT NULL
  RETURN id(a) AS a, id(p) AS p
`);

await db.close();