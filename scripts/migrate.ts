import { readFileSync, readdirSync } from "node:fs";
import { getDB } from "../src/lib/registry/db";
const db = getDB();
for (const name of readdirSync("migrations")
  .filter((n) => n.endsWith(".sql"))
  .sort())
  await db.exec(readFileSync("migrations/" + name, "utf8"));
console.log("Registry migration applied");
await db.close();
