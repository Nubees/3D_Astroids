import { ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { Vector2, ShipState } from './types';
import { InputState } from './input';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Ship Logic
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Runtime ship state and a procedural fallback mesh. External ship
//          models are loaded by the ship catalog module and injected into Game.
// Setup: Game owns the mesh and a Ship instance. The active MovementController
//        mutates ship.state via apply().
// Issues: Phase 1 Ship.update combined movement and aim.
// Fix: Split movement out to controllers; Ship keeps only aim, fire timing,
//      and a dead/respawn flag for the explosion/respawn flow.
// Gotchas: Geometry points up (+Y) by default; rotate -90° around Z so nose is +X.
//          Collision radius is smaller than visual radius for fair near-misses.
// ═══════════════════════════════════════════════════════════════════════════

export const SHIP_RADIUS = 0.35;
export const SHIELD_RADIUS = SHIP_RADIUS * 2.4 * 1.1;
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
  isDead = false;
  respawnTimer = 0;

  constructor(x = 0, y = -5) {
    this.state = {
      position: { x, y },
      velocity: { x: 0, y: 0 },
      aim: { x: 1, y: 0 },
    };
  }

  update(input: InputState, deltaTime: number, fireRateMultiplier = 1): void {
    if (this.isDead) return;

    const aimDx = input.aim.x - this.state.position.x;
    const aimDy = input.aim.y - this.state.position.y;
    const aimLength = Math.hypot(aimDx, aimDy);
    this.state.aim = aimLength > 0
      ? { x: aimDx / aimLength, y: aimDy / aimLength }
      : this.state.aim;

    this.fireCooldown = Math.max(0, this.fireCooldown - deltaTime * fireRateMultiplier);
  }

  canFire(): boolean {
    return !this.isDead && this.fireCooldown <= 0;
  }

  resetCooldown(): void {
    this.fireCooldown = SHIP_FIRE_COOLDOWN;
  }

  markDead(respawnDelay: number): void {
    this.isDead = true;
    this.respawnTimer = respawnDelay;
  }

  markAlive(): void {
    this.isDead = false;
    this.respawnTimer = 0;
    this.state.position = { x: 0, y: 0 };
    this.state.velocity = { x: 0, y: 0 };
    this.state.aim = { x: 1, y: 0 };
    this.fireCooldown = 0;
  }
}
