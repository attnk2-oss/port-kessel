// Port Kessel's fixed geography. A 9 by 9 block grid gives eight avenues and eight cross streets,
// a seawall and a container terminal on the south edge, and pockets (parks, plazas, terminals)
// carved into the grid. All of it is generated from one seeded layout pass, then frozen.

import { CITY, DISTRICT_NAMES, NEON_SIGNS } from './config.js';
import { clamp, createRandom } from './random.js';

const ROAD = CITY.roadWidth;
const CURB = CITY.curb;
const PITCH = CITY.pitch;
const ORIGIN = 166;
const DOCK_Y = 3190;
const WATER_Y = 3288;

function avenue(index) { return ORIGIN + index * PITCH; }
function cross(index) { return ORIGIN + index * PITCH; }
function blockLeft(bx) { return avenue(bx) + ROAD / 2; }
function blockTop(by) { return cross(by) + ROAD / 2; }
function blockSize() { return PITCH - ROAD; }

export function createCity(seed) {
  const rand = createRandom(seed);
  const blocks = [];
  const buildings = [];
  const parks = [];
  const terminals = [];
  const cranes = [];
  const signs = [];
  const lamps = [];
  const trees = [];
  const lots = [];

  for (let by = 0; by < CITY.blocksY; by += 1) {
    for (let bx = 0; bx < CITY.blocksX; bx += 1) {
      const x = blockLeft(bx);
      const y = blockTop(by);
      const size = blockSize();
      const district = DISTRICT_NAMES[Math.min(2, Math.floor(by / 3))][Math.min(2, Math.floor(bx / 3))];
      const kind = blockKind(bx, by);
      const block = { bx, by, x, y, size, district, kind, index: blocks.length };
      blocks.push(block);
      if (kind === 'park') {
        const park = { x: x + 16, y: y + 12, w: size - 32, h: size - 24, bx, by, name: parkName(bx, by) };
        parks.push(park);
        for (let t = 0; t < 8; t += 1) {
          trees.push({ x: park.x + 18 + rand() * (park.w - 36), y: park.y + 18 + rand() * (park.h - 36), r: 9 + rand() * 8 });
        }
        continue;
      }
      if (kind === 'terminal') {
        const terminal = { x: x + 6, y: y + 6, w: size - 12, h: size - 12, bx, by };
        terminals.push(terminal);
        for (let row = 0; row < 5; row += 1) {
          for (let col = 0; col < 6; col += 1) {
            lots.push({
              x: terminal.x + 15 + col * 38,
              y: terminal.y + 18 + row * 28,
              w: 28, h: 17,
              color: rand.pick(['#a34d3e', '#497b70', '#8a7542', '#4f596e', '#93623e']),
            });
          }
        }
        continue;
      }
      const count = kind === 'plaza' ? 2 : 3;
      for (let slot = 0; slot < count; slot += 1) {
        const cols = count === 3 ? 2 : 2;
        const rows = count === 3 ? 2 : 1;
        const col = slot % cols;
        const row = Math.floor(slot / cols);
        const gap = 12;
        const w = (size - gap * (cols + 1)) / cols;
        const h = (size - gap * (rows + 1)) / rows;
        const bxPos = x + gap + col * (w + gap);
        const byPos = y + gap + row * (h + gap);
        const hInset = h * (0.28 + rand() * 0.42);
        const building = {
          x: bxPos, y: byPos + hInset, w, h: h - hInset,
          top: byPos + hInset * 0.18,
          height: 0.32 + rand() * 0.95 + (kind === 'plaza' ? 0.16 : 0),
          district, kind,
          lit: rand(),
          windows: 4 + Math.floor(rand() * 4),
          rooftop: rand.pick(['ac', 'sign', 'tank', 'antenna']),
        };
        buildings.push(building);
        if (rand() < 0.72) {
          const sign = rand.pick(NEON_SIGNS);
          const vertical = rand() < 0.45;
          signs.push({
            text: sign[0], color: sign[1],
            x: building.x + w * (vertical ? rand.range(0.08, 0.7) : rand.range(0.16, 0.44)),
            y: building.y + (vertical ? rand.range(0.14, 0.45) : rand.range(0.12, 0.35)),
            vertical, scale: rand.range(0.72, 1.16), flicker: rand() * Math.PI * 2,
          });
        }
      }
    }
  }

  for (let avenueIndex = 0; avenueIndex <= CITY.blocksX; avenueIndex += 1) {
    for (let crossIndex = 0; crossIndex <= CITY.blocksY; crossIndex += 1) {
      lamps.push({ x: avenue(avenueIndex), y: cross(crossIndex) });
    }
  }

  // The dock edge is its own strip of road and rail, with the water beyond it.
  const dock = { x: 80, y: DOCK_Y, w: CITY.worldWidth - 160, h: WATER_Y - DOCK_Y };
  const warehouses = [];
  for (let index = 0; index < 6; index += 1) {
    warehouses.push({
      x: 260 + index * 452, y: DOCK_Y - 118,
      w: 255 + rand() * 65, h: 90 + rand() * 16,
      color: index % 2 ? '#283841' : '#31434a',
    });
  }
  for (let index = 0; index < 5; index += 1) {
    cranes.push({
      x: 345 + index * 588, baseY: WATER_Y - 18,
      height: 122 + rand() * 42, arm: 108 + rand() * 52,
      angle: -0.34 + rand() * 0.2,
    });
  }
  const districtAt = (x, y) => {
    const bx = clamp(Math.floor((x - ORIGIN) / PITCH), 0, 8);
    const by = clamp(Math.floor((y - ORIGIN) / PITCH), 0, 8);
    return DISTRICT_NAMES[Math.min(2, Math.floor(by / 3))][Math.min(2, Math.floor(bx / 3))];
  };

  return {
    blocks, buildings, parks, terminals, cranes, signs, lamps, trees, lots,
    dock, warehouses,
    water: { x: 0, y: WATER_Y, w: CITY.worldWidth, h: CITY.waterBottom - WATER_Y },
    origin: ORIGIN, pitch: PITCH, road: ROAD, curb: CURB, dockY: DOCK_Y,
    avenue, cross, blockLeft, blockTop, blockSize, districtAt,
    intersection(i, j) { return { x: avenue(i), y: cross(j) }; },
    isRoad(x, y) {
      if (y > DOCK_Y && y < WATER_Y) return true;
      const ax = (x - ORIGIN + ROAD / 2) % PITCH;
      const ay = (y - ORIGIN + ROAD / 2) % PITCH;
      return ax >= 0 && ax < ROAD || ay >= 0 && ay < ROAD;
    },
    isWater(x, y) { return y >= WATER_Y; },
    streetsNear(x, y, radius = 820) {
      const found = [];
      for (let by = 0; by < CITY.blocksY; by += 1) {
        for (let bx = 0; bx < CITY.blocksX; bx += 1) {
          const cx = blockLeft(bx) + blockSize() / 2;
          const cy = blockTop(by) + blockSize() / 2;
          if (Math.abs(cx - x) < radius && Math.abs(cy - y) < radius) {
            found.push({ x: cx, y: cy, block: blocks[by * CITY.blocksX + bx] });
          }
        }
      }
      return found;
    },
    randomPointOnRoad(random) {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const x = ORIGIN + random() * (CITY.worldWidth - ORIGIN * 2);
        const y = ORIGIN + random() * (DOCK_Y - ORIGIN);
        if (this.isRoad(x, y)) return { x, y };
      }
      return { x: avenue(4), y: cross(4) };
    },
    randomSidewalk(random) {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const block = blocks[Math.floor(random() * blocks.length)];
        if (block.kind === 'terminal') continue;
        return {
          x: block.x - CURB - 13 + random() * (block.size + CURB * 2 + 26),
          y: block.y - CURB - 13 + random() * (block.size + CURB * 2 + 26),
        };
      }
      return { x: ORIGIN + 120, y: ORIGIN + 120 };
    },
  };
}

function blockKind(bx, by) {
  if (by === 8 && bx >= 1 && bx <= 7) return 'terminal';
  if ((bx === 4 && by === 1) || (bx === 2 && by === 5)) return 'plaza';
  if ((bx === 6 && by === 2) || (bx === 1 && by === 1) || (bx === 7 && by === 0)) return 'park';
  return 'city';
}

function parkName(bx, by) {
  if (bx === 6 && by === 2) return 'Ember Common';
  if (bx === 1 && by === 1) return 'Cormorant Green';
  return 'Tidewalk Garden';
}

