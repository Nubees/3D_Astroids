import { AdditiveBlending, Mesh, MeshBasicMaterial, RingGeometry, Scene, Vector3 } from 'three';
import { Vector2 } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shockwave Ring (Phase 6b Fracture Burst Cascade)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Generic world-space additive ring that expands and fades. Used for
//          crystal burst frames and the saturation death explosion.
// Setup: Imported by src/game.ts. Game owns the active shockwave list.
// Issues: 2nd-pass BLOCKER B1 — addShieldImpact in shield-visuals was being
//         abused for non-shield effects because it was the only "ring" helper
//         in the codebase. It is shader-shader-specific (writes to shield
//         uniforms) and cannot produce a clean free-floating ring.
// Fix:    Add a dedicated Shockwave module. Uses MeshBasicMaterial with
//         AdditiveBlending + depthTest:false + depthWrite:false so the ring
//         always reads against the dark arena background regardless of
//         occluders. Disposes its geometry and material when its tween ends.
// Gotchas:
//  - Mesh is positioned at z = -0.2 so it sits visually behind the ship and
//    forward crystals but in front of the starfield. With depthTest:false,
//    z-order is for visual layering only — it does NOT gate visibility.
//  - intensity is the `actual / requested` ratio from the spawn site. Used
//    by the Game to scale the ring radius so partial-cap bursts feel weaker.
//  - update(dt) returns true when the tween is done. Caller is responsible
//    for scene.remove + geometry/material disposal.
// ═══════════════════════════════════════════════════════════════════════════

const SHOCKWAVE_DURATION_SECONDS = 0.5;
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

  constructor(position: Vector2, color: number, intensity: number) {
    this.age = 0;
    this.duration = SHOCKWAVE_DURATION_SECONDS;
    this.scaleMax = SHOCKWAVE_SCALE_MAX * Math.max(0.25, intensity);
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
