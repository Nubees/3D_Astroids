import {
  DoubleSide,
  Group,
  IcosahedronGeometry,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  VideoTexture,
} from 'three';
import { AsteroidSize } from './types';
import { SIZE_RADIUS } from './asteroid';
import { applyChromaKeyToStandardMaterial } from './chroma-key';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Video Asteroid (Phase 7h — Custom Asteroids)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Replace the RED targeted asteroid mesh (the one that doesn't
//          bump into other asteroids — see asteroid.ts:266
//          `if (a.isTargeted || b.isTargeted) return;`) with an MP4-video-
//          textured SphereGeometry so the asteroid looks like a real video
//          playing on a 3D surface.
//
//          Why MP4 + VideoTexture (not a sprite or animated texture):
//          - User has 2 MP4 files of a rotating asteroid; wants them
//            played in real-time as the mesh surface.
//          - VideoTexture uploads each frame automatically — no manual
//            frame stepping needed.
//          - Wrapping the video on a SphereGeometry sized to the original
//            `radius = SIZE_RADIUS[size]` keeps collision and visual size
//            identical to the previous generated asteroid.
//
// Setup:   createVideoAsteroidMesh(size) — call from createAsteroidMesh
//          when isTargeted=true. The singleton <video> element + VideoTexture
//          are created lazily on first call and shared across all targeted
//          asteroids (one video element drives all 5+ targeted asteroids).
//          Public asset: /public/video/asteroid1.mp4 (copied from user's
//          Downloads folder; ~2.7MB).
//
// Issues:  Phase 7h shipped with `IcosahedronGeometry(radius, 0)`. The user
//          reported "the video does not cover the whole asteroid" — visual
//          inspection of phase-7h-video-close.png confirmed the front face
//          showed the video but the back/side faces were solid black or
//          grey Iron Slag color. Root cause: PolyhedronGeometry (which
//          IcosahedronGeometry inherits from) generates UVs via spherical
//          coordinates of each vertex. At detail 0 the icosahedron has only
//          60 unique vertices, so the UVs cluster into 20 tiny triangles
//          in UV space — most of the texture is never sampled. The faces
//          whose UVs fall outside the "used" wedge of the texture either
//          sample an uninitialized region (black) or stretch the texture
//          in a way that makes it look like grey Iron Slag.
//
// Fix:     Phase 7h v3 — Switch from `IcosahedronGeometry(radius, 0)` to
//          `SphereGeometry(radius, 16, 12)`. SphereGeometry uses
//          equirectangular UV projection: U = longitude/2π + 0.5,
//          V = latitude/π + 0.5. This produces UVs that span the FULL 0-1
//          range across the entire sphere, so the 2D video texture wraps
//          perfectly around the surface. Trade-off: the chunky icosahedron
//          silhouette is replaced by a low-poly sphere (16 segments wide ×
//          12 tall = 192 triangles vs the icosahedron's 80). At gameplay
//          camera distance the difference is barely perceptible, and the
//          video coverage is now complete.
//
//          Phase 7h v4 — user reported "It only covers one side of the
//          asteroid". Diagnosis: PBR `MeshStandardMaterial` with
//          `emissive: 0x000000` shades the back hemisphere (away from the
//          directional light) dark even though every face IS sampling
//          the texture. Playwright in-browser pixel sampling confirmed:
//          UV coverage spans full 0-1 range, video brightness is roughly
//          equal across L/M/R at every sampled frame, texture wrap is
//          ClampToEdgeWrapping but the left/right columns of the source
//          MP4 are nearly identical pixels so clamp seams aren't the
//          dominant problem. The visual dark-side is the unlit PBR
//          hemisphere. Fix: boost `emissive` to `0xffffff` with
//          `emissiveIntensity: 1.0` so the material self-illuminates and
//          the video color reads on both sides of the asteroid. PBR
//          shading from the directional light still adds depth/contour
//          to the silhouette, but the back side now reads the texture
//          color regardless of camera/light angle. Standard
//          self-illuminated PBR pattern: emissive drives color, light
//          only adds shading on top.
//
//          Phase 7h v5 — user reported "it look like an all white
//          astroid .. it didnt work" on the v4 result. Root cause: v4
//          kept the texture in BOTH the diffuse `map` slot AND the
//          emissive slot. The Three.js MeshStandardMaterial shader does
//          `finalColor = outgoingLight + totalEmissiveRadiance`
//          (see three.js src/renderers/shaders/ShaderLib/meshphysical.glsl.js,
//          output_fragment chunk). With v4's `map: texture` (white
//          diffuse on the lit hemisphere) + `emissive: 0xffffff` +
//          `emissiveIntensity: 1.0`, the lit side computed:
//            outgoingLight ≈ directional * (white map) ≈ 1.0
//            totalEmissiveRadiance = 1.0
//            finalColor ≈ 2.0  →  tone-mapped to 1.0 = pure white
//          i.e. v4 fixed the dark hemisphere but blew out the lit
//          hemisphere to pure white. The v4 screenshot showed a pale
//          washed-out sphere with no readable video content.
//
//          v5 fixes both hemispheres by routing the video through
//          `emissiveMap` ONLY and setting `color: 0x000000`. With no
//          diffuse map AND a zero color, `outgoingLight ≈ 0` on every
//          face (no BRDF contribution at all). The texture drives
//          `totalEmissiveRadiance` exclusively, and both hemispheres
//          read the video color at full saturation — no additive
//          overshoot, no double-counting.
//
//          Trade-off: no PBR contour from the directional light. The
//          surface reads as a flat video wrap. This is the correct
//          intent for a self-illuminated asteroid (similar pattern to
//          signs, holograms, and CRT screens). The slight loss of
//          silhouette depth is acceptable because the video itself
//          provides the visual interest — we don't need the light to
//          add fake shading on top.
//
//          Phase 7h v6 — User reported v5's sphere still doesn't read
//          as a "real asteroid mesh" (it looks like a sphere with video
//          projected on it). User explicitly requested "square shape .
//          and the video is on each flat side" — we swap SphereGeometry
//          for BoxGeometry and rewrite the UVs to a cube-cross layout
//          so every face shows a UNIQUE 1/4 × 1/3 portion of the video
//          instead of all 6 faces sampling the same texture (which is
//          what default BoxGeometry UVs do — every face gets the full
//          [0,1]² texture, causing visible repetition).
//
//          BoxGeometry face group order is `+X, -X, +Y, -Y, +Z, -Z`
//          (X-first — verified from node_modules/three/src/geometries/
//          BoxGeometry.js:76-81). Each face is a 4-vertex quad with
//          default UVs `(0,1)-(1,1)-(0,0)-(1,0)` (full texture per
//          face). We replace this with the per-face slice table in
//          FACE_UV_RANGES below.
//
//          Cube-cross layout (4 columns × 3 rows):
//                    [ +Y top ]    col 1, row 0
//            [ -X ][ +Z ][ +X ][ -Z ]  cols 0..3, row 1
//                    [ -Y bot ]    col 1, row 2
//
//          Size: side = SIZE_RADIUS[size] * 2. The original Iron Slag
//          asteroid was IcosahedronGeometry(radius), giving a bounding
//          extent of 2r in diameter. v3/v4/v5 SphereGeometry preserved
//          this. A unit cube of side `s` has the same bounding extent
//          as a sphere of radius `s/2`, so `side = 2*radius` keeps the
//          visual size identical to v5. Collision in `asteroid.ts:
//          resolveAsteroidCollision` still keys on `radius` via the
//          SIZE_RADIUS lookup — box bounding sphere matches the
//          original Iron Slag's diameter for world-space parity.
//
//          v5 channel routing (map: null, color: 0x000000, emissiveMap
//          only) is UNCHANGED. The only delta from v5 is geometry
//          class + UV remap. The v5 "no PBR contour from the
//          directional light" trade-off becomes invisible — each
//          box face is intrinsically flat, so the lack of
//          inter-quad PBR smoothing doesn't read as a regression.
//
// Gotchas:
//  - The <video> element must be `muted=true` + `playsinline=true` +
//    `loop=true`. Modern browsers refuse to autoplay audio, and we don't
//    want the video to have sound anyway.
//  - `autoplay=true` ALONE is not enough. Chrome's autoplay policy can
//    still reject playback if the element is `display: none`. We park the
//    video off-screen with `position: absolute; left: -9999px` instead —
//    visually invisible, but the browser considers it visible enough to
//    autoplay. We also call `video.play()` explicitly and swallow the
//    rejection (the rejected-promise is a warning, not fatal).
//  - JSDOM (Vitest's jsdom environment, used in tests/video-asteroid.test.ts)
//    does NOT implement HTMLMediaElement.play() — it returns `undefined`
//    instead of a Promise. We therefore guard `.catch` with a thenable check;
//    real browsers always return a Promise, so this is a no-op in production.
//  - One <video> element shared across N asteroids. NOT one per asteroid —
//    that would mean 5+ simultaneous video decodes.
//  - texture.colorSpace = SRGBColorSpace is REQUIRED for correct color
//    rendering; without it the video looks washed-out gray.
//  - The video file is in /public/video/ so Vite serves it as a static
//    asset at `/video/asteroid1.mp4` (no import needed — direct path).
//  - Dispose: pause() the video, then texture.dispose(). Three.js does NOT
//    auto-pause or auto-dispose video textures on material disposal.
//  - The user said: when shot, "Split/Drop two generated Parts, like it was
//    done before" — splitAsteroid() in asteroid.ts already returns 2
//    normal iron children; no change to split logic needed.
//  - The user said: "It must be made to the same size as the Original
//    Generated Asteroid" — we use SIZE_RADIUS[size] for the SphereGeometry
//    radius, identical to the original IcosahedronGeometry radius.
//  - DO NOT use `require('three')` anywhere — see
//    feedback_require_three_freeze.md (Phase 7b bomb freeze was caused by
//    inline `require('three')` calls).
//  - SphereGeometry's UV coverage is INTRINSIC — every face samples a
//    proper portion of the texture. No need for manual UV remapping.
//  - Phase 7h v6 — BoxGeometry face order is `+X, -X, +Y, -Y, +Z, -Z`
//    (X-first, NOT Z-first). Locked by video-asteroid.test.ts.
//  - Phase 7h v6 — Default BoxGeometry UVs put the FULL texture on every
//    face. The cube-cross remap in remapBoxUVsToCubeCross MUST always
//    run, otherwise the box shows the same video content 6 times.
//  - Phase 7h v6 — Box side = SIZE_RADIUS[size] × 2 (diameter). The
//    collision/visual radius constant stays the same; only the box
//    geometry's world-space extent is doubled.
//  - Phase 7h v6 — Material channel routing (v5 contract) is UNCHANGED:
//    `map: null`, `color: 0x000000`, `emissiveMap: texture` only. Do not
//    re-introduce the diffuse `map` slot or the v4 lit-hemisphere
//    additive-overshoot regression returns.
//  - Phase 7h v6 — UV remap uses `new BufferAttribute(arr, 2)` (matches
//    the crystal-fx.ts:863-865 idiom in this project). Float32BufferAttribute
//    is equivalent but not the project style.
//  - Phase 7h v7 — CRITICAL GOTCHA: BufferGeometry attributes are sized in
//    FLOATS, not items. BoxGeometry has 24 unique vertices (one per
//    face-corner, NOT shared across faces). With itemSize=2 (vec2 UVs),
//    the Float32Array must be `24 × 2 = 48` floats long. An earlier
//    mistake used `new Float32Array(24)` which produced only 12 UV
//    entries (24/2 = 12) — Three.js then read past the buffer for the
//    remaining 12 vertices, sampling garbage UVs (0,0 in adjacent memory)
//    and rendering those faces with whatever texture pixel sits at
//    `(0,0)` — likely a green-dominant region of the source MP4. This
//    was the root cause of the v6 user report "the box is there, but
//    it is all green .. no video". Fix: 48 floats, not 24.
//
//          Phase 7h v11 — User accepted NO34 from the Asteroid Lab as the
//    production port. NO34 = IcosahedronGeometry + emissiveIntensity 1.5
//    + DoubleSide + chroma-key. This is the full port: geometry class
//    swap, brightness boost, two-sided rendering, and green-screen
//    removal all land together.
//
//    Geometry: IcosahedronGeometry(radius, 0) replaces BoxGeometry. The
//    icosahedron's UVs are still clustered (PolyhedronGeometry spherical
//    projection → 20 tiny UV triangles), but with DoubleSide + chroma-
//    key we don't care — the back hemisphere now renders (was culled
//    under FrontSide), and the green-screen pixels are discarded before
//    they reach the framebuffer. The user picked NO34 specifically
//    because DoubleSide prevents the asteroid from "disappearing" when
//    rotating past the camera — a real bug in v3-v10 that the user
//    explicitly called out as the deciding factor ("30 Is Better as it
//    doesnt dissapear as it rotates and is always viewable").
//
//    Brightness: emissiveIntensity 1.0 → 1.5. The Asteroid Lab single-
//    axis sweep (NO31 = 1.2, NO32 = 1.3, NO33 = 1.4, NO34 = 1.5, NO30
//    was 1.0) tested each value against the UnrealBloomPass pipeline.
//    1.5 reads as "clearly bright but not over-bloomed". 1.6 (the next
//    step up) starts saturating into white via bloom + tonemap. 1.5 is
//    the max-safe value.
//
//    DoubleSide: replaces the default FrontSide. With FrontSide the
//    Three.js renderer culls back faces, so when the asteroid rotates
//    and its back hemisphere points at the camera, nothing renders —
//    the asteroid visually "disappears". DoubleSide renders both sides
//    of every triangle, so the silhouette is always present regardless
//    of rotation. The icosahedron's 20 flat faces make this read as a
//    chunky faceted rock that catches highlights from any angle.
//
//    Chroma-key: applyChromaKeyToStandardMaterial(mat) injects a discard
//    for green-dominant pixels via onBeforeCompile, hooked after the
//    <emissivemap_fragment> include in the standard material's fragment
//    shader. The MP4 source video has a flat #107d31 (16,125,48)
//    background — without chroma-keying the entire asteroid reads as a
//    green-tinted rock. The threshold `G - max(R, B) > 0.15` separates
//    background (greenness ≈ 77) from asteroid pixels (greenness ≈ -91)
//    with a wide margin. The helper lives in src/chroma-key.ts
//    (production home, Phase 7h v11) and is also consumed by the test
//    lab at src/test-lab/methods.ts.
//
//    Transparent: `transparent: true` is REQUIRED alongside the chroma
//    inject. Otherwise the discarded fragments would still occlude
//    what's behind the asteroid (no blending happens for fully-opaque
//    geometry with `discard` in the fragment shader — the depth buffer
//    is already written for those fragments by the time the fragment
//    shader runs, so they block sight through the asteroid even though
//    nothing is drawn). With `transparent: true` the renderer keeps
//    discarded fragments from blocking depth-tested geometry behind them.
//
//    v11 DELTA FROM v6:
//      - Geometry: BoxGeometry → IcosahedronGeometry
//      - emissiveIntensity: 1.0 → 1.5
//      - side: FrontSide (default) → DoubleSide
//      - transparent: false (default) → true
//      - applyChromaKeyToStandardMaterial(mat) called after construction
//      - DELETE FACE_UV_RANGES + remapBoxUVsToCubeCross (~55 lines) —
//        icosahedron doesn't need cube-cross UV remap because (a)
//        DoubleSide makes every face visible so the cluster-UV issue
//        reads as "chunky rock with video patches" not "broken box",
//        and (b) chroma-key discards background pixels so any UV
//        stretching outside the texture's green region is invisible.
// ═══════════════════════════════════════════════════════════════════════════

// Path to the MP4 asset — Vite serves /public/video/* at /video/*.
const VIDEO_SRC = '/video/asteroid1.mp4';

// Phase 7h v2 — Chrome's autoplay policy rejects `display: none` videos.
// Park the element off-screen with absolute positioning instead. The
// element is still in the DOM (required for autoplay policies) but
// not visible to the player.
const HIDDEN_VIDEO_STYLE = 'position: absolute; left: -9999px; top: 0; '
  + 'width: 1px; height: 1px; pointer-events: none; opacity: 0;';

/**
 * Singleton HTMLVideoElement shared across all targeted asteroids. Created
 * lazily on first call to `getOrCreateVideo()`. We share ONE video element
 * because:
 *   1. Browsers can decode only a handful of MP4s simultaneously.
 *   2. All targeted asteroids should display the same animation at the
 *      same frame (they're conceptually one "targeted asteroid type").
 *   3. Sharing avoids 5+ separate <video> DOM nodes + 5+ decoder threads.
 */
let sharedVideo: HTMLVideoElement | null = null;
let sharedTexture: VideoTexture | null = null;

/**
 * Lazily create the shared <video> element + VideoTexture. Idempotent —
 * returns the same instances on repeat calls. Only one video element
 * exists per page, ever.
 */
function getOrCreateVideo(): { video: HTMLVideoElement; texture: VideoTexture } {
  if (sharedVideo !== null && sharedTexture !== null) {
    return { video: sharedVideo, texture: sharedTexture };
  }

  const video = document.createElement('video');
  video.src = VIDEO_SRC;
  video.muted = true; // required for autoplay
  video.loop = true;
  video.playsInline = true; // required for iOS Safari
  video.autoplay = true;
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  // Park off-screen (NOT display: none — Chrome autoplay policy rejects
  // hidden elements). The element is in the document but visually invisible
  // to the player. Phase 7h v2.
  video.style.cssText = HIDDEN_VIDEO_STYLE;
  document.body.appendChild(video);

  // Phase 7h v2 — explicitly call play() to satisfy Chrome autoplay policy.
  // Some browsers silently ignore the `autoplay` attribute and need an
  // explicit play() call. We don't await this — the texture will start
  // uploading frames as soon as playback begins (which is immediate for
  // muted videos). A rejection here would mean the browser blocked autoplay
  // entirely; we log and continue, since the video may still play when
  // the user interacts with the page (browser autoplay unlock).
  //
  // Note: JSDOM (used in tests/video-asteroid.test.ts via
  // `// @vitest-environment jsdom`) does not implement HTMLMediaElement.play()
  // — it returns `undefined` instead of a Promise. We therefore guard the
  // `.catch` chain with a thenable check so tests don't blow up; real browsers
  // always return a Promise here.
  const playResult = video.play();
  if (playResult && typeof playResult.catch === 'function') {
    playResult.catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[video-asteroid] autoplay rejected:', err);
    });
  }

  const texture = new VideoTexture(video);
  texture.colorSpace = 'srgb'; // correct color rendering for video
  // Linear filter so the video doesn't pixelate when scaled up on the mesh.
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false; // video textures don't need mipmaps

  sharedVideo = video;
  sharedTexture = texture;

  return { video, texture };
}

/**
 * Build a Group containing an IcosahedronGeometry wrapped with the shared
 * video texture. Phase 7h v11 — replaces v6's BoxGeometry + cube-cross UV
 * remap with the lab-winning NO34 stack:
 *   - IcosahedronGeometry(radius, 0) — chunky 20-face faceted rock
 *   - emissiveIntensity 1.5 — max-safe brightness (1.6 over-blooms)
 *   - side: DoubleSide — back hemisphere always renders (no rotation
 *     disappearance)
 *   - transparent: true + applyChromaKeyToStandardMaterial — discards
 *     the green-screen background pixels from the MP4
 *
 * Public API signature unchanged from v3/v4/v5/v6 — collision radius
 * (SIZE_RADIUS[size]) and userData shape are preserved so call sites in
 * createAsteroidMesh / disposeAsteroidMesh don't need updates.
 */
export function createVideoAsteroidMesh(size: AsteroidSize): Group {
  const radius = SIZE_RADIUS[size];
  const { texture } = getOrCreateVideo();

  // Phase 7h v11: IcosahedronGeometry replaces BoxGeometry. The icosahedron's
  // UVs are clustered (PolyhedronGeometry spherical projection → 20 small UV
  // triangles instead of the full texture), but with DoubleSide + chroma-key
  // this reads as a chunky faceted rock, not as the "video missing on the
  // back" bug from v3. Detail=0 → 60 vertices / 80 faces; matches the
  // silhouette of the original Iron Slag asteroid that v3 swapped away from.
  const geometry = new IcosahedronGeometry(radius, 0);

  // Phase 7h v11 material: emissiveIntensity 1.5 + DoubleSide + transparent +
  // chroma-key. The v5 channel-routing contract (map: null, color: 0x000000,
  // emissiveMap only) is preserved from v6 — only intensity/side/transparency
  // change, plus the chroma-key inject.
  const material = new MeshStandardMaterial({
    // v5 channel routing: emissiveMap drives color, no diffuse contribution.
    color: 0x000000,
    emissive: 0xffffff,
    emissiveIntensity: 1.5,
    emissiveMap: texture,
    flatShading: true,
    // Roughness 0.85 keeps the surface matte — space rock, not polished chrome.
    roughness: 0.85,
    metalness: 0.05,
    // v11: DoubleSide renders both faces of every triangle. Without this the
    // back hemisphere culls out and the asteroid visually "disappears" when
    // rotating past the camera — the deciding-factor bug NO34 was picked for.
    side: DoubleSide,
    // v11: transparent MUST be true so discarded fragments (from chroma-key)
    // don't occlude geometry behind the asteroid. Without this, the depth
    // buffer for discarded fragments is still written and blocks sight-through.
    transparent: true,
  });
  // v11: inject the green-screen discard into the standard material's
  // fragment shader. After this call, any pixel where
  // `G - max(R, B) > 0.15` is dropped before lighting runs.
  applyChromaKeyToStandardMaterial(material);

  const mesh = new Mesh(geometry, material);
  const group = new Group();
  group.add(mesh);

  // Stash the video + texture on userData so disposeAsteroidMesh can pause
  // the video + dispose the texture exactly once when the last asteroid is
  // destroyed. We don't dispose per-asteroid because the texture is shared.
  group.userData.videoAsteroid = {
    video: sharedVideo,
    texture: sharedTexture,
  };

  return group;
}

/**
 * Dispose the shared video + texture. Safe to call multiple times — only
 * the first call actually pauses + disposes. Call from Game.stop() or
 * the equivalent teardown hook.
 */
export function disposeVideoAsteroidResources(): void {
  if (sharedVideo !== null) {
    sharedVideo.pause();
    sharedVideo.src = '';
    if (sharedVideo.parentNode) {
      sharedVideo.parentNode.removeChild(sharedVideo);
    }
    sharedVideo = null;
  }
  if (sharedTexture !== null) {
    sharedTexture.dispose();
    sharedTexture = null;
  }
}