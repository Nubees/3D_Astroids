import { Scene, PerspectiveCamera, WebGLRenderer } from 'three';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Post-Processing
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Compose the final scene render.
// Setup: The game loop calls composer.render() instead of renderer.render().
// Issues: UnrealBloomPass caused repeated white-out over the bright cyan
//         crystal (emissive peaks ~1.4) regardless of threshold/strength
//         tuning. User explicitly disabled bloom.
// Fix: Skip the EffectComposer pipeline entirely. The renderer draws the
//      scene directly. BloomComposer is kept as a no-op stub so callers
//      don't need to change.
// Gotchas: Removing the composer also removes its resize hookup — any
//          future re-introduction of bloom needs a resize handler too.
// ═══════════════════════════════════════════════════════════════════════════

export interface BloomComposer {
  composer: null;
  dispose: () => void;
}

export function createBloomComposer(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
): BloomComposer {
  // Bloom disabled. The renderer renders the scene directly; we wrap it in
  // a no-op composer stub so call sites that do `composer.render()` work.
  return {
    composer: null,
    dispose: (): void => {
      // No-op.
    },
  };
}
