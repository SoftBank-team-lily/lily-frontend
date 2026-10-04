import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectRequest } from "@/lib/projects/client";
import type { FixProgress } from "./types";
import { useFixProgress } from "./useFixProgress";

vi.mock("@/lib/projects/client", () => ({ projectRequest: vi.fn(), ProjectError: class extends Error {} }));
describe("AI 수정 상태 응답", () => {
  beforeEach(() => vi.mocked(projectRequest).mockReset());
  it("다른 응답 형식을 상태로 저장하지 않고 오류를 표시한다", async () => {
    vi.mocked(projectRequest).mockResolvedValue({ id: "project" } as unknown as FixProgress);
    const { result } = renderHook(() => useFixProgress("project"));
    await waitFor(() => expect(result.current.error).toContain("AI 수정 상태"));
    expect(result.current.data).toBeUndefined();
  });
  it("정상적인 빈 이력은 서비스 꺼짐 상태로 표시한다", async () => {
    const data = { enabled: false, consent: false, githubApp: false, runs: [] };
    vi.mocked(projectRequest).mockResolvedValue(data);
    const { result } = renderHook(() => useFixProgress("project"));
    await waitFor(() => expect(result.current.data).toEqual(data));
    expect(result.current.error).toBeUndefined();
    expect(projectRequest).toHaveBeenCalledTimes(1);
  });
});
