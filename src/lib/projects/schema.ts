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
export const databaseLocationSchema = z.enum(["local", "external", "cloud"]);
/** 사용자 DB 주소. lily-builder BuildRequest.databaseUrl 과 같은 형식 */
export const databaseUrlSchema = z
  .string()
  .trim()
  .max(500)
  .regex(
    /^(postgres|postgresql|mysql):\/\/[^\s:@/]+:[^\s@]+@[^\s:/]+(:\d+)?\/[^\s/?]+(\?\S*)?$/,
    "DB 주소는 postgresql://계정:비밀번호@호스트:포트/DB이름 형식이에요.",
  );
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
const repoSchema = z
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
  });
export const projectSchema = z
  .object({
    repo: repoSchema,
    name: nameSchema.optional(),
    target: z.enum(["cloud", "onprem"]).optional(),
    deploymentMode: z.enum(["HYBRID", "ONPREM_ONLY"]).optional(),
    cloudProvider: z.enum(["AWS", "GCP"]).optional(),
    cloudSelection: z.enum(["auto", "manual"]).optional(),
    ...settingsShape(),
    // 등록할 때만 받는다. 바꾸면 tenant DB 가 엔진마다 따로 생겨서 updateSchema 에는 없다
    database: databaseSchema.optional(),
    // 온프레미스 DB 위치. external 이면 databaseUrl 이 있어야 한다
    databaseLocation: databaseLocationSchema.optional(),
    databaseUrl: databaseUrlSchema.optional(),
    // 배포 전 확인 창: 서버가 랜덤 값을 만들 키, 같은 레포 다른 프로젝트 값을 가져올 키
    generateEnv: envKeysSchema.optional(),
    reuseEnv: envKeysSchema.optional(),
    // 온프레미스 PC 장애 대비. 비우면 둘 다 켠다
    edgeSnapshot: z.boolean().optional(),
    edgeQueue: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.edgeSnapshot !== undefined || value.edgeQueue !== undefined)
      && value.target !== "onprem" && value.deploymentMode !== "ONPREM_ONLY")
      ctx.addIssue({ code: "custom", message: "장애 대비(읽기 사본·쓰기 보관)는 온프레미스 프로젝트만 정해요." });
    if (value.databaseLocation === "external" && !value.databaseUrl)
      ctx.addIssue({ code: "custom", message: "사용할 DB 주소를 넣어 주세요." });
    if (value.databaseUrl && value.databaseLocation !== "external")
      ctx.addIssue({ code: "custom", message: "DB 주소는 '이미 있는 DB'를 고를 때만 넣어요." });
    if (value.databaseLocation && value.target !== "onprem" && value.deploymentMode !== "ONPREM_ONLY")
      ctx.addIssue({ code: "custom", message: "DB 위치는 온프레미스 프로젝트만 정해요." });
    if (value.deploymentMode === "ONPREM_ONLY" && value.target === "cloud")
      ctx.addIssue({ code: "custom", message: "온프레미스 전용은 내 PC 에만 배포해요." });
    if (value.deploymentMode === "ONPREM_ONLY" && value.databaseLocation && value.databaseLocation !== "local")
      ctx.addIssue({ code: "custom", message: "온프레미스 전용 DB 는 내 PC 에만 둘 수 있어요." });
    if (value.deploymentMode === "ONPREM_ONLY" && value.cloudProvider === "GCP")
      ctx.addIssue({ code: "custom", message: "온프레미스 전용은 클라우드를 고르지 않아요." });
    if (value.databaseUrl && value.database && value.database !== "none") {
      const engine = value.databaseUrl.startsWith("mysql:") ? "mysql" : "postgres";
      if (engine !== value.database)
        ctx.addIssue({
          code: "custom",
          message: `DB 주소가 ${engine === "mysql" ? "MySQL" : "PostgreSQL"}인데 고른 DB와 달라요.`,
        });
    }
  });
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
    repo: repoSchema,
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
    remediate: z.boolean().optional(),
    name: nameSchema.optional(),
    branch: pathSchema.nullable().optional(),
    port: portSchema.nullable().optional(),
    healthPath: healthPathSchema.nullable().optional(),
    env: envSchema.optional(),
    removeEnv: z.array(envKeySchema).max(50).optional(),
    deploymentMode: z.enum(["HYBRID", "ONPREM_ONLY"]).optional(),
    cloudProvider: z.enum(["AWS", "GCP"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "바꿀 내용이 없어요.");
export type ProjectUpdate = z.infer<typeof updateSchema>;
/** 클라우드 앱을 내 PC 로 옮기기. database 는 DB 위치 (DB 없는 앱은 비운다). 되돌리기는 거점 전환이 맡는다 */
export const moveSchema = z
  .object({
    to: z.literal("onprem"),
    database: z.enum(["cloud", "local"]).nullable().optional(),
  })
  .strict();
export type ProjectMove = z.infer<typeof moveSchema>;
/** 클라우드 전용 앱을 다른 클라우드로 옮기기. start 는 to 가 필요하다 */
export const cloudMoveSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), to: z.enum(["AWS", "GCP"]) }).strict(),
  z.object({ action: z.literal("rollback"), discardTargetWrites: z.literal(true) }).strict(),
  z.object({ action: z.literal("finalize") }).strict(),
]);
/** 버스팅 켜기·끄기와 클라우드 비율 (0~100). 0 이어도 대기 Pod 1대는 둔다 */
export const burstSchema = z
  .object({
    enabled: z.boolean(),
    cloudPercent: z.number().int().min(0).max(100),
  })
  .strict();
export type BurstInput = z.infer<typeof burstSchema>;
/** 엣지 쓰기 큐에 넣을 POST 경로. / 로 시작하고 쿼리·공백이 없다 (lily-builder EdgeQueueController 와 같다). 빈 목록이면 끈다 */
/** 모니터 패널의 엣지 체크박스. 준 값만 바꾼다 (queue: 장애 중 쓰기 보관, snapshot: 장애 중 읽기 사본) */
export const writeQueueSchema = z
  .object({ queue: z.boolean().optional(), snapshot: z.boolean().optional() })
  .strict()
  .refine((value) => value.queue !== undefined || value.snapshot !== undefined, {
    message: "바꿀 값이 없어요.",
  });
export type WriteQueueInput = z.infer<typeof writeQueueSchema>;
/** 공개 주소가 가리킬 곳 */
/** migrateDatabase: 앱 DB 도 옮긴다 (클라우드로: 내 PC → RDS, 내 PC 로: RDS → 내 PC) */
export const homeSchema = z
  .object({ home: z.enum(["cloud", "onprem"]), migrateDatabase: z.boolean().optional() })
  .strict();
export const eventSchema = z
  .object({
    eventId: z.string().min(1).max(128),
    status: z.enum(["running", "succeeded", "failed", "rolled-back", "cancelled"]),
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
