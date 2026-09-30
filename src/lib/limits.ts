import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";

export async function consumeLimit(
  key: string,
  rule: { window: number; max: number },
) {
  const hash = createHash("sha256")
    .update(`${key}:${rule.window}:${rule.max}`)
    .digest("hex");
  const result = await db.query<{ count: number; retry: string }>(
    `
    INSERT INTO api_limits(key, window_start, count) VALUES ($1, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN api_limits.window_start + make_interval(secs => $2) <= now()
        THEN 1 ELSE LEAST(api_limits.count + 1, $3 + 1) END,
      window_start = CASE WHEN api_limits.window_start + make_interval(secs => $2) <= now()
        THEN now() ELSE api_limits.window_start END
    RETURNING count, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (window_start + make_interval(secs => $2) - now())))) AS retry`,
    [hash, rule.window, rule.max],
  );
  const allowed = result.rows[0].count <= rule.max;
  return { allowed, retryAfter: allowed ? null : Number(result.rows[0].retry) };
}
