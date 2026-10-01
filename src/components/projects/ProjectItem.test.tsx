import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
  createdAt: "2026-10-01T00:00:00.000Z",
  latestDeployment: null,
};

describe("프로젝트 웹훅 안내", () => {
  it("Payload URL과 Secret, main 푸시 안내를 보여 준다", () => {
    render(<ProjectItem project={project} onUpdate={() => {}} />);
    expect(screen.getByText("https://lily.example/api/github/webhook")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
    expect(screen.getByText(/main에/)).toBeInTheDocument();
    expect(screen.getByText(/푸시할 때마다/)).toBeInTheDocument();
  });
});
