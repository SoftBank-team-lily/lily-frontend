import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from "./LandingPage";

const flower = vi.hoisted(() =>
  vi.fn<(props: { targets: { progress: number; wilt: number } }) => null>(
    () => null,
  ),
);
vi.mock("@/components/flower/FlowerCanvas", () => ({ FlowerCanvas: flower }));

const PROJECT = "1b62c0de-0000-4000-8000-000000000001";
function project(status: string | null, extra: Record<string, unknown> = {}) {
  return {
    id: PROJECT,
    repo: "o/next.js",
    name: "next.js",
    target: "cloud",
    rootDir: "",
    envKeys: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    latestDeployment: status
      ? { id: "d1", status, url: null, message: null, ...extra }
      : null,
  };
}
function respond(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("배포 화면", () => {
  let fetch: ReturnType<typeof vi.fn>;
  /** GET /api/projects/{id} 가 차례로 돌려줄 상태 */
  let states: ReturnType<typeof project>[];
  beforeEach(() => {
    vi.useFakeTimers();
    states = [];
    fetch = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/projects" && init?.method === "POST")
        return respond(201, project("queued"));
      if (url === `/api/projects/${PROJECT}`)
        return respond(200, states.shift() ?? project("running"));
      return respond(404, { error: { code: "NOT_FOUND", message: "없음" } });
    });
    vi.stubGlobal("fetch", fetch);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const input = () => screen.getByRole("textbox", { name: "GitHub 레포 주소" });
  function submit(repo = "o/next.js") {
    fireEvent.change(input(), { target: { value: repo } });
    fireEvent.click(screen.getByRole("button", { name: "배포 시작" }));
  }
  it("잘못된 입력은 오류를 유지하고 입력으로 포커스를 돌린다", () => {
    render(<LandingPage />);
    submit("bad");
    expect(screen.getByRole("alert")).toHaveTextContent("owner/repo 형식");
    expect(input()).toHaveFocus();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(input(), { target: { value: "o/r" } });
    expect(screen.getByRole("alert")).not.toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "배포 시작" }));
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });
  it("레포와 배포 설정으로 실제 프로젝트를 등록하고 배포 주소를 보여 준다", async () => {
    const complete = vi.fn();
    states = [
      project("running"),
      project("succeeded", { url: "https://next-js-1b62c0.apps.lilycloud.kr" }),
    ];
    render(<LandingPage onComplete={complete} />);
    fireEvent.change(screen.getByLabelText("앱 폴더"), {
      target: { value: "frontend" },
    });
    fireEvent.change(screen.getByLabelText("환경변수"), {
      target: { value: "VITE_API_URL=https://api.example.com" },
    });
    submit();
    expect(input()).toBeDisabled();
    await act(() => vi.runAllTimersAsync());

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      repo: "o/next.js",
      rootDir: "frontend",
      env: { VITE_API_URL: "https://api.example.com" },
    });
    expect(screen.getByText("배포 완료")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://next-js-1b62c0.apps.lilycloud.kr",
    );
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "succeeded", projectId: PROJECT }),
    );
    expect(flower.mock.lastCall?.[0]).toMatchObject({
      targets: { progress: 1, wilt: 0 },
    });
    fireEvent.click(screen.getByRole("button", { name: "다시 배포하기" }));
    expect(input()).toBeEnabled();
    expect(input()).toHaveFocus();
    expect(input()).toHaveValue("o/next.js");
  });
  it("배포가 실패하면 builder 가 남긴 이유를 보여 준다", async () => {
    states = [
      project("failed", { message: "kaniko build failed: npm ci exited 1" }),
    ];
    render(<LandingPage />);
    submit();
    await act(() => vi.runAllTimersAsync());
    expect(screen.getByText("배포하지 못했어요")).toBeInTheDocument();
    expect(screen.getByText(/npm ci exited 1/)).toBeInTheDocument();
    expect(flower.mock.lastCall?.[0]).toMatchObject({ targets: { wilt: 0.85 } });
  });
  it("로그인하지 않았으면 로그인으로 보낸다", async () => {
    const login = vi.fn();
    fetch.mockImplementation(() =>
      respond(401, { error: { code: "UNAUTHORIZED", message: "로그인" } }),
    );
    render(<LandingPage onNeedLogin={login} />);
    submit();
    await act(() => vi.runAllTimersAsync());
    expect(login).toHaveBeenCalledTimes(1);
    expect(input()).toBeEnabled();
  });
  it("환경변수 형식이 틀리면 보내지 않고 알려 준다", () => {
    render(<LandingPage />);
    fireEvent.change(screen.getByLabelText("환경변수"), {
      target: { value: "not a pair" },
    });
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent("1번째 줄");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("언마운트 시 진행을 취소한다", async () => {
    const complete = vi.fn();
    const { unmount } = render(<LandingPage onComplete={complete} />);
    submit();
    unmount();
    await act(() => vi.runAllTimersAsync());
    expect(complete).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
