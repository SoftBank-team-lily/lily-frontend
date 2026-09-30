import { getMigrations } from "better-auth/db/migration";
import { auth } from "../src/lib/auth/server";
import { db } from "../src/lib/db";

async function migrate() {
  const migrations = await getMigrations(auth.options);
  await migrations.runMigrations();
  console.log("인증 DB 마이그레이션을 적용했습니다.");
}
migrate()
  .catch(() => {
    console.error(
      "마이그레이션을 적용하지 못했습니다. DB 연결과 환경 설정을 확인해 주세요.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.end());
