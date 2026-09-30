import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from "./LandingPage";

const flower = vi.hoisted(() =>
  vi.fn<(props: { targets: { progress: number; wilt: number } }) => null>(
    () => null,
  ),
);
vi.mock("@/components/flower/FlowerCanvas", () => ({ FlowerCanvas: flower }));

describe("배포 화면", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
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
    fireEvent.change(input(), { target: { value: "o/r" } });
    expect(screen.getByRole("alert")).not.toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "배포 시작" }));
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });
  it("성공 후 재시작하면 입력을 유지하며 활성화하고 포커스를 돌린다", async () => {
    const complete = vi.fn();
    render(<LandingPage onComplete={complete} />);
    submit();
    expect(input()).toBeDisabled();
    expect(screen.getByRole("checkbox")).toBeEnabled();
    await act(() => vi.runAllTimersAsync());
    expect(screen.getByText("배포 완료")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveTextContent("next-js.lily.app");
    expect(complete).toHaveBeenCalledTimes(1);
    expect(flower.mock.lastCall?.[0]).toMatchObject({
      targets: { progress: 1, wilt: 0 },
    });
    fireEvent.click(screen.getByRole("button", { name: "다시 배포하기" }));
    expect(flower.mock.lastCall?.[0]).toMatchObject({
      targets: { progress: 0, wilt: 0 },
    });
    expect(input()).toBeEnabled();
    expect(input()).toHaveFocus();
    expect(input()).toHaveValue("o/next.js");
    expect(screen.queryByText("배포 완료")).not.toBeInTheDocument();
  });
  it("시작 시 체크 상태로 롤백 여부를 고정한다", async () => {
    render(<LandingPage />);
    fireEvent.click(screen.getByRole("checkbox"));
    submit();
    fireEvent.click(screen.getByRole("checkbox"));
    await act(() => vi.runAllTimersAsync());
    expect(flower.mock.lastCall?.[0]).toMatchObject({
      targets: { progress: (4 + 7 / 12) / 6, wilt: 0.85 },
    });
    expect(screen.getByText("이전 버전으로 되돌렸어요")).toBeInTheDocument();
    expect(screen.getByText(/서비스는 계속 정상이에요/)).toBeInTheDocument();
    expect(input()).toBeDisabled();
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
