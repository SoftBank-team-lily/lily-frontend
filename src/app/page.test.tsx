import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LandingPage } from "@/components/landing/LandingPage";

vi.mock("@/components/flower/FlowerCanvas", () => ({
  FlowerCanvas: () => null,
}));

describe("랜딩 페이지", () => {
  it("시연 안내와 이름이 있는 입력을 표시한다", () => {
    render(<LandingPage />);
    expect(
      screen.getByRole("heading", { name: "지금 피워 보세요." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "GitHub 레포 주소" }),
    ).toBeInTheDocument();
  });
});
