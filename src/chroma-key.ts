import type { MeshStandardMaterial } from 'three';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Chroma-Key Helpers (Phase 7h v11)
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
//              (Phase 7h v11). Calls applyChromaKeyToStandardMaterial on
//              the MeshStandardMaterial wrapping the IcosahedronGeometry.
//          (2) src/test-lab/methods.ts — NO21-NO37 lab methods. Same
//              helper, imported from here so test-lab and production
//              share the implementation. (Earlier Phase 7h v9 had a
//              copy in src/test-lab/chroma-key.ts that was deleted when
//              this production module landed.)
//          (3) NO20 CanvasTexture path — chromaKeyCanvas walks the
//              pixel buffer after drawImage to zero out alpha for green
//              pixels. Kept here for completeness even though no current
//              production consumer uses it.
//
// Issues:  Without chroma-keying the asteroid reads as a flat green
//          sphere/box. Pixel sampling of the source video at frames
//          0/0.3/0.6/1.0/1.5s confirmed: ~76% of frame pixels are the
//          uniform background color #107d31 = (16, 125, 48). The
//          asteroid pixels are pink/red/blue — greenness (G - max(R,B))
//          for the background ≈ 77, for asteroid pixels ≈ -91. The
//          threshold 0.15 cleanly separates the two with a wide margin.
//
// Fix:     This module provides:
//          - CHROMA_KEY_DISCARD_GLSL: shader snippet for fragment shaders
//            that have a `totalEmissiveRadiance` accumulator (Three.js
//            standard materials).
//          - CHROMA_KEY_DISCARD_FROM_VID_GLSL: variant for fully custom
//            ShaderMaterial methods that sample the video into a local
//            `vid` variable.
//          - applyChromaKeyToStandardMaterial(material): injects the
//            discard into a MeshStandardMaterial via onBeforeCompile,
//            patching right after <emissivemap_fragment>.
//          - chromaKeyCanvas(canvas): per-frame pixel walker for
//            CanvasTexture methods (NO20).
//
// Gotchas:
//  - The threshold is `greenness > 0.15` where greenness = G - max(R, B).
//    0.15 is the in-shader float threshold; the JS canvas walker uses
//    the same threshold but multiplied by 255 to match the [0..255]
//    color channels in ImageData. Both paths agree on what to discard.
//  - For onBeforeCompile, we inject right after <emissivemap_fragment>
//    so the discard runs before the lighting pass — fragments rejected
//    before any expensive lighting math.
//  - Material must have `transparent: true` AFTER chroma-key injection,
//    otherwise the discarded fragments would still occlude what's behind.
//    `applyChromaKeyToStandardMaterial` does NOT set transparent itself
//    — the caller decides (some materials want chroma for logic but
//    blend the result back over a background).
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
 */
export function applyChromaKeyToStandardMaterial(
  material: MeshStandardMaterial,
): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
${CHROMA_KEY_DISCARD_GLSL}`,
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