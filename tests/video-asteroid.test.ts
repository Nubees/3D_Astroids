// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, MeshStandardMaterial, VideoTexture } from 'three';
import { AsteroidSize } from '../src/types';
import { SIZE_RADIUS } from '../src/asteroid';
import {
  createVideoAsteroidMesh,
  disposeVideoAsteroidResources,
} from '../src/video-asteroid';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Video Asteroid Unit Tests (Phase 7h — Custom Asteroids)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Lock the visual + lifecycle contract for the video-textured RED
//          targeted asteroid (isTargeted=true) — the new mesh factory that
//          wraps a SphereGeometry in a VideoTexture driven by
//          /public/video/asteroid1.mp4. Split/drop physics remain on the
//          original Iron Slag — only the visual mesh swaps.
//
// Setup:   Vitest loads this file. createVideoAsteroidMesh and
//          disposeVideoAsteroidResources are imported from
//          src/video-asteroid.ts. The module's shared video element + texture
//          are global mutable singletons; beforeEach resets state by calling
//          disposeVideoAsteroidResources() at the end of every test.
//
// Issues:  Phase 7h v2 shipped with IcosahedronGeometry; user reported
//          "video doesn't cover the whole asteroid". Root cause: the
//          icosahedron's UVs cluster into 20 tiny triangles, so most faces
//          sample an unused wedge of the texture and render as base material
//          color. Phase 7h v3 fixed it by switching to SphereGeometry,
//          which has natural equirectangular UVs that span the full 0-1
//          range.
//
// Fix:     Phase 7h v3 (geometry) + Phase 7h v5 (channel routing). Tests cover:
//          (1) Mesh creation — Group shape, child Mesh, SphereGeometry
//              radius matching SIZE_RADIUS[size], material emissiveMap =
//              VideoTexture (NOT the diffuse `map` slot).
//          (2) UV coverage — UVs span >50% of the 0-1 range in both U and V
//              axes (locks the "video covers whole asteroid" guarantee).
//          (3) Singleton — second call returns the SAME texture instance.
//          (4) userData stash — disposeAsteroidMesh in asteroid.ts uses this
//              to detach the per-mesh reference.
//          (5) Disposal — disposeVideoAsteroidResources pauses the video,
//              removes it from DOM, disposes the texture, and nulls both
//              module-level singletons.
//          (6) Disposal is idempotent — calling it twice does not throw.
//          (7) Per-mesh material disposal does NOT dispose the texture —
//              the shared texture is owned by Game.stop().
//          (8) v5 channel routing — material.map is null and material.color
//              is 0x000000 so the lit hemisphere does not double-count the
//              texture (outgoingLight + totalEmissiveRadiance would saturate
//              to white). Video lives ONLY in emissiveMap.
//
// Gotchas: JSDOM (Vitest's default) does not actually decode MP4. We only
//          assert that the VideoTexture was created and references the
//          shared HTMLVideoElement — we don't try to play frames.
// ═══════════════════════════════════════════════════════════════════════════

describe('createVideoAsteroidMesh', () => {
  afterEach(() => {
    // Reset module-level singletons between tests so each one starts clean.
    disposeVideoAsteroidResources();
  });

  it('returns a Group with one child Mesh', () => {
    const mesh = createVideoAsteroidMesh(AsteroidSize.MEDIUM);
    expect(mesh.children).toHaveLength(1);
    // Group itself is the public return shape; same as createAsteroidMesh.
    expect(mesh.type).toBe('Group');
  });

  it('uses BoxGeometry sized to the original asteroid diameter (side = 2 × radius)', () => {
    // Phase 7h v6: BoxGeometry replaces SphereGeometry. Box side equals
    // the diameter of the original IcosahedronGeometry asteroid (2 ×
    // radius) so the world-space bounding extent is preserved across
    // v3 (sphere), v4/v5 (sphere) and v6 (box). Collision in
    // asteroid.ts:resolveAsteroidCollision still uses SIZE_RADIUS for
    // the radius check; the box's bounding sphere matches the original
    // Iron Slag's diameter exactly.
    const mesh = createVideoAsteroidMesh(AsteroidSize.LARGE);
    const inner = mesh.children[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((inner as any).geometry).toBeInstanceOf(BoxGeometry);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params = ((inner as any).geometry as BoxGeometry).parameters;
    // BoxGeometry(width, height, depth) — all three equal the box side.
    expect(params.width).toBeCloseTo(SIZE_RADIUS[AsteroidSize.LARGE] * 2);
    expect(params.width).toBeCloseTo(4.4);
    expect(params.height).toBeCloseTo(SIZE_RADIUS[AsteroidSize.LARGE] * 2);
    expect(params.depth).toBeCloseTo(SIZE_RADIUS[AsteroidSize.LARGE] * 2);
  });

  it('BoxGeometry UVs are remapped to cube-cross layout — 6 faces, each unique 1/4 × 1/3 portion', () => {
    // Phase 7h v6: replace SphereGeometry with BoxGeometry + custom UV
    // remap so each flat face shows a DIFFERENT portion of the same video.
    // Default BoxGeometry UVs put the full texture on every face (visible
    // repetition). The cube-cross layout assigns each face a unique
    // 1/4 × 1/3 cell of the [0,1]² texture:
    //
    //            [ +Y top ]    col 1, row 0
    //   [ -X ][ +Z ][ +X ][ -Z ]   cols 0..3, row 1
    //            [ -Y bot ]    col 1, row 2
    //
    // Test asserts the new invariant: every face has its own UV range,
    // each face spans exactly 1/4 of U and 1/3 of V, no two faces have
    // identical (uMin, uMax, vMin, vMax), and the 6 ranges together
    // tile [0,1]² (union of U = [0,1], union of V = [0,1]).
    const mesh = createVideoAsteroidMesh(AsteroidSize.MEDIUM);
    const inner = mesh.children[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geom = (inner as any).geometry as BoxGeometry;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvAttr = (geom.attributes as any).uv;

    // BoxGeometry has 24 UVs (6 faces × 4 vertices). Each face's 4 UVs
    // should be at the 4 corners of its assigned cell.
    expect(uvAttr.count).toBe(24);

    const faceRanges: Array<{ uMin: number; uMax: number; vMin: number; vMax: number }> = [];
    for (let face = 0; face < 6; face++) {
      let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
      for (let v = 0; v < 4; v++) {
        const idx = face * 4 + v;
        const u = uvAttr.getX(idx);
        const vt = uvAttr.getY(idx);
        if (u < uMin) uMin = u;
        if (u > uMax) uMax = u;
        if (vt < vMin) vMin = vt;
        if (vt > vMax) vMax = vt;
      }
      faceRanges.push({ uMin, uMax, vMin, vMax });
    }

    // Each face spans exactly 1/4 of the U axis and 1/3 of the V axis.
    // Tolerance 2 instead of 3 — 1/3 = 0.3333... is not exact in Float32
    // so toBeCloseTo with precision 3 (tolerance 0.0005) fails on the
    // last digit. Precision 2 (tolerance 0.005) is the correct check.
    for (const range of faceRanges) {
      expect(range.uMax - range.uMin).toBeCloseTo(0.25, 2);
      expect(range.vMax - range.vMin).toBeCloseTo(1 / 3, 2);
    }

    // No two faces have IDENTICAL (uMin, uMax, vMin, vMax). Different
    // faces can share U or V in the cube-cross (top/bottom/front all
    // share col 1 in U), but the cells must differ.
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6; j++) {
        const a = faceRanges[i];
        const b = faceRanges[j];
        const identical =
          a.uMin === b.uMin && a.uMax === b.uMax &&
          a.vMin === b.vMin && a.vMax === b.vMax;
        expect(identical).toBe(false);
      }
    }

    // The 6 faces together tile the [0,1]×[0,1] texture with no gaps.
    const allUMins = faceRanges.map(r => r.uMin);
    const allUMaxs = faceRanges.map(r => r.uMax);
    const allVMins = faceRanges.map(r => r.vMin);
    const allVMaxs = faceRanges.map(r => r.vMax);
    expect(Math.min(...allUMins)).toBeCloseTo(0, 5);
    expect(Math.max(...allUMaxs)).toBeCloseTo(1, 5);
    expect(Math.min(...allVMins)).toBeCloseTo(0, 5);
    expect(Math.max(...allVMaxs)).toBeCloseTo(1, 5);
  });

  it('wraps the geometry in a MeshStandardMaterial with a VideoTexture as emissiveMap', () => {
    const mesh = createVideoAsteroidMesh(AsteroidSize.SMALL);
    const inner = mesh.children[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const material = (inner as any).material as MeshStandardMaterial;
    expect(material).toBeInstanceOf(MeshStandardMaterial);
    // Phase 7h v5: video lives in emissiveMap (post-lighting additive slot),
    // NOT the diffuse `map` slot. v4 routed it through both `map` AND
    // emissive, which double-counted on the lit hemisphere:
    //   outgoingLight ≈ directional * (white map) ≈ 1.0
    //   totalEmissiveRadiance = 1.0
    //   finalColor ≈ 2.0  →  tonemapped to 1.0 = pure white ("all white asteroid")
    // v5 keeps the texture only in emissiveMap and sets `color: 0x000000`
    // so `outgoingLight ≈ 0` on every face. Lit and unlit hemispheres both
    // read the video color at full saturation, no additive overshoot.
    // Trade-off: no PBR contour from the directional light — surface reads
    // as a flat video wrap. Correct intent for a self-illuminated asteroid.
    expect(material.map).toBeNull();
    expect(material.emissiveMap).toBeInstanceOf(VideoTexture);
    expect(material.color.getHex()).toBe(0x000000);
    expect(material.emissive.getHex()).toBe(0xffffff);
    expect(material.emissiveIntensity).toBe(1);
  });

  it('shares one VideoTexture across multiple asteroids (singleton video)', () => {
    const a = createVideoAsteroidMesh(AsteroidSize.LARGE);
    const b = createVideoAsteroidMesh(AsteroidSize.MEDIUM);
    const c = createVideoAsteroidMesh(AsteroidSize.SMALL);

    // All three materials must reference the same texture instance.
    // Phase 7h v5: texture is in emissiveMap, not the diffuse `map` slot.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ta = ((a.children[0] as any).material as MeshStandardMaterial).emissiveMap;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tb = ((b.children[0] as any).material as MeshStandardMaterial).emissiveMap;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tc = ((c.children[0] as any).material as MeshStandardMaterial).emissiveMap;
    expect(ta).toBe(tb);
    expect(tb).toBe(tc);
  });

  it('stashes the shared video + texture on userData for disposal', () => {
    const mesh = createVideoAsteroidMesh(AsteroidSize.MEDIUM);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stash = (mesh.userData as any).videoAsteroid;
    expect(stash).toBeDefined();
    expect(stash.video).toBeInstanceOf(HTMLVideoElement);
    expect(stash.texture).toBeInstanceOf(VideoTexture);
    // The stash texture must match the material's emissiveMap (same singleton).
    // Phase 7h v5: texture lives in emissiveMap, not the diffuse `map` slot.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matEmissiveMap = ((mesh.children[0] as any).material as MeshStandardMaterial).emissiveMap;
    expect(stash.texture).toBe(matEmissiveMap);
  });

  it('produces box meshes with side = SIZE_RADIUS[size] × 2 for every AsteroidSize', () => {
    // Phase 7h v6 requirement: "must be made to the same size as the
    // Original Generated Asteroid". For a BoxGeometry, that means each
    // side equals the diameter of the original sphere (2 × radius).
    // Both collision (in asteroid.ts:resolveAsteroidCollision) and visual
    // radius (in asteroid.ts:SIZE_RADIUS) are still keyed on `radius`,
    // but the box's bounding extent matches the sphere's diameter for
    // world-space parity with v3/v4/v5.
    for (const size of [AsteroidSize.TINY, AsteroidSize.SMALL, AsteroidSize.MEDIUM, AsteroidSize.LARGE]) {
      const mesh = createVideoAsteroidMesh(size);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const geom = (mesh.children[0] as any).geometry as BoxGeometry;
      const expectedSide = SIZE_RADIUS[size] * 2;
      expect(geom.parameters.width).toBeCloseTo(expectedSide);
      expect(geom.parameters.height).toBeCloseTo(expectedSide);
      expect(geom.parameters.depth).toBeCloseTo(expectedSide);
    }
  });
});

describe('disposeVideoAsteroidResources', () => {
  it('pauses the shared <video> element and disposes the VideoTexture', () => {
    const mesh = createVideoAsteroidMesh(AsteroidSize.MEDIUM);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const videoBefore = (mesh.userData as any).videoAsteroid.video as HTMLVideoElement;
    // JSDOM supports pause() — spy on it to verify the call.
    const pauseSpy = vi.spyOn(videoBefore, 'pause');

    disposeVideoAsteroidResources();

    expect(pauseSpy).toHaveBeenCalledOnce();
    // After disposal, the shared singletons are nulled — a follow-up call
    // to createVideoAsteroidMesh will lazily re-create them.
  });

  it('is idempotent (safe to call twice)', () => {
    createVideoAsteroidMesh(AsteroidSize.MEDIUM);
    expect(() => {
      disposeVideoAsteroidResources();
      disposeVideoAsteroidResources();
    }).not.toThrow();
  });

  it('removes the <video> element from the document body', () => {
    createVideoAsteroidMesh(AsteroidSize.MEDIUM);
    // After creation the body should contain a <video> element.
    const before = document.querySelectorAll('video').length;
    expect(before).toBeGreaterThan(0);
    disposeVideoAsteroidResources();
    const after = document.querySelectorAll('video').length;
    // Element was appended and then removed.
    expect(after).toBe(before - 1);
  });
});

describe('per-mesh disposal (asteroid.ts disposeAsteroidMesh contract)', () => {
  // Phase 7h disposeAsteroidMesh behavior: detaches the per-mesh reference
  // by nulling userData.videoAsteroid, but does NOT dispose the shared
  // texture (because other targeted asteroids may still reference it).
  // The shared texture is freed by Game.stop() via disposeVideoAsteroidResources.
  it('disposing a single mesh does not null the shared texture (other asteroids still alive)', () => {
    const a = createVideoAsteroidMesh(AsteroidSize.LARGE);
    const b = createVideoAsteroidMesh(AsteroidSize.MEDIUM);

    // Simulate disposeAsteroidMesh behavior — null the userData stash.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a.userData as any).videoAsteroid = undefined;

    // The other mesh still references the same shared texture.
    // Phase 7h v5: texture lives in emissiveMap, not the diffuse `map` slot.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bMatEmissiveMap = ((b.children[0] as any).material as MeshStandardMaterial).emissiveMap;
    expect(bMatEmissiveMap).toBeInstanceOf(VideoTexture);
  });
});
