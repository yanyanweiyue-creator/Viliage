import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const source = resolve(process.argv[2] || "data/users.json");
const destination = resolve(process.argv[3] || "data/cloudflare-users-import.sql");

function sql(value) {
  if (value == null) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

let users;
try {
  users = JSON.parse(await readFile(source, "utf8"));
} catch (error) {
  console.error(`Could not read ${source}: ${error.message}`);
  process.exitCode = 1;
  throw error;
}

if (!Array.isArray(users)) throw new Error("The source users file must contain a JSON array.");

const statements = users.map((user) => {
  if (!user.id || !user.email || !user.passwordHash) throw new Error("Every user must include id, email, and passwordHash.");
  const createdAt = user.createdAt || new Date().toISOString();
  const updatedAt = user.profile?.updatedAt || createdAt;
  return `INSERT INTO users (id, name, email, password_hash, survey_completed, profile_json, history_json, feedback, liked_resources_json, disliked_resources_json, created_at, updated_at) VALUES (${sql(user.id)}, ${sql(user.name || "Village user")}, ${sql(String(user.email).toLowerCase())}, ${sql(user.passwordHash)}, ${user.surveyCompleted ? 1 : 0}, ${sql(user.profile ? JSON.stringify(user.profile) : null)}, ${sql(JSON.stringify(user.history || []))}, ${sql(user.feedback || "")}, ${sql(JSON.stringify(user.likedResources || []))}, ${sql(JSON.stringify(user.dislikedResources || []))}, ${sql(createdAt)}, ${sql(updatedAt)}) ON CONFLICT(email) DO UPDATE SET name = excluded.name, password_hash = excluded.password_hash, survey_completed = excluded.survey_completed, profile_json = excluded.profile_json, history_json = excluded.history_json, feedback = excluded.feedback, liked_resources_json = excluded.liked_resources_json, disliked_resources_json = excluded.disliked_resources_json, updated_at = excluded.updated_at;`;
});

const output = [
  "-- Generated locally. Contains password hashes and user records; never commit this file.",
  "PRAGMA foreign_keys = ON;",
  ...statements,
  ""
].join("\n");

await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, output, { mode: 0o600 });
console.log(`Prepared ${users.length} account(s) for D1 import at ${destination}.`);
