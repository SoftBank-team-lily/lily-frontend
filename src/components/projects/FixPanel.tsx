"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState } from "react";
import type { DeployFix, Diagnosis } from "@/lib/projects/types";
import type { FixInput } from "@/lib/projects/client";
import { ProjectError } from "@/lib/projects/client";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { UNSET } from "./DeployCheckDialog";

/** 진단의 고칠 방법 + 사용자가 넣은 값 → 고치기 요청 */
export function fixInputOf(
  fixes: DeployFix[],
  values: Record<string, string>,
): FixInput {
  const input: FixInput = { env: {}, generateEnv: [] };
  for (const [index, fix] of fixes.entries()) {
    const typed = values[String(index)]?.trim() ?? "";
    switch (fix.type) {
      case "env":
        if (!fix.env) break;
        if (fix.kind === "GENERATE") input.generateEnv!.push(fix.env);
        else if (fix.kind === "DEFAULT")
          input.env![fix.env] = typed || fix.value || "";
        else input.env![fix.env] = typed || UNSET;
        break;
      case "port":
        if (/^\d+$/.test(typed || fix.value || ""))
          input.port = Number(typed || fix.value);
        break;
      case "healthPath":
        input.healthPath = typed || fix.value || "tcp";
        break;
      case "database":
        if (fix.value === "postgres" || fix.value === "mysql")
          input.database = fix.value;
        break;
      case "rootDir":
        if (typed || fix.value) input.rootDir = typed || fix.value || undefined;
        break;
    }
  }
  return input;
}

function describe(fix: DeployFix, t: ReturnType<typeof useI18n>["t"]) {
  switch (fix.type) {
    case "env":
      return fix.kind === "GENERATE"
        ? "자동으로 만들어요"
        : fix.kind === "DEFAULT"
          ? `${fix.value}`
          : null;
    case "port":
      return t("컨테이너 포트를 {{value0}} 로 바꿔요", { value0: fix.value });
    case "healthPath":
      return fix.value === "tcp"
        ? "주소 대신 포트가 열렸는지만 확인해요"
        : t("헬스 체크를 {{value0}} 로 바꿔요", { value0: fix.value });
    case "database":
      return t("{{value0}} DB 를 붙여요", { value0: fix.value });
    default:
      return null;
  }
}

/**
 * 실패 원인과 고칠 방법. 사용자만 아는 값(외부 서비스 키, 앱 폴더)만 입력받고 나머지는 자동으로 채운다.
 * @param onApply 고친 값을 저장하고 다시 배포한다
 */
export function FixPanel({
  diagnosis,
  onApply,
}: {
  diagnosis: Diagnosis;
  onApply: (input: FixInput) => Promise<void>;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fixes = diagnosis.fixes;
  async function apply() {
    setBusy(true);
    setError("");
    try {
      await onApply(fixInputOf(fixes, values));
    } catch (problem) {
      setError(
        problem instanceof ProjectError
          ? problem.message
          : "서버에 연결하지 못했어요.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 rounded-xl border border-line p-4 text-left">
      <p className="text-caption text-ink">{diagnosis.cause}</p>
      {fixes.length > 0 ? (
        <>
          <ul className="mt-3 flex flex-col gap-3">
            {fixes.map((fix, index) => {
              const id = `fix-${index}`;
              const text = describe(fix, t);
              return (
                <li key={id} className="flex flex-col gap-1.5">
                  <label
                    htmlFor={id}
                    className="break-all font-mono text-caption text-ink"
                  >
                    {fix.type === "env"
                      ? fix.env
                      : fix.type === "rootDir"
                        ? t("앱 폴더")
                        : fix.type}
                  </label>
                  {fix.type === "rootDir" && fix.options.length ? (
                    <select
                      id={id}
                      value={values[String(index)] ?? fix.value ?? ""}
                      onChange={(event) =>
                        setValues({ ...values, [index]: event.target.value })
                      }
                      className="rounded-xl border border-line bg-field px-4 py-3 text-input text-ink outline-none focus-visible:border-ink"
                    >
                      {fix.options.map((option) => (
                        <option
                          key={option}
                          value={option}
                          className="bg-ink text-surface"
                        >
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : fix.kind === "INPUT" ? (
                    <TextField
                      id={id}
                      value={values[String(index)] ?? ""}
                      onChange={(event) =>
                        setValues({ ...values, [index]: event.target.value })
                      }
                      placeholder={t(
                        "비워 두면 앱은 뜨지만 이 기능은 동작하지 않아요",
                      )}
                    />
                  ) : (
                    text && (
                      <p className="break-all text-caption text-mute">
                        {t(text)}
                      </p>
                    )
                  )}
                  {fix.hint && (
                    <p className="text-caption text-mute">{fix.hint}</p>
                  )}
                </li>
              );
            })}
          </ul>
          <Button
            className="mt-4 h-10"
            disabled={busy}
            onClick={() => void apply()}
          >
            {busy ? t("고치는 중…") : t("고쳐서 다시 배포")}
          </Button>
        </>
      ) : (
        <p className="mt-2 text-caption text-mute">
          {t(
            "설정으로 고칠 수 없어요. 레포 코드를 고친 뒤 다시 배포해 주세요.",
          )}
        </p>
      )}
      <p role="alert" className="mt-2 text-caption text-danger">
        {t(error)}
      </p>
    </div>
  );
}
