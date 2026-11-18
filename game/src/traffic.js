// Civilian traffic on Port Kessel's eight-by-eight avenue grid. Each car follows a lane between
// junctions, chooses a turn only when it arrives, yields when a crossing car is already in the
// box, and brakes for anyone standing in its path. The player can take any of them.

import { TRAFFIC, VEHICLE, CITY } from './config.js';
import { angleDelta, clamp } from './random.js';

export const DIR_E = 0;
export const DIR_S = 1;
export const DIR_W = 2;
export const DIR_N = 3;
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

function lanePoint(city, gi, gj, dir) {
  const x = city.avenue(gi);
  const y = city.cross(gj);
  if (dir === DIR_E) return { x, y: y + TRAFFIC.laneOffset };
  if (dir === DIR_W) return { x, y: y - TRAFFIC.laneOffset };
  if (dir === DIR_S) return { x: x - TRAFFIC.laneOffset, y };
  return { x: x + TRAFFIC.laneOffset, y };
}

function segmentFor(city, gi, gj, dir) {
  const from = lanePoint(city, gi, gj, dir);
  const ni = gi + DX[dir];
  const nj = gj + DY[dir];
  const to = lanePoint(city, ni, nj, dir);
  return { from, to, ni, nj, length: Math.max(1, Math.hypot(to.x - from.x, to.y - from.y)) };
}

function valid(city, i, j) {
  return i >= 0 && i <= CITY.blocksX && j >= 0 && j <= CITY.blocksY;
}

function pickTurn(city, gi, gj, dir, random) {
  const options = [dir];
  const right = (dir + 1) % 4;
  const left = (dir + 3) % 4;
  if (valid(city, gi + DX[right], gj + DY[right])) options.push(right, right);
  if (valid(city, gi + DX[left], gj + DY[left])) options.push(left);
  if (!valid(city, gi + DX[dir], gj + DY[dir])) {
    for (let offset = 0; offset < 4; offset += 1) {
      const candidate = (dir + offset) % 4;
      if (valid(city, gi + DX[candidate], gj + DY[candidate])) return candidate;
    }
  }
  return options[Math.floor(random() * options.length)];
}

export function createTrafficCar(type, x, y, angle, random, driver = true) {
  const spec = VEHICLE[type];
  return {
    kind: 'traffic', type, x, y, angle, speed: 0, health: spec.health,
    width: spec.width, length: spec.length, color: spec.color,
    driver, ai: true, playerOwned: false, destroyed: false, mission: false,
    gi: 4, gj: 4, dir: DIR_E, progress: 0, fromX: x, fromY: y, toX: x, toY: y,
    lengthSegment: 1, brakeFlash: 0, honk: 0, lastHit: 0,
    plate: `PK-${Math.floor(random() * 899 + 100)}-${Math.floor(random() * 89 + 10)}`,
    randomOffset: random() * 0.4,
  };
}

export function createTraffic(state, city, random) {
  const cars = [];
  for (let index = 0; index < TRAFFIC.count; index += 1) {
    cars.push(spawnCar(city, random, index));
  }

  function spawnCar(cityRef, rand, index) {
    let gi = rand.int(1, 7);
    let gj = rand.int(1, 7);
    let dir = rand.int(0, 3);
    for (let attempt = 0; attempt < 12 && !valid(cityRef, gi + DX[dir], gj + DY[dir]); attempt += 1) dir = rand.int(0, 3);
    const type = index % 7 === 0 ? 'bream' : 'kestrel';
    const point = lanePoint(cityRef, gi, gj, dir);
    const seg = segmentFor(cityRef, gi, gj, dir);
    const car = createTrafficCar(type, point.x, point.y, directionAngle(dir), rand);
    car.gi = gi; car.gj = gj; car.dir = dir;
    car.fromX = seg.from.x; car.fromY = seg.from.y; car.toX = seg.to.x; car.toY = seg.to.y;
    car.lengthSegment = seg.length; car.progress = rand.range(0.05, 0.65);
    placeOnSegment(car);
    if (rand() < 0.28) car.color = rand.pick(TRAFFIC.colors);
    return car;
  }

  function placeOnSegment(car) {
    const t = clamp(car.progress, 0, 1);
    car.x = car.fromX + (car.toX - car.fromX) * t;
    car.y = car.fromY + (car.toY - car.fromY) * t;
    car.angle = Math.atan2(car.toY - car.fromY, car.toX - car.fromX);
  }

  function beginSegment(car, dir) {
    car.dir = dir;
    car.fromX = car.x; car.fromY = car.y;
    const ni = car.gi + DX[dir];
    const nj = car.gj + DY[dir];
    const to = lanePoint(city, ni, nj, dir);
    car.toX = to.x; car.toY = to.y;
    car.lengthSegment = Math.max(1, Math.hypot(to.x - car.x, to.y - car.y));
    car.gi = ni; car.gj = nj; car.progress = 0;
  }

  function wantsStop(car, player, cars) {
    const headingX = Math.cos(car.angle);
    const headingY = Math.sin(car.angle);
    const aheadX = car.x + headingX * 65;
    const aheadY = car.y + headingY * 65;
    if (player && !player.vehicle) {
      const along = (player.x - car.x) * headingX + (player.y - car.y) * headingY;
      const side = Math.abs((player.x - car.x) * -headingY + (player.y - car.y) * headingX);
      if (along > 8 && along < 88 && side < 25) return true;
    }
    for (let index = 0; index < cars.length; index += 1) {
      const other = cars[index];
      if (other === car || other.playerOwned) continue;
      const along = (other.x - car.x) * headingX + (other.y - car.y) * headingY;
      const side = Math.abs((other.x - car.x) * -headingY + (other.y - car.y) * headingX);
      if (along > 8 && along < 77 && side < 27) return true;
      if (along > 0 && along < 110 && side < 20) return true;
      if (Math.hypot(other.x - aheadX, other.y - aheadY) < 42) return true;
    }
    return false;
  }

  function inJunction(car) {
    const ix = city.avenue(car.gi);
    const iy = city.cross(car.gj);
    const near = Math.hypot(car.x - ix, car.y - iy) < 64;
    return near && car.progress > 0.78;
  }

  function crossingAt(car, cars) {
    if (!inJunction(car)) return false;
    for (let index = 0; index < cars.length; index += 1) {
      const other = cars[index];
      if (other === car || other.playerOwned) continue;
      if (other.gi !== car.gi || other.gj !== car.gj) continue;
      if (other.progress < 0.2 || other.progress > 0.8) continue;
      if (Math.abs((other.dir % 2) - (car.dir % 2)) !== 0) {
        if (Math.abs(other.speed) > 7) return true;
      }
    }
    if (car.dir % 2 === 0) {
      // At a four-way box, halt briefly before entering when a fast car is close on the cross avenue.
      for (let index = 0; index < cars.length; index += 1) {
        const other = cars[index];
        if (other === car || other.playerOwned) continue;
        if (Math.abs(other.y - car.y) < 58 && Math.abs(other.x - car.x) < 142 && other.dir % 2 === 1) return true;
      }
    }
    return false;
  }

  function update(dt, stateRef) {
    const cars = stateRef.traffic;
    const player = stateRef.player;
    for (let index = 0; index < cars.length; index += 1) {
      const car = cars[index];
      if (car.playerOwned) continue;
      if (car.destroyed) continue;
      car.lastHit = Math.max(0, car.lastHit - dt);
      if (!car.driver) {
        car.speed *= Math.exp(-2.6 * dt);
        if (Math.abs(car.speed) < 0.2) car.speed = 0;
        car.x += Math.cos(car.angle) * car.speed * dt;
        car.y += Math.sin(car.angle) * car.speed * dt;
        continue;
      }
      const stop = wantsStop(car, player, cars) || crossingAt(car, cars);
      const target = stop ? 0 : TRAFFIC.cruise * (0.85 + (car.randomOffset || 0));
      if (car.speed < target) car.speed = Math.min(target, car.speed + TRAFFIC.accel * dt);
      else car.speed = Math.max(target, car.speed - TRAFFIC.brake * dt * (stop ? 2.4 : 0.7));
      car.progress += (car.speed * dt) / car.lengthSegment;
      if (car.progress >= 1) {
        car.x = car.toX; car.y = car.toY;
        const next = pickTurn(city, car.gi, car.gj, car.dir, random);
        car.gi = clamp(car.gi, 0, CITY.blocksX);
        car.gj = clamp(car.gj, 0, CITY.blocksY);
        if (!valid(city, car.gi + DX[next], car.gj + DY[next])) {
          // At the outer rim, turn around rather than leaving the map.
          car.dir = (car.dir + 2) % 4;
          car.gi = clamp(car.gi + DX[car.dir], 0, CITY.blocksX);
          car.gj = clamp(car.gj + DY[car.dir], 0, CITY.blocksY);
          beginSegment(car, car.dir);
        } else beginSegment(car, next);
      }
      placeOnSegment(car);
      car.speed = clamp(car.speed, 0, TRAFFIC.cruise * 1.2);
      if (car.speed < 4) car.brakeFlash = Math.max(car.brakeFlash, 0.1);
      car.brakeFlash = Math.max(0, car.brakeFlash - dt);
    }
  }

  return { cars, spawnCar, update };
}

export function directionAngle(dir) {
  return dir === DIR_E ? 0 : dir === DIR_S ? Math.PI / 2 : dir === DIR_W ? Math.PI : -Math.PI / 2;
}

export function steerCarToward(car, targetX, targetY, dt, maxTurn) {
  const desired = Math.atan2(targetY - car.y, targetX - car.x);
  const delta = angleDelta(car.angle, desired);
  const turn = clamp(delta, -maxTurn * dt, maxTurn * dt);
  car.angle += turn;
  return delta;
}
