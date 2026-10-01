import type { FormEventHandler, Ref } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { DeploySettingsFields } from "@/components/projects/DeploySettingsFields";

type Props = {
  repo: string;
  disabled?: boolean;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
  onRepoChange?: (value: string) => void;
  onSubmit?: FormEventHandler<HTMLFormElement>;
};

export function DeployForm({
  repo,
  disabled,
  error,
  inputRef,
  onRepoChange,
  onSubmit,
}: Props) {
  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="mt-7 flex w-full max-w-lg flex-col gap-3"
    >
      <fieldset disabled={disabled} className="flex flex-col gap-3">
        <div className="flex w-full gap-2 max-[641px]:flex-col">
          <label htmlFor="repo" className="sr-only">
            GitHub 레포 주소
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
          <Button type="submit" disabled={disabled}>
            배포 시작
          </Button>
        </div>
        <DeploySettingsFields />
      </fieldset>
      <div
        id="repo-error"
        role="alert"
        className="min-h-[1.4em] text-caption text-danger"
      >
        {error}
      </div>
    </form>
  );
}
