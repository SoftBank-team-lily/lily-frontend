"use client";

import { useEffect, useRef, useState } from "react";
import type { DatabaseChoice } from "@/lib/projects/types";
import { Button } from "@/components/ui/Button";

const OPTIONS: { value: DatabaseChoice; label: string }[] = [
  { value: "postgres", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "none", label: "없음" },
];

/** 등록 전 DB 확인. lily-builder 가 감지한 값을 미리 골라 두고 사용자가 바꿀 수 있다 */
export function DatabaseDialog({
  detected,
  onCancel,
  onCreate,
}: {
  detected: DatabaseChoice;
  onCancel: () => void;
  onCreate: (database: DatabaseChoice) => void;
}) {
  const [value, setValue] = useState(detected);
  const select = useRef<HTMLSelectElement>(null);
  const cancel = useRef(onCancel);
  useEffect(() => {
    cancel.current = onCancel;
  }, [onCancel]);
  useEffect(() => {
    select.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel.current();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="database-choice-label"
        className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 text-left"
      >
        <div className="flex flex-col gap-2 text-control">
          <label id="database-choice-label" htmlFor="database-choice">
            감지된 DB
          </label>
          <select
            id="database-choice"
            ref={select}
            value={value}
            onChange={(event) => setValue(event.target.value as DatabaseChoice)}
            className="rounded-xl border border-line bg-field px-4 py-3 text-input text-ink outline-none focus-visible:border-ink"
          >
            {OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            취소
          </Button>
          <Button className="h-10" onClick={() => onCreate(value)}>
            생성
          </Button>
        </div>
      </div>
    </div>
  );
}
