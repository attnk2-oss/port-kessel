// The living city. world.js advances Port Kessel one fixed simulation step at a time: character
// movement, vehicles, bullets, pedestrians, police, wanted heat, missions and the 12-hour clock.
// Drawing, input and browser storage stay at the edges, so this module can be stepped headlessly.

import {
  CAMERA, CITY, HOSPITAL, PLAYER, SAFEHOUSE, STEP, STORAGE_KEY,
  VEHICLE, WANTED, PEDESTRIAN, TRAFFIC,
} from './config.js';
import { angleDelta, clamp, createRandom, distanceSq, hashSeed } from './random.js';
import { createCity } from './city.js';
import { createTraffic, createTrafficCar } from './traffic.js';
import { createPolice } from './police.js';
import { createMissions, missionStepText } from './missions.js';
import { createRadio } from './radio.js';
import { createSideJobs } from './sidejobs.js';

// Lane offsets for the four cardinal directions: east, south, west, north.
const DIR_LANE = [{ x: 0, y: 21 }, { x: -21, y: 0 }, { x: 0, y: -21 }, { x: 21, y: 0 }];
const SHOT_LIFE = 1.15;
const SAVE_VERSION = 1;

// ---------------------------------------------------------------- geometry and clock helpers

function circleIntersectsRect(x, y, radius, rect) {
  const nearestX = clamp(x, rect.x, rect.x + rect.w);
  const nearestY = clamp(y, rect.y, rect.y + rect.h);
  return distanceSq(x, y, nearestX, nearestY) < radius * radius;
}

export function formatClock(minutes) {
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = Math.floor(minutes) % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function createWorld(seed) {
  const normalizedSeed = Number(seed) || 7;
  const random = createRandom(normalizedSeed);
  const city = createCity(normalizedSeed);

  // Independent streams keep traffic, pedestrians, police and missions from perturbing each other.
  const trafficRandom = random.stream(11);
  const pedRandom = random.stream(23);
  const trafficSystem = createTraffic(null, city, trafficRandom);
  const policeSystem = createPolice(city, random.stream(37));
  const missions = createMissions(city, random.stream(43));
  const radio = createRadio();
  const sideJobs = createSideJobs();

  // ---------------------------------------------------------------- simulation state

  const state = {
    seed: normalizedSeed,
    time: 0,
    clockMinutes: 22 * 60 + 40,
    player: null,
    traffic: trafficSystem.cars,
    peds: [],
    police: [],
    bullets: [],
    particles: [],
    skids: [],
    exhaust: [],
    spray: [],
    radio: null,
    sideJob: null,
    sideJobsDone: 0,
    muzzles: [],
    missionActors: [],
    corpsePaths: [],
    wanted: 0,
    heat: 0,
    policeSight: 0,
    lastCrime: 0,
    policeSpawnTimer: 0,
    footSpawnTimer: 0,
    alarm: 0,
    money: 120,
    mission: null,
    missionStep: 0,
    missionComplete: false,
    missionsDone: 0,
    nextMissionTimer: 0,
    missionMarker: null,
    objective: '',
    hudDialogue: null,
    surviveTimer: 0,
    missionFinished: false,
    credits: false,
    creditsTimer: 0,
    city,
    district: 'Lantern Ward',
    camera: { x: 0, y: 0, zoom: 1 },
    shake: 0,
    flash: 0,
    dead: false,
    deadTimer: 0,
    respawnTimer: 0,
    screenFlash: 0,
    soundEvents: [],
    events: [],
    message: '',
    messageTimer: 0,
    crosshair: { x: 640, y: 360 },
    aimAngle: 0,
    nearVehicle: null,
    weapon: 'fists',
    pistolRounds: 36,
    policeShots: 0,
    playerShots: 0,
    tyreSqueal: 0,
    pedsKilled: 0,
    policeKilled: 0,
    missionsComplete: false,
    paused: false,
    driveDistance: 0,
    currentVehicleName: '',
    bestCombo: 0,
    pedestriansVisible: 0,
  };

  const player = {
    x: SAFEHOUSE.x, y: SAFEHOUSE.y, angle: Math.PI, health: PLAYER.maxHealth,
    armour: 0, vehicle: null, radius: PLAYER.radius, sprint: false,
    invulnerable: 0, walkPhase: 0, aim: false, dead: false, reload: 0,
  };
  state.player = player;

  const buildings = city.buildings;
  const blocks = city.blocks;

  // ---------------------------------------------------------------- small state and event helpers

  function emitSound(type, extra) {
    const event = { type };
    if (extra) Object.assign(event, extra);
    state.soundEvents.push(event);
  }

  function showMessage(text, seconds = 2.8) {
    state.message = text;
    state.messageTimer = seconds;
  }

  function playerPosition() {
    return player.vehicle ? { x: player.vehicle.x, y: player.vehicle.y } : { x: player.x, y: player.y };
  }

  // ---------------------------------------------------------------- reset and initial population

  function reset() {
    state.time = 0;
    state.clockMinutes = 22 * 60 + 40;
    player.x = SAFEHOUSE.x; player.y = SAFEHOUSE.y; player.angle = Math.PI;
    player.health = PLAYER.maxHealth; player.armour = 0; player.vehicle = null;
    player.invulnerable = 1.2; player.dead = false; player.reload = 0;
    state.wanted = 0; state.heat = 0; state.policeSight = 0; state.lastCrime = 0;
    state.police.length = 0; state.bullets.length = 0; state.particles.length = 0;
    state.skids.length = 0; state.exhaust.length = 0; state.muzzles.length = 0; state.spray.length = 0;
    state.peds.length = 0; state.missionActors.length = 0;
    state.money = 120; state.mission = null; state.missionStep = 0;
    state.missionComplete = false; state.missionsDone = 0; state.nextMissionTimer = 0;
    state.missionMarker = null; state.objective = ''; state.hudDialogue = null;
    state.credits = false; state.creditsTimer = 0; state.missionFinished = false;
    state.dead = false; state.deadTimer = 0; state.respawnTimer = 0;
    state.weapon = 'fists'; state.pistolRounds = 36;
    state.alarm = 0; state.shake = 0; state.flash = 0;
    state.policeSpawnTimer = 1.2; state.footSpawnTimer = 2;
    state.district = city.districtAt(player.x, player.y);
    state.camera.x = player.x; state.camera.y = player.y;
    radio.reset(state);
    sideJobs.reset(state);
    state.message = ''; state.messageTimer = 0;
    state.pedsKilled = 0; state.policeKilled = 0; state.playerShots = 0; state.policeShots = 0;
    trafficSystem.cars.length = 0;
    for (let index = 0; index < TRAFFIC.count; index += 1) {
      trafficSystem.cars.push(trafficSystem.spawnCar(city, trafficRandom, index));
    }
    for (let index = 0; index < PEDESTRIAN.count; index += 1) spawnPedestrian();
    seedNearbyTraffic();
    startMission(0);
    showMessage('Port Kessel. The rain never asks permission.', 4.5);
  }

  // Guarantee a car on the strip and a van at Salt Market so every new game is legible.
  function seedNearbyTraffic() {
    const coupe = createTrafficCar('kestrel', 1430, 1566, 0, trafficRandom);
    coupe.ai = true; coupe.driver = true;
    coupe.gi = 4; coupe.gj = 3; coupe.dir = 0;
    coupe.fromX = 1430; coupe.fromY = 1566; coupe.toX = 1780; coupe.toY = 1566;
    coupe.lengthSegment = 350; coupe.progress = 0.08;
    state.traffic.push(coupe);

    const van = createTrafficCar('bream', 1030, 2310, Math.PI / 2, trafficRandom);
    van.ai = true; van.driver = true;
    van.gi = 2; van.gj = 6; van.dir = 1;
    van.fromX = 1030; van.fromY = 2310; van.toX = 1030; van.toY = 2660;
    van.lengthSegment = 350; van.progress = 0.12;
    state.traffic.push(van);
  }

  function spawnPedestrian() {
    let block = blocks[Math.floor(pedRandom() * blocks.length)];
    for (let attempt = 0; attempt < 16 && (block.kind === 'terminal' || block.kind === 'park'); attempt += 1) {
      block = blocks[Math.floor(pedRandom() * blocks.length)];
    }
    const edgeIndex = Math.floor(pedRandom() * 4);
    const perimeter = blockPerimeter(block);
    const edge = perimeter[edgeIndex];
    // Two colour draws are intentional here: the first was historically the helper fallback,
    // while the second supplies the coat colour. Keeping both preserves every seeded city.
    const fallbackColour = PEDESTRIAN.palette[Math.floor(pedRandom() * PEDESTRIAN.palette.length)];
    const ped = {
      x: edge.x + pedRandom() * Math.max(10, edge.tx - edge.x),
      y: edge.y + pedRandom() * Math.max(10, edge.ty - edge.y),
      angle: Math.atan2(edge.ty - edge.y, edge.tx - edge.x),
      speed: 0, target: { x: edge.tx, y: edge.ty }, block, edge: edgeIndex,
      mode: 'walk', timer: 0, health: 25, dead: false, deadTimer: 0,
      colour: fallbackColour,
      coat: Math.floor(pedRandom() * 4), stride: pedRandom() * Math.PI * 2, umbrella: pedRandom() < 0.22,
      crossTimer: 0, crossTarget: null,
    };
    ped.colour = PEDESTRIAN.palette[Math.floor(pedRandom() * PEDESTRIAN.palette.length)];
    state.peds.push(ped);
    return ped;
  }

  function blockPerimeter(block) {
    const left = block.x - 20;
    const top = block.y - 20;
    const right = block.x + block.size + 20;
    const bottom = block.y + block.size + 20;
    return [
      { x: left, y: top, tx: right, ty: top },
      { x: right, y: top, tx: right, ty: bottom },
      { x: right, y: bottom, tx: left, ty: bottom },
      { x: left, y: bottom, tx: left, ty: top },
    ];
  }

  function chooseNextPedestrianWaypoint(ped) {
    if (ped.mode === 'cross' && ped.crossTarget) {
      ped.target = ped.crossTarget;
      ped.crossTarget = null;
      return;
    }
    ped.edge = (ped.edge + 1) % 4;
    const edge = blockPerimeter(ped.block)[ped.edge];
    ped.target = { x: edge.tx, y: edge.ty };
    if (pedRandom() < PEDESTRIAN.crossChance) {
      const offsetX = Math.cos(ped.angle + Math.PI / 2) * 118;
      const offsetY = Math.sin(ped.angle + Math.PI / 2) * 118;
      ped.crossTarget = {
        x: clamp(ped.x + offsetX, 80, CITY.worldWidth - 80),
        y: clamp(ped.y + offsetY, 80, city.dockY - 40),
      };
      if (!city.isRoad(ped.crossTarget.x, ped.crossTarget.y)) ped.crossTarget = null;
    }
  }

  // ---------------------------------------------------------------- collision and movement

  function isSolid(x, y, radius = 0) {
    if (x < 80 || y < 80 || x > CITY.worldWidth - 80 || y > city.dockY - 18) return true;
    for (let index = 0; index < buildings.length; index += 1) {
      if (circleIntersectsRect(x, y, radius, buildings[index])) return true;
    }
    return false;
  }

  // Axis-separated movement lets an entity slide along a wall instead of sticking to it.
  function moveEntityWithCollisions(entity, dx, dy, radius) {
    const previousX = entity.x;
    const previousY = entity.y;
    entity.x += dx;
    if (isSolid(entity.x, entity.y, radius)) entity.x = previousX;
    entity.y += dy;
    if (isSolid(entity.x, entity.y, radius)) entity.y = previousY;
  }

  // ---------------------------------------------------------------- projectiles and effects

  function spawnBullet(x, y, angle, speed, damage, owner) {
    state.bullets.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: SHOT_LIFE, damage, owner, angle, trail: 0,
    });
  }

  function addMuzzleFlash(x, y, angle, owner) {
    state.muzzles.push({ x, y, angle, owner, life: 0.11, max: 0.11 });
    if (state.muzzles.length > 48) state.muzzles.shift();
  }

  function addExhaustPuff(x, y, angle, speed, tint = '#a7bdc2') {
    if (state.exhaust.length > 150) state.exhaust.shift();
    state.exhaust.push({
      x: x + (Math.random() - 0.5) * 9,
      y: y + (Math.random() - 0.5) * 9,
      vx: -Math.cos(angle) * (14 + Math.random() * 38) - Math.sin(angle) * (Math.random() - 0.5) * 15,
      vy: -Math.sin(angle) * (14 + Math.random() * 38) + Math.cos(angle) * (Math.random() - 0.5) * 15,
      life: 0.32 + Math.random() * 0.36, max: 0.68,
      size: 3 + Math.random() * 4 + Math.min(4, Math.abs(speed) * 0.018), tint,
    });
  }

  function addSprayDrop(x, y, angle, speed, tint = '#cfe8ea') {
    if (state.spray.length > 220) state.spray.shift();
    const sideways = (Math.random() - 0.5) * 34;
    state.spray.push({
      x: x + Math.cos(angle + Math.PI / 2) * sideways * 0.35,
      y: y + Math.sin(angle + Math.PI / 2) * sideways * 0.35,
      vx: -Math.cos(angle) * (18 + Math.random() * 44) + Math.cos(angle + Math.PI / 2) * sideways,
      vy: -Math.sin(angle) * (18 + Math.random() * 44) + Math.sin(angle + Math.PI / 2) * sideways,
      life: 0.28 + Math.random() * 0.42, max: 0.7,
      size: 1.2 + Math.random() * 2.8 + Math.min(3, Math.abs(speed) * 0.01),
      tint,
    });
  }

  function addSkidMark(x1, y1, x2, y2, width = 2.2, strength = 1) {
    if (state.skids.length > 360) state.skids.shift();
    state.skids.push({ x1, y1, x2, y2, width, life: 0.8 + strength * 0.75, max: 1.55, strength });
  }

  function rearWheelPosition(car, side) {
    const rearX = car.x - Math.cos(car.angle) * car.length * 0.34;
    const rearY = car.y - Math.sin(car.angle) * car.length * 0.34;
    return {
      x: rearX + Math.cos(car.angle + Math.PI / 2) * car.width * 0.33 * side,
      y: rearY + Math.sin(car.angle + Math.PI / 2) * car.width * 0.33 * side,
    };
  }

  // ---------------------------------------------------------------- combat

  function attack(angle) {
    if (player.dead) return;
    if (state.weapon === 'pistol') {
      if (player.reload > 0) return;
      if (state.pistolRounds <= 0) {
        showMessage('Pistol empty. Press R to reload.', 2.2);
        return;
      }
      if (player.vehicle) {
        const side = player.vehicle.angle + Math.PI / 2;
        spawnBullet(
          player.vehicle.x + Math.cos(side) * 14,
          player.vehicle.y + Math.sin(side) * 14,
          angle, 940, PLAYER.bulletDamage, 'player',
        );
      } else {
        spawnBullet(player.x + Math.cos(angle) * 16, player.y + Math.sin(angle) * 16, angle, 940, PLAYER.bulletDamage, 'player');
      }
      state.pistolRounds -= 1;
      state.playerShots += 1;
      player.reload = PLAYER.pistolCooldown;
      state.shake = Math.max(state.shake, 0.8);
      state.flash = 0.04;
      addMuzzleFlash(player.vehicle ? player.vehicle.x : player.x, player.vehicle ? player.vehicle.y : player.y, angle, 'player');
      emitSound('shot', { police: false });
      state.alarm = Math.max(state.alarm, 2.4);
      addWantedHeat(0.17);
      player.angle = angle;
    } else {
      if (player.reload > 0) return;
      player.reload = PLAYER.fistCooldown;
      state.shake = Math.max(state.shake, 0.25);
      emitSound('punch');
      damageNearestInCone(player.x, player.y, angle, PLAYER.fistRange, PLAYER.fistDamage, 'player');
    }
  }

  function damageNearestInCone(x, y, angle, range, damage, owner) {
    const candidates = [];
    for (let index = 0; index < state.peds.length; index += 1) {
      const ped = state.peds[index];
      if (ped.dead) continue;
      const distance = Math.hypot(ped.x - x, ped.y - y);
      const targetAngle = Math.atan2(ped.y - y, ped.x - x);
      if (distance < range && Math.abs(angleDelta(angle, targetAngle)) < 1.2) candidates.push({ target: ped, distance });
    }
    for (let index = 0; index < state.police.length; index += 1) {
      const cop = state.police[index];
      if (cop.destroyed) continue;
      const distance = Math.hypot(cop.x - x, cop.y - y);
      const targetAngle = Math.atan2(cop.y - y, cop.x - x);
      if (distance < range && Math.abs(angleDelta(angle, targetAngle)) < 1.2) candidates.push({ target: cop, distance });
    }
    for (let index = 0; index < state.missionActors.length; index += 1) {
      const actor = state.missionActors[index];
      if (actor.dead) continue;
      const distance = Math.hypot(actor.x - x, actor.y - y);
      const targetAngle = Math.atan2(actor.y - y, actor.x - x);
      if (distance < range && Math.abs(angleDelta(angle, targetAngle)) < 1.2) candidates.push({ target: actor, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    if (candidates.length) applyDamage(candidates[0].target, damage, owner);
  }

  function applyDamage(target, damage, owner) {
    if (target.kind === 'police' || target.kind === 'tern' || target.type === 'tern') {
      target.health -= damage;
      target.lastHit = 1.4;
      if (target.health <= 0) {
        target.destroyed = true;
        target.driver = false;
        state.policeKilled += 1;
        addWantedHeat(0.8);
        emitBurst(target.x, target.y, '#ffb24e', 12);
        emitBurst(target.x, target.y, '#6e6252', 12, 'debris');
        emitSound('explosion');
      }
      return;
    }
    target.health = (target.health ?? 30) - damage;
    target.lastHit = 1.2;
    if (target.health > 0) return;
    if (target.kind === 'ped' || target.kind === 'courier') {
      target.dead = true; target.deadTimer = 0;
      state.pedsKilled += 1;
      addWantedHeat(0.45);
      emitBurst(target.x, target.y, '#b93b5a', 8);
    } else if (target.kind === 'foot' || target.kind === 'police') {
      target.destroyed = true;
      state.policeKilled += 1;
      addWantedHeat(0.65);
      emitBurst(target.x, target.y, '#4b9be8', 9);
    } else if (target.kind === 'enemy' || target.kind === 'boss') {
      target.dead = true;
      emitBurst(target.x, target.y, '#d7a34e', 10);
      state.money += 25;
      if (target.kind === 'boss') showMessage('Okonkwo goes down. The Exchange falls silent.', 4);
    }
  }

  function emitBurst(x, y, colour, count, kind = 'spark') {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (kind === 'debris' ? 45 : 35) + Math.random() * (kind === 'debris' ? 150 : 115);
      state.particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.7, max: 1,
        colour, size: kind === 'debris' ? 2.6 + Math.random() * 4 : 1.2 + Math.random() * 2.4,
        kind, spin: Math.random() * Math.PI * 2,
      });
    }
    if (state.particles.length > 260) state.particles.splice(0, state.particles.length - 260);
  }

  // Heat accumulates in fractions; every 0.9 raises one whole wanted star.
  function addWantedHeat(amount) {
    if (state.wanted >= WANTED.max) return;
    state.heat += amount;
    state.lastCrime = state.time;
    if (state.heat >= 0.9) {
      state.heat = 0;
      state.wanted = Math.min(WANTED.max, state.wanted + 1);
      state.policeSpawnTimer = Math.min(state.policeSpawnTimer, 0.6);
      emitSound('siren');
      showMessage(`Wanted level ${state.wanted}. ${WANTED.stars[state.wanted]}`, 3);
    }
  }

  // ---------------------------------------------------------------- vehicles

  function findNearestVehicle(radius = 62) {
    let nearest = null;
    let nearestDistance = radius * radius;
    for (let index = 0; index < state.traffic.length; index += 1) {
      const car = state.traffic[index];
      if (car.destroyed) continue;
      const distance = distanceSq(player.x, player.y, car.x, car.y);
      if (distance < nearestDistance) { nearest = car; nearestDistance = distance; }
    }
    return nearest;
  }

  function boardVehicle(car) {
    if (!car || car.destroyed) return false;
    if (car.driver) {
      car.driver = false;
      const ejected = spawnRandomPedestrianAt(
        car.x + Math.cos(car.angle + Math.PI / 2) * 24,
        car.y + Math.sin(car.angle + Math.PI / 2) * 24,
      );
      ejected.mode = 'flee';
      ejected.timer = 5;
      ejected.colour = '#d1a070';
      ejected.umbrella = false;
      car.ai = false;
      car.playerOwned = true;
      addWantedHeat(0.34);
      showMessage('Stolen. The driver is already running.', 2.6);
      emitSound('engine');
    } else {
      car.playerOwned = true;
      car.ai = false;
    }
    player.vehicle = car;
    player.x = car.x; player.y = car.y;
    car.speed = Math.max(-20, Math.min(car.speed, 90));
    state.currentVehicleName = VEHICLE[car.type]?.name || 'Kestrel coupe';
    state.weapon = 'pistol';
    showMessage(`Entered ${state.currentVehicleName}.`, 2.4);
    return true;
  }

  function spawnRandomPedestrianAt(x, y) {
    const ped = {
      x, y, angle: pedRandom() * Math.PI * 2, speed: 0,
      target: { x, y }, block: blocks[0], edge: 0, mode: 'walk', timer: 0,
      health: 25, dead: false, deadTimer: 0, colour: PEDESTRIAN.palette[Math.floor(pedRandom() * PEDESTRIAN.palette.length)],
      coat: Math.floor(pedRandom() * 4), stride: pedRandom() * Math.PI * 2, umbrella: false,
      crossTimer: 0, crossTarget: null,
    };
    state.peds.push(ped);
    return ped;
  }

  function leaveVehicle() {
    const car = player.vehicle;
    if (!car) return;
    car.playerOwned = false;
    car.ai = false;
    car.speed *= 0.3;
    const side = car.angle + Math.PI / 2;
    let exitX = car.x + Math.cos(side) * 28;
    let exitY = car.y + Math.sin(side) * 28;
    if (isSolid(exitX, exitY, PLAYER.radius)) {
      exitX = car.x - Math.cos(side) * 28;
      exitY = car.y - Math.sin(side) * 28;
    }
    player.x = exitX; player.y = exitY;
    player.vehicle = null;
    state.currentVehicleName = '';
    showMessage('On foot.', 1.6);
  }

  function interact() {
    if (player.dead) return;
    if (player.vehicle) { leaveVehicle(); return; }
    const nearbyCar = findNearestVehicle(66);
    if (nearbyCar) { boardVehicle(nearbyCar); return; }
    // A courier at arm's length hands over whatever Marrow sent Vale for.
    for (let index = 0; index < state.missionActors.length; index += 1) {
      const actor = state.missionActors[index];
      if (actor.dead) continue;
      if (distanceSq(player.x, player.y, actor.x, actor.y) < 42 * 42) {
        if (actor.kind === 'courier') {
          actor.dead = true;
          showMessage('Ledger taken. Pell is face-down in the rain.', 3.2);
          addWantedHeat(0.22);
          return;
        }
      }
    }
    showMessage('Nothing to use here.', 1.3);
  }

  function startMission(index) {
    missions.begin(state, index);
  }

  // ---------------------------------------------------------------- player update

  function updatePlayerMovement(dt, input) {
    if (player.dead) return;
    if (player.reload > 0) player.reload = Math.max(0, player.reload - dt);
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);
    if (player.vehicle) {
      updatePlayerCar(player.vehicle, dt, input);
      return;
    }
    const movement = input.axis;
    const speed = input.aim ? PLAYER.aimWalk : input.sprint ? PLAYER.sprint : PLAYER.walk;
    const length = Math.hypot(movement.x, movement.y);
    player.sprint = input.sprint && length > 0;
    if (length > 0) {
      moveEntityWithCollisions(player, movement.x * speed * dt, movement.y * speed * dt, PLAYER.radius);
      if (!input.aim) player.angle = Math.atan2(movement.y, movement.x);
      const cadence = player.sprint ? 12 : 7;
      player.walkPhase += dt * cadence;
      if (Math.floor(player.walkPhase) !== Math.floor(player.walkPhase - dt * cadence)) {
        emitSound('footstep', { sprint: player.sprint });
      }
    }
    if (input.aim) {
      const aimAngle = Math.atan2(input.mouseWorld.y - player.y, input.mouseWorld.x - player.x);
      player.angle = aimAngle;
      state.aimAngle = aimAngle;
    }
    state.nearVehicle = findNearestVehicle(66);
    if (input.firing || input.firePressed) attack(player.angle);
  }

  function updatePlayerCar(car, dt, input) {
    const spec = VEHICLE[car.type] || VEHICLE.kestrel;
    const throttle = (input.up ? 1 : 0) - (input.brake ? 1 : 0);
    const steering = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (throttle > 0) car.speed += spec.accel * dt;
    else if (throttle < 0) car.speed -= (car.speed > 0 ? spec.brake : spec.accel * 0.55) * dt;
    else car.speed *= Math.exp(-0.52 * dt);
    car.speed = clamp(car.speed, -spec.reverse, spec.maxSpeed);
    const steeringGrip = 0.32 + Math.min(1, Math.abs(car.speed) / 105) * 0.68;
    state.tyreSqueal = Math.abs(steering) > 0 && Math.abs(car.speed) > 82 ? 1 : 0;
    if (Math.abs(car.speed) > 2) {
      const travelDirection = car.speed >= 0 ? 1 : -1;
      car.angle += steering * spec.steer * steeringGrip * travelDirection * dt;
    }
    // At low speed the front wheels bite less, so the coupe can creep out of a junction without
    // snapping around, while a full-speed handbrake still swings the tail wide.
    if (Math.abs(car.speed) < 14 && steering !== 0) car.angle += steering * 0.3 * dt;
    // Rain on the quay makes every lane a little slick.
    if (Math.abs(car.speed) > 150) car.angle += Math.sin(car.x * 0.01 + car.y * 0.007) * 0.0009;
    car.wheel = (car.wheel || 0) + car.speed * dt * 0.18;
    const previousX = car.x;
    const previousY = car.y;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const impactSpeed = Math.abs(car.speed);
    const leftTheRoad = car.x < 70 || car.y < 70 || car.x > CITY.worldWidth - 70 || car.y > city.dockY - 30;
    if (vehicleTouchesBuilding(car) || leftTheRoad) {
      car.x = previousX; car.y = previousY;
      if (impactSpeed > 26) {
        const damage = impactSpeed * 0.055;
        car.health -= damage;
        state.shake = Math.max(state.shake, Math.min(9, impactSpeed * 0.035));
        emitSound('impact', { strength: impactSpeed / 150 });
        emitBurst(car.x, car.y, '#ffcf6c', 12);
        emitBurst(car.x, car.y, '#74675a', 9, 'debris');
      }
      car.speed *= -0.18;
    }
    const sliding = Math.abs(car.speed) > 58 && (Math.abs(steering) > 0 || input.brake || Math.abs(car.speed) > 205);
    if (sliding) {
      state.skidTimer = (state.skidTimer || 0) + dt;
      const leftRear = rearWheelPosition(car, 0);
      const rightRear = rearWheelPosition(car, 1);
      const trailLength = Math.abs(car.speed) * dt * 0.92 + 1.5;
      addSkidMark(leftRear.x, leftRear.y, leftRear.x - Math.cos(car.angle) * trailLength, leftRear.y - Math.sin(car.angle) * trailLength, 2.4, 1);
      addSkidMark(rightRear.x, rightRear.y, rightRear.x - Math.cos(car.angle) * trailLength, rightRear.y - Math.sin(car.angle) * trailLength, 2.4, 1);
      if (Math.abs(car.speed) > 120 && Math.random() < 0.14) emitBurst(leftRear.x, leftRear.y, '#7f9290', 1, 'spark');
    }
    if (Math.abs(car.speed) > 28) {
      state.exhaustTimer = (state.exhaustTimer || 0) + dt;
      if (state.exhaustTimer > 0.035) {
        state.exhaustTimer = 0;
        const rear = rearWheelPosition(car, Math.random() < 0.5 ? -1 : 1);
        addExhaustPuff(rear.x, rear.y, car.angle, car.speed, car.type === 'tern' ? '#8eb1b7' : '#a7bdc2');
      }
    }
    if (Math.abs(car.speed) > 82) {
      state.sprayTimer = (state.sprayTimer || 0) + dt;
      if (state.sprayTimer > 0.028) {
        state.sprayTimer = 0;
        const rear = rearWheelPosition(car, Math.random() < 0.5 ? -1 : 1);
        addSprayDrop(rear.x, rear.y, car.angle, car.speed);
      }
    }
    state.driveDistance += Math.abs(car.speed) * dt;
    state.currentVehicleName = spec.name;
    state.camera.x += (car.x - state.camera.x) * CAMERA.driveFollow;
    state.camera.y += (car.y - state.camera.y) * CAMERA.driveFollow;
    for (let index = 0; index < state.peds.length; index += 1) {
      const ped = state.peds[index];
      if (ped.dead) continue;
      const distance = distanceSq(car.x, car.y, ped.x, ped.y);
      if (distance < 60 * 60 && Math.abs(car.speed) > 12) {
        const pushX = ped.x - car.x;
        const pushY = ped.y - car.y;
        const pushLength = Math.hypot(pushX, pushY) || 1;
        ped.x += pushX / pushLength * 18;
        ped.y += pushY / pushLength * 18;
        ped.mode = 'flee';
        ped.timer = 3.6;
        if (Math.abs(car.speed) > 55) {
          // The copy preserves the original wanted/crime side effects of a vehicle strike.
          applyDamage({ ...ped, kind: 'ped' }, 100, 'vehicle');
          ped.dead = true;
          car.speed *= 0.82;
          state.shake = Math.max(state.shake, 4);
        }
      }
    }
    for (let index = 0; index < state.traffic.length; index += 1) {
      const other = state.traffic[index];
      if (other === car || other.destroyed || other.playerOwned) continue;
      const distance = distanceSq(car.x, car.y, other.x, other.y);
      if (distance < 38 * 38 && impactSpeed > 22) {
        other.health -= impactSpeed * 0.09;
        car.health -= impactSpeed * 0.035;
        other.speed = 0;
        car.speed *= 0.56;
        state.shake = Math.max(state.shake, Math.min(8, impactSpeed * 0.03));
        emitSound('impact', { strength: impactSpeed / 160 });
        emitBurst((car.x + other.x) / 2, (car.y + other.y) / 2, '#ffcc71', 9);
        emitBurst(other.x, other.y, '#55636a', 7, 'debris');
        break;
      }
    }
    if (car.health <= 0 && !car.destroyed) {
      car.destroyed = true;
      car.driver = false;
      car.speed = 0;
      player.vehicle = null;
      player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 26;
      player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 26;
      state.shake = 10;
      emitBurst(car.x, car.y, '#ffb24e', 24);
      emitBurst(car.x, car.y, '#6d6152', 16, 'debris');
      emitSound('explosion');
      showMessage('The car is finished. Get clear.', 3.4);
    }
    if (input.firePressed || input.firing) {
      const aim = Math.atan2(input.mouseWorld.y - car.y, input.mouseWorld.x - car.x);
      attack(aim);
    }
  }

  function vehicleTouchesBuilding(car) {
    const halfLength = car.length * 0.34;
    const halfWidth = car.width * 0.42;
    const cos = Math.cos(car.angle);
    const sin = Math.sin(car.angle);
    // Test the car's corners against each building's axis-aligned box via a street projection.
    for (let index = 0; index < buildings.length; index += 1) {
      const building = buildings[index];
      const nearestX = clamp(car.x, building.x, building.x + building.w);
      const nearestY = clamp(car.y, building.y, building.y + building.h);
      const dx = car.x - nearestX;
      const dy = car.y - nearestY;
      if (Math.abs(dx * cos + dy * sin) < halfLength && Math.abs(-dx * sin + dy * cos) < halfWidth) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- pedestrians

  function updatePedestrians(dt) {
    for (let index = 0; index < state.peds.length; index += 1) {
      const ped = state.peds[index];
      if (ped.dead) { ped.deadTimer += dt; continue; }
      if (ped.timer > 0) ped.timer -= dt;
      let threatX = 0;
      let threatY = 0;
      let fleeing = false;
      if (state.alarm > 0) {
        const distance = Math.hypot(player.x - ped.x, player.y - ped.y);
        if (distance < 330) { fleeing = true; threatX = player.x; threatY = player.y; }
      }
      if (!fleeing) {
        for (let carIndex = 0; carIndex < state.traffic.length; carIndex += 1) {
          const car = state.traffic[carIndex];
          if (Math.abs(car.speed) > 38 && distanceSq(car.x, car.y, ped.x, ped.y) < 130 * 130) {
            fleeing = true; threatX = car.x; threatY = car.y; break;
          }
        }
      }
      if (fleeing) {
        ped.mode = 'flee';
        ped.timer = Math.max(ped.timer, 1.3);
      } else if (ped.mode === 'flee' && ped.timer <= 0) {
        ped.mode = 'walk';
        chooseNextPedestrianWaypoint(ped);
      }
      const targetX = ped.mode === 'flee' ? ped.x * 2 - threatX : ped.target.x;
      const targetY = ped.mode === 'flee' ? ped.y * 2 - threatY : ped.target.y;
      const dx = targetX - ped.x;
      const dy = targetY - ped.y;
      const distance = Math.hypot(dx, dy);
      const speed = ped.mode === 'flee' ? PEDESTRIAN.fleeSpeed : PEDESTRIAN.walkSpeed;
      if (distance > 2) {
        const angle = Math.atan2(dy, dx);
        ped.angle += clamp(angleDelta(ped.angle, angle), -5 * dt, 5 * dt);
        const moveX = Math.cos(ped.angle) * speed * dt;
        const moveY = Math.sin(ped.angle) * speed * dt;
        if (!isSolid(ped.x + moveX, ped.y + moveY, 7)) { ped.x += moveX; ped.y += moveY; }
        else if (ped.mode === 'walk') chooseNextPedestrianWaypoint(ped);
      }
      ped.speed += (speed - ped.speed) * Math.min(1, dt * 6);
      if (!fleeing && distance < 8 && ped.mode === 'walk') chooseNextPedestrianWaypoint(ped);
      ped.stride += dt * (ped.mode === 'flee' ? 12 : 5);
      if (state.alarm > 0) state.alarm = Math.max(0, state.alarm - dt);
    }
  }

  // ---------------------------------------------------------------- police and damage

  function updatePoliceResponse(dt) {
    policeSystem.update(state, dt);
    for (let index = 0; index < state.police.length; index += 1) {
      const cop = state.police[index];
      if (cop.destroyed) continue;
      if (cop.kind === 'foot' && player.vehicle) {
        // Foot patrols cannot catch a moving car; they still hurt Vale close alongside it.
        const distance = Math.hypot(cop.x - player.vehicle.x, cop.y - player.vehicle.y);
        if (distance < 44) damagePlayer(14 + state.wanted * 2, 'police');
      }
      if (cop.kind === 'police' && player.vehicle) {
        const distance = distanceSq(cop.x, cop.y, player.vehicle.x, player.vehicle.y);
        if (distance < 50 * 50 && Math.abs(cop.speed - player.vehicle.speed) > 40) {
          damagePlayer(8 + state.wanted, 'ram');
          player.vehicle.health -= 10;
          state.shake = Math.max(state.shake, 5);
        }
      }
      if (cop.kind === 'police' && !player.vehicle && Math.hypot(cop.x - player.x, cop.y - player.y) < 30) damagePlayer(10, 'ram');
    }
    let visible = false;
    const position = playerPosition();
    for (let index = 0; index < state.police.length; index += 1) {
      const cop = state.police[index];
      if (cop.destroyed) continue;
      if (Math.hypot(cop.x - position.x, cop.y - position.y) < WANTED.sightRadius) { visible = true; break; }
    }
    state.policeSight = visible ? 1 : 0;
    if (state.wanted <= 0) return;
    if (visible) {
      state.outOfSight = 0;
    } else {
      state.outOfSight = (state.outOfSight || 0) + dt;
    }
    if (state.outOfSight > WANTED.decayAfter) {
      state.heat = Math.max(0, state.heat - WANTED.decayRate * dt);
      if (state.heat <= 0 && state.outOfSight > WANTED.decayAfter + 1.5) {
        state.wanted = Math.max(0, state.wanted - 1);
        state.outOfSight = visible ? 0 : WANTED.decayAfter + 0.8;
        if (state.wanted === 0) showMessage('You lost the division.', 3);
      }
    }
  }

  function damagePlayer(amount, source) {
    if (player.dead || player.invulnerable > 0) return;
    let remaining = amount;
    if (player.armour > 0) {
      const absorbed = Math.min(player.armour, remaining * 0.6);
      player.armour -= absorbed;
      remaining -= absorbed;
    }
    player.health -= remaining;
    state.flash = 0.22;
    state.shake = Math.max(state.shake, source === 'ram' ? 5 : 1.8);
    emitSound('hit');
    if (player.health <= 0) {
      player.health = 0;
      player.dead = true;
      state.dead = true;
      state.deadTimer = 0;
      if (player.vehicle) {
        player.vehicle.playerOwned = false;
        player.vehicle.driver = false;
        player.vehicle = null;
      }
      showMessage('Flatlined. St. Orra will send a bill.', 4);
    }
  }

  // ---------------------------------------------------------------- bullets and mission actors

  function updateBullets(dt) {
    for (let index = state.bullets.length - 1; index >= 0; index -= 1) {
      const bullet = state.bullets[index];
      bullet.life -= dt;
      bullet.trail += dt;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      let hit = bullet.life <= 0 || isSolid(bullet.x, bullet.y, 2);
      if (!hit && bullet.owner === 'player') {
        for (let targetIndex = 0; targetIndex < state.police.length; targetIndex += 1) {
          const cop = state.police[targetIndex];
          if (!cop.destroyed && distanceSq(bullet.x, bullet.y, cop.x, cop.y) < 24 * 24) {
            applyDamage(cop, bullet.damage, 'player'); hit = true; break;
          }
        }
        if (!hit) {
          for (let targetIndex = 0; targetIndex < state.peds.length; targetIndex += 1) {
            const ped = state.peds[targetIndex];
            if (!ped.dead && distanceSq(bullet.x, bullet.y, ped.x, ped.y) < 14 * 14) {
              // The temporary copy keeps wanted heat from the original damageTarget path while
              // the real ped still receives the bullet's final health change below.
              applyDamage({ kind: 'ped', ...ped }, bullet.damage, 'player');
              ped.health -= bullet.damage;
              if (ped.health <= 0) { ped.dead = true; ped.deadTimer = 0; state.pedsKilled += 1; addWantedHeat(0.22); }
              hit = true; break;
            }
          }
        }
        if (!hit) {
          for (let targetIndex = 0; targetIndex < state.missionActors.length; targetIndex += 1) {
            const actor = state.missionActors[targetIndex];
            if (!actor.dead && distanceSq(bullet.x, bullet.y, actor.x, actor.y) < 22 * 22) {
              applyDamage(actor, bullet.damage, 'player'); hit = true; break;
            }
          }
        }
      } else if (!hit) {
        const position = playerPosition();
        const hitRadius = player.vehicle ? 28 : 14;
        if (distanceSq(bullet.x, bullet.y, position.x, position.y) < hitRadius * hitRadius) {
          damagePlayer(bullet.damage, 'bullet');
          emitBurst(bullet.x, bullet.y, '#ff526b', 5);
          hit = true;
        }
      }
      if (hit) {
        emitBurst(bullet.x, bullet.y, bullet.owner === 'player' ? '#ffcf4a' : '#ff6b6b', 5);
        emitBurst(bullet.x, bullet.y, '#6b6560', 2, 'debris');
        state.bullets.splice(index, 1);
      }
    }
  }

  function updateMissionActors(dt) {
    for (let index = 0; index < state.missionActors.length; index += 1) {
      const actor = state.missionActors[index];
      if (actor.dead) continue;
      const position = playerPosition();
      const dx = position.x - actor.x;
      const dy = position.y - actor.y;
      const distance = Math.hypot(dx, dy);
      if (actor.chase && distance < 470) {
        const angle = Math.atan2(dy, dx);
        actor.angle += clamp(angleDelta(actor.angle, angle), -3.2 * dt, 3.2 * dt);
        if (distance > 52) {
          actor.x += Math.cos(actor.angle) * 58 * dt;
          actor.y += Math.sin(actor.angle) * 58 * dt;
        }
        actor.fireTimer -= dt;
        if (actor.fireTimer <= 0 && distance < 380) {
          actor.fireTimer = 0.9 + random() * 1.1;
          addMuzzleFlash(actor.x, actor.y, actor.angle, 'enemy');
          state.bullets.push({
            x: actor.x, y: actor.y,
            vx: Math.cos(actor.angle) * 470, vy: Math.sin(actor.angle) * 470,
            life: 0.9, damage: actor.kind === 'boss' ? 15 : 9,
            owner: 'enemy', angle: actor.angle, trail: 0,
          });
          emitSound('policeShot');
        }
      } else if (!actor.chase && distance < 44) {
        // Couriers shove past Vale if the meeting takes too long.
        actor.x -= Math.cos(actor.angle) * 32 * dt;
        actor.y -= Math.sin(actor.angle) * 32 * dt;
      }
    }
  }

  // ---------------------------------------------------------------- transient effects and camera

  function updateParticles(dt) {
    for (let index = state.particles.length - 1; index >= 0; index -= 1) {
      const particle = state.particles[index];
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.94;
      particle.vy *= 0.94;
      if (particle.life <= 0) state.particles.splice(index, 1);
    }
  }

  function updateSurfaceEffects(dt) {
    for (let index = state.skids.length - 1; index >= 0; index -= 1) {
      state.skids[index].life -= dt;
      if (state.skids[index].life <= 0) state.skids.splice(index, 1);
    }
    for (let index = state.exhaust.length - 1; index >= 0; index -= 1) {
      const puff = state.exhaust[index];
      puff.life -= dt;
      puff.x += puff.vx * dt;
      puff.y += puff.vy * dt;
      puff.vx *= 0.95;
      puff.vy *= 0.95;
      puff.size += dt * 8;
      if (puff.life <= 0) state.exhaust.splice(index, 1);
    }
    for (let index = state.muzzles.length - 1; index >= 0; index -= 1) {
      state.muzzles[index].life -= dt;
      if (state.muzzles[index].life <= 0) state.muzzles.splice(index, 1);
    }
    for (let index = state.spray.length - 1; index >= 0; index -= 1) {
      const drop = state.spray[index];
      drop.life -= dt;
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      drop.vx *= 0.96;
      drop.vy *= 0.96;
      if (drop.life <= 0) state.spray.splice(index, 1);
    }
    // Idling and cruising traffic leaves exhaust in the spray, so a frozen frame still reads as live.
    state.trafficPuffTimer = (state.trafficPuffTimer || 0) + dt;
    if (state.trafficPuffTimer <= 0.085) return;
    state.trafficPuffTimer = 0;
    const position = playerPosition();
    for (let index = 0; index < state.traffic.length; index += 1) {
      const car = state.traffic[index];
      if (car === player.vehicle || Math.abs(car.speed) < 28) continue;
      if (Math.abs(car.x - position.x) > 640 || Math.abs(car.y - position.y) > 430) continue;
      const rear = rearWheelPosition(car, Math.random() < 0.5 ? -1 : 1);
      addExhaustPuff(rear.x, rear.y, car.angle, car.speed, car.type === 'tern' ? '#8eb1b7' : '#a7bdc2');
    }
    for (let index = 0; index < state.police.length; index += 1) {
      const cop = state.police[index];
      if (cop.kind !== 'police' || cop.destroyed || Math.abs(cop.speed) < 35) continue;
      const rear = rearWheelPosition(cop, Math.random() < 0.5 ? -1 : 1);
      addExhaustPuff(rear.x, rear.y, cop.angle, cop.speed, '#8eb1b7');
    }
  }

  function updateCamera(dt) {
    const position = playerPosition();
    const angle = player.vehicle ? player.vehicle.angle : 0;
    const lookAhead = player.vehicle ? CAMERA.lookAhead : 0;
    const targetX = position.x + Math.cos(angle) * lookAhead;
    const targetY = position.y + Math.sin(angle) * lookAhead;
    const follow = player.vehicle ? CAMERA.driveFollow : CAMERA.follow;
    state.camera.x += (targetX - state.camera.x) * follow;
    state.camera.y += (targetY - state.camera.y) * follow;
    state.camera.zoom = 1;
    state.shake = Math.max(0, state.shake - CAMERA.shakeDecay * dt);
    state.flash = Math.max(0, state.flash - dt);
  }

  // ---------------------------------------------------------------- main simulation step

  function step(dt, input) {
    state.soundEvents.length = 0;
    if (state.dead) {
      state.deadTimer += dt;
      if (state.deadTimer > 3.4) respawn();
      updateParticles(dt);
      updateCamera(dt);
      return;
    }
    state.time += dt;
    state.clockMinutes = (22 * 60 + 40 + state.time / 6) % (24 * 60);
    if (state.messageTimer > 0) {
      state.messageTimer -= dt;
      if (state.messageTimer <= 0) state.message = '';
    }
    if (state.hudDialogue) {
      state.hudDialogue.timer -= dt;
      if (state.hudDialogue.timer <= 0) state.hudDialogue = null;
    }
    if (state.alarm > 0) state.alarm = Math.max(0, state.alarm - dt);
    updatePlayerMovement(dt, input);
    updatePedestrians(dt);
    trafficSystem.update(dt, state);
    updatePoliceResponse(dt);
    updateBullets(dt);
    updateMissionActors(dt);
    missions.update(state, dt);
    updateParticles(dt);
    updateSurfaceEffects(dt);
    sideJobs.update(state, dt);
    radio.update(state, dt);
    updateCamera(dt);
    const position = playerPosition();
    state.district = city.districtAt(position.x, position.y);
    state.nearVehicle = player.vehicle ? null : findNearestVehicle(66);
    state.missionMarker = missions.markerFor(state);
    state.objective = missions.objectiveFor(state)?.text || (state.credits ? 'Leave Port Kessel' : state.objective);
    state.driveDistance = Math.min(999999, state.driveDistance);
    // Hard caps protect long sessions from unbounded arrays.
    if (state.police.length > 32) state.police.length = 32;
    if (state.peds.length > 72) state.peds.splice(0, state.peds.length - 72);
    if (state.bullets.length > 120) state.bullets.splice(0, state.bullets.length - 120);
  }

  // ---------------------------------------------------------------- death, persistence and staging

  function respawn() {
    const fee = Math.min(state.money, PLAYER.respawnFee);
    state.money = Math.max(0, state.money - fee);
    player.x = HOSPITAL.x; player.y = HOSPITAL.y;
    player.health = PLAYER.respawnHealth;
    player.armour = Math.max(10, player.armour);
    player.dead = false; state.dead = false; state.deadTimer = 0;
    player.invulnerable = 2.2;
    state.wanted = 0; state.heat = 0; state.police.length = 0;
    state.camera.x = player.x; state.camera.y = player.y;
    showMessage(`St. Orra Hospital. Care costs $${fee}. The division lost interest.`, 4.4);
  }

  function save() {
    try {
      const position = playerPosition();
      const payload = {
        version: SAVE_VERSION,
        x: position.x, y: position.y, onFoot: !player.vehicle,
        money: state.money, mission: state.mission, missionStep: state.missionStep,
        missionsDone: state.missionsDone, wanted: state.wanted, health: player.health,
        armour: player.armour, pistolRounds: state.pistolRounds, weapon: state.weapon,
        clockMinutes: state.clockMinutes, seed: state.seed,
        savedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function hasSave() {
    try { return Boolean(window.localStorage.getItem(STORAGE_KEY)); } catch { return false; }
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || data.version !== SAVE_VERSION) return false;
      reset();
      player.x = Number(data.x) || SAFEHOUSE.x;
      player.y = Number(data.y) || SAFEHOUSE.y;
      player.health = clamp(Number(data.health) || 100, 20, 100);
      player.armour = clamp(Number(data.armour) || 0, 0, 75);
      state.money = Number(data.money) || 0;
      state.wanted = clamp(Number(data.wanted) || 0, 0, 5);
      state.pistolRounds = Number(data.pistolRounds) || 0;
      state.weapon = data.weapon === 'pistol' ? 'pistol' : 'fists';
      state.clockMinutes = Number(data.clockMinutes) || 22 * 60 + 40;
      state.missionsDone = Number(data.missionsDone) || 0;
      if (Number.isInteger(data.mission) && data.mission >= 0 && data.mission < missions.definitions.length) {
        missions.resume(state, data.mission, clamp(Number(data.missionStep) || 0, 0, 4));
        state.objective = missionStepText(state);
      }
      state.camera.x = player.x; state.camera.y = player.y;
      state.wanted = clamp(state.wanted, 0, 5);
      radio.sync(state);
      showMessage('Continue: Port Kessel remembers you.', 3.5);
      return true;
    } catch {
      return false;
    }
  }

  function teleport(x, y) {
    player.x = x; player.y = y;
    if (player.vehicle) {
      player.vehicle.x = x; player.vehicle.y = y;
    }
    state.camera.x = x; state.camera.y = y;
  }

  function setVehicle(type, x, y, angle) {
    const car = createTrafficCar(type, x, y, angle, trafficRandom, false);
    car.playerOwned = true;
    car.ai = false;
    car.speed = 0;
    state.traffic.push(car);
    player.vehicle = car;
    player.x = x; player.y = y;
    state.currentVehicleName = VEHICLE[type].name;
    state.camera.x = x; state.camera.y = y;
    state.weapon = 'pistol';
    return car;
  }

  // Staged scenes use this to put a specific wanted level on screen immediately.
  function triggerWanted(level) {
    state.wanted = clamp(level, 0, 5);
    state.heat = 0;
    state.policeSpawnTimer = 0.1;
    for (let index = state.police.length - 1; index >= 0; index -= 1) {
      if (state.police[index].kind === 'police') state.police.splice(index, 1);
    }
    for (let index = 0; index < level; index += 1) policeSystem.spawnCruiser(state);
  }

  function addPoliceNear(x, y, count) {
    const added = [];
    for (let index = 0; index < count; index += 1) {
      const cop = {
        kind: 'police', type: 'tern',
        x: x + Math.cos(index * 2.1) * (160 + index * 42),
        y: y + Math.sin(index * 2.1) * (160 + index * 42),
        angle: index * 2.1, speed: 90, health: VEHICLE.tern.health,
        width: VEHICLE.tern.width, length: VEHICLE.tern.length,
        color: VEHICLE.tern.color, driver: true, playerOwned: false, ai: true,
        destroyed: false, sirenPhase: index, fireTimer: 1.2, wheel: 0,
        plate: 'PKPD-' + (400 + index),
      };
      state.police.push(cop);
      added.push(cop);
    }
    return added;
  }

  function spawnCarAt(type, x, y, angle, driver = true) {
    const car = createTrafficCar(type, x, y, angle, trafficRandom, driver);
    const direction = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))
      ? (Math.cos(angle) >= 0 ? 0 : 2)
      : (Math.sin(angle) >= 0 ? 1 : 3);
    const lane = DIR_LANE[direction];
    const gridX = clamp(Math.round((x - city.origin) / city.pitch), 0, 8);
    const gridY = clamp(Math.round((y - city.origin) / city.pitch), 0, 8);
    car.dir = direction;
    car.gi = gridX; car.gj = gridY;
    car.fromX = x + lane.x; car.fromY = y + lane.y;
    const nextGridX = gridX + (direction === 0 ? 1 : direction === 2 ? -1 : 0);
    const nextGridY = gridY + (direction === 1 ? 1 : direction === 3 ? -1 : 0);
    car.toX = city.avenue(nextGridX) + lane.x;
    car.toY = city.cross(nextGridY) + lane.y;
    car.lengthSegment = Math.max(24, Math.hypot(car.toX - car.fromX, car.toY - car.fromY));
    car.progress = 0;
    placeCarOnRoad(car);
    car.ai = false;
    car.speed = driver ? 54 : 0;
    car.playerOwned = false;
    state.traffic.push(car);
    return car;
  }

  function placeCarOnRoad(car) {
    const progress = clamp(car.progress, 0, 1);
    car.x = car.fromX + (car.toX - car.fromX) * progress;
    car.y = car.fromY + (car.toY - car.fromY) * progress;
    car.angle = Math.atan2(car.toY - car.fromY, car.toX - car.fromX);
  }

  function spawnPedAt(x, y, mode = 'walk') {
    const ped = spawnRandomPedestrianAt(x, y);
    ped.mode = mode;
    ped.target = { x: x + 110 * Math.cos(ped.angle), y: y + 60 * Math.sin(ped.angle) };
    ped.timer = mode === 'flee' ? 2.5 : 0;
    return ped;
  }

  function setMissionDemo(index = 0) {
    missions.begin(state, index);
  }

  function getClock() { return formatClock(state.clockMinutes); }

  reset();
  return {
    state, city, player, missions, trafficSystem, policeSystem,
    step, reset, interact, save, load, hasSave, teleport, setVehicle,
    addMuzzle: addMuzzleFlash, burst: emitBurst, addExhaust: addExhaustPuff,
    addSpray: addSprayDrop, addSkid: addSkidMark, radio, sideJobs,
    triggerWanted, addPoliceNear, setMissionDemo, spawnPedestrian, spawnCarAt, spawnPedAt, getClock,
    saveKey: STORAGE_KEY,
  };
}
