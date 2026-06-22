import { describe, expect, it, vi } from 'vitest';
import {
  AsteroidKind,
  AsteroidSize,
  createAsteroidMesh,
  disposeAsteroidMesh,
  swapToCrackedMaterial,
} from '../src/asteroid';
import { createCrackedMaterial, drawCrackedCrystalPattern } from '../src/crystal-fx';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Crystal FX GPU Leak Test (pure)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify disposeAsteroidMesh disposes cracked material + texture so
//          the GPU sees no leaks when a crystal is destroyed or culled.
// Setup:   Uses a mock 2D context — no jsdom, no canvas npm package.
// Issues:  None.
// Fix:     Refactored makeCrackedCrystalTexture into two functions: a pure
//          drawCrackedCrystalPattern that takes a 2D context, and a thin
//          makeCrackedCrystalTexture wrapper that creates the canvas + tex.
//          The test only needs the drawing side, so we mock the context.
// Gotchas: vi.spyOn works on any object's methods including Three.js
//          MeshStandardMaterial.dispose and CanvasTexture.dispose.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a minimal mock 2D context that records calls to fillRect, beginPath,
 * moveTo, lineTo, and stroke — enough for drawCrackedCrystalPattern to run
 * without throwing. Returns the context plus a spy on each method.
 */
function makeMockContext(): {
  ctx: CanvasRenderingContext2D;
  fillRect: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
} {
  const fillRect = vi.fn();
  const beginPath = vi.fn();
  const moveTo = vi.fn();
  const lineTo = vi.fn();
  const stroke = vi.fn();
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect,
    beginPath,
    moveTo,
    lineTo,
    stroke,
  } as unknown as CanvasRenderingContext2D;
  return { ctx, fillRect, beginPath, moveTo, lineTo, stroke };
}

describe('drawCrackedCrystalPattern — pure drawing', () => {
  it('fills the canvas with the dark cyan base', () => {
    const { ctx, fillRect } = makeMockContext();
    drawCrackedCrystalPattern(ctx, 1);
    expect(fillRect).toHaveBeenCalledWith(0, 0, 256, 256);
  });

  it('draws 8 crack polylines (8 stroke calls)', () => {
    const { ctx, stroke } = makeMockContext();
    drawCrackedCrystalPattern(ctx, 1);
    expect(stroke).toHaveBeenCalledTimes(8);
  });

  it('is deterministic — same seed produces identical call counts', () => {
    const a = makeMockContext();
    const b = makeMockContext();
    drawCrackedCrystalPattern(a.ctx, 42);
    drawCrackedCrystalPattern(b.ctx, 42);
    expect(a.stroke.mock.calls.length).toBe(b.stroke.mock.calls.length);
    expect(a.lineTo.mock.calls.length).toBe(b.lineTo.mock.calls.length);
  });

  it('different seeds produce different call sequences (probabilistic)', () => {
    const a = makeMockContext();
    const b = makeMockContext();
    drawCrackedCrystalPattern(a.ctx, 1);
    drawCrackedCrystalPattern(b.ctx, 2);
    // At least one stroke call must differ in argument shape — for seeds 1 vs 2
    // the lineTo sequence should differ in at least one coordinate.
    const aArgs = JSON.stringify(a.lineTo.mock.calls);
    const bArgs = JSON.stringify(b.lineTo.mock.calls);
    expect(aArgs === bArgs).toBe(false);
  });
});

describe('swapToCrackedMaterial + disposeAsteroidMesh — GPU leak fix', () => {
  it('disposeAsteroidMesh disposes userData.crackedMaterial and userData.crackedTexture', () => {
    // Build a cracked material manually with a mock CanvasTexture so we
    // never touch document or getContext(). The texture is just a stand-in;
    // we only care that .dispose() is called on it.
    const fakeTexture = { dispose: vi.fn() } as unknown as import('three').CanvasTexture;
    const mesh = createAsteroidMesh(AsteroidSize.LARGE, false, AsteroidKind.CRYSTAL);
    const material = createCrackedMaterial(fakeTexture);
    const matDisposeSpy = vi.spyOn(material, 'dispose');
    const texDisposeSpy = vi.spyOn(fakeTexture, 'dispose');
    swapToCrackedMaterial(mesh, material, fakeTexture);

    disposeAsteroidMesh(mesh);

    expect(matDisposeSpy).toHaveBeenCalled();
    expect(texDisposeSpy).toHaveBeenCalled();
  });
});