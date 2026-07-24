import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const token = (await readFile(resolve(root, ".turso-token"), "utf8")).trim();
const schema = await readFile(resolve(root, "db", "schema_community_flywheel.sql"), "utf8");
const endpoint = "https://jgt-mining-topnodrog.aws-us-east-2.turso.io/v3/pipeline";

const statements = schema
  .split(";")
  .map((statement) => statement.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);

for (const [index, sql] of statements.entries()) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        { type: "execute", stmt: { sql, args: [] } },
        { type: "close" },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Migration request ${index + 1} failed with HTTP ${response.status}`);
  }

  const data = await response.json();
  const result = data.results?.[0];
  if (result?.type === "error") {
    throw new Error(`Migration statement ${index + 1} failed: ${result.error?.message || "unknown error"}`);
  }
  console.log(`Applied ${index + 1}/${statements.length}`);
}
