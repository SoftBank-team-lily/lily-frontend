"use client";

import { useI18n } from "@/lib/i18n/provider";

import Link from "next/link";
import { useEffect, useState } from "react";
import { projectRequest } from "@/lib/projects/client";
import { placeBadge } from "@/lib/projects/burst";
import type { Project } from "@/lib/projects/types";
import { PlaceBadgeView } from "./PlaceBadge";
import { StatusOverview } from "./StatusOverview";
import { BurstPanel } from "./BurstPanel";
import { MetricChart } from "./MetricChart";

/** 거점·버스팅은 몇 초 단위로 바뀐다. 클러스터 지표는 30초 간격으로 쌓인다 */
const PROJECT_MS = 4_000;
const MONITOR_MS = 15_000;
const WINDOWS = ["5m", "15m", "1h", "6h"] as const;
type Range = (typeof WINDOWS)[number];

type Resource<T> =
  { state: "ready"; data: T } | { state: string; message: string };
type Traffic = {
  requestsPerMinute: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
};
type Pod = {
  name: string;
  phase: string;
  ready: boolean;
  restarts: number;
  slot: string | null;
  cpuMillicores: number | null;
  memoryMiB: number | null;
  problem: string | null;
  lastRestartReason: string | null;
};
type Monitor = {
  status: Resource<{
    level: string;
    message: string;
    reason: string;
    action: string;
    judgedAt: string;
  }>;
  metrics: Resource<{ current: Traffic; series: (Traffic & { at: string })[] }>;
  pods: Resource<Pod[]>;
  logs: Resource<{ at: string; pod: string | null; message: string }[]>;
};

const levelTone: Record<string, string> = {
  NORMAL: "border-onprem text-onprem",
  HOLD: "border-line text-mute",
  NOTICE: "border-cloud text-cloud",
  WARNING: "border-warning text-warning",
  CRITICAL: "border-danger text-danger",
};
const levelLabel: Record<string, string> = {
  NORMAL: "✓ 정상",
  HOLD: "… 판단 보류",
  NOTICE: "i 알림",
  WARNING: "! 주의",
  CRITICAL: "✕ 위험",
};

/** 프로젝트 하나를 한 화면에서: 거점, HOME/AWS 자원 비교, 트래픽 조절, 지표 차트, Pod, 판정, 로그 */
export function ProjectMonitor({ initial }: { initial: Project }) {
  const { t } = useI18n();
  const [project, setProject] = useState(initial);
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [range, setRange] = useState<Range>("15m");

  useEffect(() => {
    const timer = setInterval(() => {
      projectRequest<Project>(`/api/projects/${project.id}`)
        .then(setProject)
        .catch(() => undefined);
    }, PROJECT_MS);
    return () => clearInterval(timer);
  }, [project.id]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      projectRequest<Monitor>(
        `/api/projects/${project.id}/monitor?window=${range}`,
      )
        .then((value) => alive && setMonitor(value))
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, MONITOR_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [project.id, range]);

  const live = project.burst?.live ?? null;
  const metrics =
    monitor?.metrics.state === "ready"
      ? (
          monitor.metrics as {
            data: { current: Traffic; series: (Traffic & { at: string })[] };
          }
        ).data
      : null;
  const pods =
    monitor?.pods.state === "ready"
      ? (monitor.pods as { data: Pod[] }).data
      : null;
  const status =
    monitor?.status.state === "ready"
      ? (
          monitor.status as {
            data: { level: string; message: string; action: string };
          }
        ).data
      : null;
  const logs =
    monitor?.logs.state === "ready"
      ? (
          monitor.logs as {
            data: { at: string; pod: string | null; message: string }[];
          }
        ).data
      : null;
  const url = project.latestDeployment?.url ?? null;
  const onprem = project.target === "onprem";
  const home = onprem ? (live?.home ?? null) : "CLOUD";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <PlaceBadgeView badge={placeBadge(project, null)} large />
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-control text-ink underline break-all"
          >
            {url.replace(/^https?:\/\//, "")} ↗
          </a>
        )}
        <Link
          href="/projects"
          className="ml-auto text-caption text-mute hover:text-ink"
        >
          {t("← 내 프로젝트")}
        </Link>
      </div>

      <section aria-labelledby="compare-title">
        <h2 id="compare-title" className="text-lead font-semibold">
          {t("HOME 과 AWS")}
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <SideCard
            name={"HOME · 내 PC"}
            tone="onprem"
            current={home === "ONPREM"}
            empty={onprem ? null : t("이 앱은 내 PC 를 쓰지 않아요.")}
            rows={[
              ["CPU", percent(live?.homeCpuPercent), t("코어 1개 기준")],
              [
                "RAM",
                mib(live?.homeMemoryMiB),
                live?.homeMemoryPercent != null
                  ? `${live.homeMemoryPercent}%`
                  : "",
              ],
              ["P95", ms(live?.homeP95Ms), t("최근 5분")],
              [
                t("처리 중"),
                live ? `${live.localActive}` : "–",
                live?.localLimit
                  ? t("한도 {{value0}}", { value0: live.localLimit })
                  : "",
              ],
            ]}
          />
          <SideCard
            name={"AWS · 클라우드"}
            tone="cloud"
            current={home === "CLOUD"}
            empty={null}
            rows={[
              [
                "CPU",
                pods ? percent(cpuPercent(pods)) : "–",
                pods
                  ? t("Pod {{value0}}/{{value1}} · 코어 1개 기준", {
                      value0: pods.filter((pod) => pod.ready).length,
                      value1: pods.length,
                    })
                  : t("Pod 정보 없음"),
              ],
              [
                "RAM",
                pods ? mib(sum(pods.map((pod) => pod.memoryMiB))) : "–",
                "",
              ],
              [
                "P95",
                metrics ? ms(metrics.current.p95LatencyMs) : "–",
                t("최근 {{value0}}", { value0: range }),
              ],
              [
                t("처리 중"),
                live ? `${live.remoteActive}` : "–",
                onprem ? t("내 PC 가 넘긴 요청") : "",
              ],
            ]}
          />
        </div>
        <p className="mt-3 text-control text-ink">
          <span className="text-mute">Traffic · </span>
          {trafficLine(project)}
        </p>
      </section>

      {onprem && project.burst && (
        <section aria-label={t("거점과 트래픽 조절")}>
          <StatusOverview project={project} onUpdate={setProject} />
          <BurstPanel
            project={project}
            burst={project.burst}
            onUpdate={setProject}
          />
        </section>
      )}

      <section aria-labelledby="metrics-title">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="metrics-title" className="text-lead font-semibold">
            {t("AWS 지표")}
          </h2>
          {status && (
            <span
              className={`rounded-lg border px-2 py-0.5 text-caption font-semibold ${levelTone[status.level] ?? "border-line text-mute"}`}
            >
              {t(levelLabel[status.level] ?? status.level)}
            </span>
          )}
          <div
            className="ml-auto flex gap-1"
            role="group"
            aria-label={t("기간")}
          >
            {WINDOWS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={range === value}
                onClick={() => setRange(value)}
                className={`rounded-md px-2 py-1 text-caption ${range === value ? "bg-field text-ink" : "text-mute hover:text-ink"}`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        {status && (
          <p className="mt-2 text-caption text-mute">
            {t(status.message)}
            {status.action && ` · ${t(status.action)}`}
          </p>
        )}
        {monitor && monitor.metrics.state !== "ready" ? (
          <p className="mt-3 text-caption text-mute">
            {t("message" in monitor.metrics ? monitor.metrics.message : "")}
          </p>
        ) : (
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <MetricChart
              title={t("분당 요청")}
              unit={"요청/분"}
              format={(v) => v.toFixed(1)}
              points={(metrics?.series ?? []).map((p) => ({
                at: p.at,
                value: p.requestsPerMinute,
              }))}
            />
            <MetricChart
              title={t("오류율 (HTTP 5xx)")}
              unit="%"
              format={(v) => v.toFixed(2)}
              points={(metrics?.series ?? []).map((p) => ({
                at: p.at,
                value: p.errorRate * 100,
              }))}
            />
            <MetricChart
              title={t("p95 응답")}
              unit="ms"
              format={(v) => Math.round(v).toString()}
              points={(metrics?.series ?? []).map((p) => ({
                at: p.at,
                value: p.p95LatencyMs,
              }))}
            />
          </div>
        )}
      </section>

      {pods && pods.length > 0 && (
        <section aria-labelledby="pods-title">
          <h2 id="pods-title" className="text-lead font-semibold">
            {t("클라우드 Pod")}
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-caption">
              <thead className="text-mute">
                <tr>
                  <th className="py-1 pr-4 font-normal">{t("이름")}</th>
                  <th className="py-1 pr-4 font-normal">{t("상태")}</th>
                  <th className="py-1 pr-4 font-normal">{t("재시작")}</th>
                  <th className="py-1 pr-4 font-normal">CPU</th>
                  <th className="py-1 font-normal">RAM</th>
                </tr>
              </thead>
              <tbody>
                {pods.map((pod) => (
                  <tr key={pod.name} className="border-t border-line">
                    <td className="py-2 pr-4 break-all text-ink">{pod.name}</td>
                    <td
                      className={`py-2 pr-4 ${pod.ready ? "text-onprem" : pod.problem ? "text-danger" : "text-warning"}`}
                    >
                      {pod.ready
                        ? t("● 준비됨")
                        : `○ ${pod.problem ?? pod.phase}`}
                    </td>
                    <td
                      className={`py-2 pr-4 tabular-nums ${pod.restarts > 0 ? "text-warning" : "text-ink"}`}
                    >
                      {pod.restarts}
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-ink">
                      {pod.cpuMillicores != null
                        ? `${pod.cpuMillicores}m`
                        : "–"}
                    </td>
                    <td className="py-2 tabular-nums text-ink">
                      {pod.memoryMiB != null
                        ? `${Math.round(pod.memoryMiB)}MiB`
                        : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {logs && logs.length > 0 && (
        <details className="rounded-xl border border-line p-4 text-caption">
          <summary className="cursor-pointer text-ink">
            {t("최근 로그 (")}
            {logs.length})
          </summary>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all text-mute">
            {logs
              .map((log) => `${log.at.slice(11, 19)} ${log.message}`)
              .join("\n")}
          </pre>
        </details>
      )}
    </div>
  );
}

function SideCard({
  name,
  tone,
  current,
  empty,
  rows,
}: {
  name: string;
  tone: "onprem" | "cloud";
  current: boolean;
  empty: string | null;
  rows: [string, string, string][];
}) {
  const { t } = useI18n();
  const color = tone === "onprem" ? "text-onprem" : "text-cloud";
  const border = current
    ? tone === "onprem"
      ? "border-onprem"
      : "border-cloud"
    : "border-line";
  return (
    <div className={`rounded-xl border-2 p-4 ${border}`}>
      <div className="flex items-center justify-between">
        <p className={`text-control font-semibold ${color}`}>
          {tone === "onprem" ? "🖥 " : "☁ "}
          {name}
        </p>
        {current && (
          <span className={`text-caption font-semibold ${color}`}>
            {t("지금 공개 주소")}
          </span>
        )}
      </div>
      {empty ? (
        <p className="mt-3 text-caption text-mute">{empty}</p>
      ) : (
        <dl className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2">
          {rows.map(([label, value, note]) => (
            <div key={label} className="contents">
              <dt className="text-caption text-mute">{t(label)}</dt>
              <dd className="text-ink">
                <span className="text-lead font-semibold tabular-nums">
                  {value}
                </span>
                {note && (
                  <span className="ml-2 text-caption text-mute">{note}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function trafficLine(project: Project) {
  if (project.target === "cloud") return "AWS 100% (클라우드 앱)";
  const live = project.burst?.live;
  const burst = project.burst;
  if (!live) return "에이전트 상태를 확인하는 중";
  if (live.home === "CLOUD") return "AWS 100% · 거점이 AWS 라 버스팅은 쉬어요";
  if (live.home.startsWith("MOVING")) return "거점 전환 중";
  if (!burst?.enabled || !live.enabled) return "HOME 100% · 버스팅 꺼짐";
  if (live.cloudPercent === 0) return "자동 · HOME 이 넘칠 때만 AWS 가 받아요";
  return `수동 · HOME ${100 - live.cloudPercent}% / AWS ${live.cloudPercent}%`;
}

function sum(values: (number | null)[]) {
  const known = values.filter((value): value is number => value != null);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
}
/** Pod 들의 CPU 를 Pod 하나당 코어 1개 기준 평균 % 로 */
function cpuPercent(pods: Pod[]) {
  const known = pods.filter((pod) => pod.cpuMillicores != null);
  return known.length
    ? known.reduce((a, pod) => a + pod.cpuMillicores!, 0) / known.length / 10
    : null;
}
function percent(value: number | null | undefined) {
  return value == null ? "–" : `${Math.round(value)}%`;
}
function mib(value: number | null | undefined) {
  return value == null
    ? "–"
    : value >= 1024
      ? `${(value / 1024).toFixed(1)}GiB`
      : `${Math.round(value)}MiB`;
}
function ms(value: number | null | undefined) {
  return value == null || value < 0 ? "–" : `${Math.round(value)}ms`;
}
