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

// Is Task 9 connected to Project 8?
await run("p->a directed", `MATCH (p:Project {name: 'evalX'})-[]->(a) WHERE id(a) = 9 RETURN id(p) AS p, id(a) AS a`);
await run("a<-p directed", `MATCH (a)<-[]-(p:Project {name: 'evalX'}) WHERE id(a) = 9 RETURN id(p) AS p, id(a) AS a`);
await run("undirected a-[r]-(p)", `MATCH (a)-[r]-(p:Project {name: 'evalX'}) WHERE id(a) = 9 RETURN id(p) AS p, id(a) AS a, type(r) AS t`);
await run("p->a with type", `MATCH (p:Project {name: 'evalX'})-[:HAS_TASK]->(a) WHERE id(a) = 9 RETURN id(p) AS p, id(a) AS a`);

// Boolean pattern semantics
await run("bool (p)-[]->(a) a=9", `MATCH (p:Project {name: 'evalX'}) WHERE (p)-[]->(a) AND id(a) = 9 RETURN id(p) AS p, id(a) AS a`);
await run("bool (a)-[]->(p) a=9", `MATCH (p:Project {name: 'evalX'}) WHERE (a)-[]->(p) AND id(a) = 9 RETURN id(p) AS p, id(a) AS a`);
await run("bool EXISTS((p)-[]->(a)) a=9", `MATCH (p:Project {name: 'evalX'}) WHERE EXISTS((p)-[]->(a)) AND id(a) = 9 RETURN id(p) AS p, id(a) AS a`);

// The actual failing query shape
await run("failing shape EXISTS", `
  MATCH (a)-[r]->(b) WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  MATCH (p:Project {name: 'evalX'}) WHERE p = a OR EXISTS((p)-[]->(a))
  RETURN type(r) AS type
`);

await run("working shape bool", `
  MATCH (a)-[r]->(b) WHERE id(a) = 8 AND id(b) = 9 AND type(r) = 'HAS_TASK'
  MATCH (p:Project {name: 'evalX'}) WHERE p = a OR (p)-[]->(a)
  RETURN type(r) AS type
`);

await db.close();