import {
  AdditiveBlending,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from 'three';
import { MAGNET_RADIUS } from './scrap';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Magnet Booster VFX Ring Factories (Phase 7f Task 2)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Three.js ring mesh factories for the Magnet Booster's preview
//          ring (shows queued tier near the ship) and active ring (pulsing
//          ring during the 6s activation window). Both rings sit at z = -0.4
//          so they render between the ship body and the baseline magnet
//          ring at z = -0.5, anchoring the visual stack to the existing
//          baseline-magnet ring in src/scrap.ts.
// Setup: Imported by src/game.ts (Task 6 wires createPreviewRing into the
//        pickup lifecycle and createActiveRing into the activation
//        lifecycle). Consumes MAGNET_RADIUS from src/scrap.ts so the ring
//        sizes track the canonical project baseline (2.5u). Pulse uses
//        0.40 + 0.15 * sin(remainingSeconds * π * 4) — a 2 Hz oscillation
//        with range [0.25, 0.55] that stays under the 0.70 additive-cap.
// Issues: None at creation. The baseline magnet ring in src/scrap.ts is
//         colored 0xffcc00 (yellow-gold) at lower opacity; the new rings
//         use 0xffcc44 (slightly warmer gold) to read as a different layer
//         without clashing.
// Fix: Phase 7f Task 2. RingGeometry segments = 64 (smooth circle at
//      gameplay zoom). depthWrite: false prevents the additive ring from
//      occluding transparent FX drawn after it. preview ring is thinner
//      (0.08u wide) and dimmer (0.20 opacity) — the pending tier is a
//      subtle hint, not the main attraction. active ring is thicker
//      (0.12u wide) and brighter (0.45 base + 0.15 pulse excursion) —
//      the active state is the showstopper. Both rings scale by
//      (tier + 1): tier 1 = 2x ring, tier 2 = 3x ring, which lines up
//      with the effectiveMagnetMultiplier from src/magnet-booster.ts
//      (multiplier is tier+1 = 2x or 3x radius).
// Gotchas: The `deltaTime` parameter on updateActiveRing is reserved for
//          future frame-rate-independent animation; the current pulse
//          formula is purely time-based on `remainingSeconds` (which
//          already integrates real elapsed seconds per frame). Don't
//          add deltaTime into the sin() call — it would double-count.
//          AdditiveBlending + DoubleSide + depthWrite false = the ring
//          always renders bright on top of dark ship interior and dark
//          on top of bright asteroids (additive math), without z-fighting
//          against the ship's hull (which sits in front at z = 0). The
//          starts-hidden default (visible = false) means the rings only
//          flash onto screen when the first pickup is collected, never
//          on a fresh game start.
// ═══════════════════════════════════════════════════════════════════════════

const RING_Z = -0.4;
const RING_COLOR = 0xffcc44;
const RING_SEGMENTS = 64;
const PREVIEW_INNER_OFFSET = 0.04;
const PREVIEW_OUTER_OFFSET = 0.04;
const PREVIEW_OPACITY = 0.20;
const ACTIVE_INNER_OFFSET = 0.06;
const ACTIVE_OUTER_OFFSET = 0.06;
const ACTIVE_INITIAL_OPACITY = 0.45;
const ACTIVE_PULSE_BASE = 0.40;
const ACTIVE_PULSE_AMPLITUDE = 0.15;
const ACTIVE_PULSE_FREQ_HZ = 2;

export function createPreviewRing(): Mesh {
  const geometry = new RingGeometry(
    MAGNET_RADIUS - PREVIEW_INNER_OFFSET,
    MAGNET_RADIUS + PREVIEW_OUTER_OFFSET,
    RING_SEGMENTS,
    1,
  );
  const material = new MeshBasicMaterial({
    color: RING_COLOR,
    transparent: true,
    opacity: PREVIEW_OPACITY,
    side: DoubleSide,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.z = RING_Z;
  mesh.visible = false;
  return mesh;
}

export function createActiveRing(): Mesh {
  const geometry = new RingGeometry(
    MAGNET_RADIUS - ACTIVE_INNER_OFFSET,
    MAGNET_RADIUS + ACTIVE_OUTER_OFFSET,
    RING_SEGMENTS,
    1,
  );
  const material = new MeshBasicMaterial({
    color: RING_COLOR,
    transparent: true,
    opacity: ACTIVE_INITIAL_OPACITY,
    side: DoubleSide,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.z = RING_Z;
  mesh.visible = false;
  return mesh;
}

export function updatePreviewRing(ring: Mesh, pendingTier: 0 | 1 | 2): void {
  if (pendingTier === 0) {
    ring.visible = false;
    return;
  }
  ring.visible = true;
  const scale = pendingTier + 1;
  ring.scale.set(scale, scale, 1);
}

export function updateActiveRing(
  ring: Mesh,
  activeTier: 0 | 1 | 2,
  remainingSeconds: number,
  // deltaTime is reserved for future frame-rate-independent animations.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  deltaTime: number,
): void {
  if (activeTier === 0 || remainingSeconds === 0) {
    ring.visible = false;
    return;
  }
  ring.visible = true;
  const scale = activeTier + 1;
  ring.scale.set(scale, scale, 1);
  const pulse =
    ACTIVE_PULSE_BASE +
    ACTIVE_PULSE_AMPLITUDE *
      Math.sin(remainingSeconds * Math.PI * 2 * ACTIVE_PULSE_FREQ_HZ);
  (ring.material as MeshBasicMaterial).opacity = pulse;
}
