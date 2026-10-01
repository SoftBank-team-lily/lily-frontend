import "server-only";
import { z } from "zod";
import { getAgent } from "@/lib/agents/server";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects/server";
import {
  appSchema, databasesSchema, logsSchema, metricsSchema, podsSchema,
  routeSchema, statusSchema, type MonitorQuery, type Resource,
} from "./schema";

function missing(state: "unconfigured" | "unavailable" | "pending" | "unsupported", message: string) {
  return { state, message } as const;
}

export async function readResource<T>(base: string | undefined, token: string | undefined,
  path: string, schema: z.ZodType<T>): Promise<Resource<T>> {
  if (!base) return missing("unconfigured", "아직 서비스가 연결되지 않았어요.");
  try {
    const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
      return missing("unavailable", "서비스 연결 설정을 확인해 주세요.");
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404) return missing("pending", "아직 수집된 리소스가 없어요.");
    if (!response.ok) return missing("unavailable", "서비스에서 데이터를 가져오지 못했어요.");
    const result = schema.safeParse(await response.json());
    return result.success ? { state: "ready", data: result.data }
      : missing("unavailable", "서비스 응답 형식을 확인해 주세요.");
  } catch {
    return missing("unavailable", "서비스 연결이 끊겼어요. 잠시 후 다시 시도해 주세요.");
  }
}

export function redact(message: string, secrets: string[]) {
  let result = message;
  for (const secret of secrets.filter((value) => value.length >= 4).sort((a, b) => b.length - a.length))
    result = result.split(secret).join("[REDACTED]");
  return result
    .replace(/(Bearer\s+)[^\s,;"']+/gi, "$1[REDACTED]")
    .replace(/((?:password|passwd|secret|token|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/(\w+:\/\/[^\s:/]+:)[^@\s]+@/g, "$1[REDACTED]@");
}

export async function getMonitor(ownerId: string, id: string, query: MonitorQuery) {
  // 소유권을 확인한 뒤 내부 서비스에 접근한다.
  const project = await getProject(ownerId, id);
  const mapping = await db.query<{ app_name: string; env: Record<string, string>; database_url: string | null }>(
    `SELECT r.app_name, p.env, p.database_url FROM projects p
     LEFT JOIN LATERAL (SELECT b.app_name FROM builder_runs b
       JOIN deployments d ON d.id=b.deployment_id
       WHERE d.project_id=p.id AND b.app_name<>'' ORDER BY b.created_at DESC LIMIT 1) r ON true
     WHERE p.id=$1 AND p.owner_id=$2`, [id, ownerId],
  );
  const row = mapping.rows[0];
  const appName = row?.app_name ?? null;
  const namespace = process.env.DEPLOYMENT_NAMESPACE || "default";
  const secrets = [...Object.values(row?.env ?? {}), row?.database_url ?? ""];
  const clean = (value: string) => redact(value, secrets);
  if (project.latestDeployment) {
    project.latestDeployment.logs = project.latestDeployment.logs.map(clean);
    if (project.latestDeployment.message) project.latestDeployment.message = clean(project.latestDeployment.message);
  }
  const agent = project.target === "onprem"
    ? await getAgent(ownerId).then((data) => ({ state: "ready" as const, data }))
      .catch(() => missing("unavailable", "에이전트 연결 상태를 확인하지 못했어요."))
    : missing("unsupported", "클라우드 앱은 PC 에이전트를 사용하지 않아요.");
  // 배포 진단의 수정 제안 값은 이 화면에 필요 없으므로 보내지 않는다.
  const latest = project.latestDeployment;
  const summary = {
    id: project.id, name: project.name, repo: project.repo, rootDir: project.rootDir,
    target: project.target, databaseLocation: project.databaseLocation,
    latestDeployment: latest ? {
      id: latest.id, status: latest.status, stage: latest.stage, url: latest.url,
      message: latest.message, logs: latest.logs,
    } : null,
  };
  const common = { project: summary, agent, appName, namespace, window: query.window, generatedAt: new Date().toISOString() };
  const unavailable = project.target === "onprem"
    ? missing("unsupported", "온프레미스 앱의 실시간 관측은 아직 지원하지 않아요.")
    : !appName ? missing("pending", "첫 배포가 실행되면 관측 데이터가 연결돼요.") : null;
  if (unavailable) return { ...common, status: unavailable, metrics: unavailable, pods: unavailable,
    logs: unavailable, app: unavailable, route: unavailable, databases: unavailable };
  const appPath = `api/apps/${encodeURIComponent(appName!)}`;
  const params = new URLSearchParams({ namespace });
  const observe = <T>(path: string, schema: z.ZodType<T>) => readResource(
    process.env.OBSERVABILITY_URL, process.env.OBSERVABILITY_API_TOKEN, path, schema);
  const [status, metrics, pods, logs, apps, route, databases] = await Promise.all([
    observe(`${appPath}/status?${params}`, statusSchema.refine((data) => data.app === appName && data.namespace === namespace)),
    observe(`${appPath}/metrics?${params}&window=${query.window}`, metricsSchema.refine((data) => data.app === appName && data.namespace === namespace)),
    observe(`${appPath}/pods?${params}`, podsSchema),
    observe(`${appPath}/logs?${params}&since=${query.window}&level=${query.level}&limit=100`, logsSchema),
    observe(`api/apps?${params}`, z.array(appSchema)),
    readResource(process.env.INGRESS_API_URL, process.env.INGRESS_API_TOKEN,
      `api/v1/routes/${encodeURIComponent(namespace)}/${encodeURIComponent(appName!)}`, routeSchema.refine((data) => data.app === appName && data.namespace === namespace)),
    readResource(process.env.PROVISIONER_URL, process.env.PROVISIONER_API_TOKEN,
      `api/databases?projectId=${encodeURIComponent(appName!)}`, databasesSchema),
  ]);
  const app = apps.state === "ready"
    ? apps.data.find((item) => item.app === appName && item.namespace === namespace) : null;
  return { ...common, status, metrics, pods, route, databases,
    app: apps.state !== "ready" ? apps : app ? { state: "ready" as const, data: app }
      : missing("pending", "클러스터에 실행 중인 앱이 없어요."),
    logs: logs.state === "ready" ? { ...logs, data: logs.data.map((log) => ({ ...log, message: clean(log.message) })) } : logs,
  };
}
