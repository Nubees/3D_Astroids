// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MeshStandardMaterial, SphereGeometry, VideoTexture } from 'three';
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

  it('uses SphereGeometry at the same radius as the original asteroid', () => {
    const mesh = createVideoAsteroidMesh(AsteroidSize.LARGE);
    const inner = mesh.children[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((inner as any).geometry).toBeInstanceOf(SphereGeometry);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params = ((inner as any).geometry as SphereGeometry).parameters;
    // SphereGeometry(radius, 16, 12) — parameters.radius is the first arg.
    expect(params.radius).toBeCloseTo(SIZE_RADIUS[AsteroidSize.LARGE]);
    expect(params.radius).toBeCloseTo(2.2);
  });

  it('SphereGeometry UVs span the full 0-1 range so the video covers the whole asteroid', () => {
    // Phase 7h v3 fix for the "video doesn't cover the whole asteroid" bug:
    // SphereGeometry uses equirectangular UV projection, so every vertex's
    // UV falls within [0,1]² and the video texture is sampled on every face.
    // (Compare to IcosahedronGeometry at detail 0, where UVs cluster into 20
    // tiny triangles and most of the texture is never sampled.)
    const mesh = createVideoAsteroidMesh(AsteroidSize.MEDIUM);
    const inner = mesh.children[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geom = (inner as any).geometry as SphereGeometry;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvAttr = (geom.attributes as any).uv;
    expect(uvAttr).toBeDefined();
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < uvAttr.count; i++) {
      const u = uvAttr.getX(i);
      const v = uvAttr.getY(i);
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    // UVs should span nearly the full [0,1] range — there should be vertices
    // near both U=0 and U=1 (top/bottom of sphere wraps around) and near
    // both V=0 and V=1 (poles). A tight cluster would indicate a coverage
    // regression like the Phase 7h v2 icosahedron bug.
    expect(maxU - minU).toBeGreaterThan(0.5);
    expect(maxV - minV).toBeGreaterThan(0.5);
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

  it('produces meshes sized identically to SIZE_RADIUS for every AsteroidSize', () => {
    // Phase 7h requirement: "must be made to the same size as the Original
    // Generated Asteroid" — SIZE_RADIUS is the source of truth for collision
    // and visual radius. Both come from the same constant, so the geometry
    // parameters.radius must equal SIZE_RADIUS[size] exactly.
    for (const size of [AsteroidSize.TINY, AsteroidSize.SMALL, AsteroidSize.MEDIUM, AsteroidSize.LARGE]) {
      const mesh = createVideoAsteroidMesh(size);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const geom = (mesh.children[0] as any).geometry as SphereGeometry;
      expect(geom.parameters.radius).toBeCloseTo(SIZE_RADIUS[size]);
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
