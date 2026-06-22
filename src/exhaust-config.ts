// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Ship Exhaust Configuration (Derived from GLB Model Vertex Data)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Define where exhaust nozzles sit on each ship and the flame color.
//          Positions derived from actual GLB mesh geometry — exhaust port
//          clusters identified by clustering vertices at the tail edge of each
//          hull.
// Setup: Each nozzle's xPosition is the normalized center (0 = hull left,
//        1 = hull right) computed as
//        (cluster_mean_X - hull_min_X) / hull_width from GLB vertex data.
//        This maps to Three.js Y after catalog.ts -90Z rotation via:
//        yAnchor = (-0.5 + nozzle.xPosition) * hullWidthY
// Issues: Previous config used sprite PNG pixel measurements which live in a
//         completely different coordinate space than the GLB mesh geometry.
//         They never aligned correctly because sprites have padding/dimensions
//         unrelated to mesh geometry.
// Fix: Exhaust port positions computed by clustering rear-edge vertices
//      (bottom 2.5% of hull Y) with a 4% hull-width separation threshold.
//      Cluster center gives xPosition. Flame colors were then matched to the
//      visible engine glow on each ship using the Ship Hangar inspector so the
//      effect reads correctly against the drawn art.
// Gotchas: xPosition must stay inside [0, 1]. flameWidthPercent is the cone
//          radius as a fraction of hull width, not diameter. brightnessMax is
//          capped to 0.95 at runtime to keep additive flames from washing out.
// ═══════════════════════════════════════════════════════════════════════════

export interface ExhaustNozzle {
  xPosition: number;        // 0-1 across hull width from GLB clusters
  flameWidthPercent: number; // flame radius as % of hull width
  color: number;              // hex RGB matching the drawn flame color
  brightnessMin: number;
  brightnessMax: number;
}

export interface ShipExhaustConfig {
  nozzleCount: number;        // mirrors nozzles.length for quick UI use
  nozzles: ExhaustNozzle[];
}

// ─── Ship 1 ShadowWing (1 nozzle) — single exhaust cluster at hull center ───
// GLB analysis: 16 tail-edge vertices all at x=0.0 with zero X span = one port.
const SHIP_1_CONFIG: ShipExhaustConfig = {
  nozzleCount: 1,
  nozzles: [
    {
      xPosition: 0.501,
      flameWidthPercent: 0.09,
      color: 0xccff00,
      brightnessMin: 0.85,
      brightnessMax: 0.95,
    }, // center — brightest yellow-green
  ],
};

// ─── Ship 2 Ironclaw (2 nozzles) — symmetric pair at x=0.402 and x=0.598 ───
// GLB analysis: two distinct port clusters, each 32 tail-edge verts,
// X_span ~1.9% hull.
const SHIP_2_CONFIG: ShipExhaustConfig = {
  nozzleCount: 2,
  nozzles: [
    {
      xPosition: 0.402,
      flameWidthPercent: 0.13,
      color: 0xffaa44,
      brightnessMin: 0.75,
      brightnessMax: 0.95,
    }, // left — orange
    {
      xPosition: 0.598,
      flameWidthPercent: 0.13,
      color: 0xffcc66,
      brightnessMin: 0.80,
      brightnessMax: 1.0,
    }, // right — brighter yellow-orange
  ],
};

// ─── Ship 3 Voidstriker (3 nozzles) — one wide band + two tight ports ───
// GLB analysis: cluster[0] = 48 verts spanning 7.5% hull (wide exhaust band),
// clusters[1,2] = 16 verts each near the right edge.
// Visual tuning: drawn engine glow is yellow-green.
const SHIP_3_CONFIG: ShipExhaustConfig = {
  nozzleCount: 3,
  nozzles: [
    {
      xPosition: 0.300,
      flameWidthPercent: 0.09,
      color: 0xccff00,
      brightnessMin: 0.75,
      brightnessMax: 1.0,
    }, // left — yellow-green
    {
      xPosition: 0.500,
      flameWidthPercent: 0.09,
      color: 0xd4ff1a,
      brightnessMin: 0.80,
      brightnessMax: 0.95,
    }, // center — bright yellow-green
    {
      xPosition: 0.700,
      flameWidthPercent: 0.09,
      color: 0xb8e600,
      brightnessMin: 0.70,
      brightnessMax: 0.90,
    }, // right — darker yellow-green
  ],
};

// ─── Ship 4 Starneedle (2 nozzles) — two ports at x=0.366 and x=0.628 ───
// GLB analysis: two symmetric port clusters, each 16 tail-edge verts.
// Visual tuning: drawn engine glow is pink/purple.
// Per-ship override: base sits 2% hull length closer to center, width is 2%
// of hull width larger than the global 1.20x multiplier.
const SHIP_4_CONFIG: ShipExhaustConfig = {
  nozzleCount: 2,
  nozzles: [
    {
      xPosition: 0.366,
      flameWidthPercent: 0.13,
      color: 0xcc44ff,
      brightnessMin: 0.80,
      brightnessMax: 1.0,
    }, // left — purple
    {
      xPosition: 0.628,
      flameWidthPercent: 0.13,
      color: 0xdd66ff,
      brightnessMin: 0.75,
      brightnessMax: 0.95,
    }, // right — brighter purple
  ],
};

// ─── Ship 5 Cometbreaker (2 nozzles) — pair at x=0.343 and x=0.656 ───
// GLB analysis: left cluster 32 verts (1.6% hull), right cluster 16 verts.
// Visual tuning: drawn engine glow is orange/yellow.
const SHIP_5_CONFIG: ShipExhaustConfig = {
  nozzleCount: 2,
  nozzles: [
    {
      xPosition: 0.343,
      flameWidthPercent: 0.14,
      color: 0xffaa44,
      brightnessMin: 0.75,
      brightnessMax: 1.0,
    }, // left — orange
    {
      xPosition: 0.656,
      flameWidthPercent: 0.14,
      color: 0xffcc66,
      brightnessMin: 0.80,
      brightnessMax: 0.95,
    }, // right — brighter yellow-orange
  ],
};

// ─── Ship 6 Dustdevil (2 nozzles) — pair at x=0.342 and x=0.618 ───
// GLB analysis: left cluster 16 verts, right cluster 32 verts — both clear
// tail-edge ports. Visual tuning: drawn engine glow is cyan/blue.
const SHIP_6_CONFIG: ShipExhaustConfig = {
  nozzleCount: 2,
  nozzles: [
    {
      xPosition: 0.342,
      flameWidthPercent: 0.11,
      color: 0x44ddff,
      brightnessMin: 0.75,
      brightnessMax: 1.0,
    }, // left — cyan
    {
      xPosition: 0.618,
      flameWidthPercent: 0.10,
      color: 0x66eaff,
      brightnessMin: 0.80,
      brightnessMax: 0.95,
    }, // right — brighter cyan
  ],
};

// ─── Ship 7 Shardwing (4 nozzles) — four clusters across full hull width ───
// GLB analysis: all four ports confirmed by vertex density at tail edge.
// Visual tuning: drawn engine glow is orange/yellow.
const SHIP_7_CONFIG: ShipExhaustConfig = {
  nozzleCount: 4,
  nozzles: [
    {
      xPosition: 0.213,
      flameWidthPercent: 0.08,
      color: 0xffaa44,
      brightnessMin: 0.75,
      brightnessMax: 1.0,
    },
    {
      xPosition: 0.361,
      flameWidthPercent: 0.08,
      color: 0xffcc66,
      brightnessMin: 0.80,
      brightnessMax: 0.95,
    },
    {
      xPosition: 0.631,
      flameWidthPercent: 0.08,
      color: 0xffaa44,
      brightnessMin: 0.70,
      brightnessMax: 1.0,
    },
    {
      xPosition: 0.781,
      flameWidthPercent: 0.08,
      color: 0xffcc66,
      brightnessMin: 0.85,
      brightnessMax: 0.95,
    },
  ],
};

// ─── Ship 8 Thunderbolt (2 nozzles) — pair at x=0.378 and x=0.624 ───
// GLB analysis: two symmetric ports, each 16 tail-edge verts with zero X span.
const SHIP_8_CONFIG: ShipExhaustConfig = {
  nozzleCount: 2,
  nozzles: [
    {
      xPosition: 0.378,
      flameWidthPercent: 0.14,
      color: 0xffcc44,
      brightnessMin: 0.75,
      brightnessMax: 1.0,
    }, // left — bright yellow
    {
      xPosition: 0.624,
      flameWidthPercent: 0.14,
      color: 0xddaa22,
      brightnessMin: 0.80,
      brightnessMax: 0.95,
    }, // right — darker gold
  ],
};

// ─── Ship 9 Blackbolt (2 nozzles) — pair at x=0.314 and x=0.697 ───
// GLB analysis: two symmetric ports, each 32 tail-edge verts with slight X span.
const SHIP_9_CONFIG: ShipExhaustConfig = {
  nozzleCount: 2,
  nozzles: [
    {
      xPosition: 0.314,
      flameWidthPercent: 0.13,
      color: 0xffcc00,
      brightnessMin: 0.75,
      brightnessMax: 1.0,
    }, // left — bright yellow
    {
      xPosition: 0.697,
      flameWidthPercent: 0.13,
      color: 0xffdd44,
      brightnessMin: 0.80,
      brightnessMax: 0.95,
    }, // right — even brighter
  ],
};

// ─── Ship 10 Sunrazor (4 nozzles) — two GLB clusters plus two painted inner
// exhaust details flanking them. We add symmetric inner flames so all four
// visible exhausts emit thrust.
const SHIP_10_CONFIG: ShipExhaustConfig = {
  nozzleCount: 4,
  nozzles: [
    {
      xPosition: 0.255,
      flameWidthPercent: 0.07,
      color: 0xcc44ff,
      brightnessMin: 0.75,
      brightnessMax: 1.0,
    }, // inner-left — purple
    {
      xPosition: 0.365,
      flameWidthPercent: 0.08,
      color: 0xdd66ff,
      brightnessMin: 0.80,
      brightnessMax: 0.95,
    }, // outer-left — brighter purple
    {
      xPosition: 0.615,
      flameWidthPercent: 0.08,
      color: 0xdd66ff,
      brightnessMin: 0.80,
      brightnessMax: 0.95,
    }, // outer-right — brighter purple
    {
      xPosition: 0.725,
      flameWidthPercent: 0.07,
      color: 0xaa22ee,
      brightnessMin: 0.75,
      brightnessMax: 1.0,
    }, // inner-right — deeper purple
  ],
};

// ─── Ship 11 Frostfang (4 nozzles) — four ports across full hull width ───
// GLB analysis: all four clusters confirmed, each 32 tail-edge verts at
// distinct positions.
const SHIP_11_CONFIG: ShipExhaustConfig = {
  nozzleCount: 4,
  nozzles: [
    {
      xPosition: 0.209,
      flameWidthPercent: 0.09,
      color: 0xffaa44,
      brightnessMin: 0.75,
      brightnessMax: 1.0,
    }, // left — orange
    {
      xPosition: 0.333,
      flameWidthPercent: 0.09,
      color: 0xffcc66,
      brightnessMin: 0.85,
      brightnessMax: 1.0,
    }, // center-left — brighter
    {
      xPosition: 0.652,
      flameWidthPercent: 0.09,
      color: 0xddaa33,
      brightnessMin: 0.70,
      brightnessMax: 0.95,
    }, // center-right — darker gold
    {
      xPosition: 0.782,
      flameWidthPercent: 0.09,
      color: 0xeebb44,
      brightnessMin: 0.75,
      brightnessMax: 1.0,
    }, // right — brighter
  ],
};

// ─── Ship 12 Emberlance (2 nozzles) — pair at x=0.183 and x=0.794 ───
// GLB analysis: left cluster 32 verts, right cluster 48 verts — outer-edge
// ports wide apart.
const SHIP_12_CONFIG: ShipExhaustConfig = {
  nozzleCount: 2,
  nozzles: [
    {
      xPosition: 0.183,
      flameWidthPercent: 0.11,
      color: 0x44ccff,
      brightnessMin: 0.75,
      brightnessMax: 1.0,
    }, // left — bright cyan
    {
      xPosition: 0.794,
      flameWidthPercent: 0.11,
      color: 0x44bbff,
      brightnessMin: 0.85,
      brightnessMax: 0.95,
    }, // right — brighter cyan
  ],
};

export const SHIP_EXHAUST_CONFIGS: Map<number, ShipExhaustConfig> = new Map([
  [1, SHIP_1_CONFIG],
  [2, SHIP_2_CONFIG],
  [3, SHIP_3_CONFIG],
  [4, SHIP_4_CONFIG],
  [5, SHIP_5_CONFIG],
  [6, SHIP_6_CONFIG],
  [7, SHIP_7_CONFIG],
  [8, SHIP_8_CONFIG], // Ship 8 Thunderbolt — similar to Ship 2, different colors
  [9, SHIP_9_CONFIG],
  [10, SHIP_10_CONFIG],
  [11, SHIP_11_CONFIG],
  [12, SHIP_12_CONFIG],
]);

export const EXHAUST_FLAME_NAME = 'exhaustFlame';
