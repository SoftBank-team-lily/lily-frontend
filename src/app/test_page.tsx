import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("초기 페이지", () => {
  it("샘플 콘텐츠 없이 빈 main 영역을 렌더링한다", () => {
    render(<Home />);

    expect(screen.getByRole("main")).toBeEmptyDOMElement();
  });
});
