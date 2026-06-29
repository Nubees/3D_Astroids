// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Orbit Drone VFX (Phase 7i Sprint 1)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Single home for all Orbit Drone visual factories and per-frame
//          updaters. Pure visual layer — no state machine, no projectile
//          spawning, no targeting. State + per-frame tick live in
//          src/active-deployments.ts; the Game class wires spawn→tick→dispose.
// Setup:   Game imports createDroneMesh / createAuraRing / createTetherLine /
//          createLockOnSprite / createDeployShockwave once at deploy time and
//          calls the matching `update*` helper each frame. All factories
//          return Three.js objects; tier color is the only knob.
// Issues:  Pre-Phase 7i the drone was a bare static IcosahedronGeometry
//          with no animation, aura, or targeting visibility. It looked
//          "plain, simple, not very effective."
// Fix:     Phase 7i Sprint 1. Five new visual layers:
//          - Aura ring under the ship (AdditiveBlending, 2 Hz opacity pulse)
//          - Per-drone idle spin (Y 90°/s, X 60°/s) + Y-bob
//          - Per-fire scale pop + emissive flash (80ms ramp)
//          - Tether line from drone to current target (additive, 0.25 opacity)
//          - Lock-on Sprite at target position (additive, 0.15u scale)
//          - Deploy shockwave ring (250ms scale 0.5→2.0 + opacity 1→0)
// Gotchas: All additive opacity caps per feedback_additive_blending_whiteout.md:
//          aura peak 0.6, sparks 0.4, tether 0.25. depthWrite=false on all
//          additive layers so they don't occlude scene geometry. The aura
//          ring is parented to the ship (added in src/game.ts), not the
//          scene, so it inherits ship position automatically.
//          Lock-on Sprite uses a CanvasTexture for the diamond shape —
//          created once at module load (shared across all sprites per tier).
//          getSharedLockOnTexture is exported so Task 6 (drone-kill sparks)
//          can re-use the same diamond bitmap if needed.
// ═══════════════════════════════════════════════════════════════════════════

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  IcosahedronGeometry,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  Sprite,
  SpriteMaterial,
} from 'three';
import { Vector2 } from './types';
import {
  ORBIT_DRONES_TIER_COLOR,
  bobOffset,
  fireFlashCurve,
  spinAngles,
} from './orbit-drone';

const DEPLOY_SHOCKWAVE_DURATION_SECONDS = 0.25;
const FIRE_FLASH_PEAK_EMISSIVE = 2.5;
const FIRE_FLASH_REST_EMISSIVE = 0.8;
const AURA_PULSE_BASELINE = 0.35;
const AURA_PULSE_AMPLITUDE = 0.25;
// Spec: 2 Hz pulse. sin(t * 2π * 2) = sin(t * 4π) = sin(t * Math.PI * 4).
// Period = 2π / (4π) = 0.5s → 2 cycles/second.
const AURA_PULSE_FREQ = Math.PI * 4;
const AURA_PEAK_FLASH = 0.6;
const LOCK_ON_SCALE = 0.15;
const DRONE_RADIUS = 0.12;

export function createDroneMesh(tier: 1 | 2 | 3): Mesh {
  const color = ORBIT_DRONES_TIER_COLOR(tier);
  const geometry = new IcosahedronGeometry(DRONE_RADIUS, 0);
  const material = new MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: FIRE_FLASH_REST_EMISSIVE,
    flatShading: true,
  });
  return new Mesh(geometry, material);
}

export function createAuraRing(tier: 1 | 2 | 3): Mesh {
  const geometry = new RingGeometry(0.6, 1.4, 48, 1);
  const material = new MeshBasicMaterial({
    color: ORBIT_DRONES_TIER_COLOR(tier),
    transparent: true,
    opacity: AURA_PULSE_BASELINE,
    blending: AdditiveBlending,
    side: DoubleSide,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  return mesh;
}

export function createTetherLine(tier: 1 | 2 | 3): Line {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 0]), 3),
  );
  const material = new LineBasicMaterial({
    color: ORBIT_DRONES_TIER_COLOR(tier),
    transparent: true,
    opacity: 0.25,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const line = new Line(geometry, material);
  line.visible = false;
  return line;
}

let _lockOnTexture: CanvasTexture | null = null;

/**
 * Lazy module-scope CanvasTexture for the lock-on diamond bitmap. Returns
 * null in node environments (no `document`); callers (createLockOnSprite)
 * pass null to SpriteMaterial.map without crashing. Exported so Task 6
 * (drone-kill sparks) can share the same texture instead of allocating
 * a second one.
 */
export function getSharedLockOnTexture(): CanvasTexture | null {
  if (_lockOnTexture !== null) return _lockOnTexture;
  if (typeof document === 'undefined') return null;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(size / 2, 4);
  ctx.lineTo(size - 4, size / 2);
  ctx.lineTo(size / 2, size - 4);
  ctx.lineTo(4, size / 2);
  ctx.closePath();
  ctx.fill();
  _lockOnTexture = new CanvasTexture(canvas);
  _lockOnTexture.needsUpdate = true;
  return _lockOnTexture;
}

export function createLockOnSprite(tier: 1 | 2 | 3): Sprite {
  const material = new SpriteMaterial({
    map: getSharedLockOnTexture(),
    color: ORBIT_DRONES_TIER_COLOR(tier),
    transparent: true,
    opacity: 0.7,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new Sprite(material);
  sprite.scale.set(LOCK_ON_SCALE, LOCK_ON_SCALE, 1);
  sprite.visible = false;
  return sprite;
}

export function createDeployShockwave(tier: 1 | 2 | 3): Mesh {
  const geometry = new RingGeometry(0.5, 0.7, 48, 1);
  const material = new MeshBasicMaterial({
    color: ORBIT_DRONES_TIER_COLOR(tier),
    transparent: true,
    opacity: 1.0,
    blending: AdditiveBlending,
    side: DoubleSide,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  return mesh;
}

/**
 * Apply per-frame visual updates to a single drone mesh. Caller is
 * responsible for setting the orbital X/Y position before calling
 * (this helper adds the Y-bob on top, leaves X untouched, and assigns
 * spin + fire-flash).
 */
export function updateDroneVisuals(
  mesh: Mesh,
  t: number,
  fireFlashAge: number,
  bobPhase: number,
  orbitalY: number = mesh.position.y,
): void {
  const angles = spinAngles(t);
  mesh.rotation.x = angles.x;
  mesh.rotation.y = angles.y;
  const flash = fireFlashCurve(fireFlashAge);
  const scale = 1.0 + 0.15 * flash;
  mesh.scale.set(scale, scale, scale);
  const mat = mesh.material as MeshStandardMaterial;
  mat.emissiveIntensity = FIRE_FLASH_REST_EMISSIVE
    + (FIRE_FLASH_PEAK_EMISSIVE - FIRE_FLASH_REST_EMISSIVE) * flash;
  mesh.position.y = orbitalY + bobOffset(t, bobPhase);
}

export function updateAuraPulse(
  ring: Mesh,
  tier: 0 | 1 | 2 | 3,
  t: number,
  fireFlashAge: number,
): void {
  if (tier === 0) {
    ring.visible = false;
    return;
  }
  ring.visible = true;
  const flash = fireFlashCurve(fireFlashAge);
  const pulse = AURA_PULSE_BASELINE + AURA_PULSE_AMPLITUDE * Math.sin(t * AURA_PULSE_FREQ);
  const opacity = Math.min(AURA_PEAK_FLASH, pulse + (AURA_PEAK_FLASH - AURA_PULSE_BASELINE) * flash);
  (ring.material as MeshBasicMaterial).opacity = opacity;
}

export function updateTetherLine(
  line: Line,
  dronePosition: Vector2,
  targetPosition: Vector2 | null,
): void {
  if (targetPosition === null) {
    line.visible = false;
    return;
  }
  line.visible = true;
  const positions = (line.geometry as BufferGeometry).attributes.position;
  positions.setXYZ(0, dronePosition.x, dronePosition.y, 0);
  positions.setXYZ(1, targetPosition.x, targetPosition.y, 0);
  positions.needsUpdate = true;
}

export function updateLockOnSprite(sprite: Sprite, targetPosition: Vector2 | null): void {
  if (targetPosition === null) {
    sprite.visible = false;
    return;
  }
  sprite.visible = true;
  sprite.position.set(targetPosition.x, targetPosition.y, 0);
}

export function updateDeployShockwave(ring: Mesh, age: number): void {
  if (age >= DEPLOY_SHOCKWAVE_DURATION_SECONDS) {
    ring.visible = false;
    return;
  }
  ring.visible = true;
  const t = age / DEPLOY_SHOCKWAVE_DURATION_SECONDS; // 0..1
  const scale = 0.5 + 1.5 * t; // 0.5 → 2.0
  ring.scale.set(scale, scale, 1);
  (ring.material as MeshBasicMaterial).opacity = 1.0 - t;
}
