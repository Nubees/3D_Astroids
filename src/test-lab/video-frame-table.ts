import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Test Lab Frame-Table Loader (Phase 7h v12.1)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Decode /public/video/asteroid1.mp4 into a single re-uploadable
//          DataTexture whose pixel buffer holds 240 pre-decoded frames in
//          a flat layout (frame i at offset i × size × size × 4). The
//          first `fadeFrames` frames are pre-baked with a seam blend so
//          the wrap from frame N-1 back to frame 0 is visually continuous.
//          Drives the icosahedron mesh's `emissiveMap` directly — the
//          v11 material contract (chroma-key + DoubleSide + transparent +
//          emissive 1.5) is unchanged.
//
// Setup:   Called from `createB3Method()` in methods.ts. Returns a
//          `FrameTable` that includes the texture, frame count, fps, and
//          fade window length. The caller (lab method) re-uploads one
//          frame per render tick via `texture.image.data.set(...)` +
//          `texture.needsUpdate = true`. The icosahedron's UVs sample the
//          full [0,1]² so the material doesn't need to know which frame
//          is current — it just reads the latest uploaded pixels.
//
// Issues:  The MP4 has a non-matching wrap (mean abs diff center 256×256
//          is 54.78 between frame 239 and frame 0; a normal step is
//          ~9-11). The browser's `loop=true` autoplay-seek hitch on
//          `currentTime` reset contributes to the perceived snap. Source-
//          side mitigations (offset start, crossfade window) cannot hide
//          the seam at the perception threshold. The fix has to live in
//          the runtime path.
//
//          v12.0 ADDITIONAL ISSUE — detached video stall: `loadedmetadata`
//          fires after the file header is parsed, but frame pixel data is
//          still pending. A video element created via
//          `document.createElement('video')` + `video.src = src` without
//          DOM attachment or a `play()` call never advances Chrome's
//          demuxer past metadata — the sequential seek loop in Step 3
//          regresses (observed currentTime 6.82 → 4.30 → 4.07 over 90s)
//          and the placeholder cube stays visible because the .then()
//          callback never resolves.
//
// Fix:     Phase 7h v12 — Pre-bake a 240-frame table. For i in
//          [0, fadeFrames), bake
//              frame[i] = (1 - α) × frame[i] + α × frame[N - 1 - i]
//              where α = (i + 1) / fadeFrames
//          After the bake:
//            - frame[0] ≈ 50% blend of frame[0] and frame[N-1]
//            - frame[fadeFrames-1] ≈ 97% blend
//          The wrap from frame[N-1] back to frame[0] shows a fade-in to
//          the seam-blended head instead of a snap. The frame index is
//          driven by `performance.now()` (not `video.currentTime`) so we
//          sidestep the browser's `loop=true` autoplay-seek hitch.
//
//          v12.1 — Force the decode pipeline by appending the <video> to
//          the DOM and calling play()/pause() after `loadedmetadata`.
//          Wait for `canplaythrough` (10s safety timeout) to confirm the
//          full buffer is decoded before starting the sequential seek.
//          This mirrors the working pattern in methods.ts's
//          getSharedVideoTexture() (which uses loop:true + autoplay:true)
//          — without DOM attachment + play() kick, Chrome treats the
//          video as "metadata-only" and seek operations on it are
//          unreliable.
//
//          Per-tick: re-upload one frame via `image.data.set` +
//          `needsUpdate = true`. Modulate `material.emissiveIntensity`
//          from 1.5 → 0 across the fade window (B4 layered in for an
//          extra layer of concealment).
//
// Memory math (corrected from the research agent's estimate):
//   - At 128²: 240 × 128 × 128 × 4 = 15.7 MB (single Uint8Array buffer)
//   - At 256²: 240 × 256 × 256 × 4 = 62.9 MB
//   - At 512²: 240 × 512 × 512 × 4 = 251.7 MB
//   The DataTexture itself only references one frame at a time
//   (256×256×4 = 256 KB), but the full pixel buffer is held in JS memory
//   so we can re-upload any frame on demand. At 512² this exceeds
//   sensible per-asteroid memory on low-end devices. The lab methods
//   load their own size so the user can eyeball cost.
//
// Gotchas:
//  - Sequential `video.currentTime = i/fps` + `await seeked` is the
//    fragile path. Some browsers coalesce or drop seek events under
//    rapid back-to-back seeks. We accept this in the lab (one-time
//    decode on first call); production v13 may want to migrate to
//    `requestVideoFrameCallback` for reliability.
//  - JSDOM (Vitest's default env) does NOT implement `HTMLVideoElement`
//    seek/load events. Tests for this module must use `@vitest-environment
//    jsdom` but mark decode-dependent tests as `it.skip` or stub the
//    video element. (We don't write unit tests for v12 — the lab is the
//    verification surface.)
//  - `AbortSignal` handling: if the signal aborts mid-decode, we reject
//    with `DOMException('Aborted', 'AbortError')`. The caller (lab method)
//    catches this in `update()` and leaves the placeholder visible.
//  - The `transparent: true` requirement on the MeshStandardMaterial is
//    the caller's responsibility (matches `applyChromaKeyToStandardMaterial`
//    contract). The DataTexture itself doesn't care.
//  - Texture color space MUST be sRGB or the video looks washed-out gray.
//  - We park the temp <video> off-screen with the same HIDDEN_VIDEO_STYLE
//    as the production code in src/video-asteroid.ts. We don't append
//    the element to the document body — `loadedmetadata` fires from
//    attaching the src alone, no DOM presence needed.
// ═══════════════════════════════════════════════════════════════════════════

export interface FrameTableOptions {
  /** Target square size per frame (128 / 256 / 512). */
  targetSize: number;
  /** Number of frames to cross-blend at the seam. Default 12 (0.5s @ 24fps). */
  fadeFrames?: number;
  /** Optional cancellation. Decoding stops at the next frame boundary. */
  signal?: AbortSignal;
  /**
   * Optional crop rectangle in source-pixel coordinates of the 1280×720
   * MP4. When set, each frame is sampled from `cropRegion` of the source
   * instead of the full frame. Used by lab method NO41 to crop out the
   * green-screen border so the asteroid body fills the texture.
   *
   * Coordinates are in source pixels: x ∈ [0, 1280], y ∈ [0, 720].
   * Defaults to full frame (no crop).
   */
  cropRegion?: { x: number; y: number; width: number; height: number };
}

export interface FrameTable {
  /** Single re-uploadable DataTexture. Holds the current frame's pixels. */
  texture: DataTexture;
  /** Total frames decoded (240 for the asteroid1.mp4 source). */
  frameCount: number;
  /** Source frame rate (24 for the asteroid1.mp4 source). */
  fps: number;
  /** Width of the pre-baked fade window (default 12). */
  fadeFrames: number;
  /** Resolved decode size (echoes opts.targetSize). */
  size: number;
  /**
   * Full flat pixel buffer — all frameCount × size × size × 4 bytes.
   * Frame i lives at offset [i × size × size × 4, (i+1) × size × size × 4).
   * Cached on the table so per-tick re-uploads are a cheap `subarray`.
   */
  allFrames: Uint8Array;
}

const DEFAULT_FADE_FRAMES = 12;
const VIDEO_FPS = 24;
const HIDDEN_VIDEO_STYLE = 'position:absolute;left:-9999px;top:0;width:1px;'
  + 'height:1px;pointer-events:none;opacity:0;';

/**
 * Async-decode an MP4 into a pre-baked frame table. Returns a FrameTable
 * whose `texture` is updated each tick by the caller. The seam at the
 * loop wrap is hidden via a pre-baked pixel-level blend of the first
 * `fadeFrames` frames against the corresponding tail frames.
 *
 * Throws `DOMException('Aborted', 'AbortError')` if `signal` aborts.
 */
export async function loadVideoFrameTable(
  src: string,
  opts: FrameTableOptions,
): Promise<FrameTable> {
  const { targetSize, fadeFrames = DEFAULT_FADE_FRAMES, signal } = opts;

  if (!Number.isInteger(targetSize) || targetSize < 16 || targetSize > 1024) {
    throw new Error(`video-frame-table: targetSize must be 16..1024, got ${targetSize}`);
  }

  // Step 1 — load metadata via a hidden <video> element. `loadedmetadata`
  // only signals the browser parsed the file header — frame pixel data is
  // still pending. Detached videos (no DOM attachment, no play() call) stall
  // on sequential seek: Chrome's demuxer never advances past metadata, so
  // `seeked` either never fires or fires with stale positions (observed
  // currentTime regressing 6.82 → 4.30 → 4.07 over 90s in v12.0).
  //
  // Phase 7h v12.1 fix: append to DOM + play()/pause() to force the full
  // decode pipeline. Mirrors the working pattern in methods.ts's
  // getSharedVideoTexture() (which uses loop:true + autoplay:true).
  const video = document.createElement('video');
  video.src = src;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  video.style.cssText = HIDDEN_VIDEO_STYLE;

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('error', onError);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const onReady = () => {
      video.removeEventListener('error', onError);
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    };
    const onError = () => {
      video.removeEventListener('loadedmetadata', onReady);
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(new Error(`video-frame-table: failed to load ${src}`));
    };
    video.addEventListener('loadedmetadata', onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
  });

  // Step 1b — attach to DOM + play/pause to kick Chrome into decoding the
  // full buffer. Without this, the sequential seek loop in Step 3 stalls
  // after a few iterations because the demuxer hasn't decoded past the
  // metadata stage. The `canplaythrough` event signals enough data is
  // buffered for uninterrupted playback. 10s safety timeout guards against
  // the rare case where canplaythrough never fires (small mp4, cached, etc).
  document.body.appendChild(video);
  await new Promise<void>((resolve) => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };
    video.addEventListener('canplaythrough', done, { once: true });
    setTimeout(done, 10000);
    const playPromise = video.play();
    if (playPromise) playPromise.catch(() => done());
  });
  video.pause();
  video.currentTime = 0;

  // Step 2 — compute frame count from duration. The asteroid1.mp4 source
  // is exactly 10.000s @ 24fps = 240 frames.
  const fps = VIDEO_FPS;
  const frameCount = Math.round(video.duration * fps);
  if (!Number.isFinite(frameCount) || frameCount <= 0) {
    video.src = '';
    throw new Error(`video-frame-table: invalid duration ${video.duration}`);
  }

  // Step 3 — extract pixels frame by frame via sequential seek +
  // drawImage + getImageData. Sequential seek is known-fragile but
  // acceptable for a one-time decode in the lab. Abort between frames.
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    video.src = '';
    throw new Error('video-frame-table: 2d context unavailable');
  }

  // Optional crop — when set, sample a sub-rectangle of the source
  // (default: full frame). The cropped content is rescaled into the
  // targetSize² canvas. Used by NO41 to crop out the green-screen
  // border so the asteroid body fills every frame.
  const SOURCE_W = video.videoWidth;
  const SOURCE_H = video.videoHeight;
  const crop = opts.cropRegion ?? { x: 0, y: 0, width: SOURCE_W, height: SOURCE_H };
  if (crop.x < 0 || crop.y < 0
    || crop.x + crop.width > SOURCE_W
    || crop.y + crop.height > SOURCE_H) {
    video.src = '';
    throw new Error(`video-frame-table: crop ${JSON.stringify(crop)}`
      + ` exceeds source ${SOURCE_W}x${SOURCE_H}`);
  }

  const pixelsPerFrame = targetSize * targetSize * 4;
  const allFrames = new Uint8Array(frameCount * pixelsPerFrame);

  for (let i = 0; i < frameCount; i++) {
    if (signal?.aborted) {
      video.src = '';
      throw new DOMException('Aborted', 'AbortError');
    }
    // Seek to the exact frame time. `seeked` fires once the browser has
    // decoded the requested frame and applied it to the <video> output.
    await seekTo(video, i / fps);
    // Source rect (crop.x, crop.y, crop.width, crop.height) is rescaled
    // into the targetSize² canvas. The asteroid body now fills the
    // texture when crop is set to the asteroid bounding box.
    ctx.drawImage(
      video,
      crop.x, crop.y, crop.width, crop.height,
      0, 0, targetSize, targetSize,
    );
    const imgData = ctx.getImageData(0, 0, targetSize, targetSize);
    allFrames.set(imgData.data, i * pixelsPerFrame);
  }

  // Step 4 — pre-bake the seam blend. For i in [0, fadeFrames), replace
  // frame[i] with (1 - α) × frame[i] + α × frame[N - 1 - i] where
  // α = (i + 1) / fadeFrames. The result is a head tail that visually
  // matches the actual tail — when the index wraps from N-1 to 0, the
  // user sees a fade-in to the blend, not a snap.
  const fade = Math.min(fadeFrames, frameCount - 1);
  for (let i = 0; i < fade; i++) {
    const alpha = (i + 1) / fade;
    const headOffset = i * pixelsPerFrame;
    const tailOffset = (frameCount - 1 - i) * pixelsPerFrame;
    for (let p = 0; p < pixelsPerFrame; p++) {
      const head = allFrames[headOffset + p];
      const tail = allFrames[tailOffset + p];
      allFrames[headOffset + p] = Math.round((1 - alpha) * head + alpha * tail);
    }
  }

  // Step 5 — build the single re-uploadable DataTexture. We initialize
  // it with the seam-blended frame 0 (which is ~50% of frame 0 + frame
  // N-1) so the first render frame already shows the blended head.
  const initialFrame = allFrames.subarray(0, pixelsPerFrame);
  const texture = new DataTexture(
    initialFrame,
    targetSize,
    targetSize,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  // Step 6 — dispose the <video> element. The decoded frames are all in
  // `allFrames` now; we don't need the <video> any more. It was appended
  // to the DOM in Step 1b to kick the decode pipeline — remove it now.
  video.pause();
  video.removeAttribute('src');
  video.load();
  if (video.parentNode) video.parentNode.removeChild(video);

  return { texture, frameCount, fps, fadeFrames: fade, size: targetSize, allFrames };
}

/**
 * Seek a <video> element to a precise time and wait for the `seeked` event.
 * Throws DOMException('Aborted') if `signal` aborts during the seek.
 */
function seekTo(video: HTMLVideoElement, t: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      video.removeEventListener('seeked', onSeeked);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const onSeeked = () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    if (signal) {
      if (signal.aborted) {
        video.removeEventListener('seeked', onSeeked);
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
    video.currentTime = t;
  });
}
