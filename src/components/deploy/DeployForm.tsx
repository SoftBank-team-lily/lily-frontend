import type { FormEventHandler, Ref } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { OptionCheckbox } from "@/components/ui/OptionCheckbox";

type Props = {
  repo: string;
  fail: boolean;
  disabled?: boolean;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
  onRepoChange?: (value: string) => void;
  onFailChange?: (value: boolean) => void;
  onSubmit?: FormEventHandler<HTMLFormElement>;
};

export function DeployForm({
  repo,
  fail,
  disabled,
  error,
  inputRef,
  onRepoChange,
  onFailChange,
  onSubmit,
}: Props) {
  return (
    <>
      <form
        noValidate
        onSubmit={onSubmit}
        className="mt-7 flex w-full max-w-lg gap-2 max-[641px]:flex-col"
      >
        <label htmlFor="repo" className="sr-only">
          GitHub 레포 주소
        </label>
        <TextField
          id="repo"
          ref={inputRef}
          value={repo}
          onChange={(event) => onRepoChange?.(event.target.value)}
          disabled={disabled}
          placeholder="github.com/owner/repo"
          aria-invalid={!!error}
          aria-describedby={error ? "repo-error" : undefined}
        />
        <Button type="submit" disabled={disabled}>
          배포 시작
        </Button>
      </form>
      <OptionCheckbox
        checked={fail}
        onChange={(event) => onFailChange?.(event.target.checked)}
      >
        롤백 상황으로 시연하기
      </OptionCheckbox>
      <div
        id="repo-error"
        role="alert"
        className="mt-2.5 min-h-[1.4em] text-caption text-danger"
      >
        {error}
      </div>
    </>
  );
}
