import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { parseColorToken, readColorToken } from "@/lib/design/readColorToken";
import { damp } from "../damp";
import { fitView } from "./fitView";
import { CAMERA, FLOWER } from "./config";
import {
  buildFlowerAttributes,
  buildDustAttributes,
  type FlowerPalette,
} from "./particles";
import {
  createDustUniforms,
  createParticleGeometry,
  createParticleMaterial,
  createUniforms,
} from "./material";

const css = readFileSync("src/app/globals.css", "utf8");
const rawToken = (name: string): string =>
  css
    .match(new RegExp(`--${name}: ([^;]+);`))![1]
    .replace(/var\(--([\w-]+)\)/g, (_, name) => rawToken(name));
const token = (name: string) => parseColorToken(rawToken(name));
const palette: FlowerPalette = {
  stamen: token("flower-stamen"),
  pollen: token("flower-pollen"),
  petal: token("flower-petal"),
  edge: token("flower-petal-edge"),
  spot: token("flower-spot"),
  unlit: token("flower-unlit"),
  wilt: token("flower-wilt"),
  dust: token("flower-dust"),
};
function seeded() {
  let seed = 42;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

describe("꽃 기반 모듈", () => {
  it("CSS 색상의 채널을 변환 없이 보존한다", () => {
    expect(token("color-ink")[0]).toBe(242 / 255);
    expect(palette.pollen[0]).toBe(93 / 100);
    document.documentElement.style.setProperty(
      "--test-color",
      rawToken("flower-pollen"),
    );
    expect(readColorToken("--test-color")).toEqual(palette.pollen);
    expect(() => parseColorToken("invalid")).toThrow();
  });
  it("감쇠는 dt가 0이면 유지되고 목표에 수렴한다", () => {
    expect(damp(0, 1, 0.15, 0)).toBe(0);
    expect(damp(0, 1, 0.15, 10)).toBeCloseTo(1);
  });
  it.each([
    { width: 1456, height: 804 },
    { width: 390, height: 780 },
  ])("카메라가 꽃을 빈 공간에 맞춘다: %o", (viewport) => {
    const slot = {
      top: viewport.width >= 700 ? 12 : 56,
      bottom: viewport.height * 0.52 - 16,
    };
    const view = fitView({ slot, viewport, fov: CAMERA.fov });
    const half = view.cam[2] * Math.tan(((CAMERA.fov / 2) * Math.PI) / 180);
    const flowerTop =
      ((1 - (FLOWER.cy + FLOWER.hh - view.cam[1]) / half) * viewport.height) /
      2;
    const flowerBottom =
      ((1 - (FLOWER.cy - FLOWER.hh - view.cam[1]) / half) * viewport.height) /
      2;
    expect(flowerTop).toBeGreaterThanOrEqual(slot.top - 0.001);
    expect(flowerBottom).toBeLessThanOrEqual(slot.bottom + 0.001);
    expect(
      FLOWER.hw / ((half * viewport.width) / viewport.height),
    ).toBeLessThanOrEqual(0.860001);
  });
  it("실제 마스크로 재현 가능한 입자를 생성한다", () => {
    const mask = PNG.sync.read(readFileSync("public/flower-mask.png"));
    expect([mask.width, mask.height]).toEqual([187, 187]);
    const desktop = buildFlowerAttributes(mask, {
      rng: seeded(),
      small: false,
      palette,
    });
    const mobile = buildFlowerAttributes(mask, {
      rng: seeded(),
      small: true,
      palette,
    });
    expect(desktop).toEqual(
      buildFlowerAttributes(mask, { rng: seeded(), small: false, palette }),
    );
    expect(desktop.aRand.length).toBeGreaterThan(mobile.aRand.length);
    expect(mobile.aRand.length).toBeGreaterThan(1000);
    expect(new Set(desktop.aExtra)).toEqual(new Set([0, 1]));
    for (let i = 0; i < desktop.aRand.length; i++) {
      expect(desktop.aBright[i]).toBeGreaterThanOrEqual(0.1);
      expect(desktop.aRand[i]).toBeGreaterThanOrEqual(0);
      expect(desktop.aRand[i]).toBeLessThan(1);
      const radius = Math.hypot(
        desktop.aStart[i * 3],
        desktop.aStart[i * 3 + 1],
        desktop.aStart[i * 3 + 2] + 3,
      );
      expect(radius).toBeGreaterThanOrEqual(4.99999);
      expect(radius).toBeLessThanOrEqual(11.00001);
    }
    expect(Array.from(desktop.aColor.slice(0, 9))).toMatchSnapshot();
  });
  it("먼지는 모바일 600개·데스크톱 1400개이고 공유 uniform을 유지한다", () => {
    for (const small of [true, false]) {
      const attrs = buildDustAttributes({ rng: seeded(), small, palette });
      expect(attrs.aRand.length).toBe(small ? 600 : 1400);
      expect(attrs.position).toEqual(attrs.aStart);
      expect(attrs.position).toEqual(attrs.aSpread);
      expect(attrs.aExtra.every((value) => value === 0)).toBe(true);
      const geometry = createParticleGeometry(attrs);
      expect(geometry.getAttribute("position").count).toBe(attrs.aRand.length);
      geometry.dispose();
    }
    const uniforms = createUniforms(2, false),
      dust = createDustUniforms(uniforms);
    expect(dust.uTime).toBe(uniforms.uTime);
    expect(dust.uGather).toBe(uniforms.uGather);
    expect(dust.uProgress).not.toBe(uniforms.uProgress);
    expect(dust.uWilt).not.toBe(uniforms.uWilt);
    const material = createParticleMaterial(uniforms, palette);
    expect(material.uniforms.uProgress).toBe(uniforms.uProgress);
    material.dispose();
  });
});
