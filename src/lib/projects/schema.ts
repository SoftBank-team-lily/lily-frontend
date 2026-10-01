import { z } from "zod";
import { ApiError } from "@/lib/api";
import { parseRepo } from "@/lib/repo/parseRepo";

export const idSchema = z.uuid();
export const nameSchema = z.string().trim().min(1).max(100);
// 배포 설정. 비우면 lily-builder 가 레포를 보고 정한다. 형식은 lily-builder BuildRequest 와 같다
const pathSchema = z
  .string()
  .trim()
  .max(200)
  .regex(/^[\w./-]*$/, "브랜치와 폴더는 영문, 숫자, . / - _ 만 쓸 수 있어요.");
const portSchema = z.number().int().min(1).max(65535);
const healthPathSchema = z
  .string()
  .trim()
  .max(200)
  // tcp: 주소 대신 포트가 열렸는지만 본다 (lily-builder)
  .regex(/^(tcp|\/[!-~]*)?$/, "헬스 체크 경로는 /로 시작해야 해요.");
const envKeySchema = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "환경변수 이름은 영문, 숫자, _ 만 쓸 수 있어요.")
  .max(100);
const envSchema = z
  .record(envKeySchema, z.string().max(4000))
  .refine((value) => Object.keys(value).length <= 50, "환경변수는 50개까지예요.");
export const databaseSchema = z.enum(["postgres", "mysql", "none"]);
const envKeysSchema = z.array(envKeySchema).max(50);
function settingsShape() {
  return {
    branch: pathSchema.optional(),
    rootDir: pathSchema
      .transform((value) => value.replace(/^\/+|\/+$/g, ""))
      .optional(),
    port: portSchema.optional(),
    healthPath: healthPathSchema.optional(),
    env: envSchema.optional(),
  };
}
export const projectSchema = z
  .object({
    repo: z
      .string()
      .max(300)
      .transform((value, ctx) => {
        const repo = parseRepo(value);
        if (!repo) {
          ctx.addIssue({
            code: "custom",
            message: "GitHub 레포 주소를 확인해 주세요.",
          });
          return z.NEVER;
        }
        return repo.toLowerCase();
      }),
    name: nameSchema.optional(),
    target: z.enum(["cloud", "onprem"]).optional(),
    ...settingsShape(),
    // 등록할 때만 받는다. 바꾸면 tenant DB 가 엔진마다 따로 생겨서 updateSchema 에는 없다
    database: databaseSchema.optional(),
    // 배포 전 확인 창: 서버가 랜덤 값을 만들 키, 같은 레포 다른 프로젝트 값을 가져올 키
    generateEnv: envKeysSchema.optional(),
    reuseEnv: envKeysSchema.optional(),
  })
  .strict();
/** 실패한 배포 고치기. 앱 폴더와 DB 는 한 번도 성공하지 않은 프로젝트만 바꾼다 (fixProject) */
export const fixSchema = z
  .object({
    env: envSchema.optional(),
    generateEnv: envKeysSchema.optional(),
    reuseEnv: envKeysSchema.optional(),
    port: portSchema.optional(),
    healthPath: healthPathSchema.optional(),
    database: databaseSchema.optional(),
    rootDir: pathSchema
      .transform((value) => value.replace(/^\/+|\/+$/g, ""))
      .optional(),
    // false 면 저장만 한다 (랜딩은 저장한 뒤 배포를 따라가며 다시 시작한다)
    redeploy: z.boolean().optional(),
  })
  .strict();
export type ProjectFix = z.infer<typeof fixSchema>;
/** 등록 전 DB 감지. 폴더·브랜치는 등록할 값과 같게 보낸다 */
export const detectSchema = z
  .object({
    repo: projectSchema.shape.repo,
    branch: pathSchema.optional(),
    rootDir: pathSchema
      .transform((value) => value.replace(/^\/+|\/+$/g, ""))
      .optional(),
  })
  .strict();
/**
 * 등록한 뒤에 바꾸는 값. null 이면 비운다 (builder 가 다시 레포를 보고 정한다).
 * 앱 폴더는 앱 이름(= 주소)이 바뀌므로 바꾸지 않는다. 환경변수는 env 로 넣거나 덮고 removeEnv 로 지운다
 */
export const updateSchema = z
  .object({
    name: nameSchema.optional(),
    branch: pathSchema.nullable().optional(),
    port: portSchema.nullable().optional(),
    healthPath: healthPathSchema.nullable().optional(),
    env: envSchema.optional(),
    removeEnv: z.array(envKeySchema).max(50).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "바꿀 내용이 없어요.");
export type ProjectUpdate = z.infer<typeof updateSchema>;
export const eventSchema = z
  .object({
    eventId: z.string().min(1).max(128),
    status: z.enum(["running", "succeeded", "failed", "rolled-back"]),
  })
  .strict();
export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(
      400,
      "INVALID_INPUT",
      result.error.issues[0]?.code === "custom" ||
        result.error.issues[0]?.code === "invalid_format"
        ? result.error.issues[0].message
        : "입력 내용을 확인해 주세요.",
    );
  return result.data;
}
