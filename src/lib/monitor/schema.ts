import { z } from "zod";

const text = z.string().max(20000);
const number = z.number().finite();
const nullable = text.nullable();
export const trafficSchema = z.object({
  requestsPerMinute: number, errorRate: number,
  avgLatencyMs: number, p95LatencyMs: number,
});
export const metricsSchema = z.object({
  app: text, namespace: text, current: trafficSchema,
  series: z.array(trafficSchema.extend({ at: text })).max(1000),
});
export const statusSchema = z.object({
  app: text, namespace: text,
  level: z.enum(["HOLD", "NORMAL", "NOTICE", "WARNING", "CRITICAL"]),
  message: text, reason: text, action: text, judgedAt: text,
});
export const podsSchema = z.array(z.object({
  name: text, phase: text, ready: z.boolean(), restarts: number,
  slot: nullable, image: nullable, node: nullable, startedAt: nullable,
  problem: nullable, lastRestartReason: nullable,
  cpuMillicores: number.nullable(), memoryMiB: number.nullable(),
}));
export const logsSchema = z.array(z.object({
  at: text, pod: nullable, slot: nullable, image: nullable, message: text,
})).max(500);
export const appSchema = z.object({
  app: text, namespace: text, url: nullable, strategy: text,
  activeSlot: nullable, readyReplicas: number, replicas: number, image: nullable,
  deployments: z.array(z.object({
    name: text, slot: nullable, readyReplicas: number, replicas: number, image: nullable,
  })),
});
export const routeSchema = z.object({
  namespace: text, app: text, url: text, primaryHost: text,
  serviceName: text, servicePort: number,
  canary: z.object({ serviceName: text, servicePort: number, weight: number }).nullable(),
});
// DB 연결 문자열, host, 비밀번호, 서버 오류 본문은 공개 DTO에 넣지 않는다.
export const databasesSchema = z.array(z.object({ id: text, engine: text, status: text }));
export const monitorQuery = z.object({
  window: z.enum(["5m", "15m", "1h", "6h"]).default("15m"),
  level: z.enum(["all", "error"]).default("all"),
});
export type MonitorQuery = z.infer<typeof monitorQuery>;
export type Resource<T> =
  | { state: "ready"; data: T }
  | { state: "unconfigured" | "unavailable" | "pending" | "unsupported"; message: string };
