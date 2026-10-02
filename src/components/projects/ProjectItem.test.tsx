import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectItem } from "./ProjectItem";
import type { Project } from "@/lib/projects/types";

const project: Project = {
  id: "1b62c0de-0000-4000-8000-000000000001",
  repo: "owner/repo",
  name: "repo",
  target: "cloud",
  rootDir: "",
  branch: null,
  port: null,
  healthPath: null,
  envKeys: [],
  webhookSecret: "abc123",
  webhookUrl: "https://lily.example/api/github/webhook",
  githubApp: false,
  createdAt: "2026-10-01T00:00:00.000Z",
  latestDeployment: null,
};

describe("프로젝트 웹훅 안내", () => {
  it("Payload URL과 Secret, main 푸시 안내를 보여 준다", () => {
    render(<ProjectItem project={project} onUpdate={() => {}} />);
    expect(screen.getByText("https://lily.example/api/github/webhook")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
    expect(screen.getByText(/main 푸시가 배포돼요/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "내 PC로 옮기기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "클라우드로 옮기기" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "GitHub 연결" })).toHaveAttribute(
      "href",
      "/api/github/install",
    );
  });

  it("앱이 연결되면 웹훅 값 대신 푸시 배포 안내를 보여 준다", () => {
    render(
      <ProjectItem
        project={{ ...project, githubApp: true, webhookSecret: "", webhookUrl: "" }}
        onUpdate={() => {}}
      />,
    );
    expect(screen.getByText(/푸시하면 이 프로젝트를 다시/)).toBeInTheDocument();
    expect(screen.queryByText("abc123")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "GitHub 연결" })).not.toBeInTheDocument();
  });
});

describe("환경 옮기기", () => {
  const deployed: Project = {
    ...project,
    latestDeployment: {
      id: "d1",
      status: "succeeded",
      url: "https://repo.example",
      message: null,
      stage: null,
      logs: [],
    },
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("클라우드에 있으면 내 PC로 옮기는 버튼 하나만 보여 준다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ home: "cloud" }) })),
    );
    render(<ProjectItem project={deployed} onUpdate={() => {}} />);
    expect(await screen.findByRole("button", { name: "내 PC로 옮기기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "클라우드로 옮기기" })).not.toBeInTheDocument();
  });

  it("내 PC에 있으면 클라우드로 옮기는 버튼 하나만 보여 준다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ home: "onprem" }) })),
    );
    render(<ProjectItem project={deployed} onUpdate={() => {}} />);
    expect(await screen.findByRole("button", { name: "클라우드로 옮기기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "내 PC로 옮기기" })).not.toBeInTheDocument();
  });

  it("버튼을 누르면 지금 거점의 반대쪽으로만 옮긴다", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return { ok: true, json: async () => ({ home: "onprem" }) };
      }
      return { ok: true, json: async () => ({ home: "cloud" }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ProjectItem project={deployed} onUpdate={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "내 PC로 옮기기" }));
    expect(await screen.findByRole("button", { name: "클라우드로 옮기기" })).toBeInTheDocument();
    const posted = fetchMock.mock.calls.find((call) => call[1]?.method === "POST");
    expect(posted?.[0]).toBe("/api/projects/1b62c0de-0000-4000-8000-000000000001/home");
    expect(JSON.parse(String(posted?.[1]?.body))).toEqual({ home: "onprem" });
  });
});
