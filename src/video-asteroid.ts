import {
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { AsteroidSize } from './types';
import { SIZE_RADIUS } from './asteroid';
import { applyChromaKeyToStandardMaterial } from './chroma-key';
import { loadVideoFrameTable, type FrameTable } from './video-frame-table';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Video Asteroid (Phase 7h v14 — Halo + Flash Fixes)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Replace the v11 VideoTexture path for the RED targeted asteroid
//          (isTargeted=true) with a pre-baked 240-frame DataTexture driven
//          by performance.now(). Eliminates the v11 "rough loop" bug
//          caused by the browser's autoplay-seek hitch on `currentTime`
//          reset.
//
//          Why frame-table instead of VideoTexture:
//          - VideoTexture + loop=true: Chrome's autoplay policy resets
//            `currentTime` to 0 at the wrap, which snaps the displayed
//            frame to whatever happened to be decoded at that instant —
//            NOT frame 0 of the source. The user perceived this as
//            "rough looping, not a smooth transition" (v11 user report).
//          - Frame table: we pre-decode all 240 frames once into a
//            DataTexture, drive the index from performance.now(), and
//            wrap the loop in JS. The browser's `currentTime` reset
//            hitch never fires because we don't use the <video> for
//            playback — only for one-time frame extraction.
//
//          Why NO40 (512²) instead of NO38/NO39 (128²/256²):
//          - User explicitly chose NO40 in the lab after side-by-side
//            comparison: "Lets push No40 .. Not Perfect , but it is the
//            best we have .."
//          - 512² gives 4× the texture detail of 256² at 4× the JS
//            buffer cost (~250 MB vs ~63 MB). Per-frame GPU upload is
//            still ~256 KB / frame at 60 fps — acceptable.
//          - "Not Perfect" caveat = the half-round silhouette caused by
//            IcosahedronGeometry auto-UVs spanning [0, 1.088] × [0.176,
//            0.824] while the asteroid body only occupies 39% × 77% of
//            the MP4 frame. Lab variants NO41 (cropped frames),
//            NO42 (UV remap), NO43 (soft chroma-key) exist for a future
//            v14 — NOT ported in v13 per user direction.
//
// Setup:   createVideoAsteroidMesh(size) — call from createAsteroidMesh
//          in src/asteroid.ts when isTargeted=true. Returns a Group
//          with a placeholder material immediately; the v11 contract
//          material is swapped in once the frame table resolves. The
//          game loop calls `tickVideoAsteroid(mesh)` per frame to
//          re-upload the current frame + modulate emissive in the fade
//          window. Public API signature unchanged from v3/v4/v5/v6/v11.
//
//          Public asset: /public/video/asteroid1.mp4 (byte-identical to
//          the user's source file at
//          `C:\Users\User101\Downloads\3d Astroids\Astroids\Astroid1\asteroid1.mp4`,
//          md5 b21b28b1bf71c06e75645ad861e3feb0).
//
// Issues:  Phase 7h v11 (the version before v13) used a shared
//          <video> element + VideoTexture. The `loop=true` autoplay-seek
//          hitch caused the "rough loop" perception. v13 fixes this by
//          replacing the playback path entirely with a pre-baked frame
//          table.
//
//          v13 DELTA FROM v11:
//          - Texture source: VideoTexture → DataTexture (from frame table)
//          - Playback driver: video.currentTime → performance.now()
//          - Loop wrap handling: browser loop → JS-managed wrap with
//            pre-baked seam blend
//          - Per-frame work: automatic VideoTexture upload → explicit
//            `tickVideoAsteroid` call from game.ts update loop
//          - Module singletons: {sharedVideo, sharedTexture} →
//            {sharedTable, sharedTablePromise, sharedAbortController}
//          - userData.videoAsteroid shape: {video, texture: VideoTexture}
//            → {table, mesh, material, t0}
//          - Disposal: pause() + dispose() VideoTexture →
//            abortController.abort() + DataTexture.dispose()
//
//          v11 CONTRACT PRESERVED VERBATIM:
//          - Geometry: IcosahedronGeometry(radius, 0)
//          - Material: MeshStandardMaterial with color 0x000000,
//            emissive 0xffffff, emissiveIntensity 1.5,
//            flatShading: true, roughness: 0.85, metalness: 0.05,
//            side: DoubleSide, transparent: true
//          - Chroma-key: applyChromaKeyToStandardMaterial(mat) called
//            after material construction (v14 adds threshold=0.10 param)
//          - texture in emissiveMap slot ONLY (v5 channel routing)
//
//          v14 DELTA FROM v13 (Phase 7h v14 — halo + flash fixes):
//          - Chroma-key threshold: hardcoded 0.15 → CHROMA_KEY_THRESHOLD
//            module constant (0.10). Kills the rotation-persistent
//            green halo on the asteroid caused by bilinear sampling at
//            icosahedron triangle edges. The halo was a v13 regression
//            that the user reported as "green background ... all good".
//          - Placeholder visibility: visible (0x223355 dark-blue shows
//            for ~1s on fresh spawn) → hidden (visible=false until the
//            live material swap fires). Kills the first-second
//            placeholder flash. The mesh stays in the scene graph (just
//            not rendered) so position/rotation still update.
//          - tickVideoAsteroid: added `if (!mesh.visible) return;`
//            early-out — defensive, skips per-frame DataTexture upload
//            for any hidden mesh.
//          - Module-level constant: CHROMA_KEY_THRESHOLD = 0.10 added
//            next to DECODE_SIZE for visibility in code review.
//
//          v13+v11 contracts PRESERVED VERBATIM:
//          - Frame-table decode: same loadVideoFrameTable singleton
//          - Per-frame texture upload + fade modulation: same
//          - Disposal: same abortController + DataTexture.dispose
//          - userData.videoAsteroid shape: same {table, mesh, material, t0}
//
// Gotchas:
//  - v14: mesh.visible is FALSE at construction time. The first tick
//    after the table resolves sets visible=true. Calling tickVideoAsteroid
//    before the resolve is a no-op (mesh visible check + table null
//    check both bail).
//  - v14: CHROMA_KEY_THRESHOLD = 0.10 — tightening too much (e.g. 0.05)
//    starts rejecting asteroid body pixels if the source MP4 ever shifts.
//    0.10 keeps a 0.05 unit buffer while catching bilinear-blend edges.
//    See src/chroma-key.ts My Rules block for the full envelope.
//  - The frame table decode is async. createVideoAsteroidMesh returns
//    IMMEDIATELY with a placeholder (now invisible) material. The v11
//    contract material is swapped in once the table resolves AND
//    visible=true is set. Game.ts must call `tickVideoAsteroid(mesh)`
//    per frame regardless — the helper bails out early if hidden or if
//    `userData.videoAsteroid.material` is null.
//  - The frame table is SHARED across all targeted asteroids (one
//    singleton `FrameTable`, same pattern as v11's shared VideoTexture).
//    Disposing it on per-mesh disposal would blank every other live
//    targeted asteroid. The shared table is freed only on
//    `Game.stop()` via `disposeVideoAsteroidResources()`.
//  - `tickVideoAsteroid` stores `t0 = performance.now()` on
//    `userData.videoAsteroid.t0` at first call, not at mesh creation.
//    This means the asteroid's animation starts at "first tick after
//    the table resolves" rather than "mesh creation time" — but
//    visually indistinguishable because the placeholder material was
//    showing until the table resolved anyway (now invisible in v14).
//  - Per-frame texture upload: at 512² × 4 bytes = 1 MB copy per frame
//    PER ASTEROID. With 5 targeted asteroids on screen at 60 fps that's
//    5 MB/frame for the texture upload path alone. This is the
//    primary cost of v13 vs v11 — the user accepted this trade-off in
//    exchange for smooth looping.
//  - `disposeVideoAsteroidResources` aborts the in-flight decode via
//    `AbortController` if the table hasn't resolved yet, then disposes
//    the DataTexture. The abort throws DOMException('Aborted') in the
//    pending `.then()` chain — the placeholder swap path catches and
//    logs it, leaving the placeholder material in place (harmless
//    because the game is stopping anyway). v14: mesh stays invisible
//    after decode failure too (the failure path doesn't set visible=true).
//  - DO NOT use `require('three')` anywhere — see
//    `feedback_require_three_freeze.md`. The v13 file imports
//    `MeshStandardMaterial` (etc) via the existing top-of-file block.
//  - The icosahedron's UVs are still clustered (PolyhedronGeometry
//    spherical projection → 20 small UV triangles), but with DoubleSide
//    + chroma-key this reads as a chunky faceted rock with video
//    patches, not as a "missing video" regression. The half-round
//    silhouette is the accepted v13 trade-off.
//  - JSDOM (Vitest default env) does NOT implement HTMLVideoElement
//    seek/load events or `HTMLCanvasElement.getContext('2d')` fully.
//    Tests for v14 either stub the video element or skip decode-dependent
//    paths with `it.skip`. The lab at /test-lab/asteroid-lab.html is the
//    visual verification surface.
// ═══════════════════════════════════════════════════════════════════════════

// Path to the MP4 asset — Vite serves /public/video/* at /video/*.
const VIDEO_SRC = '/video/asteroid1.mp4';

// Phase 7h v13 — decode size for the production port. User picked NO40
// (512²) from the lab comparator after side-by-side comparison. Memory
// cost: 240 × 512 × 512 × 4 = 251.7 MB JS buffer. See the plan file for
// the full size-vs-memory trade-off matrix.
const DECODE_SIZE = 512;

// Phase 7h v14 — chroma-key threshold lowered from 0.15 to 0.10 to kill
// the rotation-persistent green halo on the asteroid. The halo is caused
// by bilinear sampling at icosahedron triangle edges blending the green
// border of the MP4 frame with the asteroid body, producing intermediate
// greenness values in [0.05, 0.15] — BELOW the v11-v13 0.15 threshold.
// Tightening to 0.10 catches those bilinear-blend edge pixels while
// leaving the asteroid body untouched (asteroid body greenness is ≪ 0.10).
// See src/chroma-key.ts My Rules block for the full envelope analysis.
const CHROMA_KEY_THRESHOLD = 0.10;

/**
 * Singleton FrameTable shared across all targeted asteroids. Created
 * lazily on first call to `getOrCreateFrameTable()`. We share ONE
 * frame table because:
 *   1. The decode is ~250 MB at 512² — running it per-asteroid would
 *      multiply memory by 5+ for no visual gain.
 *   2. All targeted asteroids should display the same animation at the
 *      same frame (they're conceptually one "targeted asteroid type").
 *   3. Sharing avoids redundant decode work — the MP4 is decoded once
 *      and consumed by every targeted asteroid.
 */
let sharedTable: FrameTable | null = null;
let sharedTablePromise: Promise<FrameTable> | null = null;
let sharedAbortController: AbortController | null = null;

/**
 * Lazily create the shared FrameTable. Idempotent — returns the same
 * instance on repeat calls. Only one frame table exists per page, ever.
 *
 * First call kicks off the async decode and returns the in-flight
 * promise. Subsequent calls return the same promise without re-decoding.
 * If a previous decode was aborted (e.g. via disposeVideoAsteroidResources),
 * a new decode is kicked off.
 */
export function getOrCreateFrameTable(): Promise<FrameTable> {
  if (sharedTable !== null) return Promise.resolve(sharedTable);
  if (sharedTablePromise !== null) return sharedTablePromise;

  sharedAbortController = new AbortController();
  sharedTablePromise = loadVideoFrameTable(VIDEO_SRC, {
    targetSize: DECODE_SIZE,
    signal: sharedAbortController.signal,
  }).then((table) => {
    sharedTable = table;
    sharedTablePromise = null;
    return table;
  }).catch((err) => {
    // Reset so a subsequent call can retry. The placeholder swap path
    // catches this error and leaves the placeholder material visible.
    sharedTablePromise = null;
    sharedAbortController = null;
    throw err;
  });

  return sharedTablePromise;
}

/**
 * Shape stashed on `group.userData.videoAsteroid` so `tickVideoAsteroid`
 * and `disposeVideoAsteroidResources` can find the table + material
 * they need without re-deriving them from the mesh tree.
 */
interface VideoAsteroidUserData {
  table: FrameTable | null;
  mesh: Mesh;
  material: MeshStandardMaterial | null;
  /**
   * performance.now() at the moment tickVideoAsteroid first ran.
   * Stored per-mesh (not globally) so multiple asteroids spawned at
   * different times each get their own time origin — preventing a
   * "global clock race" where all asteroids snap to the same frame
   * regardless of when they spawned.
   */
  t0: number;
}

/**
 * Build a Group containing an IcosahedronGeometry wrapped with the v11
 * video material (v13: texture source is DataTexture from frame table).
 *
 * Returns IMMEDIATELY with a placeholder material. The v11 contract
 * material is swapped in asynchronously once the frame table resolves.
 *
 * Phase 7h v11 material contract — UNCHANGED in v13:
 *   - IcosahedronGeometry(radius, 0) — chunky 20-face faceted rock
 *   - emissiveIntensity 1.5 — max-safe brightness (1.6 over-blooms)
 *   - side: DoubleSide — back hemisphere always renders (no rotation
 *     disappearance)
 *   - transparent: true + applyChromaKeyToStandardMaterial — discards
 *     the green-screen background pixels from the MP4
 *
 * Public API signature unchanged from v3/v4/v5/v6/v11 — collision
 * radius (SIZE_RADIUS[size]) and Group shape are preserved so call sites
 * in createAsteroidMesh / disposeAsteroidMesh don't need updates.
 */
export function createVideoAsteroidMesh(size: AsteroidSize): Group {
  const radius = SIZE_RADIUS[size];

  // Phase 7h v13 — IcosahedronGeometry replaces v6's BoxGeometry, same as
  // v11. The icosahedron's UVs are clustered (PolyhedronGeometry spherical
  // projection → 20 small UV triangles instead of the full texture), but
  // with DoubleSide + chroma-key this reads as a chunky faceted rock, not
  // as the "video missing on the back" bug from v3. Detail=0 → 60 vertices
  // / 80 faces; matches the silhouette of the original Iron Slag asteroid.
  const geometry = new IcosahedronGeometry(radius, 0);

  // Phase 7h v14 — placeholder material. Same dark-blue as the lab's
  // createB3Method. Swapped the moment the frame table resolves.
  //
  // v14 HIDES the mesh during decode (visible=false) so the player doesn't
  // see a dark-blue flash for ~1 second on the first targeted-asteroid
  // spawn. The mesh is set visible=true inside the .then() handler when
  // the live v11 contract material is swapped in. tickVideoAsteroid
  // bails out on the visibility flag so we don't waste a per-frame
  // DataTexture upload on an invisible mesh.
  const placeholder = new MeshStandardMaterial({ color: 0x223355 });
  const mesh = new Mesh(geometry, placeholder);
  mesh.visible = false;
  const group = new Group();
  group.add(mesh);

  // Stash refs so tickVideoAsteroid + disposeVideoAsteroidResources can
  // find what they need. `table` and `material` are populated when the
  // decode resolves; `t0` is populated on first tick (after table
  // resolves, so the placeholder material doesn't see an early frame).
  const userData: VideoAsteroidUserData = {
    table: null,
    mesh,
    material: null,
    t0: 0,
  };
  group.userData.videoAsteroid = userData;

  // Kick off the frame-table decode. Failures are silent (placeholder
  // stays) — the user sees a dark blob if the MP4 fails to load. This
  // matches the lab's createB3Method pattern: return immediately, swap
  // material when the table resolves.
  getOrCreateFrameTable().then((table) => {
    // v11 material contract — UNCHANGED in v13. Only the texture source
    // changes (VideoTexture → DataTexture from frame table).
    const mat = new MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xffffff,
      emissiveIntensity: 1.5,
      emissiveMap: table.texture,
      flatShading: true,
      roughness: 0.85,
      metalness: 0.05,
      side: DoubleSide,
      transparent: true,
    });
    // Phase 7h v14 — pass CHROMA_KEY_THRESHOLD (0.10) to kill the
    // rotation-persistent green halo. See src/chroma-key.ts My Rules
    // for the threshold envelope analysis.
    applyChromaKeyToStandardMaterial(mat, CHROMA_KEY_THRESHOLD);
    mesh.material = mat;
    // Phase 7h v14 — unhide the mesh NOW that the live material is in
    // place. The mesh was hidden at construction time to suppress the
    // first-second dark-blue placeholder flash.
    mesh.visible = true;
    userData.table = table;
    userData.material = mat;
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[video-asteroid] frame-table decode failed:', err);
  });

  return group;
}

/**
 * Per-frame tick. The game loop calls this for every asteroid mesh in
 * updateAsteroids() (src/game.ts). Re-uploads the current frame into
 * the shared DataTexture and modulates `emissiveIntensity` across the
 * pre-baked fade window.
 *
 * Bails out early if the frame table hasn't resolved yet (placeholder
 * material is still in place — caller doesn't need to special-case).
 */
export function tickVideoAsteroid(mesh: Group, clockMs?: number): void {
  const stash = mesh.userData.videoAsteroid as VideoAsteroidUserData | undefined;
  if (stash === undefined) return;
  // Phase 7h v14 — skip the per-frame work if the mesh is hidden. v14 sets
  // visible=false until the live material swaps in (kills first-second
  // placeholder flash). This is also a general safety: any hidden mesh
  // (e.g. parent group .visible=false) skips the DataTexture upload.
  if (!mesh.visible) return;
  const { table, material } = stash;
  if (table === null || material === null) return; // table still decoding

  // First-tick bookkeeping: latch the time origin so each asteroid has
  // its own clock (not shared with other asteroids or with the moment
  // of mesh creation, which could be many seconds earlier).
  const now = clockMs ?? performance.now();
  if (stash.t0 === 0) stash.t0 = now;
  const t0 = stash.t0;

  const u = ((now - t0) / 1000) * table.fps;
  const i = Math.floor(u) % table.frameCount;
  const pixelsPerFrame = table.size * table.size * 4;
  const offset = i * pixelsPerFrame;
  // Re-upload the current frame into the shared DataTexture. The
  // icosahedron's UVs already span [0,1]², so the material doesn't
  // need to know which frame is current. `image.data` is typed as
  // nullable by Three.js but we constructed it ourselves with a
  // non-null Uint8Array, so the assertion is safe.
  table.texture.image.data!.set(
    table.allFrames.subarray(offset, offset + pixelsPerFrame),
  );
  table.texture.needsUpdate = true;
  // B4 layered on: dim the emissive in the pre-baked fade window so
  // the seam blend reads even smoother. Fades from 1.5 → 0 across
  // the first `fadeFrames` frames after the wrap.
  if (i < table.fadeFrames) {
    material.emissiveIntensity = 1.5 * (1 - i / table.fadeFrames);
  } else {
    material.emissiveIntensity = 1.5;
  }
}

/**
 * Dispose the shared frame table. Safe to call multiple times — only
 * the first call actually aborts the decode + disposes the DataTexture.
 * Call from Game.stop() or the equivalent teardown hook.
 *
 * Phase 7h v13 — replaces v11's pause-video + dispose-VideoTexture path
 * with abort-decode + dispose-DataTexture. Same external contract: free
 * GPU resources for the video asteroid type.
 */
export function disposeVideoAsteroidResources(): void {
  // Step 1 — abort any in-flight decode. The pending `.then()` in
  // `getOrCreateFrameTable` will reject with DOMException('Aborted').
  // The placeholder swap path catches that error silently.
  if (sharedAbortController !== null) {
    sharedAbortController.abort();
    sharedAbortController = null;
  }
  sharedTablePromise = null;

  // Step 2 — dispose the DataTexture if the decode completed before the
  // abort fired. We don't need to free the underlying Uint8Array — JS GC
  // handles that once the FrameTable reference drops.
  if (sharedTable !== null) {
    sharedTable.texture.dispose();
    sharedTable = null;
  }
}