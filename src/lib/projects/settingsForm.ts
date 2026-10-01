import type { DeploySettings } from "./types";

/**
 * 폼의 배포 설정 칸 → API 본문. 빈 칸은 빼서 lily-builder 가 레포를 보고 정하게 둔다.
 * 환경변수는 .env 처럼 한 줄에 KEY=VALUE 로 받는다.
 * @throws Error 형식이 맞지 않는 줄이 있을 때 (사용자에게 보여 줄 문장)
 */
export function readSettings(data: FormData): DeploySettings {
  const text = (key: string) => String(data.get(key) ?? "").trim();
  const settings: DeploySettings = {};
  if (text("branch")) settings.branch = text("branch");
  if (text("rootDir")) settings.rootDir = text("rootDir");
  if (text("port")) {
    const port = Number(text("port"));
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("포트는 1~65535 사이 숫자로 입력해 주세요.");
    settings.port = port;
  }
  if (text("healthPath")) settings.healthPath = text("healthPath");
  const env = parseEnv(String(data.get("env") ?? ""));
  if (Object.keys(env).length) settings.env = env;
  return settings;
}

export function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const at = line.indexOf("=");
    const key = (at < 0 ? line : line.slice(0, at)).replace(/^export\s+/, "").trim();
    if (at < 0 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
      throw new Error(`환경변수 ${index + 1}번째 줄을 KEY=VALUE 형식으로 적어 주세요.`);
    env[key] = line.slice(at + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
  });
  return env;
}

/** 등록한 뒤 설정 수정 본문. 빈 칸은 null 로 보내 비운다 (builder 가 다시 레포를 보고 정한다) */
export type SettingsUpdate = {
  name: string;
  branch: string | null;
  port: number | null;
  healthPath: string | null;
  env?: Record<string, string>;
  removeEnv?: string[];
};

/**
 * 설정 수정 폼 → PATCH 본문. 환경변수는 적은 줄만 넣거나 덮고, 체크한 키(removeEnv)는 지운다.
 * @throws Error 형식이 맞지 않을 때 (사용자에게 보여 줄 문장)
 */
export function readUpdate(data: FormData): SettingsUpdate {
  const text = (key: string) => String(data.get(key) ?? "").trim();
  const name = text("name");
  if (!name || name.length > 100)
    throw new Error("프로젝트 이름은 1~100자로 입력해 주세요.");
  let port: number | null = null;
  if (text("port")) {
    port = Number(text("port"));
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("포트는 1~65535 사이 숫자로 입력해 주세요.");
  }
  const update: SettingsUpdate = {
    name,
    branch: text("branch") || null,
    port,
    healthPath: text("healthPath") || null,
  };
  const env = parseEnv(String(data.get("env") ?? ""));
  if (Object.keys(env).length) update.env = env;
  const remove = data.getAll("removeEnv").map(String).filter((key) => !(key in env));
  if (remove.length) update.removeEnv = remove;
  return update;
}
