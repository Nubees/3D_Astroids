import {
  BoxGeometry,
  BufferAttribute,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  VideoTexture,
} from 'three';
import { AsteroidSize } from './types';
import { SIZE_RADIUS } from './asteroid';

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
 * Cube-cross UV layout. Each of the 6 BoxGeometry faces gets a unique
 * 1/4 × 1/3 portion of the [0,1]² texture. BoxGeometry group order is
 * `+X, -X, +Y, -Y, +Z, -Z` (X-first, verified from
 * node_modules/three/src/geometries/BoxGeometry.js:76-81), so this array
 * is keyed by that exact order.
 *
 * Standard cross unwrap (4 columns × 3 rows):
 *            [ +Y top ]    col 1, row 0
 *   [ -X ][ +Z ][ +X ][ -Z ]   cols 0..3, row 1
 *            [ -Y bot ]    col 1, row 2
 *
 * Each entry is [uMin, uMax, vMin, vMax] — the corners of that face's
 * cell in texture space. The remap expands each entry into 4 vertex
 * UVs (one per face-quad corner) when writing the attribute.
 */
const FACE_UV_RANGES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.50, 0.75, 0.333, 0.667], // group 0: +X (right)   — col 2, row 1
  [0.00, 0.25, 0.333, 0.667], // group 1: -X (left)    — col 0, row 1
  [0.25, 0.50, 0.667, 1.000], // group 2: +Y (top)     — col 1, row 0
  [0.25, 0.50, 0.000, 0.333], // group 3: -Y (bottom)  — col 1, row 2
  [0.25, 0.50, 0.333, 0.667], // group 4: +Z (front)   — col 1, row 1
  [0.75, 1.00, 0.333, 0.667], // group 5: -Z (back)    — col 3, row 1
];

/**
 * Rewrite the BoxGeometry's UV attribute so each of the 6 faces samples
 * a unique 1/4 × 1/3 portion of the texture (cube-cross unwrap). Default
 * BoxGeometry UVs put the FULL [0,1]² texture on every face — visible
 * repetition if left unchanged. We replace the UV attribute with the
 * per-face slice table above.
 *
 * Each BoxGeometry face is a 4-vertex quad. Three.js emits the 4 UVs
 * per face in this order (BoxGeometry.js:139-140):
 *   vertex 0 → UV (0, 1)  — top-left  in face-quad local space
 *   vertex 1 → UV (1, 1)  — top-right
 *   vertex 2 → UV (0, 0)  — bottom-left
 *   vertex 3 → UV (1, 0)  — bottom-right
 *
 * So for face `g` with UV range [uMin, uMax, vMin, vMax]:
 *   vertex 0 → (uMin, vMax)  top-left of slice
 *   vertex 1 → (uMax, vMax)  top-right
 *   vertex 2 → (uMin, vMin)  bottom-left
 *   vertex 3 → (uMax, vMin)  bottom-right
 *
 * 24 UVs total (6 faces × 4 vertices × 2 floats). UV remap doesn't
 * touch positions or indices — CCW winding from outside stays correct,
 * backface culling still applies.
 */
function remapBoxUVsToCubeCross(geometry: BoxGeometry): void {
  const uvs = new Float32Array(24);
  for (let face = 0; face < 6; face++) {
    const [uMin, uMax, vMin, vMax] = FACE_UV_RANGES[face];
    const base = face * 8; // each face is 4 vertices × 2 floats = 8 floats
    uvs[base + 0] = uMin;
    uvs[base + 1] = vMax; // vertex 0 top-left
    uvs[base + 2] = uMax;
    uvs[base + 3] = vMax; // vertex 1 top-right
    uvs[base + 4] = uMin;
    uvs[base + 5] = vMin; // vertex 2 bottom-left
    uvs[base + 6] = uMax;
    uvs[base + 7] = vMin; // vertex 3 bottom-right
  }
  // Matches crystal-fx.ts:863-865 idiom: new BufferAttribute(arr, 2)
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
}

/**
 * Build a Group containing a BoxGeometry wrapped with the shared video
 * texture. Same physical bounding extent as the v3-v5 SphereGeometry
 * (side = SIZE_RADIUS[size] × 2 = original IcosahedronGeometry's diameter).
 *
 * Each of the 6 box faces samples a unique 1/4 × 1/3 portion of the
 * video via remapBoxUVsToCubeCross (see FACE_UV_RANGES for the cube-cross
 * table). Default BoxGeometry UVs put the full texture on every face —
 * the remap is mandatory to avoid 6× visible repetition.
 */
export function createVideoAsteroidMesh(size: AsteroidSize): Group {
  const side = SIZE_RADIUS[size] * 2;
  const { texture } = getOrCreateVideo();

  const geometry = new BoxGeometry(side, side, side);
  remapBoxUVsToCubeCross(geometry);
  const material = new MeshStandardMaterial({
    // Phase 7h v5: route the video texture through emissiveMap ONLY, not
    // the diffuse `map` slot. The standard material shader does
    //   finalColor = outgoingLight + totalEmissiveRadiance
    // (see three.js src/renderers/shaders/ShaderLib/meshphysical.glsl.js,
    // output_fragment chunk). With v4's `map: texture` + `emissive: 0xffffff`
    // + `emissiveIntensity: 1.0`, the lit hemisphere received:
    //   outgoingLight ≈ directional * (white map) ≈ 1.0
    //   totalEmissiveRadiance = 1.0
    //   finalColor ≈ 2.0  →  tonemapped to 1.0 = pure white
    // i.e. v4 overshot — fixed the dark side but blew out the lit side.
    //
    // v5 fixes both: `map` stays null (no diffuse contribution at all),
    // `emissiveMap: texture` + `emissive: 0xffffff` + `emissiveIntensity: 1`
    // drive the entire pixel color from the video. PBR lighting still
    // applies BUT `color: 0x000000` zeroes diffuse so `outgoingLight ≈ 0`
    // on both sides, and `totalEmissiveRadiance = texture sample` is the
    // only contribution. The video reads as-is everywhere — no lit-side
    // saturation, no dark-side washout. Trade-off: no PBR contour from
    // the directional light (the surface reads as a flat video wrap),
    // which is the correct intent for a self-illuminated asteroid.
    color: 0x000000,
    emissive: 0xffffff,
    emissiveIntensity: 1.0,
    emissiveMap: texture,
    flatShading: true,
    // Roughness 0.85 keeps the surface matte — space rock, not polished chrome.
    roughness: 0.85,
    metalness: 0.05,
  });
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