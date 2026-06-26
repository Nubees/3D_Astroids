import {
  AdditiveBlending,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  CircleGeometry,
  ShaderMaterial,
} from 'three';
import { MAGNET_RADIUS } from './scrap';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Magnet Booster VFX Ring + Field Factories (Phase 7f)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Three.js mesh factories for the Magnet Booster's activation
//          visuals — a gold RING outline + a green field DISK that fills
//          the inside of the ring. Both only show during the 10s active
//          window (the pending state is communicated by the HUD pill
//          alone; no in-world preview).
// Setup: Imported by src/game.ts (Task 6 wires createActiveRing into the
//        activation lifecycle and createActiveField as a sibling disk).
//        Consumes MAGNET_RADIUS from src/scrap.ts so the ring + disk
//        sizes track the canonical project baseline (2.5u). The disk
//        uses a ShaderMaterial that mimics the shield's
//        (fresnel rim + slow pulse) visual language so the player reads
//        it as a "field of force" — see src/shield-visuals.ts:79-194.
//        The disk and ring use the same pulse formula so they breathe
//        in sync.
// Issues: Pre-2026-06-26 the pending state had a separate preview ring
//         that cluttered the arena without giving the player any extra
//         information. The HUD pill already shows "2x" / "3x" pending
//         tier, so the in-world ring is reserved for the active state.
// Fix: Phase 7f Task 2. RingGeometry segments = 64 (smooth circle at
//      gameplay zoom). CircleGeometry segments = 64 too (same perimeter
//      tessellation density). depthWrite: false prevents the additive
//      surfaces from occluding transparent FX drawn after them. Ring is
//      thin gold outline (0.08u wide, pulse 0.20→0.40). Disk is a flat
//      green field (SHIELD_BOOST_GREEN #33ff7f) with fresnel + slow pulse
//      matching the shield's visual feel. Both scale by (tier + 1).
//      2026-06-26 v2 tuning — preview ring removed entirely; the
//      activation ring stays. Disk shader uniforms tuned for "very
//      light green, transparent" per user feedback.
// Gotchas: The `deltaTime` parameter on updateActiveRing/Field is
//          reserved for future frame-rate-independent animation; the
//          current pulse formula is purely time-based on
//          `remainingSeconds` (which already integrates real elapsed
//          seconds per frame). Don't add deltaTime into the sin() call —
//          it would double-count.
//          AdditiveBlending + DoubleSide + depthWrite false = the
//          surfaces always render bright on top of dark ship interior
//          and dark on top of bright asteroids (additive math), without
//          z-fighting against the ship's hull (which sits in front at
//          z = 0). The starts-hidden default (visible = false) means
//          the visuals only appear on Digit4 activation, never on a
//          fresh game start or during the pending state.
//          The disk's shader is INTENTIONALLY simpler than the shield
//          shader — no grid, no damage flicker, no impact rings. The
//          disk is a "field of force" cue, not a defensive barrier.
//          Adding impact rings here would imply the field blocks
//          asteroids, which it does not.
// ═══════════════════════════════════════════════════════════════════════════

const RING_Z = -0.4;
const FIELD_Z = -0.5; // sits one plane behind the ring outline
const RING_COLOR = 0xffcc44;
const FIELD_COLOR: [number, number, number] = [0.20, 1.00, 0.50]; // SHIELD_BOOST_GREEN
const RING_SEGMENTS = 64;
const FIELD_SEGMENTS = 64;
// 2026-06-26 v2 tuning — ring thinner + more transparent.
const ACTIVE_INNER_OFFSET = 0.04;
const ACTIVE_OUTER_OFFSET = 0.04;
const ACTIVE_INITIAL_OPACITY = 0.30;
const ACTIVE_PULSE_BASE = 0.30;
const ACTIVE_PULSE_AMPLITUDE = 0.10;
const ACTIVE_PULSE_FREQ_HZ = 2;
// Field disk shader constants — keep the field "very light green and
// transparent" per user feedback. Peak alpha across the disk surface
// stays around 0.15 (rim fresnel) + 0.05 (pulse wash) = 0.20, well
// under the 0.70 additive-blend cap.
const FIELD_FRESNEL_POWER = 2.0;
const FIELD_FRESNEL_STRENGTH = 0.30;
const FIELD_PULSE_SPEED = 1.6;
const FIELD_PULSE_MIN = 0.25;

const fieldVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vObjPos;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPosition.xyz);
    vObjPos = position;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fieldFragmentShader = `
  uniform float uTime;
  uniform vec3 uBaseColor;
  uniform float uFresnelPower;
  uniform float uFresnelStrength;
  uniform float uPulseSpeed;
  uniform float uPulseMin;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vObjPos;

  // Slow breathing pulse so the field feels alive without flickering.
  float pulseEnvelope(float time, float speed, float pulseMin) {
    float slow = 0.5 + 0.5 * sin(time * speed);
    return slow * (1.0 - pulseMin) + pulseMin;
  }

  void main() {
    // Fresnel rim gives the disk a soft edge fade so the rim doesn't
    // read as a hard circle. Power 2.0 spreads the falloff over most of
    // the disk surface, so the center is barely visible and the rim
    // glows — matches the "very light transparent" feel.
    float fresnel = pow(1.0 - abs(dot(vNormal, vViewDir)), uFresnelPower);

    float pulse = pulseEnvelope(uTime, uPulseSpeed, uPulseMin);

    // Combine: rim fresnel sets the silhouette, pulse washes the whole
    // disk with a slow breath. The center stays near-invisible so the
    // disk reads as a "field" not a "solid".
    float alpha = fresnel * uFresnelStrength * pulse;
    vec3 color = uBaseColor * alpha;

    gl_FragColor = vec4(color, alpha);
  }
`;

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

export function createActiveField(): Mesh {
  const geometry = new CircleGeometry(MAGNET_RADIUS, FIELD_SEGMENTS);
  const material = new ShaderMaterial({
    vertexShader: fieldVertexShader,
    fragmentShader: fieldFragmentShader,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uBaseColor: { value: FIELD_COLOR },
      uFresnelPower: { value: FIELD_FRESNEL_POWER },
      uFresnelStrength: { value: FIELD_FRESNEL_STRENGTH },
      uPulseSpeed: { value: FIELD_PULSE_SPEED },
      uPulseMin: { value: FIELD_PULSE_MIN },
    },
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.z = FIELD_Z;
  mesh.visible = false;
  return mesh;
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

export function updateActiveField(
  field: Mesh,
  activeTier: 0 | 1 | 2,
  remainingSeconds: number,
  deltaTime: number,
): void {
  if (activeTier === 0 || remainingSeconds === 0) {
    field.visible = false;
    return;
  }
  field.visible = true;
  const scale = activeTier + 1;
  field.scale.set(scale, scale, 1);
  // Advance the shader's uTime clock so the disk pulses in sync with
  // the ring outline. remainingSeconds counts down, so we feed the
  // delta forward (the pulse uses sin(time * speed), monotonic).
  const material = field.material as ShaderMaterial;
  const uniforms = material.uniforms as {
    uTime: { value: number };
  };
  uniforms.uTime.value += deltaTime;
}