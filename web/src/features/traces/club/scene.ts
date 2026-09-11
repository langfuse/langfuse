import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { type ClubFrame, type ClubScore } from "./model";
import { createTowerGeometry } from "./tower-geometry";
import {
  towerVertex,
  towerFragment,
  tunnelVertex,
  tunnelFragment,
  paperVertex,
  paperFragment,
  particleVertex,
  particleFragment,
  prismShader,
} from "./shaders";

const TOWERS = 49;
const DOCUMENTS = 96;
const modulo = (value: number, period: number) =>
  ((value % period) + period) % period;

/** One GPU scene owns its models, atlas, render targets and input listeners. */
export class TowerScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(59, 1, 0.1, 210);
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly prism = new ShaderPass(prismShader);
  private readonly output = new OutputPass();
  private readonly renderPass: RenderPass;
  private readonly observer: ResizeObserver;
  private readonly atlas: THREE.CanvasTexture;
  private readonly towers: THREE.InstancedMesh;
  private readonly documents: THREE.InstancedMesh;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.ShaderMaterial[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly target = new THREE.Vector3();
  private readonly pointer = new THREE.Vector2();
  private drag: { x: number; y: number } | null = null;
  private zoom = 0;
  private ratio = 1;
  private readonly uniforms = {
    uTime: { value: 0 },
    uEnergy: { value: 0 },
    uPressure: { value: 0 },
    uVerify: { value: 0 },
    uPulse: { value: 0 },
    uTension: { value: 0 },
    uPixelRatio: { value: 1 },
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    score: ClubScore,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x020408);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.atlas = this.createAtlas(score.inscriptions);
    const geometry = createTowerGeometry();
    geometry.setAttribute("aTrace", this.traceAttributes(TOWERS, score));
    this.geometries.push(geometry);
    this.towers = new THREE.InstancedMesh(
      geometry,
      this.material(towerVertex, towerFragment),
      TOWERS,
    );
    this.towers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.towers.frustumCulled = false;
    this.scene.add(this.towers);

    const papers = new THREE.PlaneGeometry(3.5, 0.48, 8, 1);
    papers.setAttribute("aTrace", this.traceAttributes(DOCUMENTS, score));
    this.geometries.push(papers);
    const paperMaterial = this.material(paperVertex, paperFragment);
    paperMaterial.transparent = true;
    paperMaterial.depthWrite = false;
    paperMaterial.side = THREE.DoubleSide;
    paperMaterial.blending = THREE.AdditiveBlending;
    this.documents = new THREE.InstancedMesh(papers, paperMaterial, DOCUMENTS);
    this.documents.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.documents.frustumCulled = false;
    this.scene.add(this.documents);

    const tunnel = new THREE.SphereGeometry(120, 32, 24);
    this.geometries.push(tunnel);
    const tunnelMaterial = this.material(tunnelVertex, tunnelFragment);
    tunnelMaterial.side = THREE.BackSide;
    tunnelMaterial.depthWrite = false;
    const space = new THREE.Mesh(tunnel, tunnelMaterial);
    space.renderOrder = -1;
    this.scene.add(space);
    this.addParticles(score.seed);

    this.composer = new EffectComposer(
      this.renderer,
      new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        samples: 4,
      }),
    );
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.65, 0.68);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.prism);
    this.composer.addPass(this.output);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerUp);
    canvas.addEventListener("wheel", this.wheel, { passive: false });
    canvas.addEventListener("dblclick", this.resetView);
  }

  private material(vertexShader: string, fragmentShader: string) {
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { ...this.uniforms, uAtlas: { value: this.atlas } },
    });
    this.materials.push(material);
    return material;
  }

  private createAtlas(inscriptions: string[]) {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1024;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("The trace inscription atlas could not be created.");
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#fff";
    context.font = "30px monospace";
    context.textBaseline = "middle";
    const articles = inscriptions.filter((text) => text.startsWith("ARTICLE "));
    const rows = [
      ...articles,
      ...inscriptions.filter((text) => !articles.includes(text)),
    ];
    for (let row = 0; row < 16; row++) {
      const text = rows[row % Math.max(1, rows.length)] ?? "";
      context.fillText(text.toUpperCase(), 32, row * 64 + 32, 1950);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = Math.min(
      4,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    return texture;
  }

  private traceAttributes(count: number, score: ClubScore) {
    const data = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const node =
        score.observations[i % Math.max(1, score.observations.length)];
      data.set(
        [
          (node?.seed ?? score.seed) / 4294967295,
          (node?.hue ?? 42) / 360,
          Math.min(1, (node?.depth ?? 0) / 10),
          node?.weight ?? 0.2,
        ],
        i * 4,
      );
    }
    return new THREE.InstancedBufferAttribute(data, 4);
  }

  private addParticles(seed: number) {
    const count = 2200;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    let randomState = seed;
    const random = () => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 4294967295;
    };
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2;
      const radius = 3 + random() * 42;
      positions.set(
        [Math.cos(angle) * radius, Math.sin(angle) * radius, random() * 110],
        i * 3,
      );
      seeds[i] = random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    this.geometries.push(geometry);
    const material = this.material(particleVertex, particleFragment);
    material.transparent = true;
    material.depthWrite = false;
    material.blending = THREE.AdditiveBlending;
    const particles = new THREE.Points(geometry, material);
    particles.frustumCulled = false;
    this.scene.add(particles);
  }

  private resize() {
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    this.ratio = Math.min(
      window.devicePixelRatio || 1,
      width < 800 ? 1.25 : 1.5,
    );
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(this.ratio);
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.prism.uniforms.uAspect!.value = width / height;
    this.uniforms.uPixelRatio.value = this.ratio;
  }

  private pointerDown = (event: PointerEvent) => {
    this.drag = { x: event.clientX, y: event.clientY };
    this.canvas.setPointerCapture(event.pointerId);
  };
  private pointerMove = (event: PointerEvent) => {
    if (!this.drag) return;
    this.pointer.x = THREE.MathUtils.clamp(
      this.pointer.x + (event.clientX - this.drag.x) * 0.006,
      -1.5,
      1.5,
    );
    this.pointer.y = THREE.MathUtils.clamp(
      this.pointer.y + (event.clientY - this.drag.y) * 0.006,
      -1,
      1,
    );
    this.drag = { x: event.clientX, y: event.clientY };
  };
  private pointerUp = () => {
    this.drag = null;
  };
  private wheel = (event: WheelEvent) => {
    event.preventDefault();
    this.zoom = THREE.MathUtils.clamp(this.zoom + event.deltaY * -0.006, -4, 5);
  };
  private resetView = () => {
    this.pointer.set(0, 0);
    this.zoom = 0;
  };

  render(frame: ClubFrame, score: ClubScore, dive = 0.35, kaleidoscope = 0.45) {
    const time = (frame.beat * 60) / 132;
    this.uniforms.uTime.value = time;
    this.uniforms.uEnergy.value = frame.energy;
    this.uniforms.uPressure.value = frame.bureaucracy;
    this.uniforms.uVerify.value = frame.verification;
    this.uniforms.uPulse.value = frame.pulse;
    this.uniforms.uTension.value = frame.tension;
    const phase = (score.seed / 4294967295) * Math.PI * 2;
    const travel = time * 3.2;
    const roll = Math.sin(time * 0.065) * 0.12;
    this.camera.position.set(
      Math.sin(time * 0.17 + phase) * 1.2 + this.pointer.x * 3,
      Math.cos(time * 0.13) * 0.8 + this.pointer.y * 2,
      15 - dive * 8 - this.zoom + Math.sin(time * 0.11) * 1.4,
    );
    this.target.set(this.pointer.x * 1.2, this.pointer.y * -0.8, -16);
    this.camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    this.camera.lookAt(this.target);
    this.camera.fov = 59 + frame.pulse * 0.45 + dive * 12;
    this.camera.updateProjectionMatrix();

    for (let i = 0; i < TOWERS; i++) {
      const node =
        score.observations[i % Math.max(1, score.observations.length)];
      const seed = (node?.seed ?? score.seed) / 4294967295;
      const active = frame.active.some(
        (observation) => observation.id === node?.id,
      );
      if (i === 0) {
        this.dummy.position.set(
          Math.sin(time * 0.19) * 1.6,
          Math.cos(time * 0.12) * 0.5,
          -4 + Math.sin(time * 0.1) * 3,
        );
        this.dummy.rotation.set(
          Math.sin(time * 0.16) * 0.16,
          time * 0.27,
          Math.sin(time * 0.1) * 0.12,
        );
        this.dummy.scale.setScalar(1.65 + frame.energy * 0.12);
      } else {
        const index = i - 1;
        const ring = Math.floor(index / 8);
        const angle =
          ((index % 8) / 8) * Math.PI * 2 +
          time * (0.07 + ring * 0.009) +
          ring * 0.37;
        const radius =
          8.2 + Math.sin(ring * 2 + time * 0.15) * 1.3 + frame.depth * 0.12;
        this.dummy.position.set(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          -70 + modulo(ring * 14 + travel, 84),
        );
        this.dummy.rotation.set(
          Math.sin(time * 0.23 + seed * 8) * 0.55,
          time * (0.15 + seed * 0.14) + seed * 8,
          angle - Math.PI / 2 + Math.sin(time * 0.2 + i) * 0.2,
        );
        this.dummy.scale.setScalar(0.68 + seed * 0.5 + (active ? 0.18 : 0));
      }
      this.dummy.updateMatrix();
      this.towers.setMatrixAt(i, this.dummy.matrix);
    }
    this.towers.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < DOCUMENTS; i++) {
      const angle = i * 2.399963 + time * -0.06;
      const radius = 5.5 + (i % 5) * 1.2 + frame.bureaucracy * 1.5;
      this.dummy.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        -80 + modulo(i * 1.13 + travel * 1.13, 94),
      );
      this.dummy.rotation.set(
        Math.sin(i + time * 0.2) * 0.3,
        Math.cos(i) * 0.4,
        angle * 0.15,
      );
      this.dummy.scale.setScalar(
        0.6 + (i % 3) * 0.2 + frame.bureaucracy * 0.25,
      );
      this.dummy.updateMatrix();
      this.documents.setMatrixAt(i, this.dummy.matrix);
    }
    this.documents.instanceMatrix.needsUpdate = true;
    this.bloom.strength = 0.65 + frame.energy * 0.25 + frame.pulse * 0.08;
    this.prism.uniforms.uTime!.value = time;
    this.prism.uniforms.uPressure!.value = frame.bureaucracy;
    this.prism.uniforms.uPulse!.value = frame.pulse;
    this.prism.uniforms.uSides!.value =
      6 + Math.min(4, Math.floor(frame.depth / 2)) * 2;
    // A continuous camera passage gradually fractures into a verification mandala.
    const passage = 0.5 + 0.5 * Math.sin(time * 0.085 - 1.3);
    this.prism.uniforms.uAmount!.value =
      kaleidoscope >= 0.99
        ? 1
        : kaleidoscope *
          Math.min(1, passage * 0.85 + frame.verification * 0.45);
    this.composer.render();
  }

  dispose() {
    this.observer.disconnect();
    this.canvas.removeEventListener("pointerdown", this.pointerDown);
    this.canvas.removeEventListener("pointermove", this.pointerMove);
    this.canvas.removeEventListener("pointerup", this.pointerUp);
    this.canvas.removeEventListener("pointercancel", this.pointerUp);
    this.canvas.removeEventListener("wheel", this.wheel);
    this.canvas.removeEventListener("dblclick", this.resetView);
    this.towers.dispose();
    this.documents.dispose();
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.atlas.dispose();
    this.bloom.dispose();
    this.prism.dispose();
    this.output.dispose();
    this.renderPass.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
