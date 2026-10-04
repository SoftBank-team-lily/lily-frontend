"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useEffect, useState } from "react";
import { projectRequest, ProjectError } from "@/lib/projects/client";
import type { MultiTraffic, Project } from "@/lib/projects/types";

const REFRESH_MS = 5_000;

/**
 * 멀티클라우드(AWS + GCP) 프로젝트. 엣지 Worker 가 요청을 GCP 와 AWS 로 나누는 비율과 클라우드별 Pod 수.
 * DB 는 GCP(Cloud SQL) 하나이고 AWS 쪽은 DB 릴레이로 붙는다. 한쪽이 응답하지 못하면 Worker 가 다른 쪽으로 보낸다.
 */
export function MultiCloudPanel({ project }: { project: Project }) {
  const { t } = useI18n();
  const [traffic, setTraffic] = useState<MultiTraffic | null | undefined>(undefined);
  const [draft, setDraft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () =>
      projectRequest<{ traffic: MultiTraffic | null }>(`/api/projects/${project.id}/traffic`)
        .then((value) => alive && setTraffic(value.traffic))
        .catch(() => alive && setTraffic((current) => current ?? null));
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [project.id]);

  async function save(gcpPercent: number) {
    setBusy(true);
    setError("");
    try {
      const result = await projectRequest<{ traffic: MultiTraffic }>(`/api/projects/${project.id}/traffic`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gcpPercent }),
      });
      setTraffic(result.traffic);
      setDraft(null);
    } catch (error) {
      setError(error instanceof ProjectError ? error.message : "서버에 연결하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  const saved = traffic?.gcpPercent ?? null;
  const gcp = draft ?? saved ?? 50;

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-line p-4 text-caption">
      <div>
        <p className="text-control font-semibold text-ink">{t("AWS + GCP 트래픽")}</p>
        <p className="mt-1 text-mute">
          {t("DB 는 GCP(Cloud SQL) 하나예요. 한쪽 클라우드가 응답하지 못하면 다른 쪽으로 보내요. 세션을 메모리에 두는 앱은 맞지 않아요.")}
        </p>
      </div>

      {traffic === undefined && <p className="text-mute">{t("상태를 확인하는 중…")}</p>}
      {traffic === null && <p className="text-mute">{t("첫 배포가 끝나면 비율을 정할 수 있어요.")}</p>}

      {traffic && (
        <>
          <dl className="grid grid-cols-2 gap-3">
            {(["gcp", "aws"] as const).map((cloud) => (
              <div key={cloud} className="rounded-lg border border-line p-3">
                <dt className="font-semibold text-ink">{cloud === "gcp" ? "GCP" : "AWS"}</dt>
                <dd className="mt-1 text-mute">
                  {traffic[cloud].error
                    ? t("상태를 받지 못했어요")
                    : t("Pod {{ready}}/{{replicas}} 준비", {
                        ready: traffic[cloud].readyReplicas ?? 0,
                        replicas: traffic[cloud].replicas ?? 0,
                      })}
                </dd>
                <dd className="text-ink">{cloud === "gcp" ? gcp : 100 - gcp}%</dd>
              </div>
            ))}
          </dl>
          <label htmlFor={`traffic-${project.id}`} className="block text-ink">
            {t("GCP 로 보내는 비율")}
          </label>
          <input
            id={`traffic-${project.id}`}
            type="range"
            min={0}
            max={100}
            step={5}
            value={gcp}
            disabled={busy}
            onChange={(event) => setDraft(Number(event.target.value))}
            onPointerUp={() => draft !== null && draft !== saved && void save(draft)}
            onKeyUp={() => draft !== null && draft !== saved && void save(draft)}
            aria-valuetext={t("GCP {{gcp}}%, AWS {{aws}}%", { gcp, aws: 100 - gcp })}
            className="w-full accent-accent disabled:opacity-40"
          />
          <p className="text-mute">{t("바꾼 비율은 30초 안에 모든 엣지에 반영돼요.")}</p>
        </>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {t(error)}
        </p>
      )}
    </div>
  );
}
