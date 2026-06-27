import {
  Group,
  IcosahedronGeometry,
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
//          textured IcosahedronGeometry so the asteroid looks like a
//          real video playing on a 3D surface.
//
//          Why MP4 + VideoTexture (not a sprite or animated texture):
//          - User has 2 MP4 files of a rotating asteroid; wants them
//            played in real-time as the mesh surface.
//          - VideoTexture uploads each frame automatically — no manual
//            frame stepping needed.
//          - Wrapping the video on IcosahedronGeometry sized to the
//            original `radius = SIZE_RADIUS[size]` keeps collision and
//            visual size identical to the previous generated asteroid.
//
// Setup:   createVideoAsteroidMesh(size) — call from createAsteroidMesh
//          when isTargeted=true. The singleton <video> element + VideoTexture
//          are created lazily on first call and shared across all targeted
//          asteroids (one video element drives all 5+ targeted asteroids).
//          Public asset: /public/video/asteroid1.mp4 (copied from user's
//          Downloads folder; ~2.7MB).
//
// Issues:  User said "the RED Asteroid that doesn't bump into the other
//          Asteroids" — that's the targeted red iron asteroid (isTargeted=true,
//          color=0xcc4444). Crystals are a separate kind (cyan, CRYSTAL_HEALTH=6)
//          and are NOT replaced — this is only for the targeted red ones.
//
// Fix:     Phase 7h. Replace targeted iron asteroid's IcosahedronGeometry +
//          MeshStandardMaterial with VideoTexture-wrapped variant. State,
//          collision, splitting, health, drop-on-kill, and split-children
//          behavior are unchanged — only the visual mesh swaps.
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
//    Generated Asteroid" — we use SIZE_RADIUS[size] for the IcosahedronGeometry
//    radius, identical to the original.
//  - DO NOT use `require('three')` anywhere — see
//    feedback_require_three_freeze.md (Phase 7b bomb freeze was caused by
//    inline `require('three')` calls).
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
 * video texture. Same physical radius as the original generated asteroid
 * (via SIZE_RADIUS[size]).
 *
 * Detail level 0 = chunky jagged silhouette (matches the original targeted
 * asteroid's 80-triangle look). Higher detail would smooth out the video
 * mapping and lose the "asteroid" feel.
 */
export function createVideoAsteroidMesh(size: AsteroidSize): Group {
  const radius = SIZE_RADIUS[size];
  const { texture } = getOrCreateVideo();

  const geometry = new IcosahedronGeometry(radius, 0);
  const material = new MeshStandardMaterial({
    map: texture,
    // The video provides the color; emissive stays at 0 so the asteroid
    // doesn't glow. We want it to look like a video projected on a rock,
    // not a glowing crystal.
    color: 0xffffff,
    emissive: 0x000000,
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