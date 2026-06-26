import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AdditiveBlending,
  DoubleSide,
  Group,
  MeshBasicMaterial,
  PlaneGeometry,
  Texture,
} from 'three';
import {
  MISSILE_PLANE_WIDTH,
  MISSILE_PLANE_HEIGHT,
  createMissileAssembly,
  preloadMissileTexture,
} from '../src/missile-vfx';

beforeAll(async () => {
  await preloadMissileTexture();
});

describe('createMissileAssembly — Phase 7e sprite missile', () => {
  it('returns a Group containing exactly 2 children (sprite plane + flame)', () => {
    const { assembly } = createMissileAssembly();
    expect(assembly).toBeInstanceOf(Group);
    expect(assembly.children.length).toBe(2);
  });

  it('sprite mesh is a PlaneGeometry 0.9 × 0.858 (Phase 7e-2 shrink + 7e-3 aspect swap + 7e-4 +10% lengthen), additive, transparent, double-sided, always on top (depthTest:false)', () => {
    const { mesh } = createMissileAssembly();
    const geom = mesh.geometry as PlaneGeometry;
    expect(geom.parameters.width).toBeCloseTo(MISSILE_PLANE_WIDTH, 5);
    expect(geom.parameters.height).toBeCloseTo(MISSILE_PLANE_HEIGHT, 5);
    const mat = mesh.material as MeshBasicMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.blending).toBe(AdditiveBlending);
    expect(mat.depthWrite).toBe(false);
    expect(mat.depthTest).toBe(false); // Phase 7g-2 fix — missile stays visible against asteroid occluders
    expect(mat.side).toBe(DoubleSide);
  });

  it('sprite material has the loaded missile texture as its map (no magenta override)', () => {
    const { mesh } = createMissileAssembly();
    const mat = mesh.material as MeshBasicMaterial;
    expect(mat.map).not.toBeNull();
    expect(mat.color.getHex()).toBe(0xffffff);
    const tex = mat.map as Texture;
    // tex.image is typed as the union (HTMLImageElement | HTMLCanvasElement |
    // ImageBitmap | ...) which TS surfaces as `unknown`. We only need width/
    // height for the sanity check, so a structural cast is enough.
    const img = tex.image as { width: number; height: number };
    expect(img.width).toBeGreaterThan(0);
    expect(img.height).toBeGreaterThan(0);
  });

  it('flame is positioned at the rear pole of the plane (-height/2 along Y — sprite plane forward = +Y)', () => {
    const { flame } = createMissileAssembly();
    // Phase 7g-2 fix — the old -X anchor was stale from the +X-axis
    // procedural body (Phase 7c-2). The Phase 7e sprite swap rotated
    // forward to +Y but the flame anchor wasn't updated, so the cone
    // rendered off to the SIDE of the missile body.
    expect(flame.position.y).toBeCloseTo(-MISSILE_PLANE_HEIGHT / 2, 5);
    expect(flame.position.x).toBeCloseTo(0, 5);
  });

  it('flame material is additive, depthWrite:false, and depthTest:false (always on top — matches sprite)', () => {
    const { flame } = createMissileAssembly();
    const mat = flame.material as MeshBasicMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.blending).toBe(AdditiveBlending);
    expect(mat.depthWrite).toBe(false);
    expect(mat.depthTest).toBe(false);
  });
});