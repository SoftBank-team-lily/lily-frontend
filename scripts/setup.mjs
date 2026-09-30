import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const example = await readFile(
  new URL("../.env.example", import.meta.url),
  "utf8",
);
try {
  await writeFile(
    new URL("../.env.local", import.meta.url),
    example
      .replace(
        "replace-with-a-random-secret-at-least-32-characters",
        randomBytes(32).toString("hex"),
      )
      .replace(
        "replace-with-another-random-secret-at-least-32-characters",
        randomBytes(32).toString("hex"),
      ),
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    ".env.local을 생성했습니다. 실행 포트에 맞춰 BETTER_AUTH_URL과 AUTH_TRUSTED_ORIGINS를 설정하세요.",
  );
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("기존 .env.local을 사용합니다.");
}
