import type { MeshStandardMaterial } from 'three';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Chroma-Key Helpers (Phase 7h v11 — v14 threshold tuning)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: One-line shader injection that removes the green-screen
//          background from /public/video/asteroid1.mp4, leaving only the
//          asteroid silhouette visible. The source MP4 ships with a flat
//          #107d31 green background instead of an alpha channel — every
//          consumer that wants to render the video on a 3D surface needs
//          to discard those green pixels first, or the entire asteroid
//          tints green.
//
// Setup:   Three consumers in this codebase:
//          (1) src/video-asteroid.ts — production RED targeted asteroid
//              (Phase 7h v11→v14). Calls applyChromaKeyToStandardMaterial
//              on the MeshStandardMaterial wrapping the IcosahedronGeometry.
//              v14 passes threshold=0.10 (was 0.15 in v11-v13) to kill the
//              rotation-persistent green halo caused by bilinear sampling
//              at icosahedron triangle edges.
//          (2) src/test-lab/methods.ts — NO21-NO47 lab methods. Same
//              helper, imported from here so test-lab and production
//              share the implementation. Lab variants exercise thresholds
//              0.05, 0.10, 0.15, 0.20 to map the halo fix envelope.
//          (3) NO20 CanvasTexture path — chromaKeyCanvas walks the
//              pixel buffer after drawImage to zero out alpha for green
//              pixels. Kept here for completeness even though no current
//              production consumer uses it.
//
// Issues:  v11-v13: threshold was hardcoded at 0.15. Bilinear sampling at
//          icosahedron triangle edges blended the green border of the MP4
//          frame with the asteroid body, producing intermediate greenness
//          values in [0.05, 0.15] — BELOW the discard threshold so those
//          pixels were NOT discarded. The user saw this as a "rotation-
//          persistent green halo" on the right side of every targeted
//          asteroid. v14 lowers the threshold to 0.10 to catch these
//          bilinear-blend edge pixels without over-discarding the
//          asteroid body (whose greenness is ≪ 0.10).
//
// Fix:     Phase 7h v14 — applyChromaKeyToStandardMaterial now accepts
//          an optional `threshold` parameter (default 0.15, preserves
//          backward compatibility for any third-party callers). The video
//          asteroid module threads 0.10 through to kill the halo. The
//          shader snippet is built dynamically from the threshold rather
//          than pulling from the static CHROMA_KEY_DISCARD_GLSL constant
//          (which remains exported at 0.15 for lab consumers that want
//          the production v11-v13 baseline).
//
// Gotchas:
//  - The threshold is `greenness > X` where greenness = G - max(R, B).
//    X is the in-shader float threshold; the JS canvas walker uses
//    the same 0.15 × 255 threshold as before. Lab / production thresholds
//    only affect the shader path; the canvas path stays at 0.15.
//  - Tightening threshold from 0.15 to 0.10: kills halo, NO visible
//    asteroid damage (asteroid body greenness is ≪ 0.10).
//  - Loosening threshold to 0.20: ALSO kills halo BUT over-discards the
//    asteroid's natural darker greenish regions, producing a tan chrome
//    appearance. Threshold is a coarse knob — both directions kill halo
//    but loosen has visual cost.
//  - For onBeforeCompile, we inject right after <emissivemap_fragment>
//    so the discard runs before the lighting pass — fragments rejected
//    before any expensive lighting math.
//  - Material must have `transparent: true` AFTER chroma-key injection,
//    otherwise the discarded fragments would still occlude what's behind.
//    `applyChromaKeyToStandardMaterial` does NOT set transparent itself
//    — the caller decides.
//  - This is the production home for the helper. Don't re-introduce a
//    copy in src/test-lab/ — the test lab imports from here. Phase 7h v11
//    landed this module as a real src/ concern.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GLSL snippet that discards fragments where the video color is
 * green-dominant. Insert this AFTER the emissive map sample in any
 * fragment shader. The variable name `totalEmissiveRadiance` is the
 * standard Three.js shader's running emissive accumulator at that point.
 */
export const CHROMA_KEY_DISCARD_GLSL = /* glsl */ `
  if (totalEmissiveRadiance.g - max(totalEmissiveRadiance.r, totalEmissiveRadiance.b) > 0.15) discard;
`;

/**
 * GLSL snippet that discards fragments in ShaderMaterial methods that
 * sample the video into a local variable `vid`. Use this instead of
 * CHROMA_KEY_DISCARD_GLSL when the shader is a fully custom
 * ShaderMaterial (where totalEmissiveRadiance doesn't exist).
 */
export const CHROMA_KEY_DISCARD_FROM_VID_GLSL = /* glsl */ `
  if (vid.g - max(vid.r, vid.b) > 0.15) discard;
`;

/**
 * Inject chroma-key into a MeshStandardMaterial so its emissive sampling
 * discards green-dominant video pixels. After calling this, the material
 * should also have `transparent: true` set (caller's responsibility, so
 * they can decide the blend mode).
 *
 * @param threshold Greenness threshold for `discard`. Greenness is
 *                 `G - max(R, B)`. Pixels with greenness > threshold
 *                 are discarded. Default 0.15 (production v13 baseline).
 *                 v14 production lowered this to 0.10 to kill the
 *                 rotation-persistent green halo caused by bilinear
 *                 sampling at icosahedron triangle edges.
 */
export function applyChromaKeyToStandardMaterial(
  material: MeshStandardMaterial,
  threshold: number = 0.15,
): void {
  material.onBeforeCompile = (shader) => {
    const snippet = `if (totalEmissiveRadiance.g - max(totalEmissiveRadiance.r, totalEmissiveRadiance.b) > ${threshold.toFixed(3)}) discard;\n`;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\n${snippet}`,
    );
  };
  material.needsUpdate = true;
}

/**
 * Walk a canvas's pixel data and zero out the alpha channel for any
 * pixel that's green-dominant. Use this for CanvasTexture methods (NO20
 * in the test lab) where the video is sampled per-frame via drawImage.
 * Returns the canvas so callers can chain.
 */
export function chromaKeyCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const W = canvas.width;
  const H = canvas.height;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    // Same threshold as the shader: G - max(R, B) > 0.15 → transparent.
    if (g - Math.max(r, b) > 0.15 * 255) {
      d[i + 3] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}