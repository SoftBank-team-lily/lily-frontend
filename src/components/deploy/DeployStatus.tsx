import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { SegmentedProgress } from "@/components/ui/SegmentedProgress";

type Props = {
  stage: string;
  step: number;
  fractions: readonly number[];
  failedIndex?: number | null;
  children?: ReactNode;
  finished?: boolean;
  onReset?: () => void;
  resetDisabled?: boolean;
  actions?: ReactNode;
};

export function DeployStatus({
  stage,
  step,
  fractions,
  failedIndex,
  children,
  finished,
  onReset,
  resetDisabled,
  actions,
}: Props) {
  return (
    <div aria-live="polite" className="mt-6 w-full max-w-lg text-left">
      <SegmentedProgress
        segments={fractions.length}
        fractions={fractions}
        failedIndex={failedIndex}
      />
      <div className="mt-3 flex justify-between gap-3 text-control">
        <span>{stage}</span>
        <span className="whitespace-nowrap text-mute">
          {step} / {fractions.length}
        </span>
      </div>
      <div className="mt-3.5 text-note text-mute">{children}</div>
      {(finished || actions) && (
        <div className="mt-3.5 flex flex-wrap gap-2 max-[641px]:flex-col">
          {finished && (
            <Button variant="ghost" disabled={resetDisabled} onClick={onReset}>
              다시 배포하기
            </Button>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}
