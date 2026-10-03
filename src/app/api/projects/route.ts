import { apiError, json, limitWrites, readJson, requireUser } from "@/lib/api";
import { createProject, listProjects } from "@/lib/projects/server";
import { idSchema, projectSchema, validate } from "@/lib/projects/schema";
import { z } from "zod";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const query = new URL(request.url).searchParams;
    const cursor = query.get("cursor");
    const limit = validate(
      z.coerce.number().int().min(1).max(100),
      query.get("limit") ?? 20,
    );
    return json(
      await listProjects(
        user.id,
        cursor ? validate(idSchema, cursor) : null,
        limit,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser(request, true);
    await limitWrites(user.id, "projects");
    const input = validate(projectSchema, await readJson(request));
    return json(
      await createProject(user.id, input.repo, input.name, input.target, {
        branch: input.branch,
        rootDir: input.rootDir,
        port: input.port,
        healthPath: input.healthPath,
        env: input.env,
        database: input.database,
        databaseLocation: input.databaseLocation,
        databaseUrl: input.databaseUrl,
        deploymentMode: input.deploymentMode,
        generateEnv: input.generateEnv,
        reuseEnv: input.reuseEnv,
      }),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
