import { ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { InputState, MovementMode, ShipState } from './types';
import {
  ArenaBounds,
  DriftConfig,
  updateArenaMovement,
  updateDriftMovement,
  updateShipAim,
} from './movement';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Ship Logic
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Procedural ship mesh + movement and mouse aim.
// Setup: Game creates the mesh and owns the Ship instance.
// Issues: Phase 1 baked arena movement directly into Ship.update. Phase 2 needs
//         to switch between arena and drift movement modes cleanly.
// Fix: Ship.update now accepts a MovementMode and delegates position/velocity
//      math to pure helpers in movement.ts. Aim logic is shared.
// Gotchas: Geometry points up (+Y) by default; rotate -90° around Z so nose is +X.
//          Collision radius is smaller than visual radius for fair near-misses.
//          Ship position is now Vector3; z stays 0 in both modes.
// ═══════════════════════════════════════════════════════════════════════════

export const SHIP_SPEED = 7;
export const SHIP_ACCEL = 12;
export const SHIP_RADIUS = 0.35;
export const SHIP_FIRE_COOLDOWN = 0.154;

export function createShipMesh(): Group {
  const ship = new Group();

  const bodyGeometry = new ConeGeometry(0.5, 1.5, 8);
  const bodyMaterial = new MeshStandardMaterial({ color: 0x00ccff, roughness: 0.4 });
  const body = new Mesh(bodyGeometry, bodyMaterial);
  body.rotation.z = -Math.PI / 2;
  ship.add(body);

  const engineGeometry = new CylinderGeometry(0.2, 0.3, 0.6, 8);
  const engineMaterial = new MeshStandardMaterial({ color: 0x333333 });
  const engine = new Mesh(engineGeometry, engineMaterial);
  engine.rotation.z = -Math.PI / 2;
  engine.position.x = -0.8;
  ship.add(engine);

  return ship;
}

export class Ship {
  state: ShipState;
  fireCooldown = 0;

  constructor(x = 0, y = -5) {
    this.state = {
      position: { x, y, z: 0 },
      velocity: { x: 0, y: 0 },
      aim: { x: 1, y: 0 },
    };
  }

  update(input: InputState, deltaTime: number, mode: MovementMode): void {
    if (mode === MovementMode.ARENA) {
      const bounds: ArenaBounds = { halfWidth: 13, halfHeight: 9 };
      this.state = updateArenaMovement(this.state, input, deltaTime, bounds);
    } else {
      const driftConfig: DriftConfig = { shipSpeed: SHIP_SPEED + 1, shipAccel: SHIP_ACCEL + 2 };
      this.state = updateDriftMovement(this.state, input, deltaTime, driftConfig);
    }

    this.state.aim = updateShipAim(this.state, input);
    this.fireCooldown = Math.max(0, this.fireCooldown - deltaTime);
  }

  canFire(): boolean {
    return this.fireCooldown <= 0;
  }

  resetCooldown(): void {
    this.fireCooldown = SHIP_FIRE_COOLDOWN;
  }
}
