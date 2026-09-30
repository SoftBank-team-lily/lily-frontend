import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  ShaderMaterial,
  Vector3,
} from "three";
import type { ParticleAttributes, FlowerPalette } from "./particles";
import { vertexShader, fragmentShader } from "./shaders";

export function createParticleGeometry(attributes: ParticleAttributes) {
  const geometry = new BufferGeometry();
  for (const [name, values] of Object.entries(attributes)) {
    const size = ["position", "aStart", "aSpread", "aColor"].includes(name)
      ? 3
      : 1;
    geometry.setAttribute(name, new Float32BufferAttribute(values, size));
  }
  return geometry;
}

export function createUniforms(pixelRatio: number, reducedMotion: boolean) {
  return {
    uTime: { value: 0 },
    uAssemble: { value: reducedMotion ? 1 : 0 },
    uProgress: { value: 0 },
    uWilt: { value: 0 },
    uSize: { value: 22 },
    uPR: { value: pixelRatio },
    uOpacity: { value: 1 },
    uGather: { value: 0 },
  };
}
export type FlowerUniforms = ReturnType<typeof createUniforms>;

export function createDustUniforms(uniforms: FlowerUniforms): FlowerUniforms {
  return {
    ...uniforms,
    uProgress: { value: 0 },
    uWilt: { value: 0 },
    uAssemble: { value: 1 },
  };
}

export function createParticleMaterial(
  uniforms: FlowerUniforms,
  palette: FlowerPalette,
) {
  return new ShaderMaterial({
    uniforms: {
      ...uniforms,
      uUnlitColor: { value: new Vector3(...palette.unlit) },
      uWiltColor: { value: new Vector3(...palette.wilt) },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}
