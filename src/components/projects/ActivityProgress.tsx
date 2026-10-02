"use client";

import { useEffect, useState } from "react";
import { elapsed, type Activity } from "@/lib/projects/burst";
import { Button } from "@/components/ui/Button";

/**
 * 진행 중인 일 하나 (거점 전환 또는 버스팅 대기 배포): 단계 목록, 진행 막대, 경과 시간, 클라우드 빌드 상태, 취소.
 */
export function ActivityProgress({
  activity,
  busy,
  onCancel,
}: {
  activity: Activity;
  busy: boolean;
  onCancel: () => void;
}) {
  const now = useNow();
  const time = elapsed(activity.since, now);
  return (
    <div className="mt-3 rounded-xl border border-line p-3" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink">{activity.title}</p>
        <span className="text-mute">
          {activity.steps.length > 0 && `${activity.current + 1}/${activity.steps.length} 단계 · `}약 {activity.percent}%
        </span>
      </div>
      <div
        className="mt-2 h-1 overflow-hidden rounded-full bg-field"
        role="progressbar"
        aria-label={activity.title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={activity.percent}
      >
        <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${activity.percent}%` }} />
      </div>
      {activity.steps.length > 0 && (
        <ol className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
          {activity.steps.map((step, index) => (
            <li
              key={`${index}-${step}`}
              className={index < activity.current ? "text-mute line-through" : index === activity.current ? "text-ink" : "text-mute"}
            >
              {index === activity.current ? "▶ " : index < activity.current ? "✓ " : ""}
              {step}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-mute">
        지금 단계 {activity.steps[activity.current] ?? "준비"}
        {time && ` · ${time} 지남`}
        {activity.build && ` · 클라우드 빌드 ${activity.build.status}`}
      </p>
      {activity.build?.line && (
        <p className="mt-1 truncate font-mono text-mute" title={activity.build.line}>
          {activity.build.line}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {activity.cancellable ? (
          <Button variant="ghost" className="h-10" disabled={busy} onClick={onCancel}>
            {busy ? "요청 중…" : activity.kind === "home" ? "옮기기 취소" : "대기 배포 취소 (버스팅 끄기)"}
          </Button>
        ) : (
          activity.lockedReason && <p className="text-mute">{activity.lockedReason}</p>
        )}
      </div>
    </div>
  );
}

/** 경과 시간을 1초마다 다시 그린다 */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
