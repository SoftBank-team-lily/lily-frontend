"use client";

import { useI18n } from "@/lib/i18n/provider";
import type { FormEventHandler, Ref } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { DeploySettingsFields } from "@/components/projects/DeploySettingsFields";
import { TargetChoice } from "@/components/projects/TargetChoice";
import { AgentPanel } from "@/components/projects/AgentPanel";
import type { AgentState } from "@/lib/agents/types";
import type { DeployTarget } from "@/lib/projects/types";

type Props = {
  repo: string;
  disabled?: boolean;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
  onRepoChange?: (value: string) => void;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  target?: DeployTarget;
  onTargetChange?: (value: DeployTarget) => void;
  /** 온프레미스 에이전트 연결 상태 */
  onAgentChange?: (agent: AgentState) => void;
  onNeedLogin?: () => void;
  /** 온프레미스인데 에이전트가 아직 연결되지 않았다 */
  waitingAgent?: boolean;
};

export function DeployForm({
  repo,
  disabled,
  error,
  inputRef,
  onRepoChange,
  onSubmit,
  target = "cloud",
  onTargetChange,
  onAgentChange,
  onNeedLogin,
  waitingAgent,
}: Props) {
  const { t } = useI18n();
  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="mt-7 flex w-full max-w-lg flex-col gap-3"
    >
      <fieldset disabled={disabled} className="flex flex-col gap-3">
        <div className="flex w-full gap-2 max-[641px]:flex-col">
          <label htmlFor="repo" className="sr-only">
            {t("GitHub 레포 주소")}
          </label>
          <TextField
            id="repo"
            ref={inputRef}
            value={repo}
            onChange={(event) => onRepoChange?.(event.target.value)}
            placeholder="github.com/owner/repo"
            aria-invalid={!!error}
            aria-describedby={error ? "repo-error" : undefined}
          />
          <Button type="submit" disabled={disabled || waitingAgent}>
            {t("배포 시작")}
          </Button>
        </div>
        {onTargetChange && (
          <TargetChoice value={target} onChange={onTargetChange} />
        )}
        {target === "onprem" && onAgentChange && (
          <AgentPanel onChange={onAgentChange} onNeedLogin={onNeedLogin} />
        )}
        {waitingAgent && (
          <p className="text-caption text-mute">
            {t("온프레미스 에이전트가 연결되면 배포할 수 있어요.")}
          </p>
        )}
        <DeploySettingsFields />
      </fieldset>
      <div
        id="repo-error"
        role="alert"
        className="min-h-[1.4em] text-caption text-danger"
      >
        {t(error)}
      </div>
    </form>
  );
}
