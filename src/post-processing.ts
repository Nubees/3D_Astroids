import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Scene, PerspectiveCamera, Vector2 as ThreeVector2, WebGLRenderer } from 'three';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Post-Processing
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Add bloom so faint shield pulses and impact glows feel like real
//          energy rather than flat transparent geometry.
// Setup: Composer wraps the renderer; the game loop renders via composer instead
//        of renderer directly.
// Issues: Plain additive blending on the shield could look faint against the
//         dark background without HDR-style glow.
// Fix: Use UnrealBloomPass with a low threshold so only the bright shield rim
//      and impact ripples bloom, while the rest of the scene stays crisp.
// Gotchas: Composer must be resized alongside the renderer. Disposing the
//          composer releases its internal render targets.
// ═══════════════════════════════════════════════════════════════════════════

export interface BloomComposer {
  composer: EffectComposer;
  dispose: () => void;
}

export function createBloomComposer(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
): BloomComposer {
  const composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Resolution, strength, radius, threshold.
  // Phase 6c3 follow-up: threshold 0.15 → 0.35, strength 0.55 → 0.4. The
  // bright bloom (low threshold) bloomed the whole crystal + bolt cluster
  // into a white-out that drowned the actual line work. New threshold is
  // high enough that only the bright bolt endpoints and the very peak of
  // the cyan emissive bloom; the crystal silhouette itself stays crisp.
  const width = renderer.domElement.clientWidth;
  const height = renderer.domElement.clientHeight;
  const bloomPass = new UnrealBloomPass(
    new ThreeVector2(width, height),
    0.4,
    0.35,
    0.35,
  );
  composer.addPass(bloomPass);

  return {
    composer,
    dispose: (): void => {
      composer.dispose();
    },
  };
}
