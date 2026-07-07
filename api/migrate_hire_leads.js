// One-time migration: creates hire_leads table used by the "hire me" popup
// to capture email/phone leads. Run with:
//   node api/migrate_hire_leads.js
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
  console.log("Creating hire_leads table...");
  const result = await query(`
    CREATE TABLE IF NOT EXISTS hire_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT,
      phone TEXT,
      interest TEXT,
      message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log(JSON.stringify(result.results?.[0]?.response ?? result));
  console.log("Done.");
})();
