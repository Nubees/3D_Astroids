import {
  AmbientLight,
  Clock,
  Color,
  DirectionalLight,
  Group,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { createMethod, METHOD_COUNT, METHOD_TITLES } from './methods';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Asteroid Test Lab Cycle Driver
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Standalone test harness for the 20 video-textured asteroid
//          methods. Press SPACE to cycle NO1 → NO2 → ... → NO20 → NO1.
//          Each method is a self-contained factory in methods.ts that
//          returns a Three.js Group + an update hook for per-frame logic.
//
// Setup:   Served from public/test-lab/asteroid-lab.html. Imports from
//          /src/test-lab/methods.ts. No imports from the main game — this
//          file is fully decoupled. The user can break methods freely
//          without touching src/.
//
// Issues:  The user reported v6 (BoxGeometry cube-cross) "still doesn't
//          look good" after 5 prior attempts (v1 Icosahedron → v3 Sphere
//          → v4 emissive boost → v5 emissiveMap only → v6 cube-cross).
//          Rather than guess at v7, this lab presents 20 distinct methods
//          ranked by likely-solve-the-problem so the user can pick what
//          reads as "asteroid" to their eye.
//
// Fix:     Phase 7h v7 — Test lab cycle. Each method is small, isolated,
//          and disposes its own resources on switch. Methods share the
//          singleton VideoTexture from methods.ts so we don't decode MP4
//          20 times.
//
// Gotchas:
//  - The HUD shows the current method number + title so the user always
//    knows which method they're looking at. Screenshots can be matched to
//    method numbers.
//  - Press R to reset to NO1.
//  - Press Left/Right to skip ±5 methods.
//  - No game-loop overhead — just requestAnimationFrame spinning a clock.
// ═══════════════════════════════════════════════════════════════════════════

const canvas = document.getElementById('lab-canvas') as HTMLCanvasElement;
const hudTitle = document.getElementById('hud-title') as HTMLDivElement;
const hudDesc = document.getElementById('hud-desc') as HTMLDivElement;

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new Scene();
scene.background = new Color(0x050510);

const camera = new PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 0, 8);

const dirLight = new DirectionalLight(0xffffff, 1.0);
dirLight.position.set(3, 4, 5);
scene.add(dirLight);

const ambient = new AmbientLight(0x404060, 0.6);
scene.add(ambient);

let currentIdx = 0;
let currentGroup: Group | null = null;
let currentUpdate: ((dt: number, t: number) => void) | null = null;

function disposeCurrent(): void {
  if (currentGroup !== null) {
    scene.remove(currentGroup);
    currentGroup.traverse((obj) => {
      // Dispose any geometry / material we created. We DON'T dispose the
      // shared VideoTexture here — methods.ts owns that singleton and
      // reuses it across all 20 methods.
      const mesh = obj as unknown as {
        geometry?: { dispose(): void };
        material?: { dispose(): void } | { dispose(): void }[];
      };
      if (mesh.geometry && typeof mesh.geometry.dispose === 'function') {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          m.dispose();
        }
      }
    });
    currentGroup = null;
    currentUpdate = null;
  }
}

function spawnMethod(idx: number): void {
  disposeCurrent();
  currentIdx = ((idx % METHOD_COUNT) + METHOD_COUNT) % METHOD_COUNT;
  const result = createMethod(currentIdx);
  currentGroup = result.group;
  currentUpdate = result.update ?? null;
  scene.add(currentGroup);

  hudTitle.textContent = `Method NO${currentIdx + 1} — ${METHOD_TITLES[currentIdx]}`;
  hudDesc.textContent = result.description;
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    spawnMethod(currentIdx + 1);
  } else if (e.code === 'KeyR') {
    spawnMethod(0);
  } else if (e.code === 'ArrowRight') {
    spawnMethod(currentIdx + 5);
  } else if (e.code === 'ArrowLeft') {
    spawnMethod(currentIdx - 5);
  }
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

spawnMethod(0);

const clock = new Clock();
function animate(): void {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;
  if (currentGroup) currentGroup.rotation.y += dt * 0.3;
  if (currentUpdate) currentUpdate(dt, t);
  renderer.render(scene, camera);
}
animate();
