import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Video Frame Table Loader (Phase 7h v13)
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
// Setup:   Called from `getOrCreateFrameTable()` in src/video-asteroid.ts.
//          Returns a `FrameTable` that includes the texture, frame count,
//          fps, fade window length, and the full pixel buffer (so per-tick
//          re-uploads are a cheap `subarray`). The first call kicks off
//          the async decode; subsequent calls return the same promise.
//
//          Production contract:
//          - `loadVideoFrameTable(src, { targetSize, fadeFrames?, signal? })`
//          - `FrameTable` is exported with the SAME shape as the lab copy
//            in src/test-lab/video-frame-table.ts. Lab consumer code is
//            unaffected.
//
//          Issues (history):
//          - Phase 7h v11 used VideoTexture + loop=true. User reported
//            "rough looping, not a smooth transition" — root cause was
//            the browser's autoplay-seek hitch on `currentTime` reset.
//          - Phase 7h v12.0 attempted sequential seek via detached <video>
//            element. Failed: Chrome never advanced past metadata when
//            the element was detached (no DOM, no play() call). Seek
//            regressed (currentTime 6.82 → 4.30 → 4.07 over 90s).
//          - Phase 7h v12.1 fix: append <video> to DOM + play()/pause()
//            after loadedmetadata + await canplaythrough (with 10s
//            timeout) — mirrors the working pattern in
//            methods.ts:getSharedVideoTexture().
//
//          v13 — production port of lab's NO40 (512²). The algorithm
//          matches the v12 lab helper byte-for-byte (same seam blend
//          formula, same DOM-attach trick, same canplaythrough wait).
//          Production consumers don't pass `cropRegion` — v13 ships the
//          full MP4 frame. The half-round silhouette is accepted by the
//          user (NO41/NO42/NO43 cropped/UV/soft-key variants exist in
//          the lab for a future v14 if desired).
//
//          Memory math (from v12 research agent, corrected):
//          - At 128²: 240 × 128 × 128 × 4 = 15.7 MB JS buffer.
//          - At 256²: 240 × 256 × 256 × 4 = 62.9 MB JS buffer.
//          - At 512² (v13 production pick): 240 × 512 × 512 × 4 = 251.7 MB.
//            Per-frame GPU upload: 256 KB (acceptable).
//          The DataTexture itself only references one frame at a time
//          (256 KB on the GPU), but the full pixel buffer is held in JS
//          memory so we can re-upload any frame on demand.
//
// Gotchas:
//  - Sequential `video.currentTime = i/fps` + `await seeked` is the
//    fragile path. Some browsers coalesce or drop seek events under
//    rapid back-to-back seeks. We accept this for a one-time decode on
//    first call. Future migrations to `requestVideoFrameCallback` are
//    tracked but not in scope for v13.
//  - `AbortSignal` handling: if the signal aborts mid-decode, we reject
//    with `DOMException('Aborted', 'AbortError')`. The caller
//    (`getOrCreateFrameTable` in src/video-asteroid.ts) catches this in
//    the placeholder swap path and leaves the placeholder visible.
//  - `transparent: true` requirement on the MeshStandardMaterial is the
//    caller's responsibility (matches `applyChromaKeyToStandardMaterial`
//    contract). The DataTexture itself doesn't care.
//  - Texture color space MUST be sRGB or the video looks washed-out gray.
//  - We park the temp <video> off-screen with the same HIDDEN_VIDEO_STYLE
//    as the production code in src/video-asteroid.ts. We do append to
//    the document body — `loadedmetadata` fires from attaching the src
//    alone, but `canplaythrough` requires DOM attachment + play() kick
//    (see Phase 7h v12.1 fix above).
//  - The `loadVideoFrameTable` export signature is identical to the lab
//    copy so a future v14 could `git mv` the lab file to production if
//    the duplication becomes bothersome. v13 keeps them separate to
//    avoid coupling lab consumers (NO41/NO42/NO43 use cropRegion) with
//    production.
// ═══════════════════════════════════════════════════════════════════════════

export interface FrameTableOptions {
  /** Target square size per frame (128 / 256 / 512). */
  targetSize: number;
  /** Number of frames to cross-blend at the seam. Default 12 (0.5s @ 24fps). */
  fadeFrames?: number;
  /** Optional cancellation. Decoding stops at the next frame boundary. */
  signal?: AbortSignal;
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
  // Phase 7h v12.1 fix: append to DOM + play()/pause() to kick Chrome into
  // decoding the full buffer. Without this, the sequential seek loop in
  // Step 3 stalls after a few iterations.
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
  // full buffer. The `canplaythrough` event signals enough data is buffered
  // for uninterrupted playback. 10s safety timeout guards against the rare
  // case where canplaythrough never fires (small mp4, cached, etc).
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
  // acceptable for a one-time decode. Abort between frames.
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    video.src = '';
    throw new Error('video-frame-table: 2d context unavailable');
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
    ctx.drawImage(video, 0, 0, targetSize, targetSize);
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