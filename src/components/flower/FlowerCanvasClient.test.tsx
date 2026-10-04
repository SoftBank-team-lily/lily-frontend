import { LanguageProvider } from "@/lib/i18n/provider";
import { StrictMode } from "react";
import { render as renderComponent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FlowerCanvasClient from "./FlowerCanvasClient";

const instances = vi.hoisted(
  () =>
    [] as {
      canvas: HTMLCanvasElement;
      dispose: ReturnType<typeof vi.fn>;
      setTargets: ReturnType<typeof vi.fn>;
      setReducedMotion: ReturnType<typeof vi.fn>;
    }[],
);
vi.mock("@/lib/three/flower/FlowerScene", () => ({
  FlowerScene: class {
    canvas: HTMLCanvasElement;
    dispose = vi.fn();
    setTargets = vi.fn();
    setReducedMotion = vi.fn();
    constructor({ canvas }: { canvas: HTMLCanvasElement }) {
      this.canvas = canvas;
      instances.push(this);
    }
  },
}));

describe("꽃 캔버스", () => {
  it("StrictMode 재생성에 새 canvas를 쓰고 목표 변경은 씬을 유지한다", () => {
    instances.length = 0;
    const getSlot = () => ({ top: 12, bottom: 400 });
    const { rerender, unmount } = render(
      <StrictMode>
        <FlowerCanvasClient getSlot={getSlot} reducedMotion={false} />
      </StrictMode>,
    );
    expect(instances).toHaveLength(2);
    expect(instances[0].dispose).toHaveBeenCalledTimes(1);
    expect(instances[0].canvas).not.toBe(instances[1].canvas);
    expect(document.querySelectorAll("#gl")).toHaveLength(1);
    rerender(
      <StrictMode>
        <FlowerCanvasClient
          getSlot={getSlot}
          reducedMotion={false}
          targets={{ progress: 0.5, wilt: 1 }}
        />
      </StrictMode>,
    );
    expect(instances).toHaveLength(2);
    expect(instances[1].setTargets).toHaveBeenLastCalledWith({
      progress: 0.5,
      wilt: 1,
    });
    unmount();
    expect(instances[1].dispose).toHaveBeenCalledTimes(1);
    expect(document.querySelector("#gl")).toBeNull();
  });
});

function render(ui: React.ReactNode) {
  return renderComponent(ui, {
    reactStrictMode: true,
    wrapper: ({ children }) => (
      <StrictMode><LanguageProvider locale="ko">{children}</LanguageProvider></StrictMode>
    ),
  });
}
