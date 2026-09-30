import "server-only";
import { Pool } from "pg";

const globalDb = globalThis as typeof globalThis & { lilyDb?: Pool };
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL을 설정해 주세요.");

export const db = globalDb.lilyDb ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5000,
});

if (process.env.NODE_ENV !== "production") globalDb.lilyDb = db;
