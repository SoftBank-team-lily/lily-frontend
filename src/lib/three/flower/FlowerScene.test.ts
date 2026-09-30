import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShaderMaterial } from "three";
import { FlowerScene } from "./FlowerScene";

const renderers = vi.hoisted(() => [] as {
  render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; forceContextLoss: ReturnType<typeof vi.fn>;
}[]);
vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");
  return { ...actual, WebGLRenderer: class {
    render = vi.fn(); dispose = vi.fn(); forceContextLoss = vi.fn();
    setPixelRatio() {} setClearColor() {} setSize() {}
    constructor() { renderers.push(this); }
  } };
});

const images: FakeImage[] = [];
class FakeImage {
  width = 2; height = 2; src = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { images.push(this); }
  removeAttribute() { this.src = ""; }
}
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
function tick(now: number) {
  const callbacks = [...frames.values()]; frames.clear();
  callbacks.forEach(callback => callback(now));
}
function mount(reducedMotion = false) {
  const canvas = document.createElement("canvas");
  const scene = new FlowerScene({ canvas, getSlot: () => ({ top: 12, bottom: 400 }), reducedMotion });
  return { canvas, scene, image: images.at(-1)! };
}

describe("꽃 씬 수명주기", () => {
  beforeEach(() => {
    frames = new Map(); nextFrame = 0; renderers.length = 0; images.length = 0;
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage() {}, getImageData: () => ({ width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) }) } as unknown as CanvasRenderingContext2D);
    const css = readFileSync("src/app/globals.css", "utf8");
    for (const match of css.matchAll(/(--(?:flower-[\w-]+|color-surface)): ([^;]+);/g)) document.documentElement.style.setProperty(match[1], match[2].replace(/var\((--[\w-]+)\)/g, (_, name) => css.match(new RegExp(`${name}: ([^;]+);`))![1]));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it("10번 생성·해제해도 프레임·리스너·GPU 자원을 정리한다", () => {
    const add = vi.spyOn(window, "addEventListener"), remove = vi.spyOn(window, "removeEventListener");
    for (let i = 0; i < 10; i++) {
      const { canvas, scene, image } = mount(); image.onload!(); tick(performance.now());
      const renderedScene = renderers.at(-1)!.render.mock.calls[0][0];
      const bloom = renderedScene.children[0].children[0], dust = renderedScene.children[1];
      const disposeGeometry = vi.spyOn(bloom.geometry, "dispose");
      const disposeMaterial = vi.spyOn(bloom.material, "dispose");
      const disposeDust = vi.spyOn(dust.geometry, "dispose");
      scene.dispose(); scene.dispose();
      expect(disposeGeometry).toHaveBeenCalledTimes(1); expect(disposeMaterial).toHaveBeenCalledTimes(1); expect(disposeDust).toHaveBeenCalledTimes(1);
      expect(canvas.dataset.state).toBe("disposed"); expect(frames.size).toBe(0);
      expect(image.onload).toBeNull(); expect(renderers.at(-1)!.dispose).toHaveBeenCalledTimes(1); expect(renderers.at(-1)!.forceContextLoss).toHaveBeenCalledTimes(1);
    }
    for (const type of ["pointermove", "resize"]) {
      expect(add.mock.calls.filter(call => call[0] === type)).toHaveLength(10);
      expect(remove.mock.calls.filter(call => call[0] === type)).toHaveLength(10);
    }
  });
  it("ロード途中の解放後に画像コールバックが来ても生成しない", () => {
    const { scene, image } = mount(); const load = image.onload!;
    scene.dispose(); load(); expect(frames.size).toBe(0); expect(renderers[0].render).not.toHaveBeenCalled();
  });
  it("reduced motionは完成済みで時間とポインターが動かない", () => {
    const { scene, image } = mount(true); image.onload!();
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 900, clientY: 600 }));
    tick(performance.now() + 1000);
    const bloom = renderers[0].render.mock.calls[0][0].children[0];
    const material = bloom.children[0].material as ShaderMaterial;
    expect(material.uniforms.uAssemble.value).toBe(1); expect(material.uniforms.uTime.value).toBe(0);
    expect(bloom.rotation.x).toBe(0); expect(bloom.rotation.y).toBe(0); scene.dispose();
  });
});
