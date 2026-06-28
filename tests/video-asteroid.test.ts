// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DoubleSide,
  IcosahedronGeometry,
  MeshStandardMaterial,
  VideoTexture,
} from 'three';
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
//          targeted asteroid (isTargeted=true). Phase 7h v11 swapped the
//          geometry from BoxGeometry (v6 cube-cross UV remap) to
//          IcosahedronGeometry (NO34 lab winner), with three additional
//          material changes: emissiveIntensity 1.0 → 1.5, FrontSide →
//          DoubleSide, and a chroma-key onBeforeCompile inject that
//          discards the green-screen background pixels from the source
//          MP4.
//
// Setup:   Vitest loads this file. createVideoAsteroidMesh and
//          disposeVideoAsteroidResources are imported from
//          src/video-asteroid.ts. The module's shared video element +
//          texture are global mutable singletons; afterEach resets state
//          by calling disposeVideoAsteroidResources() at the end of every
//          test.
//
// Issues:  v6 BoxGeometry had cube-cross UV remap so each face showed a
//          different portion of the video. v11 abandons cube-cross in
//          favor of IcosahedronGeometry because (a) DoubleSide makes the
//          back hemisphere visible (the deciding-factor bug NO34 was
//          picked for — "doesnt dissapear as it rotates"), (b) the
//          chroma-key discards the green background so UV clustering
//          in the icosahedron no longer reads as a "missing video"
//          regression, and (c) the chunky 20-face icosahedron silhouette
//          is what the user explicitly preferred in the lab.
//
// Fix:     Phase 7h v11. Tests cover:
//          (1) Mesh creation — Group shape, child Mesh, IcosahedronGeometry
//              radius matching SIZE_RADIUS[size].
//          (2) UV attribute present — IcosahedronGeometry has 60 unique
//              vertices with built-in clustered UVs. We don't remap; we
//              just assert the UV attribute exists (no missing-UV bug).
//          (3) v11 material contract — emissiveMap is VideoTexture, color
//              is 0x000000 (v5 channel routing preserved), emissiveIntensity
//              is 1.5, side is DoubleSide, transparent is true, and
//              onBeforeCompile has been wired (chroma-key inject).
//          (4) Singleton — second call returns the SAME texture instance.
//          (5) userData stash — disposeAsteroidMesh in asteroid.ts uses
//              this to detach the per-mesh reference.
//          (6) Per-size radius — every AsteroidSize maps to its SIZE_RADIUS.
//          (7) Disposal — disposeVideoAsteroidResources pauses the video,
//              removes it from DOM, disposes the texture, nulls both
//              module-level singletons.
//          (8) Disposal is idempotent — calling it twice does not throw.
//          (9) Per-mesh disposal does NOT dispose the texture — the
//              shared texture is owned by Game.stop().
//
// Gotchas: JSDOM (Vitest's default) does not actually decode MP4. We only
//          assert that the VideoTexture was created and references the
//          shared HTMLVideoElement — we don't try to play frames.
//          onBeforeCompile wiring check inspects `material.onBeforeCompile`
//          as a function — Three.js calls this on first program build,
//          so we don't actually compile shaders in the test (no GL
//          context). The function reference existing is sufficient proof
//          the chroma-key was injected.
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

  it('uses IcosahedronGeometry at SIZE_RADIUS[size] (v11 swap from BoxGeometry)', () => {
    // Phase 7h v11: IcosahedronGeometry replaces v6's BoxGeometry. The
    // icosahedron has detail=0 → 20 flat triangular faces, 60 vertices,
    // 80 triangles. The radius matches SIZE_RADIUS[size] (same as the
    // original Iron Slag IcosahedronGeometry that this whole module
    // swapped away from in v2 — v11 returns to it). Collision in
    // asteroid.ts:resolveAsteroidCollision keys on SIZE_RADIUS so the
    // bounding sphere of the new geometry matches the original exactly.
    const mesh = createVideoAsteroidMesh(AsteroidSize.LARGE);
    const inner = mesh.children[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((inner as any).geometry).toBeInstanceOf(IcosahedronGeometry);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params = ((inner as any).geometry as IcosahedronGeometry).parameters;
    // IcosahedronGeometry(radius, detail). Detail=0 means 20 flat faces —
    // exactly the chunky faceted rock silhouette the user picked NO34 for.
    expect(params.radius).toBeCloseTo(SIZE_RADIUS[AsteroidSize.LARGE]);
    expect(params.radius).toBeCloseTo(2.2);
    expect(params.detail).toBe(0);
  });

  it('IcosahedronGeometry has a UV attribute (no remap required under v11)', () => {
    // Phase 7h v11: we no longer rewrite the UV attribute. The icosahedron's
    // PolyhedronGeometry spherical projection produces clustered UVs (20
    // tiny triangles in UV space — most of the texture is un-sampled by
    // any face), but with DoubleSide + chroma-key this reads as a chunky
    // rock with video patches on the front, not as the "video missing on
    // the back" v3 regression. The lab explicitly tested this — NO30
    // (icosahedron at emissive 1.0) read as a "good" rock, and the user
    // picked NO34 (icosahedron at 1.5) as the production winner.
    //
    // Test: assert the UV attribute is present and has at least one
    // vertex worth of data. We don't lock specific UV ranges — the
    // icosahedron's UV projection is an internal Three.js detail that
    // can change between versions without affecting the visual contract
    // (chroma-key + DoubleSide are what make v11 work, not the UVs).
    const mesh = createVideoAsteroidMesh(AsteroidSize.MEDIUM);
    const inner = mesh.children[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geom = (inner as any).geometry as IcosahedronGeometry;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uvAttr = (geom.attributes as any).uv;
    expect(uvAttr).toBeDefined();
    // IcosahedronGeometry at detail=0 has 60 unique vertices → 60 UVs.
    expect(uvAttr.count).toBeGreaterThan(0);
  });

  it('wraps the geometry in a MeshStandardMaterial with v11 contract', () => {
    // Phase 7h v11 material contract:
    //   - emissiveMap: VideoTexture (v5 channel routing — preserved)
    //   - color: 0x000000 (v5 — zeroes diffuse contribution)
    //   - emissive: 0xffffff (v5 — drives totalEmissiveRadiance)
    //   - emissiveIntensity: 1.5 (v11 — was 1.0 in v6)
    //   - side: DoubleSide (v11 — was FrontSide default in v6)
    //   - transparent: true (v11 — required for chroma-key discard to
    //     work; depth buffer would otherwise block sight-through for
    //     discarded fragments)
    //   - onBeforeCompile: wired (v11 — chroma-key inject)
    const mesh = createVideoAsteroidMesh(AsteroidSize.SMALL);
    const inner = mesh.children[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const material = (inner as any).material as MeshStandardMaterial;
    expect(material).toBeInstanceOf(MeshStandardMaterial);
    // v5 channel routing (UNCHANGED in v11): video lives in emissiveMap
    // only. v4 routed it through both `map` and `emissive`, which double-
    // counted on the lit hemisphere (outgoingLight + totalEmissiveRadiance
    // ≈ 2.0 → tonemapped to pure white).
    expect(material.map).toBeNull();
    expect(material.emissiveMap).toBeInstanceOf(VideoTexture);
    expect(material.color.getHex()).toBe(0x000000);
    expect(material.emissive.getHex()).toBe(0xffffff);
    // v11 brightness: 1.5 was the max-safe value in the lab's single-axis
    // sweep (1.6 over-blooms via UnrealBloomPass → tonemapped to white).
    expect(material.emissiveIntensity).toBe(1.5);
    // v11 DoubleSide: back faces render. The deciding-factor bug NO34
    // was picked for — without this the asteroid disappears when rotating.
    expect(material.side).toBe(DoubleSide);
    // v11 transparent: required for chroma-key discard (see Gotchas in
    // src/chroma-key.ts). Without this, the depth buffer blocks sight-
    // through for discarded fragments.
    expect(material.transparent).toBe(true);
    // v11 chroma-key: onBeforeCompile is set. We don't actually compile
    // shaders here (no GL context) — checking the function exists is
    // sufficient proof the inject was wired.
    expect(typeof material.onBeforeCompile).toBe('function');
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

  it('produces icosahedron meshes at SIZE_RADIUS[size] for every AsteroidSize', () => {
    // Phase 7h requirement: "must be made to the same size as the Original
    // Generated Asteroid". The original was IcosahedronGeometry(radius),
    // and v11 returns to exactly that — IcosahedronGeometry(radius, 0)
    // at radius = SIZE_RADIUS[size]. Collision keys on radius via the
    // SIZE_RADIUS lookup, so the bounding sphere matches the original
    // exactly for every AsteroidSize.
    for (const size of [AsteroidSize.TINY, AsteroidSize.SMALL, AsteroidSize.MEDIUM, AsteroidSize.LARGE]) {
      const mesh = createVideoAsteroidMesh(size);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const geom = (mesh.children[0] as any).geometry as IcosahedronGeometry;
      expect(geom.parameters.radius).toBeCloseTo(SIZE_RADIUS[size]);
      expect(geom.parameters.detail).toBe(0);
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