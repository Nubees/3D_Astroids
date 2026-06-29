// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Chroma-Key Helpers (Phase 7h v9 → v15.0 lab-refresh)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: One-line shader injection that removes the green-screen
//          background from /public/video/asteroid1.mp4, leaving only the
//          asteroid silhouette visible.
//
// Setup:   Three categories of methods in the test lab consume the video
//          differently:
//          (1) ShaderMaterial methods (NO9, NO14, NO16, NO19) — the chroma
//              check is added inline in their fragment shaders via the
//              CHROMA_KEY_DISCARD_GLSL snippet.
//          (2) MeshStandardMaterial methods (NO1, NO2, NO3, NO10, NO15,
//              NO18, NO20, NO30, NO41, NO42) — the chroma check is
//              injected via onBeforeCompile, which patches the standard
//              shader's emissive sampling chunk.
//          (3) Per-frame canvas updates (NO20 — actually a CanvasTexture
//              updated from drawImage) — we walk the canvas pixels after
//              drawImage and zero out alpha for green-dominant pixels.
//
// Issues:  The user reported "the box is there, but it is all green .. no
//          video" — root cause was an MP4 with a flat green-screen
//          background instead of an alpha channel. Pixel sampling
//          confirmed: 76% of frame pixels read `#107d31` (uniform across
//          timestamps 0/0.3/0.6/1.0/1.5s) → this is a chroma-keyable
//          background, not asteroid pixels.
//
// Fix:     This module provides one constant (the discard snippet) and
//          one helper function (the onBeforeCompile injector). All test
//          lab methods that want chroma-keying import from here.
//
// v15.0 DELTA FROM v9 (lab-refresh):
//   - applyChromaKeyToStandardMaterial now accepts an optional
//     `threshold` parameter (default 0.15). Production ported this in
//     v14; the lab was left at the v9 hardcoded 0.15. v15.0 mirrors
//     the production change so the lab's NO41/NO42 can run at the v14
//     threshold (0.10) for the half-round visual refresh.
//   - GLSL snippet is now built inline via `threshold.toFixed(3)`,
//     identical to the production helper. The CHROMA_KEY_DISCARD_GLSL
//     constant is retained for any third-party callers that import it
//     directly — the helper just doesn't reference it anymore.
//
// Gotchas:
//  - The threshold is `greenness > X` where greenness = G - max(R, B) and
//    X is the in-shader float threshold. Default 0.15 matches v9.
//  - For onBeforeCompile, we inject right after <emissivemap_fragment>
//    so the discard runs before the lighting pass — fragments rejected
//    before any expensive lighting math.
//  - If a material has no emissiveMap, totalEmissiveRadiance is just
//    the constant `emissive` color — chroma check sees a small value,
//    no false-positive discards. So applyChromaKeyToStandardMaterial is
//    safe to call on any standard material.
//  - Material must have `transparent: true` AFTER chroma-key injection,
//    otherwise the discarded fragments would still occlude what's behind.
//  - The lab's helper signature mirrors production's exactly; the two
//    files (`src/test-lab/chroma-key.ts` and `src/chroma-key.ts`) are
//    independent. Changing one does not affect the other. The lab is
//    the experimental surface; production is the locked-in target.
// ═══════════════════════════════════════════════════════════════════════════

import type { MeshStandardMaterial } from 'three';

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
 * GLSL snippet that FADES fragment alpha instead of discarding. Pixels
 * with greenness below 0.10 stay fully opaque; pixels above 0.20 become
 * fully transparent; the 0.10-0.20 band is a smoothstep fade. The body
 * of the asteroid stays solid; the green border softly fades to nothing
 * instead of punching a hard hole. Insert AFTER <emissivemap_fragment>
 * so `diffuseColor` is in scope for the alpha modification.
 *
 * Used by lab method NO43 to compare against the hard `discard` variant.
 */
// Note: GLSL ES 3.0 reserves identifiers containing two consecutive
// underscores (`__`) — Three.js's fragment shader compiler enforces this.
// We use a single-underscore prefix (`chromaFade_`) to stay portable.
export const CHROMA_KEY_FADE_GLSL = /* glsl */ `
  float chromaFade_ = 1.0 - smoothstep(0.10, 0.20,
    totalEmissiveRadiance.g - max(totalEmissiveRadiance.r, totalEmissiveRadiance.b));
  diffuseColor.a *= chromaFade_;
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
 *                 are discarded. Default 0.15 (v9-v13 baseline).
 *                 v15.0 lab-refresh threads 0.10 into NO41/NO42 so the
 *                 half-round lab variants can be eyeballed at the v14
 *                 production threshold.
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
 * Inject SOFT chroma-key into a MeshStandardMaterial — fades alpha for
 * green-dominant pixels instead of discarding. The body stays solid;
 * the green border softly fades out so the asteroid looks whole even
 * when backfaces sample the green-screen edge region of the video.
 *
 * Material MUST have `transparent: true` set — the alpha fade is a
 * composite operation that needs blending enabled to be visible.
 *
 * Used by lab method NO43 to compare against the hard-discard variant
 * used by NO30-NO40.
 */
export function applySoftChromaKeyToStandardMaterial(
  material: MeshStandardMaterial,
): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
${CHROMA_KEY_FADE_GLSL}`,
    );
  };
  material.needsUpdate = true;
}

/**
 * Walk a canvas's pixel data and zero out the alpha channel for any
 * pixel that's green-dominant. Use this for CanvasTexture methods (NO20)
 * where the video is sampled per-frame via drawImage. Returns the canvas
 * so callers can chain.
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
