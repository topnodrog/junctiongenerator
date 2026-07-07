// One-time migration: creates digest_state table used to track the last
// time the daily new-signups digest email was sent. Run with:
//   node api/migrate_digest_state.js
// Requires .turso-token in repo root.
const fs = require("fs");
const path = require("path");

const token = fs.readFileSync(path.join(__dirname, "..", ".turso-token"), "utf8").trim();
const dbUrl = "https://jgt-mining-topnodrog.aws-us-east-2.turso.io";

async function query(sql) {
  const payload = {
    requests: [
      { type: "execute", stmt: { sql, args: [] } },
      { type: "close" },
    ],
  };
  const res = await fetch(`${dbUrl}/v3/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

(async () => {
  console.log("Creating digest_state table...");
  let result = await query(`
    CREATE TABLE IF NOT EXISTS digest_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_sent_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'
    )
  `);
  console.log(JSON.stringify(result.results?.[0]?.response ?? result));

  console.log("Seeding initial row...");
  result = await query(`
    INSERT OR IGNORE INTO digest_state (id, last_sent_at) VALUES (1, '1970-01-01 00:00:00')
  `);
  console.log(JSON.stringify(result.results?.[0]?.response ?? result));

  console.log("Done.");
})();
