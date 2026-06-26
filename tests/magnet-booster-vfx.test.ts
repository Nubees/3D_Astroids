import { beforeAll, describe, expect, it } from 'vitest';
import {
  AdditiveBlending,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from 'three';
import { MAGNET_RADIUS } from '../src/scrap';
import {
  createActiveRing,
  createPreviewRing,
  updateActiveRing,
  updatePreviewRing,
} from '../src/magnet-booster-vfx';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Magnet Booster VFX Ring Factories Tests (Phase 7f Task 2)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: TDD tests for the Three.js ring mesh factories that render the
//          Magnet Booster's preview/active rings. These tests assert shape
//          (RingGeometry inner/outer radii), material (color, opacity,
//          blending, depthWrite, side), positioning (z = -0.4), visibility
//          defaults (hidden), scale tier mapping, and the 2 Hz opacity pulse.
// Setup:   src/magnet-booster-vfx.ts exports 4 functions. MAGNET_RADIUS
//          (2.5) is imported from src/scrap.ts to anchor the ring sizes to
//          the project-wide baseline constant. Test runs in Node + jsdom so
//          the full Three.js mesh stack is available.
// Issues:  None at creation.
// Fix:     Phase 7f Task 2. Test groups cover: (1) ring geometry size =
//          (MAGNET_RADIUS ± 0.04) for preview, (MAGNET_RADIUS ± 0.06) for
//          active, (2) material props must match the spec exactly — color
//          0xffcc44, AdditiveBlending, depthWrite false, DoubleSide,
//          preview opacity 0.20, active opacity 0.45, (3) starts hidden
//          (visible = false), preview sits at z = -0.4, (4) updatePreview
//          scale = (pendingTier+1) — only nonzero tiers show, (5)
//          updateActive applies the 2 Hz opacity pulse with formula
//          0.40 + 0.15 * sin(remainingSeconds * π * 4), and hides the ring
//          when activeTier = 0 OR remainingSeconds = 0.
// Gotchas: The pulse test relies on hand-verified math: t=0.125 → 0.55,
//          t=0.375 → 0.25, t=0.25 → 0.40 (sin(π) = 0), t=0.5 → 0.40
//          (sin(2π) = 0). toBeCloseTo precision is 1 decimal place (0.1) to
//          absorb IEEE-754 sin() output. updateActiveRing signature includes
//          a reserved `deltaTime` param that the spec marks unused — the
//          pulse formula is time-based, not frame-rate-independent.
// ═══════════════════════════════════════════════════════════════════════════

describe('createPreviewRing', () => {
  it('uses RingGeometry sized to MAGNET_RADIUS ± 0.04 with 64 segments', () => {
    const mesh = createPreviewRing();
    const geom = mesh.geometry as RingGeometry;
    // inner = MAGNET_RADIUS - 0.04, outer = MAGNET_RADIUS + 0.04
    expect(geom.parameters.innerRadius).toBeCloseTo(MAGNET_RADIUS - 0.04, 5);
    expect(geom.parameters.outerRadius).toBeCloseTo(MAGNET_RADIUS + 0.04, 5);
    expect(geom.parameters.thetaSegments).toBe(64);
  });

  it('uses MeshBasicMaterial with color 0xffcc44, AdditiveBlending, DoubleSide, depthWrite false, opacity 0.20', () => {
    const mesh = createPreviewRing();
    const mat = mesh.material as MeshBasicMaterial;
    expect(mat).toBeInstanceOf(MeshBasicMaterial);
    expect(mat.color.getHex()).toBe(0xffcc44);
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeCloseTo(0.20, 5);
    expect(mat.blending).toBe(AdditiveBlending);
    expect(mat.side).toBe(DoubleSide);
    expect(mat.depthWrite).toBe(false);
  });

  it('starts hidden (visible = false) and sits at z = -0.4', () => {
    const mesh = createPreviewRing();
    expect(mesh.visible).toBe(false);
    expect(mesh.position.z).toBeCloseTo(-0.4, 5);
  });
});

describe('createActiveRing', () => {
  it('uses RingGeometry sized to MAGNET_RADIUS ± 0.06 with 64 segments', () => {
    const mesh = createActiveRing();
    const geom = mesh.geometry as RingGeometry;
    expect(geom.parameters.innerRadius).toBeCloseTo(MAGNET_RADIUS - 0.06, 5);
    expect(geom.parameters.outerRadius).toBeCloseTo(MAGNET_RADIUS + 0.06, 5);
    expect(geom.parameters.thetaSegments).toBe(64);
  });

  it('uses MeshBasicMaterial with color 0xffcc44, AdditiveBlending, DoubleSide, depthWrite false, opacity 0.45', () => {
    const mesh = createActiveRing();
    const mat = mesh.material as MeshBasicMaterial;
    expect(mat).toBeInstanceOf(MeshBasicMaterial);
    expect(mat.color.getHex()).toBe(0xffcc44);
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeCloseTo(0.45, 5);
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

describe('updatePreviewRing', () => {
  it('hides the ring when pendingTier = 0', () => {
    const mesh = createPreviewRing();
    updatePreviewRing(mesh, 0);
    expect(mesh.visible).toBe(false);
  });

  it('shows the ring at scale (2, 2, 1) when pendingTier = 1', () => {
    const mesh = createPreviewRing();
    updatePreviewRing(mesh, 1);
    expect(mesh.visible).toBe(true);
    expect(mesh.scale.x).toBeCloseTo(2, 5);
    expect(mesh.scale.y).toBeCloseTo(2, 5);
    expect(mesh.scale.z).toBeCloseTo(1, 5);
  });

  it('shows the ring at scale (3, 3, 1) when pendingTier = 2', () => {
    const mesh = createPreviewRing();
    updatePreviewRing(mesh, 2);
    expect(mesh.visible).toBe(true);
    expect(mesh.scale.x).toBeCloseTo(3, 5);
    expect(mesh.scale.y).toBeCloseTo(3, 5);
    expect(mesh.scale.z).toBeCloseTo(1, 5);
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

  it('pulses opacity via 0.40 + 0.15 * sin(remainingSeconds * π * 4)', () => {
    const mesh = createActiveRing();
    // 0.25s -> sin(π) = 0 -> 0.40
    updateActiveRing(mesh, 1, 0.25, 0.016);
    expect((mesh.material as MeshBasicMaterial).opacity).toBeCloseTo(0.40, 1);
    // 0.5s -> sin(2π) = 0 -> 0.40
    updateActiveRing(mesh, 1, 0.5, 0.016);
    expect((mesh.material as MeshBasicMaterial).opacity).toBeCloseTo(0.40, 1);
    // 0.125s -> sin(0.5π) = 1 -> 0.55
    updateActiveRing(mesh, 1, 0.125, 0.016);
    expect((mesh.material as MeshBasicMaterial).opacity).toBeCloseTo(0.55, 1);
    // 0.375s -> sin(1.5π) = -1 -> 0.25
    updateActiveRing(mesh, 1, 0.375, 0.016);
    expect((mesh.material as MeshBasicMaterial).opacity).toBeCloseTo(0.25, 1);
  });

  it('keeps the material color at 0xffcc44 across updates', () => {
    const mesh = createActiveRing();
    updateActiveRing(mesh, 1, 1.0, 0.016);
    expect((mesh.material as MeshBasicMaterial).color.getHex()).toBe(0xffcc44);
  });
});

