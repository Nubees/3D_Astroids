import {
  AdditiveBlending,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shockwave Particles (Phase 7b)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: InstancedMesh pool of additive billboard particles that the Bomb
//          Strike spawns for the shock-front + debris layers (layers 4 + 5
//          of the 6-layer combo). One draw call total, no per-blast allocation.
// Setup:   Imported by src/game.ts fireBombStrike. Module-scope InstancedMesh
//          is created lazily on the first emit call (when the parent scene
//          is passed in) so the module can be imported in any test env
//          without needing a WebGL context.
// Issues:  Phase 7b ship (6d0f0f0) used `require('three').Matrix4` /
//          `.Color` / `.InstancedBufferAttribute` inline to dodge a
//          `noUnusedLocals` warning on the top-level three import. Vitest
//          ran the unit tests in Node, where `require` is a global — the
//          tests passed. Vite's browser build does NOT expose `require`,
//          so the FIRST CALL TO `useActiveItem(BOMB_STRIKE)` threw
//          `ReferenceError: require is not defined` from inside
//          `ensureInstanced`, killing the rAF loop and freezing the game.
//          User-reported 2026-06-25. See feedback_require_three_freeze.md.
// Fix:     Moved `Matrix4`, `Color`, `InstancedBufferAttribute` to the
//          top-level three import block — they ARE used (lazily inside
//          ensureInstanced + the two update helpers) so the import is no
//          longer "unused" anyway. The inline `require` calls are gone.
// Gotchas: Pool size is the absolute worst case (3 charges queued, all 3
//          blasts mid-flight, 38 particles per blast) = 114. We allocate
//          128 to leave headroom. Disposal removes the InstancedMesh from
//          the scene AND disposes the geometry + material — the parent
//          scene must be passed to emitShockwaveParticles on first call
//          so the module knows where to add the InstancedMesh.
//          DO NOT use `require('three')` anywhere — the codebase runs in
//          both Vitest (Node) and the browser (Vite), and only Node has
//          `require` as a global. ES module imports are the only safe
//          pattern.
// ═══════════════════════════════════════════════════════════════════════════

const POOL_SIZE = 128;
const PARTICLE_BASE_SIZE = 0.3;
const PARTICLE_BASE_OPACITY = 0.5;

interface ParticleSlot {
  alive: boolean;
  age: number;
  lifetime: number;
  startX: number;
  startY: number;
  velocityX: number;
  velocityY: number;
  baseScale: number;
  baseOpacity: number;
  color: number;
}

const slots: ParticleSlot[] = [];
let instanced: InstancedMesh | null = null;
let material: MeshBasicMaterial | null = null;
let scene: Object3D | null = null;

function ensureInstanced(parentScene: Object3D): InstancedMesh {
  if (instanced) return instanced;
  scene = parentScene;
  const geometry = new PlaneGeometry(PARTICLE_BASE_SIZE, PARTICLE_BASE_SIZE);
  material = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  instanced = new InstancedMesh(geometry, material, POOL_SIZE);
  instanced.frustumCulled = false;
  parentScene.add(instanced);
  for (let i = 0; i < POOL_SIZE; i++) {
    slots.push({
      alive: false,
      age: 0,
      lifetime: 0,
      startX: 0,
      startY: 0,
      velocityX: 0,
      velocityY: 0,
      baseScale: 1,
      baseOpacity: PARTICLE_BASE_OPACITY,
      color: 0xffffff,
    });
    // Hide every instance offscreen until first emit.
    instanced.setMatrixAt(i, new Matrix4().makeTranslation(0, 0, -10000));
  }
  instanced.instanceMatrix.needsUpdate = true;
  return instanced;
}

export interface EmitOptions {
  count: number;
  speed: number;       // initial radial speed in world units/sec
  color: number;       // 0xRRGGBB
  lifetime: number;    // seconds before the particle is culled
  isDebris?: boolean;  // debris is faster + slightly bigger; used for the chunk layer
}

export function emitShockwaveParticles(parentScene: Object3D, x: number, y: number, options: EmitOptions): void {
  const inst = ensureInstanced(parentScene);
  let emitted = 0;
  for (let i = 0; i < POOL_SIZE && emitted < options.count; i++) {
    const slot = slots[i];
    if (slot.alive) continue;
    slot.alive = true;
    slot.age = 0;
    slot.lifetime = options.lifetime;
    slot.startX = x;
    slot.startY = y;
    const angle = (emitted / options.count) * Math.PI * 2 + Math.random() * 0.3;
    const speed = options.speed * (options.isDebris ? 1.0 + Math.random() * 0.4 : 0.8 + Math.random() * 0.4);
    slot.velocityX = Math.cos(angle) * speed;
    slot.velocityY = Math.sin(angle) * speed;
    slot.baseScale = options.isDebris ? 1.0 + Math.random() * 0.6 : 0.8 + Math.random() * 0.4;
    slot.baseOpacity = options.isDebris ? 0.6 : 0.5;
    slot.color = options.color;
    emitted += 1;
  }
  inst.count = POOL_SIZE; // ensure all instances are drawn (some are dead, culled via matrix = zero scale below)
}

export function updateShockwaveParticles(deltaTime: number): void {
  if (!instanced) return;
  const tempMatrix = new Matrix4();
  const tempColor = new Color();
  for (let i = 0; i < POOL_SIZE; i++) {
    const slot = slots[i];
    if (!slot.alive) {
      // Send dead instances offscreen.
      tempMatrix.makeTranslation(0, 0, -10000);
      instanced.setMatrixAt(i, tempMatrix);
      continue;
    }
    slot.age += deltaTime;
    const t = slot.age / slot.lifetime;
    if (t >= 1.0) {
      slot.alive = false;
      tempMatrix.makeTranslation(0, 0, -10000);
      instanced.setMatrixAt(i, tempMatrix);
      continue;
    }
    const x = slot.startX + slot.velocityX * slot.age;
    const y = slot.startY + slot.velocityY * slot.age;
    const scale = slot.baseScale * (1.0 + t * 1.4);
    tempMatrix.makeScale(scale, scale, 1);
    tempMatrix.setPosition(x, y, 0);
    instanced.setMatrixAt(i, tempMatrix);
    tempColor.setHex(slot.color);
    // Opacity is per-instance via instanceColor (Three.js .a channel).
    // Assign to a local so TS narrows the type for the setXYZ call below.
    let colorAttr = instanced.instanceColor;
    if (!colorAttr) {
      colorAttr = new InstancedBufferAttribute(
        new Float32Array(POOL_SIZE * 3), 3,
      );
      instanced.instanceColor = colorAttr;
    }
    const alpha = slot.baseOpacity * (1.0 - t);
    // ! assertion: the if-block above always assigns when null, so by this
    // point colorAttr is non-null. TS doesn't carry the narrowing across
    // the reassignment into a different variable.
    colorAttr!.setXYZ(i, tempColor.r * alpha, tempColor.g * alpha, tempColor.b * alpha);
  }
  instanced.instanceMatrix.needsUpdate = true;
  if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
}

export function disposeShockwaveParticles(): void {
  if (instanced && scene) {
    scene.remove(instanced);
    instanced.geometry.dispose();
    if (material) material.dispose();
  }
  instanced = null;
  material = null;
  scene = null;
  slots.length = 0;
}