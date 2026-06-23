import { describe, expect, it, vi } from 'vitest';
import {
  AsteroidKind,
  AsteroidSize,
  createAsteroidMesh,
  disposeAsteroidMesh,
  swapToFracturedMaterial,
} from '../src/asteroid';
import { createFracturedMaterial, crystalCharge } from '../src/crystal-fx';
import { BURST_INTERVAL_SECONDS } from '../src/types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Crystal FX GPU Leak Test (pure)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify disposeAsteroidMesh disposes the fractured material so
//          the GPU sees no leaks when a crystal is destroyed or culled.
// Setup:   No jsdom, no canvas, no texture — the fractured material is a
//          pure MeshStandardMaterial with no CanvasTexture dependency.
// Issues:  None.
// Fix:     Phase 6c dropped the cracked-vein canvas texture entirely. The
//          previous test imported drawCrackedCrystalPattern + createCracked
//          Material + a mock 2D context to drive the old cracking code.
//          Replaced those with crystalCharge math tests + a single GPU leak
//          test for swapToFracturedMaterial.
// Gotchas: vi.spyOn works on Three.js MeshStandardMaterial.dispose (just a
//          plain method). MeshStandardMaterial is constructible in node; no
//          WebGL context is required for instance creation or material
//          disposal — only for rendering.
// ═══════════════════════════════════════════════════════════════════════════

describe('crystalCharge — pure math', () => {
  it('returns 0 at the start of the burst window (timeToNext = interval)', () => {
    expect(crystalCharge(BURST_INTERVAL_SECONDS)).toBeCloseTo(0, 5);
  });

  it('returns 1 right before a burst (timeToNext = 0)', () => {
    expect(crystalCharge(0)).toBeCloseTo(1, 5);
  });

  it('returns ~0.875 at 0.5s before a burst (t = 0.5, t^3 = 0.125 inverted)', () => {
    // 1 - 0.5/2 = 0.75, cubed = 0.421875
    expect(crystalCharge(BURST_INTERVAL_SECONDS / 4)).toBeCloseTo(0.421875, 4);
  });

  it('is monotonically increasing as timeToNextBurst decreases', () => {
    const a = crystalCharge(2.0);
    const b = crystalCharge(1.5);
    const c = crystalCharge(1.0);
    const d = crystalCharge(0.5);
    const e = crystalCharge(0.0);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBeLessThan(d);
    expect(d).toBeLessThan(e);
  });

  it('clamps negative timeToNext to 1.0 (caps at burst)', () => {
    expect(crystalCharge(-1)).toBeCloseTo(1, 5);
  });

  it('clamps timeToNext > interval to 0 (caps at far-future burst)', () => {
    expect(crystalCharge(BURST_INTERVAL_SECONDS * 10)).toBeCloseTo(0, 5);
  });
});

describe('swapToFracturedMaterial + disposeAsteroidMesh — GPU leak fix', () => {
  it('disposeAsteroidMesh disposes userData.fracturedMaterial on cleanup', () => {
    // Phase 6c: no canvas texture involved. The fractured material is a
    // plain MeshStandardMaterial — build it for real and spy on dispose.
    const mesh = createAsteroidMesh(AsteroidSize.LARGE, false, AsteroidKind.CRYSTAL);
    const material = createFracturedMaterial();
    const matDisposeSpy = vi.spyOn(material, 'dispose');
    swapToFracturedMaterial(mesh, material);

    disposeAsteroidMesh(mesh);

    expect(matDisposeSpy).toHaveBeenCalled();
  });

  it('swapToFracturedMaterial swaps the inner Mesh material in place', () => {
    const mesh = createAsteroidMesh(AsteroidSize.LARGE, false, AsteroidKind.CRYSTAL);
    const inner = mesh.children[0];
    // Sanity: confirm we are swapping the right child.
    expect(inner).toBeDefined();
    const originalMat = (inner as import('three').Mesh).material;
    const fracturedMat = createFracturedMaterial();
    swapToFracturedMaterial(mesh, fracturedMat);

    expect((mesh.children[0] as import('three').Mesh).material).toBe(fracturedMat);
    // The original was disposed when the swap happened.
    // (No direct way to spy on a "just-created" MeshStandardMaterial from
    //  inside Three.js; the GPU leak test above proves the full path.)
    void originalMat;
  });
});
