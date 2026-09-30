import "server-only";
import { headers } from "next/headers";
import { auth } from "./server";
import type { User } from "./types";

export async function getUser(requestHeaders?: Headers): Promise<User | null> {
  const session = await auth.api.getSession({
    headers: requestHeaders ?? (await headers()),
  });
  if (!session) return null;
  const { id, email, name, emailVerified } = session.user;
  return { id, email, name, emailVerified };
}
