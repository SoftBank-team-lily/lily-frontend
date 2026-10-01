"use client";

import { useEffect, useRef, useState } from "react";
import type { ConfigAdvice, DatabaseChoice, Detection } from "@/lib/projects/types";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

const DATABASES: { value: DatabaseChoice; label: string }[] = [
  { value: "postgres", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "none", label: "없음" },
];
/** 사용자만 아는 필수 값을 비워 두면 넣는 값. 앱은 뜨고 그 기능만 동작하지 않는다 */
export const UNSET = "unset";

/** 확인 창에서 고른 값. 서버가 랜덤 값 생성과 다른 프로젝트 값 복사를 한다 */
export type DeployChoice = {
  database: DatabaseChoice;
  /** 앱 폴더 후보에서 고른 폴더. 후보가 없으면 undefined */
  rootDir?: string;
  env: Record<string, string>;
  generateEnv: string[];
  reuseEnv: string[];
};

type Field = { manual: boolean; value: string; reuse: boolean };

function initial(config: ConfigAdvice[]): Record<string, Field> {
  return Object.fromEntries(
    config.map((key) => [
      key.env,
      {
        manual: false,
        value: key.kind === "DEFAULT" ? (key.value ?? "") : "",
        reuse: !!key.reusable,
      },
    ]),
  );
}

/** 고른 값 → 서버로 보낼 값. 비워 둔 필수 입력은 UNSET 으로 채워 앱이 뜨게 한다 */
export function choiceOf(
  config: ConfigAdvice[],
  fields: Record<string, Field>,
  database: DatabaseChoice,
  rootDir?: string,
): DeployChoice {
  const choice: DeployChoice = { database, rootDir, env: {}, generateEnv: [], reuseEnv: [] };
  for (const key of config) {
    const field = fields[key.env];
    if (!field) continue;
    if (key.kind === "GENERATE" && !field.manual) choice.generateEnv.push(key.env);
    else if (field.reuse && key.reusable && !field.value.trim()) choice.reuseEnv.push(key.env);
    else if (field.value.trim()) choice.env[key.env] = field.value.trim();
    else if (key.required) choice.env[key.env] = UNSET;
  }
  return choice;
}

/**
 * 배포 전 확인. lily-builder 가 감지한 DB, 앱 폴더, 기동에 필요한 설정을 미리 채워 두고 사용자가 고친다.
 * 앱 내부 비밀값은 자동 생성, 예시 값이 있는 설정은 그 값, 외부 서비스 키만 사용자가 넣는다.
 *
 * @param savedKeys 이미 저장된 환경변수 (다시 배포할 때). 목록에서 뺀다
 * @param redetect  앱 폴더를 바꾸면 그 폴더로 다시 감지한다
 */
export function DeployCheckDialog({
  detection: first,
  savedKeys = [],
  confirmLabel = "생성",
  onCancel,
  onConfirm,
  redetect,
}: {
  detection: Detection;
  savedKeys?: string[];
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (choice: DeployChoice) => void;
  redetect?: (rootDir: string) => Promise<Detection>;
}) {
  const [detection, setDetection] = useState(first);
  const servable = first.apps.filter((app) => !app.client);
  const [rootDir, setRootDir] = useState<string | undefined>(
    first.apps.length > 1 ? (first.dir ?? servable[0]?.dir ?? first.apps[0]?.dir) : undefined,
  );
  const [database, setDatabase] = useState<DatabaseChoice>(first.database);
  const config = detection.config.filter((key) => !savedKeys.includes(key.env));
  const [fields, setFields] = useState(() => initial(config));
  const [loading, setLoading] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const cancel = useRef(onCancel);
  useEffect(() => {
    cancel.current = onCancel;
  }, [onCancel]);
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>("select, input, button")?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel.current();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  async function changeFolder(dir: string) {
    setRootDir(dir);
    if (!redetect) return;
    setLoading(true);
    try {
      const next = await redetect(dir);
      setDetection(next);
      setDatabase(next.database);
      setFields(initial(next.config.filter((key) => !savedKeys.includes(key.env))));
    } finally {
      setLoading(false);
    }
  }
  const update = (env: string, patch: Partial<Field>) =>
    setFields((previous) => ({ ...previous, [env]: { ...previous[env], ...patch } }));
  const needsFolder = first.apps.length > 1 && !rootDir;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim px-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="deploy-check-title"
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-line bg-surface text-left"
      >
        <div className="overflow-y-auto p-6">
          <h2 id="deploy-check-title" className="text-lead font-semibold">
            배포 전 확인
          </h2>
          <p className="mt-1 text-caption text-mute">
            레포를 보고 미리 채웠어요. 필요한 것만 고쳐 주세요.
          </p>

          {first.apps.length > 1 && (
            <div className="mt-5 flex flex-col gap-2 text-control">
              <label htmlFor="deploy-check-folder">앱 폴더</label>
              <select
                id="deploy-check-folder"
                value={rootDir ?? ""}
                disabled={loading}
                onChange={(event) => void changeFolder(event.target.value)}
                className="rounded-xl border border-line bg-field px-4 py-3 text-input text-ink outline-none focus-visible:border-ink"
              >
                {first.apps.map((app) => (
                  // 펼친 목록은 OS 가 밝은 배경으로 그려서 상속된 밝은 글씨가 안 보인다
                  <option
                    key={app.dir}
                    value={app.dir}
                    disabled={!!app.client}
                    className="bg-ink text-surface"
                  >
                    {app.dir} · {app.client ? `${app.client}, 서버로 띄울 수 없음` : app.stack}
                  </option>
                ))}
              </select>
              {first.problem && (
                <p className="text-caption text-mute">레포에 앱 폴더가 여러 개라 하나를 골라 주세요.</p>
              )}
            </div>
          )}

          <div className="mt-5 flex flex-col gap-2 text-control">
            <label htmlFor="database-choice">감지된 DB</label>
            <select
              id="database-choice"
              value={database}
              disabled={loading}
              onChange={(event) => setDatabase(event.target.value as DatabaseChoice)}
              className="rounded-xl border border-line bg-field px-4 py-3 text-input text-ink outline-none focus-visible:border-ink"
            >
              {DATABASES.map((option) => (
                <option key={option.value} value={option.value} className="bg-ink text-surface">
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <p className="mt-5 text-caption text-mute">폴더를 다시 살펴보는 중…</p>
          ) : (
            config.length > 0 && (
              <fieldset className="mt-5 flex flex-col gap-4">
                <legend className="text-control">앱이 시작할 때 읽는 설정</legend>
                {config.map((key) => (
                  <ConfigRow
                    key={key.env}
                    advice={key}
                    field={fields[key.env] ?? { manual: false, value: "", reuse: false }}
                    onChange={(patch) => update(key.env, patch)}
                  />
                ))}
              </fieldset>
            )
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line p-4">
          <Button variant="ghost" onClick={onCancel}>
            취소
          </Button>
          <Button
            className="h-10"
            disabled={loading || needsFolder}
            onClick={() =>
              onConfirm(
                choiceOf(config, fields, database, first.apps.length > 1 ? rootDir : undefined),
              )
            }
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConfigRow({
  advice,
  field,
  onChange,
}: {
  advice: ConfigAdvice;
  field: Field;
  onChange: (patch: Partial<Field>) => void;
}) {
  const id = `config-${advice.env}`;
  const generated = advice.kind === "GENERATE" && !field.manual;
  const reused = advice.reusable && field.reuse;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="break-all font-mono text-caption text-ink">
        {advice.env}
      </label>
      {generated ? (
        <p className="text-caption text-mute">
          자동으로 만들어요.{" "}
          <button
            type="button"
            className="underline hover:text-ink"
            onClick={() => onChange({ manual: true })}
          >
            직접 넣기
          </button>
        </p>
      ) : reused ? (
        <p className="text-caption text-mute">
          같은 레포의 다른 프로젝트에 넣은 값을 써요.{" "}
          <button
            type="button"
            className="underline hover:text-ink"
            onClick={() => onChange({ reuse: false })}
          >
            직접 넣기
          </button>
        </p>
      ) : (
        <TextField
          id={id}
          value={field.value}
          onChange={(event) => onChange({ value: event.target.value })}
          placeholder={
            advice.kind === "INPUT" && advice.required
              ? "비워 두면 앱은 뜨지만 이 기능은 동작하지 않아요"
              : ""
          }
        />
      )}
      <p className="text-caption text-mute">{advice.hint}</p>
    </div>
  );
}
