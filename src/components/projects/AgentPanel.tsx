"use client";

import { useEffect, useRef, useState } from "react";
import { projectRequest, ProjectError } from "@/lib/projects/client";
import type { AgentIssued, AgentState } from "@/lib/agents/types";
import { Button } from "@/components/ui/Button";

// 온프레미스 연결: 토큰을 받아 에이전트를 실행하면, 연결될 때까지 상태를 다시 묻는다.
const REPO = "https://github.com/SoftBank-team-lily/lily-on-premise";

function command(token: string) {
  return `git clone ${REPO} && cd lily-on-premise\nLILY_AGENT_TOKEN=${token} ./scripts/agent.sh`;
}

export function AgentPanel({
  onChange,
  onNeedLogin,
}: {
  onChange: (agent: AgentState) => void;
  /** 로그인하지 않았을 때. 있으면 상태 대신 로그인 버튼을 보인다 */
  onNeedLogin?: () => void;
}) {
  const [agent, setAgent] = useState<AgentState | undefined>(undefined);
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 상태 확인 실패는 다음 확인에서 지운다. 토큰 발급·복사 실패는 다시 누를 때까지 둔다
  const [pollError, setPollError] = useState("");
  const [loggedOut, setLoggedOut] = useState(false);
  const notify = useRef(onChange);
  useEffect(() => {
    notify.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await projectRequest<{ agent: AgentState }>(
          "/api/agent",
        );
        if (stop) return;
        setAgent(result.agent);
        notify.current(result.agent);
        setPollError("");
        timer = setTimeout(poll, result.agent?.connected ? 15000 : 3000);
      } catch (error) {
        if (stop) return;
        if (error instanceof ProjectError && error.status === 401) {
          setLoggedOut(true);
          return;
        }
        setPollError(
          error instanceof ProjectError
            ? error.message
            : "서버에 연결하지 못했어요.",
        );
        timer = setTimeout(poll, 10000);
      }
    }
    void poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, []);

  async function issue() {
    setBusy(true);
    setError("");
    try {
      const result = await projectRequest<AgentIssued>("/api/agent", {
        method: "POST",
      });
      setToken(result.token);
      setCopied(false);
    } catch (error) {
      setError(
        error instanceof ProjectError
          ? error.message
          : "서버에 연결하지 못했어요.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(command(token));
      setCopied(true);
    } catch {
      setError("복사하지 못했어요. 직접 선택해서 복사해 주세요.");
    }
  }

  const status = loggedOut
    ? "로그인하면 에이전트를 연결할 수 있어요."
    : agent === undefined
      ? "확인 중…"
      : agent?.connected
        ? `연결됨 · ${agent.agentId ?? "에이전트"}${agent.database ? "" : " · DB 터널 없음"}`
        : agent
          ? "연결 안 됨. 아래 명령으로 에이전트를 실행해 주세요."
          : "아직 연결한 적이 없어요.";

  return (
    <section
      className="rounded-xl border border-line p-5"
      aria-labelledby="agent-title"
    >
      <h3 id="agent-title" className="text-control font-semibold">
        온프레미스 연결
      </h3>
      <p className="mt-2 text-caption text-mute" aria-live="polite">
        {status}
      </p>
      {loggedOut ? (
        onNeedLogin && (
          <Button variant="ghost" className="mt-4" onClick={onNeedLogin}>
            로그인
          </Button>
        )
      ) : token ? (
        <div className="mt-4 space-y-3">
          <p className="text-caption text-mute">
            Docker가 켜진 PC의 터미널에서 실행하세요. 토큰은 지금만 보여요.
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-field p-4 text-caption text-ink">
            {command(token)}
          </pre>
          <Button variant="ghost" onClick={copy}>
            {copied ? "복사했어요" : "명령 복사"}
          </Button>
        </div>
      ) : (
        !agent?.connected && (
          <Button
            variant="ghost"
            className="mt-4"
            disabled={busy || agent === undefined}
            onClick={issue}
          >
            {busy ? "처리 중…" : agent ? "새 토큰 받기" : "연결 토큰 받기"}
          </Button>
        )
      )}
      <p role="alert" className="mt-2 text-caption text-danger">
        {error || pollError}
      </p>
    </section>
  );
}
