// NEON HARBOR's tuning table. The simulation uses a fixed 1280x720 logical frame and a 60 Hz
// clock; world coordinates are metres, not screen pixels, until the camera transform is applied.
// Group every number that changes the feel of the harbour here rather than burying it in systems.

// Frame and persistence.
export const FIELD = Object.freeze({ width: 1280, height: 720 });
export const STEP = 1 / 60;
export const STORAGE_KEY = 'neon-harbor.save.v1';
export const SOUND_KEY = 'neon-harbor.sound';

// The generated grid: nine blocks per axis, eight avenues and eight cross streets, and the quay.
export const CITY = Object.freeze({
  blocksX: 9,
  blocksY: 9,
  pitch: 350,
  roadWidth: 92,
  curb: 15,
  worldWidth: 3150,
  worldHeight: 3150,
  dockY: 3150,
  waterEdge: 3290,
  waterBottom: 3610,
  blocks: 81,
});

// Vale on foot, plus the weapon speeds shared by the mission and police systems.
export const PLAYER = Object.freeze({
  radius: 11,
  walk: 122,
  sprint: 194,
  aimWalk: 70,
  turn: 7.2,
  maxHealth: 100,
  maxArmour: 75,
  respawnHealth: 70,
  respawnFee: 220,
  footshotRange: 430,
  pistolRange: 680,
  pistolCooldown: 0.24,
  fistCooldown: 0.38,
  fistRange: 34,
  fistDamage: 28,
  bulletDamage: 38,
});

export const PLAYER_CAR = Object.freeze({ body: '#dfff3f', rim: '#071016', stripe: '#f6ffe0', marker: '#fff46b' });

// The three vehicle archetypes: the coupe Vale starts in, the cargo van, and the division's Tern.
export const VEHICLE = Object.freeze({
  kestrel: {
    name: 'Kestrel coupe', length: 75, width: 35, maxSpeed: 290, reverse: 92,
    accel: 168, brake: 330, drag: 0.72, steer: 2.5, grip: 8.6,
    health: 165, mass: 0.92, headlights: 195, color: '#c53d5f',
  },
  bream: {
    name: 'Bream van', length: 94, width: 42, maxSpeed: 215, reverse: 78,
    accel: 126, brake: 255, drag: 0.62, steer: 1.8, grip: 6.8,
    health: 245, mass: 1.35, headlights: 172, color: '#7d9f92',
  },
  tern: {
    name: 'Tern police cruiser', length: 80, width: 38, maxSpeed: 310, reverse: 95,
    accel: 185, brake: 350, drag: 0.75, steer: 2.42, grip: 8.8,
    health: 230, mass: 1.1, headlights: 208, color: '#e8e4d2',
  },
});

// Division response: sight radius, spawn ring, decay and the star labels shown on the HUD.
export const WANTED = Object.freeze({
  max: 5,
  decayAfter: 9,
  decayRate: 0.12,
  sightRadius: 510,
  spawnRadius: 760,
  maxPolice: 9,
  stars: ['clear', 'watch', 'pursuit', 'three stars', 'citywide', 'lockdown'],
});

// Civilian traffic density, lane offset and the palette used by ambient cars.
export const TRAFFIC = Object.freeze({
  count: 38,
  laneOffset: 21,
  cruise: 76,
  accel: 54,
  brake: 240,
  reaction: 110,
  hornDistance: 68,
  despawnFar: 1550,
  colors: ['#b54a54', '#d4b16d', '#547c8d', '#7d678d', '#b9b3a6', '#476d59', '#b77449'],
});

// Pedestrian density and the coat palette; the simulation uses these colours per seeded walker.
export const PEDESTRIAN = Object.freeze({
  count: 58,
  walkSpeed: 34,
  fleeSpeed: 88,
  radius: 7,
  crossChance: 0.35,
  palette: ['#d5b08a', '#9fb5bf', '#c69a68', '#ddc6b6', '#a37b85', '#80959a', '#d7a34e'],
});

export const MISSION_START = Object.freeze({ x: 820, y: 1566 });
export const HOSPITAL = Object.freeze({ x: 2266, y: 1916, name: 'St. Orra Hospital' });
export const SAFEHOUSE = Object.freeze({ x: 820, y: 1566, name: 'Vale\'s room, Lantern Ward' });

// One palette for the wet, neon-lit port. HUD colours are deliberately separate from world light.
export const PALETTE = Object.freeze({
  void: '#05080f',
  asphalt: '#111a24',
  asphaltLight: '#172430',
  lane: '#c9b879',
  sidewalk: '#242d34',
  curb: '#3a474e',
  water: '#061d2b',
  waterLight: '#0c3b4b',
  building: '#16212c',
  buildingTop: '#202e39',
  glass: '#153447',
  window: '#f2be69',
  windowCool: '#8fcfd6',
  neonPink: '#ff3e8f',
  neonCyan: '#39e9ed',
  neonAmber: '#ffb24e',
  neonViolet: '#9d7bff',
  marker: '#ffcf4a',
  police: '#4b9be8',
  policeRed: '#ed4b54',
  hud: 'rgba(5, 10, 18, 0.82)',
  hudEdge: 'rgba(97, 218, 225, 0.32)',
  text: '#edf8fa',
  muted: '#8fa8b2',
  danger: '#ff526b',
  armour: '#5ab6dd',
  health: '#66d492',
  rain: 'rgba(163, 210, 222, 0.28)',
});

export const FONT = '"Arial Narrow", "Roboto Condensed", "Segoe UI", sans-serif';
export const DISPLAY_FONT = '"Trebuchet MS", "Segoe UI", sans-serif';

// Camera ease per mode; look-ahead keeps the road visible when Vale is driving.
export const CAMERA = Object.freeze({ follow: 0.14, driveFollow: 0.09, lookAhead: 122, shakeDecay: 6.2 });

// The nine district names indexed by block row and column.
export const DISTRICT_NAMES = [
  ['Anchor Row', 'Kessel Exchange', 'Foundry North'],
  ['Lantern Ward', 'Neon Strip', 'Glass Quay'],
  ['Salt Market', 'Dockline', 'Container Mile'],
];

// Sign copy and tube colours. The generator picks these by seeded random stream.
export const NEON_SIGNS = [
  ['HOTEL', '#ff3e8f'], ['NOODLE', '#39e9ed'], ['PAWN', '#ffb24e'], ['KESSEL', '#9d7bff'],
  ['OPEN', '#ff526b'], ['RADIO 9', '#39e9ed'], ['MOTEL', '#ff3e8f'], ['BAIT', '#ffb24e'],
  ['TIDE', '#67f1c0'], ['JAZZ', '#9d7bff'], ['24H', '#39e9ed'], ['DOCK 7', '#ffb24e'],
];

// Weapon cards shown on the HUD; the world uses the cooldown values directly.
export const WEAPONS = Object.freeze({
  fists: { name: 'FISTS', rounds: Infinity, cooldown: PLAYER.fistCooldown },
  pistol: { name: 'PISTOL', rounds: 36, cooldown: PLAYER.pistolCooldown },
});
