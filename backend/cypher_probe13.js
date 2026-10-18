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

// Setup: create a test edge between a Task(9) and a Decision(10) in evalX
// and a parallel-ish edge to test ambiguity.
await run("setup test edge 9->10 MENTIONED", `
  MATCH (a),(b) WHERE id(a) = 9 AND id(b) = 10
  CREATE (a)-[r:MENTIONED]->(b) RETURN type(r) AS type
`);

await run("setup test edge 9->10 DEPENDS_ON", `
  MATCH (a),(b) WHERE id(a) = 9 AND id(b) = 10
  CREATE (a)-[r:DEPENDS_ON]->(b) RETURN type(r) AS type
`);

// Now test the DELETE query with OPTIONAL both endpoints
await run("DELETE 9->10 MENTIONED evalX", `
  MATCH (a)-[r]->(b) WHERE id(a) = 9 AND id(b) = 10 AND type(r) = 'MENTIONED'
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a) WHERE p IS NOT NULL
  OPTIONAL MATCH (q:Project {name: 'evalX'})-[]->(b) WHERE q IS NOT NULL
  DELETE r RETURN type(r) AS type
`);

// Verify only MENTIONED removed, DEPENDS_ON remains
await run("verify edges 9->10", `MATCH (a)-[r]->(b) WHERE id(a) = 9 AND id(b) = 10 RETURN type(r) AS type`);

// Verify nodes intact
await run("verify node 9", `MATCH (n) WHERE id(n) = 9 RETURN id(n) AS id, labels(n) AS labels`);
await run("verify node 10", `MATCH (n) WHERE id(n) = 10 RETURN id(n) AS id, labels(n) AS labels`);

// Clean up test edges
await run("cleanup DEPENDS_ON 9->10", `
  MATCH (a)-[r]->(b) WHERE id(a) = 9 AND id(b) = 10 AND type(r) = 'DEPENDS_ON'
  DELETE r RETURN type(r) AS type
`);

// Test create relationship scope check with both endpoints
await run("create scope both endpoints 8->9 evalX", `
  MATCH (a),(b) WHERE id(a) = 8 AND id(b) = 9
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a) WHERE p IS NOT NULL
  OPTIONAL MATCH (q:Project {name: 'evalX'})-[]->(b) WHERE q IS NOT NULL
  RETURN id(a) AS a, id(b) AS b, id(p) AS p, id(q) AS q
`);

await run("create scope both endpoints 3->4 devrecall", `
  MATCH (a),(b) WHERE id(a) = 3 AND id(b) = 4
  OPTIONAL MATCH (p:Project {name: 'DevRecall'})-[]->(a) WHERE p IS NOT NULL
  OPTIONAL MATCH (q:Project {name: 'DevRecall'})-[]->(b) WHERE q IS NOT NULL
  RETURN id(a) AS a, id(b) AS b, id(p) AS p, id(q) AS q
`);

await run("create scope both endpoints 3->4 evalX cross", `
  MATCH (a),(b) WHERE id(a) = 3 AND id(b) = 4
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a) WHERE p IS NOT NULL
  OPTIONAL MATCH (q:Project {name: 'evalX'})-[]->(b) WHERE q IS NOT NULL
  RETURN id(a) AS a, id(b) AS b, id(p) AS p, id(q) AS q
`);

await run("create scope both endpoints 13->9 evalX (person shared)", `
  MATCH (a),(b) WHERE id(a) = 13 AND id(b) = 9
  OPTIONAL MATCH (p:Project {name: 'evalX'})-[]->(a) WHERE p IS NOT NULL
  OPTIONAL MATCH (q:Project {name: 'evalX'})-[]->(b) WHERE q IS NOT NULL
  RETURN id(a) AS a, id(b) AS b, id(p) AS p, id(q) AS q
`);

// Test the save-memory target pattern with param interpolation
await run("save-memory target param", `
  MATCH (p:Project {name: $projectName})-[]->(target)
  WHERE (target:Task OR target:Bug)
    AND toLower(coalesce(target.title, target.task, target.decision, target.name, '')) = toLower($relatedTitle)
  RETURN id(target) AS id LIMIT 1
`, { projectName: "evalX", relatedTitle: "authentication" });

await db.close();