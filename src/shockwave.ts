import { AdditiveBlending, Mesh, MeshBasicMaterial, RingGeometry, Scene, Vector3 } from 'three';
import { Vector2 } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shockwave Ring (Phase 6b Fracture Burst Cascade → Phase 7b Bomb Upgrade)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Phase 7b — added optional `ringRadius` so the Bomb Strike can
//          produce an 8u ring to match its new 8u damage radius without
//          breaking the existing 4u crystal-burst call sites. Bumped
//          SHOCKWAVE_DURATION_SECONDS 0.5→0.7 to give the ring more time to
//          expand to the new larger radius. Originally a generic world-space
//          additive ring for crystal burst frames and the saturation death
//          explosion.
// Setup: Called from src/game.ts:1193 (bomb) and src/game.ts:2495 (crystal
//        bursts, unchanged). Game owns the active shockwave list.
// Issues: With SHOCKWAVE_DURATION_SECONDS = 0.5 and BOMB_STRIKE_RADIUS = 8.0,
//         the visual ring only reached ~3.5u before fading — much smaller
//         than the damage radius, so the explosion looked weak.
// Fix:    `ringRadius` param lets the bomb caller pass 8.0 directly; the
//        duration bump gives the ring time to ease-out to that radius.
//        MeshBasicMaterial uses AdditiveBlending + depthTest:false +
//        depthWrite:false so the ring always reads against the dark arena
//        background regardless of occluders. Disposes its geometry and
//        material when its tween ends.
// Gotchas:
//  - Mesh is positioned at z = -0.2 so it sits visually behind the ship and
//    forward crystals but in front of the starfield. With depthTest:false,
//    z-order is for visual layering only — it does NOT gate visibility.
//  - intensity is the `actual / requested` ratio from the spawn site. Used
//    by the Game to scale the ring radius so partial-cap bursts feel weaker.
//  - update(dt) returns true when the tween is done. Caller is responsible
//    for scene.remove + geometry/material disposal.
//  - `ringRadius` is the FINAL ring scale, not a multiplier. The existing
//    crystal-burst callers don't pass it, so they keep the old 4.0u
//    behavior — no breaking changes. Task 8 will pass ringRadius=8.0 from
//    the bomb caller.
// ═══════════════════════════════════════════════════════════════════════════

const SHOCKWAVE_DURATION_SECONDS = 0.7; // was 0.5 — Phase 7b slower ring expansion matches new damage radius
const SHOCKWAVE_SCALE_MAX = 4.0;
const SHOCKWAVE_INNER_RADIUS = 0.4;
const SHOCKWAVE_OUTER_RADIUS = 0.6;
const SHOCKWAVE_RING_SEGMENTS = 48;

/**
 * A world-space shockwave ring. Constructor creates geometry + material; the
 * Game adds `mesh` to the scene and tracks it in `activeShockwaves`.
 */
export class Shockwave {
  readonly mesh: Mesh;
  age: number;
  readonly duration: number;
  readonly scaleMax: number;
  readonly color: number;
  readonly intensity: number;

  constructor(position: Vector2, color: number, intensity: number, ringRadius?: number) {
    this.age = 0;
    this.duration = SHOCKWAVE_DURATION_SECONDS;
    // ringRadius overrides the default scaleMax when set — used by Bomb Strike
    // (which needs an 8u ring to match its damage radius) and Shield pickup
    // (a smaller 2.2u ring). When omitted, fall back to the historical
    // SHOCKWAVE_SCALE_MAX * intensity formula so existing crystal-burst
    // call sites need no changes.
    this.scaleMax = ringRadius ?? SHOCKWAVE_SCALE_MAX * Math.max(0.25, intensity);
    this.color = color;
    this.intensity = Math.max(0.05, intensity);

    const geometry = new RingGeometry(SHOCKWAVE_INNER_RADIUS, SHOCKWAVE_OUTER_RADIUS, SHOCKWAVE_RING_SEGMENTS);
    const material = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: 2, // DoubleSide
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.position.set(position.x, position.y, -0.2);
  }

  /**
   * Advance the tween. Returns true when the ring has finished (age >= duration).
   * Caller should scene.remove + dispose at that point.
   */
  update(deltaTime: number): boolean {
    this.age += deltaTime;
    if (this.age >= this.duration) return true;
    const t = this.age / this.duration;
    const easeOut = 1 - (1 - t) * (1 - t);
    const scale = easeOut * this.scaleMax;
    this.mesh.scale.set(scale, scale, 1);
    (this.mesh.material as MeshBasicMaterial).opacity = 1 - t;
    return false;
  }

  /**
   * Dispose geometry and material. Caller must scene.remove first.
   */
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}

/**
 * Update + prune an active shockwave list. Returns the pruned list. Any
 * finished shockwaves are disposed and removed from the given scene.
 */
export function updateShockwaves(
  list: Shockwave[],
  scene: Scene,
  deltaTime: number,
): Shockwave[] {
  const alive: Shockwave[] = [];
  for (const wave of list) {
    if (wave.update(deltaTime)) {
      scene.remove(wave.mesh);
      wave.dispose();
    } else {
      alive.push(wave);
    }
  }
  return alive;
}

/**
 * Re-export Vector3 for callers that want to position shockwaves from
 * ship/worldspace Vector3 values. Not actually used by Shockwave itself.
 */
export type { Vector3 };
