import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Points,
  PointsMaterial,
} from 'three';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Layered Streaming Starfield
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Provide parallax depth in drift mode and a static star backdrop in
//          arena mode.
// Setup: Game owns a Starfield instance; call `update(dt, mode, driftSpeed)` each
//        frame and toggle `setMode(mode)` when the player switches modes.
// Issues: Phase 1 used a single static Points cloud. Phase 2 needs stars that
//         stream toward the player with layered parallax for 3D forward drift.
// Fix: Replaced with three depth layers. In drift mode each layer moves toward
//      +Z at a speed scaled by its depth. Stars that pass the camera are reset
//      far ahead. In arena mode the starfield slowly rotates/drifts for life.
// Gotchas: Layer ordering matters — faster/closer layers should feel brighter
//          and larger. Use additive-ish colors by varying opacity/size. Reset
//          stars to a random X/Y inside a cylindrical spawn volume so the field
//          never looks like a flat plane.
// ═══════════════════════════════════════════════════════════════════════════

export interface StarfieldLayer {
  readonly count: number;
  readonly depthFactor: number; // 0..1, closer layers move faster
  readonly color: number;
  readonly size: number;
  readonly zRange: number;
  readonly xyRange: number;
}

const LAYERS: readonly StarfieldLayer[] = [
  { count: 400, depthFactor: 1.0, color: 0xffffff, size: 0.12, zRange: 140, xyRange: 60 },
  { count: 300, depthFactor: 0.6, color: 0xaaaaff, size: 0.08, zRange: 180, xyRange: 80 },
  { count: 200, depthFactor: 0.3, color: 0x555588, size: 0.05, zRange: 220, xyRange: 100 },
];

const CAMERA_Z = 20;
const SPAWN_Z = -160;

export class Starfield {
  private readonly group = new Group();
  private readonly points: Points[] = [];
  private readonly layerData: { readonly positions: Float32Array; readonly zRange: number }[] = [];

  constructor() {
    for (const layer of LAYERS) {
      const geometry = new BufferGeometry();
      const positions = new Float32Array(layer.count * 3);
      for (let i = 0; i < layer.count; i += 1) {
        const i3 = i * 3;
        positions[i3] = (Math.random() - 0.5) * layer.xyRange;
        positions[i3 + 1] = (Math.random() - 0.5) * layer.xyRange;
        positions[i3 + 2] = Math.random() * layer.zRange + SPAWN_Z;
      }
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
      const material = new PointsMaterial({
        color: layer.color,
        size: layer.size,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.8,
      });
      const pointCloud = new Points(geometry, material);
      this.group.add(pointCloud);
      this.points.push(pointCloud);
      this.layerData.push({ positions, zRange: layer.zRange });
    }
  }

  getMesh(): Group {
    return this.group;
  }

  update(deltaTime: number, mode: import('./types').MovementMode, driftSpeed: number): void {
    if (mode === 'drift') {
      for (let layerIndex = 0; layerIndex < this.points.length; layerIndex += 1) {
        const layer = LAYERS[layerIndex];
        const positions = this.layerData[layerIndex].positions;
        const zRange = this.layerData[layerIndex].zRange;
        const speed = driftSpeed * layer.depthFactor;
        for (let i = 0; i < layer.count; i += 1) {
          const i3 = i * 3;
          positions[i3 + 2] += speed * deltaTime;
          if (positions[i3 + 2] > CAMERA_Z + 5) {
            positions[i3] = (Math.random() - 0.5) * layer.xyRange;
            positions[i3 + 1] = (Math.random() - 0.5) * layer.xyRange;
            positions[i3 + 2] = SPAWN_Z + Math.random() * zRange;
          }
        }
        this.points[layerIndex].geometry.attributes.position.needsUpdate = true;
      }
    } else {
      // Arena mode: gentle counter-rotation for visual life without 3D streaming.
      this.group.rotation.z += deltaTime * 0.005;
    }
  }
}
