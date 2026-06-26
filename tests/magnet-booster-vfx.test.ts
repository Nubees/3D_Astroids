import { beforeAll, describe, expect, it } from 'vitest';
import {
  AdditiveBlending,
  CircleGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  ShaderMaterial,
} from 'three';
import { MAGNET_RADIUS } from '../src/scrap';
import {
  createActiveField,
  createActiveRing,
  updateActiveField,
  updateActiveRing,
} from '../src/magnet-booster-vfx';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Magnet Booster VFX Ring + Field Factory Tests (Phase 7f Task 2)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: TDD tests for the Three.js mesh factories that render the
//          Magnet Booster's active ring + green field disk. These tests
//          assert shape (RingGeometry inner/outer, CircleGeometry radius),
//          material (RingBasic color/opacity/blending/side, ShaderMaterial
//          uniforms), positioning (ring z = -0.4, field z = -0.5),
//          visibility defaults (hidden), scale tier mapping, and the
//          2 Hz opacity pulse on the ring.
// Setup:   src/magnet-booster-vfx.ts exports 4 functions. MAGNET_RADIUS
//          (2.5) is imported from src/scrap.ts to anchor the ring + field
//          sizes to the project-wide baseline constant. Test runs in
//          Node + jsdom so the full Three.js mesh stack is available.
// Issues:  None at creation.
// Fix:     Phase 7f Task 2. Test groups cover: (1) ring geometry size =
//          (MAGNET_RADIUS ± 0.04), (2) ring material props match spec —
//          color 0xffcc44, AdditiveBlending, depthWrite false, DoubleSide,
//          opacity 0.30, (3) ring starts hidden + z = -0.4, (4) field
//          geometry is CircleGeometry(MAGNET_RADIUS, 64 segments), (5)
//          field uses ShaderMaterial with the expected uniforms
//          (uBaseColor = SHIELD_BOOST_GREEN, fresnel + pulse), (6) field
//          starts hidden + z = -0.5, (7) updateActive applies the 2 Hz
//          opacity pulse with formula 0.30 + 0.10 * sin(remainingSeconds
//          * π * 4), (8) updateActiveField scales by (tier+1) and hides
//          when tier=0 or window expired.
//          2026-06-26 tuning pass — values above reflect the post-feedback
//          "thinner + more transparent" rebalance. Pulse peaks at 0.40,
//          still under the 0.70 additive-blend cap. Preview ring removed
//          entirely; the field disk is new.
// Gotchas: The pulse test relies on hand-verified math: t=0.125 → 0.40,
//          t=0.375 → 0.20, t=0.25 → 0.30 (sin(π) = 0), t=0.5 → 0.30
//          (sin(2π) = 0). toBeCloseTo precision is 1 decimal place (0.1) to
//          absorb IEEE-754 sin() output. updateActiveRing signature includes
//          a reserved `deltaTime` param that the spec marks unused — the
//          pulse formula is time-based, not frame-rate-independent.
//          The field shader doesn't use remainingSeconds directly — it
//          advances a uTime clock via deltaTime so the disk's pulse is
//          monotonic even when the active window is re-triggered.
// ═══════════════════════════════════════════════════════════════════════════

describe('createActiveRing', () => {
  it('uses RingGeometry sized to MAGNET_RADIUS ± 0.04 with 64 segments', () => {
    const mesh = createActiveRing();
    const geom = mesh.geometry as RingGeometry;
    expect(geom.parameters.innerRadius).toBeCloseTo(MAGNET_RADIUS - 0.04, 5);
    expect(geom.parameters.outerRadius).toBeCloseTo(MAGNET_RADIUS + 0.04, 5);
    expect(geom.parameters.thetaSegments).toBe(64);
  });

  it('uses MeshBasicMaterial with color 0xffcc44, AdditiveBlending, DoubleSide, depthWrite false, opacity 0.30', () => {
    const mesh = createActiveRing();
    const mat = mesh.material as MeshBasicMaterial;
    expect(mat).toBeInstanceOf(MeshBasicMaterial);
    expect(mat.color.getHex()).toBe(0xffcc44);
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeCloseTo(0.30, 5);
    expect(mat.blending).toBe(AdditiveBlending);
    expect(mat.side).toBe(DoubleSide);
    expect(mat.depthWrite).toBe(false);
  });

  it('starts hidden (visible = false) and sits at z = -0.4', () => {
    const mesh = createActiveRing();
    expect(mesh.visible).toBe(false);
    expect(mesh.position.z).toBeCloseTo(-0.4, 5);
  });
});

describe('createActiveField', () => {
  it('uses CircleGeometry sized to MAGNET_RADIUS with 64 segments', () => {
    const mesh = createActiveField();
    const geom = mesh.geometry as CircleGeometry;
    expect(geom).toBeInstanceOf(CircleGeometry);
    expect(geom.parameters.radius).toBeCloseTo(MAGNET_RADIUS, 5);
    expect(geom.parameters.segments).toBe(64);
  });

  it('uses ShaderMaterial with SHIELD_BOOST_GREEN base color + AdditiveBlending + DoubleSide + depthWrite false', () => {
    const mesh = createActiveField();
    const mat = mesh.material as ShaderMaterial;
    expect(mat).toBeInstanceOf(ShaderMaterial);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.side).toBe(DoubleSide);
    expect(mat.blending).toBe(AdditiveBlending);
    const baseColor = mat.uniforms.uBaseColor.value as [number, number, number];
    expect(baseColor[0]).toBeCloseTo(0.20, 5);
    expect(baseColor[1]).toBeCloseTo(1.00, 5);
    expect(baseColor[2]).toBeCloseTo(0.50, 5);
  });

  it('starts hidden (visible = false) and sits at z = -0.5 (one plane behind the ring)', () => {
    const mesh = createActiveField();
    expect(mesh.visible).toBe(false);
    expect(mesh.position.z).toBeCloseTo(-0.5, 5);
  });
});

describe('updateActiveRing', () => {
  it('hides the ring when activeTier = 0', () => {
    const mesh = createActiveRing();
    updateActiveRing(mesh, 0, 3.0, 0.016);
    expect(mesh.visible).toBe(false);
  });

  it('shows the ring at scale (activeTier+1, activeTier+1, 1) when active', () => {
    const mesh = createActiveRing();
    updateActiveRing(mesh, 2, 3.0, 0.016);
    expect(mesh.visible).toBe(true);
    expect(mesh.scale.x).toBeCloseTo(3, 5);
    expect(mesh.scale.y).toBeCloseTo(3, 5);
    expect(mesh.scale.z).toBeCloseTo(1, 5);
  });

  it('hides the ring when remainingSeconds = 0 even if activeTier > 0', () => {
    const mesh = createActiveRing();
    updateActiveRing(mesh, 1, 0, 0.016);
    expect(mesh.visible).toBe(false);
  });

  it('pulses opacity via 0.30 + 0.10 * sin(remainingSeconds * π * 4)', () => {
    const mesh = createActiveRing();
    // 0.25s -> sin(π) = 0 -> 0.30
    updateActiveRing(mesh, 1, 0.25, 0.016);
    expect((mesh.material as MeshBasicMaterial).opacity).toBeCloseTo(0.30, 1);
    // 0.5s -> sin(2π) = 0 -> 0.30
    updateActiveRing(mesh, 1, 0.5, 0.016);
    expect((mesh.material as MeshBasicMaterial).opacity).toBeCloseTo(0.30, 1);
    // 0.125s -> sin(0.5π) = 1 -> 0.40 (peak, under 0.70 additive cap)
    updateActiveRing(mesh, 1, 0.125, 0.016);
    expect((mesh.material as MeshBasicMaterial).opacity).toBeCloseTo(0.40, 1);
    // 0.375s -> sin(1.5π) = -1 -> 0.20 (trough)
    updateActiveRing(mesh, 1, 0.375, 0.016);
    expect((mesh.material as MeshBasicMaterial).opacity).toBeCloseTo(0.20, 1);
  });

  it('keeps the material color at 0xffcc44 across updates', () => {
    const mesh = createActiveRing();
    updateActiveRing(mesh, 1, 1.0, 0.016);
    expect((mesh.material as MeshBasicMaterial).color.getHex()).toBe(0xffcc44);
  });
});

describe('updateActiveField', () => {
  it('hides the field when activeTier = 0', () => {
    const mesh = createActiveField();
    updateActiveField(mesh, 0, 3.0, 0.016);
    expect(mesh.visible).toBe(false);
  });

  it('shows the field at scale (activeTier+1, activeTier+1, 1) when active', () => {
    const mesh = createActiveField();
    updateActiveField(mesh, 2, 3.0, 0.016);
    expect(mesh.visible).toBe(true);
    expect(mesh.scale.x).toBeCloseTo(3, 5);
    expect(mesh.scale.y).toBeCloseTo(3, 5);
    expect(mesh.scale.z).toBeCloseTo(1, 5);
  });

  it('hides the field when remainingSeconds = 0 even if activeTier > 0', () => {
    const mesh = createActiveField();
    updateActiveField(mesh, 1, 0, 0.016);
    expect(mesh.visible).toBe(false);
  });

  it('advances the shader uTime clock by deltaTime each call', () => {
    const mesh = createActiveField();
    const mat = mesh.material as ShaderMaterial;
    const initialTime = mat.uniforms.uTime.value as number;
    updateActiveField(mesh, 1, 3.0, 0.5);
    expect(mat.uniforms.uTime.value).toBeCloseTo(initialTime + 0.5, 5);
    updateActiveField(mesh, 1, 2.5, 0.25);
    expect(mat.uniforms.uTime.value).toBeCloseTo(initialTime + 0.75, 5);
  });
});