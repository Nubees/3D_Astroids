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
  // Strength is kept moderate so the bloom feels like energy bleed rather than
  // an over-exposed halo. Threshold is low so even the dim shield pulses bloom.
  // Phase 6c3 revert: threshold 0.35 → 0.15, strength 0.4 → 0.55. The
  // Phase 6c2 dim values were needed because yellow arcs were drawn over
  // a bright cyan core and bloomed into a white-out. Phase 6c3 uses
  // white-hot bolts on a bright cyan body — both colors bloom against
  // each other naturally without needing dim suppression.
  const width = renderer.domElement.clientWidth;
  const height = renderer.domElement.clientHeight;
  const bloomPass = new UnrealBloomPass(
    new ThreeVector2(width, height),
    0.55,
    0.35,
    0.15,
  );
  composer.addPass(bloomPass);

  return {
    composer,
    dispose: (): void => {
      composer.dispose();
    },
  };
}
