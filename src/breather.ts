import { BreatherZoneState, Vector2 } from './types';
import { ShieldState } from './shield';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Breather Zone System
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Convert collected scrap into a deployable safe zone that recharges
//          shield and boosts score while the ship remains inside.
// Setup: Game owns the BreatherZoneState; updateBreather handles deployment
//        requests, duration countdown, and shield recharge.
// Issues: Without a meter cost, the zone becomes spammable. Without a duration,
//          it becomes a permanent safe corner.
// Fix: Zone requires 8 scrap to deploy, lasts 6 seconds, and is centered on the
//      ship at the moment of activation.
// Gotchas: The zone is fixed in world space; the player can leave it. Shield
//          recharge only applies while the ship is inside the radius.
// ═══════════════════════════════════════════════════════════════════════════

export const BREATHER_METER_COST = 8;
export const BREATHER_ZONE_RADIUS = 4.0;
export const BREATHER_ZONE_DURATION = 6.0;
export const BREATHER_SHIELD_RECHARGE_MULTIPLIER = 5.0;
export const BREATHER_SCORE_MULTIPLIER = 1.5;

export function createBreatherZoneState(): BreatherZoneState {
  return {
    active: false,
    position: { x: 0, y: 0 },
    radius: BREATHER_ZONE_RADIUS,
    durationRemaining: 0,
    meter: 0,
  };
}

export function addToBreatherMeter(zone: BreatherZoneState, amount: number): void {
  zone.meter = Math.min(BREATHER_METER_COST, zone.meter + amount);
}

export function canDeployBreather(zone: BreatherZoneState): boolean {
  return zone.meter >= BREATHER_METER_COST && !zone.active;
}

export function tryDeployBreather(
  zone: BreatherZoneState,
  shipPosition: Vector2,
): boolean {
  if (!canDeployBreather(zone)) return false;

  zone.meter -= BREATHER_METER_COST;
  zone.active = true;
  zone.position = { ...shipPosition };
  zone.durationRemaining = BREATHER_ZONE_DURATION;
  return true;
}

export function isInsideBreatherZone(
  zone: BreatherZoneState,
  position: Vector2,
): boolean {
  if (!zone.active) return false;
  const distance = Math.hypot(position.x - zone.position.x, position.y - zone.position.y);
  return distance <= zone.radius;
}

export function updateBreather(
  zone: BreatherZoneState,
  shield: ShieldState,
  shipPosition: Vector2,
  requestDeploy: boolean,
  deltaTime: number,
): void {
  if (requestDeploy) {
    tryDeployBreather(zone, shipPosition);
  }

  if (!zone.active) return;

  zone.durationRemaining -= deltaTime;
  if (zone.durationRemaining <= 0) {
    zone.active = false;
    return;
  }

  if (isInsideBreatherZone(zone, shipPosition)) {
    // Rapid shield recharge while inside the zone.
    shield.energy = Math.min(1.0, shield.energy + shieldRechargePerSecond(shield) * deltaTime);
  }
}

function shieldRechargePerSecond(shield: ShieldState): number {
  // Mirror the normal recharge curve but accelerated.
  // We approximate by using a fixed recharge rate consistent with shield.ts.
  const baseRecharge = 0.25;
  return baseRecharge * BREATHER_SHIELD_RECHARGE_MULTIPLIER;
}
