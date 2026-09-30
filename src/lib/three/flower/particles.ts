import type { RGB } from "@/lib/design/readColorToken";
import { PARTICLES } from "./config";

export type FlowerPalette = { stamen: RGB; pollen: RGB; petal: RGB; edge: RGB; spot: RGB; unlit: RGB; wilt: RGB; dust: RGB };
export type ParticleAttributes = { position: Float32Array; aStart: Float32Array; aSpread: Float32Array; aExtra: Float32Array; aRand: Float32Array; aBright: Float32Array; aColor: Float32Array };
type Options = { rng?: () => number; small: boolean; palette: FlowerPalette };
export type FlowerMask = { width: number; height: number; data: Uint8ClampedArray | Uint8Array };

export function buildFlowerAttributes(mask: FlowerMask, { rng = Math.random, small, palette }: Options): ParticleAttributes {
  if (mask.width !== mask.height || mask.data.length !== mask.width * mask.height * 4) throw new Error("꽃 마스크 크기가 올바르지 않습니다.");
  const S = mask.width, data = mask.data;
  const K = small ? PARTICLES.smallDensity : PARTICLES.density, W = PARTICLES.width, CX = PARTICLES.centerX*S, CY = PARTICLES.centerY*S;
  const pos=[], start=[], spread=[], rnd=[], bri=[], col=[], extra=[];
  const { pollen: amber, petal: pink, edge: blush, stamen: green } = palette;
  const mixc=(a: RGB,b: RGB,t: number): RGB=>[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
  const ss=(a: number,b: number,x: number)=>{ const t=Math.min(1,Math.max(0,(x-a)/(b-a))); return t*t*(3-2*t); };
  for (let y=0; y<S; y++) for (let x=0; x<S; x++){
    const b = data[(y*S+x)*4] / 255;
    if (b < 0.1) continue;
    const n = Math.floor(b*K + rng());
    for (let k=0; k<n; k++){
      const px = ((x + rng() - CX) / S) * W;
      const py = -((y + rng() - CY) / S) * W;
      const d = Math.hypot(px,py) / 1.75;
      const pz = -0.45*(1-ss(0,0.8,d)) + (b-0.5)*0.3 + (rng()-0.5)*0.08;
      pos.push(px,py,pz);
      const th = rng()*Math.PI*2, ph = Math.acos(2*rng()-1), R = 5 + rng()*6;
      start.push(R*Math.sin(ph)*Math.cos(th), R*Math.sin(ph)*Math.sin(th), R*Math.cos(ph) - 3);
      // 처음에 머무는 넓게 퍼진 자리: 꽃 윤곽을 조금 키우고 무작위로 흩뜨림
      const th2 = rng()*Math.PI*2, ph2 = Math.acos(2*rng()-1), r2 = 0.03 + Math.sqrt(rng())*0.17;
      spread.push(px*1.06 + r2*Math.sin(ph2)*Math.cos(th2), py*1.06 + r2*Math.sin(ph2)*Math.sin(th2), pz + r2*Math.cos(ph2)*1.3);
      rnd.push(rng()); bri.push(b); extra.push(rng() < 0.4 ? 1 : 0);
      let cc: RGB;
      if (d < 0.07) cc = mixc(green, amber, ss(0.02,0.07,d));
      else if (d < 0.16) cc = amber;
      else cc = mixc(pink, blush, ss(0.18, 0.72, d));
      if (d > 0.16 && rng() < 0.035 && d < 0.5) cc = palette.spot; // 스타게이저 백합의 반점
      col.push(...cc);
    }
  }

  return { position: new Float32Array(pos), aStart: new Float32Array(start), aSpread: new Float32Array(spread), aExtra: new Float32Array(extra), aRand: new Float32Array(rnd), aBright: new Float32Array(bri), aColor: new Float32Array(col) };
}

export function buildDustAttributes({ rng = Math.random, small, palette }: Options): ParticleAttributes {
  const position: number[] = [], random: number[] = [], bright: number[] = [], color: number[] = [];
  const count = small ? PARTICLES.smallDust : PARTICLES.dust;
  for (let i = 0; i < count; i++) {
    position.push((rng() - 0.5) * 14, (rng() - 0.5) * 9, -2 - rng() * 6);
    random.push(rng()); bright.push(0.12 + rng() * 0.25); color.push(...palette.dust);
  }
  return { position: new Float32Array(position), aStart: new Float32Array(position), aSpread: new Float32Array(position), aExtra: new Float32Array(count), aRand: new Float32Array(random), aBright: new Float32Array(bright), aColor: new Float32Array(color) };
}
