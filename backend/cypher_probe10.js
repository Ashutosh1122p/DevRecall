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

// Test WHERE before OPTIONAL
await run("WHERE before OPTIONAL a=3 evalX", `
  MATCH (a)-[r]->(b) WHERE id(a) = 3 AND id(b) = 4 AND type(r) = 'ASSIGNED_TO'
  WHERE EXISTS { MATCH (p:Project {name: 'evalX'})-[]->(a) }
  RETURN type(r) AS type, id(a) AS aId
`);

// Subquery EXISTS
await run("subquery EXISTS a=3 evalX", `
  MATCH (a)-[r]->(b) WHERE id(a) = 3 AND id(b) = 4 AND type(r) = 'ASSIGNED_TO'
  WHERE EXISTS { MATCH (p:Project {name: 'evalX'})-[]->(a) }
  RETURN type(r) AS type, id(a) AS aId
`);

// Subquery EXISTS a=3 devrecall
await run("subquery EXISTS a=3 devrecall", `
  MATCH (a)-[r]->(b) WHERE id(a) = 3 AND id(b) = 4 AND type(r) = 'ASSIGNED_TO'
  WHERE EXISTS { MATCH (p:Project {name: 'DevRecall'})-[]->(a) }
  RETURN type(r) AS type, id(a) AS aId
`);

// Subquery EXISTS a=8 evalX (a is project node itself)
await run("subquery EXISTS a=8 evalX", `
  MATCH (a)-[r]->(b) WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  WHERE EXISTS { MATCH (p:Project {name: 'evalX'})-[]->(a) }
  RETURN type(r) AS type, id(a) AS aId
`);

// Two separate queries joined by AND in WHERE using subquery
await run("WHERE (p)-[]->(a) as boolean a=3 devrecall", `
  MATCH (a)-[r]->(b) WHERE id(a) = 3 AND id(b) = 4 AND type(r) = 'ASSIGNED_TO'
  MATCH (p:Project {name: 'DevRecall'})
  WHERE p = a OR (p)-[]->(a)
  RETURN type(r) AS type, id(a) AS aId, id(p) AS pId
`);

await run("WHERE (p)-[]->(a) as boolean a=3 evalX", `
  MATCH (a)-[r]->(b) WHERE id(a) = 3 AND id(b) = 4 AND type(r) = 'ASSIGNED_TO'
  MATCH (p:Project {name: 'evalX'})
  WHERE p = a OR (p)-[]->(a)
  RETURN type(r) AS type, id(a) AS aId, id(p) AS pId
`);

// EXISTS with p = a OR
await run("EXISTS p=a OR edge a=8 evalX", `
  MATCH (a)-[r]->(b) WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  MATCH (p:Project {name: 'evalX'})
  WHERE p = a OR EXISTS((p)-[]->(a))
  RETURN type(r) AS type, id(a) AS aId, id(p) AS pId
`);

await run("EXISTS p=a OR edge a=3 devrecall", `
  MATCH (a)-[r]->(b) WHERE id(a) = 3 AND id(b) = 4 AND type(r) = 'ASSIGNED_TO'
  MATCH (p:Project {name: 'DevRecall'})
  WHERE p = a OR EXISTS((p)-[]->(a))
  RETURN type(r) AS type, id(a) AS aId, id(p) AS pId
`);

await run("EXISTS p=a OR edge a=3 evalX", `
  MATCH (a)-[r]->(b) WHERE id(a) = 3 AND id(b) = 4 AND type(r) = 'ASSIGNED_TO'
  MATCH (p:Project {name: 'evalX'})
  WHERE p = a OR EXISTS((p)-[]->(a))
  RETURN type(r) AS type, id(a) AS aId, id(p) AS pId
`);

// EXISTS with OR of two EXISTS
await run("EXISTS both a=3 devrecall", `
  MATCH (a)-[r]->(b) WHERE id(a) = 3 AND id(b) = 4 AND type(r) = 'ASSIGNED_TO'
  MATCH (p:Project {name: 'DevRecall'})
  WHERE EXISTS((p)-[]->(a)) OR p = a
  RETURN type(r) AS type, id(a) AS aId, id(p) AS pId
`);

await run("EXISTS both a=3 evalX", `
  MATCH (a)-[r]->(b) WHERE id(a) = 3 AND id(b) = 4 AND type(r) = 'ASSIGNED_TO'
  MATCH (p:Project {name: 'evalX'})
  WHERE EXISTS((p)-[]->(a)) OR p = a
  RETURN type(r) AS type, id(a) AS aId, id(p) AS pId
`);

await db.close();