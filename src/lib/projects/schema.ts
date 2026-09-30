import { z } from "zod";
import { ApiError } from "@/lib/api";
import { parseRepo } from "@/lib/repo/parseRepo";

export const idSchema = z.uuid();
export const nameSchema = z.string().trim().min(1).max(100);
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
  })
  .strict();
export const updateSchema = z.object({ name: nameSchema }).strict();
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
      result.error.issues[0]?.message === "GitHub 레포 주소를 확인해 주세요."
        ? result.error.issues[0].message
        : "입력 내용을 확인해 주세요.",
    );
  return result.data;
}
