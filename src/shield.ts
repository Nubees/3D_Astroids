import { ShipState } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shield System
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Provide a panic shield that absorbs one otherwise-lethal hit.
// Setup: Game owns the shield state and queries it during ship-asteroid collision.
// Issues: Without a cooldown the shield becomes a permanent invulnerability button.
// Fix: Shield has a maximum duration, a cooldown, and a charge/energy bar that
//      depletes while active and regenerates while inactive.
// Gotchas: The shield should not prevent normal movement or firing. Activation
//          is a single-frame input pulse; holding the key drains the bar but does
//          not extend protection beyond the resource limit.
// ═══════════════════════════════════════════════════════════════════════════

export const SHIELD_MAX_ENERGY = 1.0;
export const SHIELD_DRAIN_PER_SECOND = 0.6;
export const SHIELD_RECHARGE_PER_SECOND = 0.25;
export const SHIELD_COOLDOWN = 2.0;

export interface ShieldState {
  energy: number;
  active: boolean;
  cooldownRemaining: number;
  hitAbsorbedThisFrame: boolean;
}

export function createShieldState(): ShieldState {
  return {
    energy: SHIELD_MAX_ENERGY,
    active: false,
    cooldownRemaining: 0,
    hitAbsorbedThisFrame: false,
  };
}

export function updateShield(
  shield: ShieldState,
  inputActive: boolean,
  deltaTime: number,
): void {
  shield.hitAbsorbedThisFrame = false;
  shield.cooldownRemaining = Math.max(0, shield.cooldownRemaining - deltaTime);

  const canActivate = shield.cooldownRemaining <= 0 && shield.energy > 0.05;
  shield.active = inputActive && canActivate;

  if (shield.active) {
    shield.energy = Math.max(0, shield.energy - SHIELD_DRAIN_PER_SECOND * deltaTime);
    if (shield.energy <= 0) {
      shield.active = false;
      shield.cooldownRemaining = SHIELD_COOLDOWN;
    }
  } else {
    shield.energy = Math.min(
      SHIELD_MAX_ENERGY,
      shield.energy + SHIELD_RECHARGE_PER_SECOND * deltaTime,
    );
  }
}

export function absorbHit(shield: ShieldState, _ship: ShipState): boolean {
  if (!shield.active) {
    return false;
  }

  shield.active = false;
  shield.energy = 0;
  shield.cooldownRemaining = SHIELD_COOLDOWN;
  shield.hitAbsorbedThisFrame = true;
  return true;
}
