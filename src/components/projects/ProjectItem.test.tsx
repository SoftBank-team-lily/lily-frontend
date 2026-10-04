import { render as renderBase, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n/provider";
import { ProjectItem } from "./ProjectItem";
import type { Project } from "@/lib/projects/types";

function render(ui: React.ReactNode) {
  return renderBase(<LanguageProvider locale="ko">{ui}</LanguageProvider>);
}

const project: Project = {
  id: "1b62c0de-0000-4000-8000-000000000001",
  repo: "owner/repo",
  name: "repo",
  target: "cloud",
  deploymentMode: "HYBRID",
  cloudProvider: "AWS",
  databaseLocation: null,
  database: null,
  movedFromCloud: false,
  unsetKeys: [],
  runtime: null,
  burst: null,
  cloudPods: null,
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
    render(<ProjectItem project={project} onUpdate={() => {}} onDelete={() => {}} />);
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
        onUpdate={() => {}} onDelete={() => {}}
      />,
    );
    expect(screen.getByText(/푸시하면 이 프로젝트를 다시/)).toBeInTheDocument();
    expect(screen.queryByText("abc123")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "GitHub 연결" })).not.toBeInTheDocument();
  });
});

