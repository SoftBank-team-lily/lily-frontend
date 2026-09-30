import {
  Color,
  Group,
  PerspectiveCamera,
  Points,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { readColorToken } from "@/lib/design/readColorToken";
import type { FlowerTargets } from "@/lib/deploy/types";
import { damp } from "../damp";
import {
  CAMERA,
  FLOWER,
  FLOWER_ENTRY,
  FLOWER_MOTION,
  PARTICLES,
} from "./config";
import { fitView, type FlowerSlot, type View } from "./fitView";
import { blendView, entryView, type FlowerArea } from "./entry";
import {
  buildDustAttributes,
  buildFlowerAttributes,
  type FlowerPalette,
} from "./particles";
import {
  createDustUniforms,
  createParticleGeometry,
  createParticleMaterial,
  createUniforms,
} from "./material";

type Options = {
  canvas: HTMLCanvasElement;
  getSlot: () => FlowerSlot;
  reducedMotion: boolean;
  onEntryProgress?: (opacity: number) => void;
  onArea?: (area: FlowerArea) => void;
  onAvailable?: (available: boolean) => void;
};

export class FlowerScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private flower = new Group();
  private camera = new PerspectiveCamera(
    CAMERA.fov,
    1,
    CAMERA.near,
    CAMERA.far,
  );
  private mouse = new Vector2();
  private smoothMouse = new Vector2();
  private cam = new Vector3();
  private look = new Vector3();
  private targetCam = new Vector3();
  private targetLook = new Vector3();
  private uniforms;
  private points: Points[] = [];
  private image = new Image();
  private frame = 0;
  private disposed = false;
  private last = performance.now();
  private introStart = 0;
  private targets: FlowerTargets = { progress: 0, wilt: 0 };
  private reducedMotion: boolean;
  private canvas: HTMLCanvasElement;
  private getSlot: () => FlowerSlot;
  private onEntryProgress?: Options["onEntryProgress"];
  private onArea?: Options["onArea"];
  private onAvailable?: Options["onAvailable"];
  private assembled = false;
  private entry: {
    mode: "zooming" | "entering" | "returning";
    start: number;
    from: View;
    center: View["look"];
    fade: number;
    onComplete: (() => void) | null;
  } | null = null;

  constructor({
    canvas,
    getSlot,
    reducedMotion,
    onEntryProgress,
    onArea,
    onAvailable,
  }: Options) {
    this.canvas = canvas;
    this.getSlot = getSlot;
    this.reducedMotion = reducedMotion;
    this.onEntryProgress = onEntryProgress;
    this.onArea = onArea;
    this.onAvailable = onAvailable;
    const surface = readColorToken("--color-surface");
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setClearColor(new Color().setRGB(...surface), 1);
    this.uniforms = createUniforms(pixelRatio, reducedMotion);
    this.scene.add(this.flower);
    this.resize();
    this.cam.copy(this.targetCam);
    this.look.copy(this.targetLook);
    window.addEventListener("pointermove", this.pointer);
    window.addEventListener("resize", this.resize);
    this.image.onload = () => {
      if (this.disposed) return;
      const source = document.createElement("canvas");
      source.width = this.image.width;
      source.height = this.image.height;
      const context = source.getContext("2d");
      if (!context) {
        canvas.dataset.state = "unavailable";
        this.onAvailable?.(false);
        return;
      }
      context.drawImage(this.image, 0, 0);
      const mask = context.getImageData(0, 0, source.width, source.height);
      const palette: FlowerPalette = {
        stamen: readColorToken("--flower-stamen"),
        pollen: readColorToken("--flower-pollen"),
        petal: readColorToken("--flower-petal"),
        edge: readColorToken("--flower-petal-edge"),
        spot: readColorToken("--flower-spot"),
        unlit: readColorToken("--flower-unlit"),
        wilt: readColorToken("--flower-wilt"),
        dust: readColorToken("--flower-dust"),
      };
      const options = {
        small: window.innerWidth < PARTICLES.breakpoint,
        palette,
      };
      const bloom = new Points(
        createParticleGeometry(buildFlowerAttributes(mask, options)),
        createParticleMaterial(this.uniforms, palette),
      );
      const dust = new Points(
        createParticleGeometry(buildDustAttributes(options)),
        createParticleMaterial(createDustUniforms(this.uniforms), palette),
      );
      // 인트로의 먼 시작점도 보이도록 정적 경계 구의 컬링을 끕니다.
      bloom.frustumCulled = false;
      dust.frustumCulled = false;
      this.flower.add(bloom);
      this.scene.add(dust);
      this.points.push(bloom, dust);
      this.introStart = performance.now();
      canvas.dataset.state = "ready";
      canvas.dataset.particles = String(
        bloom.geometry.getAttribute("position").count,
      );
      this.frame = requestAnimationFrame(this.loop);
    };
    this.image.onerror = () => {
      if (!this.disposed) {
        canvas.dataset.state = "unavailable";
        this.onAvailable?.(false);
      }
    };
    this.image.src = "/flower-mask.png";
  }

  setTargets(targets: FlowerTargets) {
    this.targets = targets;
  }
  enter(onComplete: () => void) {
    if (this.disposed || this.entry) return;
    this.flower.updateMatrixWorld(true);
    const center = this.flower.localToWorld(
      new Vector3(...FLOWER_ENTRY.center),
    );
    // 시든 꽃의 중심도 현재 렌더 위치에 맞춥니다.
    center.y -= this.uniforms.uWilt.value * 0.06;
    this.entry = {
      mode: "zooming",
      start: performance.now(),
      from: this.currentView(),
      center: [center.x, center.y, center.z],
      fade: 0,
      onComplete,
    };
  }
  returnFromEntry(onComplete: () => void) {
    if (this.disposed) return;
    if (!this.entry) {
      onComplete();
      return;
    }
    this.entry = {
      ...this.entry,
      mode: "returning",
      start: performance.now(),
      from: this.currentView(),
      onComplete,
    };
  }
  private currentView(): View {
    return {
      cam: [this.cam.x, this.cam.y, this.cam.z],
      look: [this.look.x, this.look.y, this.look.z],
    };
  }
  private animateEntry(now: number) {
    const entry = this.entry;
    if (!entry || entry.mode === "entering") return;
    const returning = entry.mode === "returning";
    const duration = returning
      ? FLOWER_ENTRY.returnDuration
      : FLOWER_ENTRY.duration;
    const t = this.reducedMotion
      ? 1
      : Math.min(1, (now - entry.start) / duration);
    const target: View = returning
      ? {
          cam: [this.targetCam.x, this.targetCam.y, this.targetCam.z],
          look: [this.targetLook.x, this.targetLook.y, this.targetLook.z],
        }
      : entryView(entry.center, this.camera.aspect);
    const view = blendView(entry.from, target, t);
    this.cam.set(...view.cam);
    this.look.set(...view.look);
    const fade = returning
      ? entry.fade * (1 - t)
      : Math.max(
          0,
          (t * duration - (duration - FLOWER_ENTRY.fadeDuration)) /
            FLOWER_ENTRY.fadeDuration,
        );
    if (!returning) entry.fade = fade;
    this.onEntryProgress?.(fade);
    if (t < 1) return;
    const complete = entry.onComplete;
    entry.onComplete = null;
    if (returning) this.entry = null;
    else entry.mode = "entering";
    complete?.();
  }
  setReducedMotion(reducedMotion: boolean) {
    this.reducedMotion = reducedMotion;
    if (reducedMotion) {
      this.uniforms.uAssemble.value = 1;
      this.smoothMouse.set(0, 0);
    }
  }

  private pointer = (event: PointerEvent) => {
    this.mouse.set(
      event.clientX / window.innerWidth - 0.5,
      event.clientY / window.innerHeight - 0.5,
    );
  };
  private reportArea() {
    if (!this.onArea || this.entry) return;
    this.camera.updateMatrixWorld();
    this.flower.updateMatrixWorld(true);
    const bounds = {
      left: Infinity,
      top: Infinity,
      right: -Infinity,
      bottom: -Infinity,
    };
    for (const x of [FLOWER.cx - FLOWER.hw, FLOWER.cx + FLOWER.hw]) {
      for (const y of [FLOWER.cy - FLOWER.hh, FLOWER.cy + FLOWER.hh]) {
        const point = this.flower
          .localToWorld(new Vector3(x, y, 0))
          .project(this.camera);
        const px = ((point.x + 1) / 2) * window.innerWidth;
        const py = ((1 - point.y) / 2) * window.innerHeight;
        bounds.left = Math.min(bounds.left, px);
        bounds.right = Math.max(bounds.right, px);
        bounds.top = Math.min(bounds.top, py);
        bounds.bottom = Math.max(bounds.bottom, py);
      }
    }
    this.onArea({
      left: bounds.left,
      top: bounds.top,
      width: bounds.right - bounds.left,
      height: bounds.bottom - bounds.top,
    });
  }
  private resize = () => {
    const width = window.innerWidth,
      height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.uniforms.uSize.value = (height / 900) * 20 + 4;
    const view = fitView({
      slot: this.getSlot(),
      viewport: { width, height },
      fov: CAMERA.fov,
    });
    this.targetCam.set(...view.cam);
    this.targetLook.set(...view.look);
  };
  private loop = (now: number) => {
    if (this.disposed) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const reduce = this.reducedMotion;
    if (!reduce) this.uniforms.uTime.value += dt;
    this.uniforms.uAssemble.value = reduce
      ? 1
      : Math.min(1, (now - this.introStart) / FLOWER_MOTION.intro);
    const k = reduce ? 1 : 1 - Math.pow(FLOWER_MOTION.camera, dt);
    if (this.entry) this.animateEntry(now);
    else {
      this.cam.lerp(this.targetCam, k);
      this.look.lerp(this.targetLook, k);
      this.smoothMouse.lerp(
        this.mouse,
        reduce ? 0 : 1 - Math.pow(FLOWER_MOTION.mouse, dt),
      );
      this.flower.rotation.x = this.smoothMouse.y * 0.18;
      this.flower.rotation.y = this.smoothMouse.x * 0.28;
    }
    this.camera.position.copy(this.cam);
    this.camera.lookAt(this.look);
    this.uniforms.uProgress.value = reduce
      ? this.targets.progress
      : damp(
          this.uniforms.uProgress.value,
          this.targets.progress,
          FLOWER_MOTION.progress,
          dt,
        );
    this.uniforms.uGather.value = reduce
      ? this.targets.progress
      : damp(
          this.uniforms.uGather.value,
          this.targets.progress,
          FLOWER_MOTION.gather,
          dt,
        );
    this.uniforms.uWilt.value = reduce
      ? this.targets.wilt
      : damp(
          this.uniforms.uWilt.value,
          this.targets.wilt,
          FLOWER_MOTION.wilt,
          dt,
        );
    this.renderer.render(this.scene, this.camera);
    this.reportArea();
    if (!this.assembled && this.uniforms.uAssemble.value === 1) {
      this.assembled = true;
      this.onAvailable?.(true);
    }
    this.frame = requestAnimationFrame(this.loop);
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.entry = null;
    this.onEntryProgress = undefined;
    this.onArea = undefined;
    this.onAvailable = undefined;
    cancelAnimationFrame(this.frame);
    window.removeEventListener("pointermove", this.pointer);
    window.removeEventListener("resize", this.resize);
    this.image.onload = null;
    this.image.onerror = null;
    this.image.removeAttribute("src");
    for (const point of this.points) {
      point.geometry.dispose();
      const materials = Array.isArray(point.material)
        ? point.material
        : [point.material];
      for (const material of materials) material.dispose();
    }
    this.points = [];
    this.scene.clear();
    this.flower.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.dataset.state = "disposed";
  }
}
