import { LanguageProvider } from "@/lib/i18n/provider";
import {
  act,
  fireEvent,
  render as renderComponent,
  screen,
} from "@testing-library/react";
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
/** 실행기가 자동으로 고쳐 다시 보낸 배포 (d2) */
function retried(status: string) {
  const base = project(status);
  return {
    ...base,
    latestDeployment: { ...base.latestDeployment!, id: "d2", autoFixed: true },
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
  /** 이미 등록한 프로젝트 (GET /api/projects) */
  let registered: ReturnType<typeof project>[];
  beforeEach(() => {
    vi.useFakeTimers();
    states = [];
    registered = [];
    fetch = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/projects?limit=100")
        return respond(200, { items: registered, nextCursor: null });
      if (url === `/api/projects/${PROJECT}/fixes`)
        return respond(200, { enabled: false, consent: false, githubApp: false, runs: [] });
      if (url === "/api/detect") return respond(200, { database: "postgres" });
      if (url === `/api/projects/${PROJECT}/deployments`)
        return respond(201, { id: "d2" });
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
  function callTo(url: string, method?: string) {
    const call = fetch.mock.calls.find(
      ([value, init]) => value === url && (!method || init?.method === method),
    );
    if (!call) throw new Error(`${url} 요청이 없다`);
    return call as [string, RequestInit & { body: string }];
  }
  /** DB 확인 창에서 생성을 누른다 */
  async function create() {
    await act(() => vi.runAllTimersAsync());
    fireEvent.click(screen.getByRole("button", { name: "생성" }));
  }
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

    // 감지한 DB 를 미리 골라 둔 확인 창. 다른 DB 로 바꿔 생성할 수 있다
    const database = screen.getByRole("combobox", { name: "감지된 DB" });
    expect(database).toHaveValue("postgres");
    expect(JSON.parse(callTo("/api/detect")[1].body)).toEqual({
      repo: "o/next.js",
      rootDir: "frontend",
    });
    fireEvent.change(database, { target: { value: "mysql" } });
    fireEvent.click(screen.getByRole("button", { name: "생성" }));
    await act(() => vi.runAllTimersAsync());

    expect(JSON.parse(callTo("/api/projects", "POST")[1].body)).toEqual({
      repo: "o/next.js",
      target: "cloud",
      rootDir: "frontend",
      env: { VITE_API_URL: "https://api.example.com" },
      database: "mysql",
      deploymentMode: "HYBRID",
      cloudSelection: "auto",
      generateEnv: [],
      reuseEnv: [],
    });
    expect(screen.getByText("배포 완료")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "next-js-1b62c0.apps.lilycloud.kr" })).toHaveAttribute(
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
  it("온프레미스는 에이전트가 연결된 뒤에만 배포하고 위치를 함께 보낸다", async () => {
    let connected = false;
    const base = fetch.getMockImplementation() as (
      url: string,
      init?: RequestInit,
    ) => Promise<Response>;
    fetch.mockImplementation((url: string, init?: RequestInit) =>
      url === "/api/agent"
        ? respond(200, {
            agent: { agentId: "edge-1", connected, database: true },
          })
        : base(url, init),
    );
    states = [project("succeeded", { url: "https://app.lilycloud.kr" })];
    render(<LandingPage />);
    fireEvent.click(screen.getByRole("radio", { name: /^하이브리드내 PC/ }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole("button", { name: "배포 시작" })).toBeDisabled();
    expect(
      screen.getByText("온프레미스 에이전트가 연결되면 배포할 수 있어요."),
    ).toBeInTheDocument();

    connected = true;
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(screen.getByText(/연결됨 · edge-1/)).toBeInTheDocument();
    submit();
    // 에이전트 상태를 계속 묻기 때문에 타이머를 모두 돌리지 않고 정해진 시간만 넘긴다
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.click(screen.getByRole("button", { name: "생성" }));
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(JSON.parse(callTo("/api/projects", "POST")[1].body)).toMatchObject({
      repo: "o/next.js",
      target: "onprem",
    });
    expect(screen.getByText("배포 완료")).toBeInTheDocument();
  });
  it("다른 위치에 등록한 레포는 등록하지 않고 이유를 보인다", async () => {
    registered = [project(null)];
    fetch.mockImplementation((url: string) =>
      url === "/api/agent"
        ? respond(200, {
            agent: { agentId: "edge-1", connected: true, database: true },
          })
        : url === "/api/projects?limit=100"
          ? respond(200, { items: registered, nextCursor: null })
          : respond(404, { error: { code: "NOT_FOUND", message: "없음" } }),
    );
    render(<LandingPage />);
    fireEvent.click(screen.getByRole("radio", { name: /^하이브리드내 PC/ }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    submit();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(
      screen.getByText(/이미 클라우드에 등록돼 있어요/),
    ).toBeInTheDocument();
    expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
      false,
    );
  });
  it("온프레미스를 고를 때 로그인하지 않았으면 로그인 버튼을 보인다", async () => {
    const login = vi.fn();
    fetch.mockImplementation(() =>
      respond(401, { error: { code: "UNAUTHORIZED", message: "로그인" } }),
    );
    render(<LandingPage onNeedLogin={login} />);
    fireEvent.click(screen.getByRole("radio", { name: /^하이브리드내 PC/ }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(
      screen.getByText("로그인하면 에이전트를 연결할 수 있어요."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    expect(login).toHaveBeenCalledTimes(1);
  });
  it("확인 창이 비밀값은 자동 생성, 예시 값은 미리 채우고, 비워 둔 외부 키는 unset 으로 보낸다", async () => {
    fetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/projects?limit=100")
        return respond(200, { items: [], nextCursor: null });
      if (url === `/api/projects/${PROJECT}/fixes`)
        return respond(200, { enabled: false, consent: false, githubApp: false, runs: [] });
      if (url === "/api/detect")
        return respond(200, {
          database: "postgres",
          detection: {
            database: "postgres",
            dir: null,
            apps: [],
            problem: null,
            config: [
              {
                env: "JWT_SECRET",
                property: "jwt.secret",
                kind: "GENERATE",
                value: null,
                hint: "비밀값",
                required: true,
                source: "a",
              },
              {
                env: "JWT_EXPIRATION",
                property: "jwt.expiration",
                kind: "DEFAULT",
                value: "3600000",
                hint: "만료",
                required: true,
                source: "a",
              },
              {
                env: "KAKAO_REST_API_KEY",
                property: "kakao.rest-api-key",
                kind: "INPUT",
                value: null,
                hint: "카카오",
                required: true,
                source: "a",
              },
              {
                env: "AI_OPENAI_API_KEY",
                property: "ai.openai.api-key",
                kind: "INPUT",
                value: null,
                hint: "OpenAI",
                required: true,
                source: "a",
                reusable: true,
              },
            ],
          },
        });
      if (url === "/api/projects" && init?.method === "POST")
        return respond(201, project("queued"));
      return respond(200, project("succeeded"));
    });
    render(<LandingPage />);
    submit();
    await act(() => vi.runAllTimersAsync());

    expect(
      screen.getByRole("dialog", { name: "배포 전 확인" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("JWT_EXPIRATION")).toHaveValue("3600000");
    expect(
      screen.getByText(/같은 레포의 다른 프로젝트에 넣은 값을 써요/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "생성" }));
    await act(() => vi.runAllTimersAsync());

    expect(JSON.parse(callTo("/api/projects", "POST")[1].body)).toMatchObject({
      generateEnv: ["JWT_SECRET"],
      reuseEnv: ["AI_OPENAI_API_KEY"],
      env: { JWT_EXPIRATION: "3600000", KAKAO_REST_API_KEY: "unset" },
    });
  });

  it("실행기가 자동으로 고쳐 다시 보낸 배포를 이어서 따라간다", async () => {
    const diagnosis = {
      cause: "JWT_SECRET 이(가) 없어서 시작하지 못했어요.",
      fixes: [
        {
          type: "env",
          env: "JWT_SECRET",
          kind: "GENERATE",
          value: null,
          hint: null,
          options: [],
          auto: true,
        },
      ],
      source: "rule",
      autoFixable: true,
    };
    states = [
      project("failed", { diagnosis, autoFixed: false }),
      retried("running"),
      retried("succeeded"),
    ];
    render(<LandingPage />);
    submit();
    await create();
    await act(() => vi.runAllTimersAsync());

    expect(screen.getByText("배포 완료")).toBeInTheDocument();
  });

  it("실패 원인에 사용자만 아는 값이 있으면 입력받아 고친 뒤 다시 배포한다", async () => {
    const diagnosis = {
      cause: "설정 KAKAO_REST_API_KEY 이(가) 없어요.",
      fixes: [
        {
          type: "env",
          env: "KAKAO_REST_API_KEY",
          kind: "INPUT",
          value: null,
          hint: "카카오 키",
          options: [],
          auto: false,
        },
      ],
      source: "rule",
      autoFixable: false,
    };
    states = [project("failed", { diagnosis, autoFixed: false })];
    fetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === `/api/projects/${PROJECT}/fix`)
        return respond(200, project("failed"));
      if (url === "/api/projects?limit=100")
        return respond(200, { items: registered, nextCursor: null });
      if (url === `/api/projects/${PROJECT}/fixes`)
        return respond(200, { enabled: false, consent: false, githubApp: false, runs: [] });
      if (url === "/api/detect") return respond(200, { database: "none" });
      if (url === `/api/projects/${PROJECT}/deployments`)
        return respond(201, { id: "d2" });
      if (url === "/api/projects" && init?.method === "POST") {
        registered = [project("failed")];
        return respond(201, project("queued"));
      }
      return respond(200, states.shift() ?? project("succeeded"));
    });
    render(<LandingPage />);
    submit();
    await create();
    await act(() => vi.runAllTimersAsync());

    expect(screen.getByText(diagnosis.cause)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("KAKAO_REST_API_KEY"), {
      target: { value: "kakao-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "고쳐서 다시 배포" }));
    await act(() => vi.runAllTimersAsync());

    expect(
      JSON.parse(callTo(`/api/projects/${PROJECT}/fix`)[1].body),
    ).toMatchObject({
      env: { KAKAO_REST_API_KEY: "kakao-123" },
      redeploy: false,
    });
    expect(callTo(`/api/projects/${PROJECT}/deployments`, "POST")).toBeTruthy();
  });

  it("배포가 실패하면 builder 가 남긴 이유를 보여 준다", async () => {
    states = [
      project("failed", { message: "kaniko build failed: npm ci exited 1" }),
    ];
    render(<LandingPage />);
    submit();
    await create();
    await act(() => vi.runAllTimersAsync());
    expect(screen.getByText("배포하지 못했어요")).toBeInTheDocument();
    expect(screen.getByText(/npm ci exited 1/)).toBeInTheDocument();
    expect(flower.mock.lastCall?.[0]).toMatchObject({
      targets: { wilt: 0.85 },
    });
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
  it("DB 확인 창에서 취소하면 등록하지 않는다", async () => {
    render(<LandingPage />);
    submit();
    await act(() => vi.runAllTimersAsync());
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(input()).toBeEnabled();
    expect(
      fetch.mock.calls.some(
        ([url, init]) => url === "/api/projects" && init?.method === "POST",
      ),
    ).toBe(false);
  });
  it("DB 를 감지하지 못하면 없음을 골라 둔다", async () => {
    fetch.mockImplementation((url: string) =>
      url === "/api/detect"
        ? respond(200, { database: "none" })
        : respond(200, { items: [], nextCursor: null }),
    );
    render(<LandingPage />);
    submit();
    await act(() => vi.runAllTimersAsync());
    expect(screen.getByRole("combobox", { name: "감지된 DB" })).toHaveValue(
      "none",
    );
  });
  it("이미 등록한 프로젝트는 DB 를 묻지 않고 다시 배포한다", async () => {
    registered = [project("succeeded")];
    states = [project("succeeded")];
    render(<LandingPage />);
    submit();
    await act(() => vi.runAllTimersAsync());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(callTo(`/api/projects/${PROJECT}/deployments`, "POST")).toBeTruthy();
    expect(fetch.mock.calls.some(([url]) => url === "/api/detect")).toBe(false);
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

function render(ui: React.ReactNode) {
  return renderComponent(ui, {
    wrapper: ({ children }) => (
      <LanguageProvider locale="ko">{children}</LanguageProvider>
    ),
  });
}
