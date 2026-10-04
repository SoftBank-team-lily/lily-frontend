import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
}));

import { chooseCloudAutomatically } from "./cloudAutomatic";

const settings = { branch: "main", rootDir: "", database: "auto" } as never;

function answer(body: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500 })));
}

describe("chooseCloudAutomatically", () => {
  beforeEach(() => { vi.stubEnv("BUILDER_URL", "http://builder"); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("accepts a rule based choice without confidence", async () => {
    answer({ status: "selected", provider: "AWS", reason: "portable_default", confidence: null });
    await expect(chooseCloudAutomatically("o/r", settings)).resolves.toEqual({ provider: "AWS", reason: "자동 · AWS · 특정 클라우드에 묶이지 않음" });
  });

  it("still requires confidence for a JEV choice", async () => {
    answer({ status: "selected", provider: "GCP", reason: "repository_jev", confidence: 0.5 });
    await expect(chooseCloudAutomatically("o/r", settings)).rejects.toMatchObject({ code: "CLOUD_SELECTION_HELD" });
    answer({ status: "selected", provider: "GCP", reason: "repository_jev", confidence: 0.91, repository: { commit: "a".repeat(40) } });
    await expect(chooseCloudAutomatically("o/r", settings)).resolves.toEqual({ provider: "GCP", reason: "JEV · GCP · 91% · aaaaaaa" });
  });

  it("does not accept an unknown reason without confidence", async () => {
    answer({ status: "selected", provider: "AWS", reason: "anything", confidence: null });
    await expect(chooseCloudAutomatically("o/r", settings)).rejects.toMatchObject({ code: "CLOUD_SELECTION_HELD" });
  });

  it("keeps held results held", async () => {
    answer({ status: "held", reason: "repository_evidence_missing" });
    await expect(chooseCloudAutomatically("o/r", settings)).rejects.toMatchObject({ code: "CLOUD_SELECTION_HELD" });
  });
});
