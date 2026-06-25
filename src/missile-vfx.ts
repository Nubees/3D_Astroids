import {
  AdditiveBlending,
  CanvasTexture,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Missile VFX Smoke Pool (Phase 7b)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: InstancedMesh pool of additive billboard smoke puffs that trail
//          behind each homing missile. One draw call for the entire pool,
//          regardless of how many missiles are in flight. Worst case is
//          12 missiles × 24 puffs/missile life = 288 active instances.
// Setup:   Imported by src/active-deployments.ts tickHomingMissiles.
//          Module-scope texture + InstancedMesh created lazily on first
//          emit (parent scene required to add the InstancedMesh).
// Issues:  None.
// Fix:     Phase 7b. Without a pool, 12 missiles × 16 emits/sec = 192 sprite
//          allocations per second, plus material duplicates — would GC
//          thrash and leak GPU resources. The InstancedMesh pool is the
//          canonical Three.js pattern for this scale.
// Gotchas: The 16×16 radial-alpha texture is generated ONCE at module load
//          (not lazily) because CanvasTexture.fromCanvas is cheap and
//          deterministic — no WebGL dependency. Pool size = 288 matches
//          the worst-case (3 charges × 4 missiles × 24 puffs each). We
//          share one material across all 288 instances; opacity is per-
//          instance via the instanceColor .a channel multiplied into RGB.
//          Disposal must remove the InstancedMesh from the scene BEFORE
//          disposing the texture (texture dispose is a no-op here, but
//          the pattern is to clean in reverse-add order).
// ═══════════════════════════════════════════════════════════════════════════

const POOL_SIZE = 288;
const SMOKE_LIFETIME_SECONDS = 0.6;
const SMOKE_BASE_SIZE = 0.4;
const SMOKE_BASE_OPACITY = 0.4;
const SMOKE_SCALE_GROWTH = 1.4; // final scale = base * (1 + growth * t)

function makeRadialAlphaTexture(): CanvasTexture | null {
  // Guarded for Node test envs (vitest) where document is undefined. Returns
  // null if no DOM is available — the pool then falls back to a flat-white
  // additive material, which is fine for smoke puffs (the smoke is supposed
  // to be soft and dim; the radial alpha just makes it slightly softer).
  if (typeof document === 'undefined') return null;
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

interface SmokeSlot {
  alive: boolean;
  age: number;
  x: number;
  y: number;
}

const slots: SmokeSlot[] = [];
let instanced: InstancedMesh | null = null;
let material: MeshBasicMaterial | null = null;
let texture: CanvasTexture | null = null;
let scene: Object3D | null = null;

function ensureInstanced(parentScene: Object3D): InstancedMesh {
  if (instanced) return instanced;
  scene = parentScene;
  texture = makeRadialAlphaTexture(); // null in Node envs — Material has no map, which is fine
  const geometry = new PlaneGeometry(SMOKE_BASE_SIZE, SMOKE_BASE_SIZE);
  material = new MeshBasicMaterial({
    map: texture,
    color: 0xaaaaaa,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  instanced = new InstancedMesh(geometry, material, POOL_SIZE);
  instanced.frustumCulled = false;
  parentScene.add(instanced);
  for (let i = 0; i < POOL_SIZE; i++) {
    slots.push({ alive: false, age: 0, x: 0, y: 0 });
  }
  return instanced;
}

export function emitMissileSmoke(parentScene: Object3D, x: number, y: number): void {
  const inst = ensureInstanced(parentScene);
  // Find a free slot; if none, steal the oldest alive one (overwrite).
  let slotIdx = -1;
  let oldestAge = -1;
  for (let i = 0; i < POOL_SIZE; i++) {
    if (!slots[i].alive) {
      slotIdx = i;
      break;
    }
    if (slots[i].age > oldestAge) {
      oldestAge = slots[i].age;
      slotIdx = i;
    }
  }
  if (slotIdx < 0) return; // pool exhausted (shouldn't happen given math)
  slots[slotIdx].alive = true;
  slots[slotIdx].age = 0;
  slots[slotIdx].x = x;
  slots[slotIdx].y = y;
  inst.count = POOL_SIZE; // ensure all instances drawn
}

export function updateMissileSmoke(deltaTime: number): void {
  if (!instanced) return;
  const tempMatrix = new (require('three').Matrix4)();
  for (let i = 0; i < POOL_SIZE; i++) {
    const slot = slots[i];
    if (!slot.alive) {
      tempMatrix.makeTranslation(0, 0, -10000);
      instanced.setMatrixAt(i, tempMatrix);
      continue;
    }
    slot.age += deltaTime;
    const t = slot.age / SMOKE_LIFETIME_SECONDS;
    if (t >= 1.0) {
      slot.alive = false;
      tempMatrix.makeTranslation(0, 0, -10000);
      instanced.setMatrixAt(i, tempMatrix);
      continue;
    }
    const scale = 1.0 + SMOKE_SCALE_GROWTH * t;
    tempMatrix.makeScale(scale, scale, 1);
    tempMatrix.setPosition(slot.x, slot.y, 0);
    instanced.setMatrixAt(i, tempMatrix);
    const alpha = SMOKE_BASE_OPACITY * (1.0 - t);
    // Assign to a local so TS narrows the type for the setXYZ call below
    // (same pattern as src/shockwave-particles.ts:160-169 — fixed in Task 3).
    let colorAttr = instanced.instanceColor;
    if (!colorAttr) {
      colorAttr = new (require('three').InstancedBufferAttribute)(
        new Float32Array(POOL_SIZE * 3), 3,
      );
      instanced.instanceColor = colorAttr;
    }
    colorAttr!.setXYZ(i, alpha, alpha, alpha);
  }
  instanced.instanceMatrix.needsUpdate = true;
  if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
}

export function disposeMissileVfx(): void {
  if (instanced && scene) {
    scene.remove(instanced);
    instanced.geometry.dispose();
    if (material) material.dispose();
    if (texture) texture.dispose();
  }
  instanced = null;
  material = null;
  texture = null;
  scene = null;
  slots.length = 0;
}
