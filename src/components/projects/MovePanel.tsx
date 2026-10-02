"use client";

import { useState } from "react";
import { projectRequest, ProjectError } from "@/lib/projects/client";
import type { AgentState } from "@/lib/agents/types";
import type { Project } from "@/lib/projects/types";
import { Button } from "@/components/ui/Button";
import { AgentPanel } from "./AgentPanel";

type Database = "cloud" | "local";

const DATABASES: { value: Database; label: string; description: string }[] = [
  {
    value: "cloud",
    label: "DB 는 클라우드(RDS)에 두기",
    description: "내 PC 앱이 터널로 지금 쓰던 RDS 를 그대로 써요. 데이터 이동이 없어요.",
  },
  {
    value: "local",
    label: "DB 도 내 PC 로 옮기기",
    description:
      "RDS 의 스키마와 데이터를 내 PC DB 로 복사해요. 전환하는 동안(내 PC 빌드 포함) 앱이 잠시 응답하지 않아요.",
  },
];

/**
 * 클라우드 앱을 내 PC 로 옮긴다. 에이전트 연결 → DB 위치 → 시작.
 * 공개 주소는 그대로이고, 내 PC 배포가 끝나서 확인된 뒤에만 클라우드를 내린다.
 */
export function MovePanel({
  project,
  onMoved,
  onCancel,
}: {
  project: Project;
  onMoved: (value: Project) => void;
  onCancel: () => void;
}) {
  const [agent, setAgent] = useState<AgentState | undefined>(undefined);
  const hasDatabase = project.database === "postgres" || project.database === "mysql";
  const [database, setDatabase] = useState<Database>("cloud");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const connected = agent?.connected === true;

  async function start() {
    setBusy(true);
    setError("");
    try {
      onMoved(
        await projectRequest<Project>(`/api/projects/${project.id}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: "onprem", database: hasDatabase ? database : null }),
        }),
      );
    } catch (error) {
      setError(error instanceof ProjectError ? error.message : "서버에 연결하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-line p-4 text-caption">
      <div>
        <p className="text-control font-semibold text-ink">클라우드 → 온프레미스 전환</p>
        <p className="mt-1 text-mute">
          주소는 그대로예요. 내 PC 에 배포가 끝나고 그 주소로 닿는 걸 확인한 뒤에만 클라우드를 내려요. 중간에
          실패하면 클라우드가 계속 받아요.
        </p>
      </div>
      <AgentPanel onChange={setAgent} />
      {hasDatabase && (
        <fieldset className="flex flex-col gap-2 text-control" disabled={busy}>
          <legend className="mb-2">DB 위치</legend>
          {DATABASES.map((option) => {
            const unsupported = option.value === "local" && project.database !== "postgres";
            return (
              <label
                key={option.value}
                className="flex cursor-pointer flex-col gap-1 rounded-xl border border-line p-4 has-[:checked]:border-ink has-[:disabled]:cursor-default has-[:disabled]:opacity-40 focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-accent"
              >
                <input
                  type="radio"
                  name={`move-database-${project.id}`}
                  value={option.value}
                  checked={database === option.value}
                  disabled={unsupported}
                  onChange={() => setDatabase(option.value)}
                  className="sr-only"
                />
                <span className="font-semibold">{option.label}</span>
                <span className="text-caption text-mute">
                  {unsupported ? "PostgreSQL 앱만 옮길 수 있어요." : option.description}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !connected} onClick={() => void start()}>
          {busy ? "요청 중…" : connected ? "전환 시작" : "에이전트 연결을 기다리는 중"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          취소
        </Button>
      </div>
      <p role="alert" className="text-danger">
        {error}
      </p>
    </div>
  );
}
