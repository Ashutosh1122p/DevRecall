// Read-only FalkorDB Cypher probe. Connects using the same env as backend.
// No mutations are performed.
import { readFileSync } from "node:fs";
import { FalkorDB } from "falkordb";

// Load backend/.env manually (probe lives at project root).
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

// 1. The failing pattern: EXISTS((p)-[]->(a))
await run("EXISTS((p)-[]->(a))", `
  MATCH (a)-[r]->(b) WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  MATCH (p:Project {name: 'evalX'}) WHERE p = a OR EXISTS((p)-[]->(a))
  RETURN type(r) AS type
`);

// 2. Alternative: OPTIONAL MATCH + WHERE
await run("OPTIONAL MATCH (p)-[]->(a)", `
  MATCH (a)-[r]->(b) WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a)
  WHERE p IS NOT NULL
  RETURN type(r) AS type
`);

// 3. Direct project edge pattern
await run("direct project edge", `
  MATCH (p:Project {name: 'evalX'})-[]->(a), (a)-[r]->(b)
  WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  RETURN type(r) AS type
`);

// 4. Test label OR condition
await run("label OR condition", `
  MATCH (p:Project {name: 'evalX'})-[]->(target)
  WHERE (target:Task OR target:Bug)
  RETURN id(target) AS id LIMIT 5
`);

// 5. Test EXISTS with direction
await run("EXISTS directed", `
  MATCH (p:Project {name: 'evalX'})
  WHERE EXISTS((p)-[:HAS_TASK]->(a))
  RETURN p.name AS name LIMIT 5
`);

// 6. Test MATCH with variable length
await run("variable length", `
  MATCH (p:Project {name: 'evalX'})-[*1]->(a)
  RETURN id(a) AS id LIMIT 5
`);

// 7. Test parameterized relationship type interpolation
await run("param label interpolation", `
  MATCH (a),(b) WHERE id(a) = 8 AND id(b) = 9
  RETURN labels(a) AS aLabels LIMIT 1
`);

await db.close();