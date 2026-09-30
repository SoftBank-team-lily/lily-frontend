import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { parseColorToken } from "@/lib/design/readColorToken";
import {
  buildFlowerAttributes,
  buildDustAttributes,
  type FlowerPalette,
} from "./particles";
import { createUniforms } from "./material";
import { vertexShader, fragmentShader } from "./shaders";

const html = readFileSync("docs/reference/landing.html", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");
const rawToken = (name: string): string =>
  css
    .match(new RegExp(`--${name}: ([^;]+);`))![1]
    .replace(/var\(--([\w-]+)\)/g, (_, name) => rawToken(name));
const token = (name: string) => parseColorToken(rawToken(`flower-${name}`));
const palette: FlowerPalette = {
  stamen: token("stamen"),
  pollen: token("pollen"),
  petal: token("petal"),
  edge: token("petal-edge"),
  spot: token("spot"),
  unlit: token("unlit"),
  wilt: token("wilt"),
  dust: token("dust"),
};
const originalVertex = html.match(/const vert = `([\s\S]*?)`;/)![1];
const originalFragment = html.match(/const frag = `([\s\S]*?)`;/)![1];
function seeded() {
  let seed = 42;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

describe("원본 꽃 수식 동등성", () => {
  it("색 uniform 변경을 제외한 셰이더가 원본과 같다", () => {
    let index = 0;
    const normalized = originalVertex
      .replace(
        /vec3\([\d., ]+\)/g,
        () => ["uUnlitColor", "uWiltColor"][index++],
      )
      .replace(
        "uniform float uTime",
        "uniform vec3 uUnlitColor, uWiltColor;\nuniform float uTime",
      );
    expect(vertexShader).toBe(normalized);
    expect(fragmentShader).toBe(originalFragment);
  });
  it.each([false, true])(
    "같은 난수의 원본·앱 입자 attribute가 모두 같다: small=%s",
    (small) => {
      const mask = PNG.sync.read(readFileSync("public/flower-mask.png"));
      const flower = new THREE.Group(),
        scene = new THREE.Scene();
      const originalMath = Object.create(Math);
      originalMath.random = seeded();
      const source = html.slice(
        html.indexOf("function buildFromImage(img)"),
        html.indexOf("// 카메라는"),
      );
      // 신뢰된 기준 HTML의 생성 함수를 실행하며 DOM·난수만 주입합니다.
      const build = new Function(
        "document",
        "innerWidth",
        "Math",
        "THREE",
        "flower",
        "scene",
        "uniforms",
        "reduce",
        "performance",
        "vert",
        "frag",
        `${source}; return buildFromImage;`,
      )(
        {
          createElement: () => ({
            getContext: () => ({ drawImage() {}, getImageData: () => mask }),
          }),
        },
        small ? 390 : 1440,
        originalMath,
        THREE,
        flower,
        scene,
        createUniforms(1, true),
        true,
        performance,
        originalVertex,
        originalFragment,
      );
      build({ width: mask.width });
      const rng = seeded();
      const actual = buildFlowerAttributes(mask, { rng, small, palette });
      const dust = buildDustAttributes({ rng, small, palette });
      for (const [attributes, point] of [
        [actual, flower.children[0]],
        [dust, scene.children[0]],
      ] as const) {
        const mesh = point as THREE.Points;
        for (const [name, values] of Object.entries(attributes))
          expect(values).toEqual(mesh.geometry.getAttribute(name).array);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    },
  );
});
