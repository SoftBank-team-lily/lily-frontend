import { getMigrations } from "better-auth/db/migration";
import { auth } from "../src/lib/auth/server";
import { db } from "../src/lib/db";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function migrate() {
  const client = await db.connect();
  try {
    await client.query("SELECT pg_advisory_lock(48157213)");
    const migrations = await getMigrations(auth.options);
    await migrations.runMigrations();
    await client.query(
      "CREATE TABLE IF NOT EXISTS lily_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const directory = resolve("db/migrations");
    for (const name of (await readdir(directory))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      await client.query("BEGIN");
      try {
        const existing = await client.query(
          "SELECT name FROM lily_migrations WHERE name=$1",
          [name],
        );
        if (!existing.rowCount) {
          await client.query(await readFile(resolve(directory, name), "utf8"));
          await client.query("INSERT INTO lily_migrations(name) VALUES($1)", [
            name,
          ]);
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    console.log("인증·프로젝트 DB 마이그레이션을 적용했습니다.");
  } finally {
    await client.query("SELECT pg_advisory_unlock(48157213)");
    client.release();
  }
}
migrate()
  .catch(() => {
    console.error(
      "마이그레이션을 적용하지 못했습니다. DB 연결과 환경 설정을 확인해 주세요.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.end());
