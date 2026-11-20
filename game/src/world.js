// The living city. world.js advances Port Kessel one fixed tick at a time: character movement,
// vehicles, bullets, pedestrians, police, wanted heat, missions and the 12-hour clock. Drawing,
// input and browser storage are kept at the edges; this module can be stepped headlessly.

import {
  CAMERA, CITY, HOSPITAL, MISSION_START, PLAYER, SAFEHOUSE, STEP, STORAGE_KEY,
  VEHICLE, WANTED, PEDESTRIAN, TRAFFIC,
} from './config.js';
import { angleDelta, clamp, createRandom, distanceSq, hashSeed } from './random.js';
import { createCity } from './city.js';
import { createTraffic, createTrafficCar } from './traffic.js';
import { createPolice } from './police.js';
import { createMissions, missionStepText } from './missions.js';
import { createRadio } from './radio.js';
import { createSideJobs } from './sidejobs.js';

const DIR_LANE = [{ x: 0, y: 21 }, { x: -21, y: 0 }, { x: 0, y: -21 }, { x: 21, y: 0 }];
const SHOT_LIFE = 1.15;
const SAVE_VERSION = 1;

function circleRect(x, y, r, rect) {
  const nx = clamp(x, rect.x, rect.x + rect.w);
  const ny = clamp(y, rect.y, rect.y + rect.h);
  return distanceSq(x, y, nx, ny) < r * r;
}

function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function formatClock(minutes) {
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = Math.floor(minutes) % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function createWorld(seed) {
  const random = createRandom(Number(seed) || 7);
  const city = createCity(Number(seed) || 7);
  const trafficRandom = random.stream(11);
  const pedRandom = random.stream(23);
  const trafficSystem = createTraffic(null, city, trafficRandom);
  const policeSystem = createPolice(city, random.stream(37));
  const missions = createMissions(city, random.stream(43));
  const radio = createRadio();
  const sideJobs = createSideJobs();

  const state = {
    seed: Number(seed) || 7,
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

  function audio(type, extra) {
    const event = { type };
    if (extra) Object.assign(event, extra);
    state.soundEvents.push(event);
  }

  function message(text, seconds = 2.8) {
    state.message = text;
    state.messageTimer = seconds;
  }

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
    beginMission(0);
    message('Port Kessel. The rain never asks permission.', 4.5);
  }

  function seedNearbyTraffic() {
    // Guarantee a car on the strip and a van at Salt Market, so every new game is legible.
    const kestrel = createTrafficCar('kestrel', 1430, 1566, 0, trafficRandom);
    kestrel.ai = true; kestrel.driver = true;
    kestrel.gi = 4; kestrel.gj = 3; kestrel.dir = 0;
    kestrel.fromX = 1430; kestrel.fromY = 1566; kestrel.toX = 1780; kestrel.toY = 1566;
    kestrel.lengthSegment = 350; kestrel.progress = 0.08;
    state.traffic.push(kestrel);
    const bream = createTrafficCar('bream', 1030, 2310, Math.PI / 2, trafficRandom);
    bream.ai = true; bream.driver = true;
    bream.gi = 2; bream.gj = 6; bream.dir = 1;
    bream.fromX = 1030; bream.fromY = 2310; bream.toX = 1030; bream.toY = 2660;
    bream.lengthSegment = 350; bream.progress = 0.12;
    state.traffic.push(bream);
  }

  function spawnPedestrian() {
    let block = blocks[Math.floor(pedRandom() * blocks.length)];
    for (let attempt = 0; attempt < 16 && (block.kind === 'terminal' || block.kind === 'park'); attempt += 1) {
      block = blocks[Math.floor(pedRandom() * blocks.length)];
    }
    const edge = Math.floor(pedRandom() * 4);
    const perimeter = perimeterPoints(block);
    const point = perimeter[edge];
    const ped = {
      x: point.x + pedRandom() * Math.max(10, point.tx - point.x),
      y: point.y + pedRandom() * Math.max(10, point.ty - point.y),
      angle: Math.atan2(point.ty - point.y, point.tx - point.x),
      speed: 0, target: { x: point.tx, y: point.ty }, block, edge,
      mode: 'walk', timer: 0, health: 25, dead: false, deadTimer: 0,
      colour: pedRandom.pick ? pedRandom.pick(PEDESTRIAN.palette) : PEDESTRIAN.palette[Math.floor(pedRandom() * PEDESTRIAN.palette.length)],
      coat: Math.floor(pedRandom() * 4), stride: pedRandom() * Math.PI * 2, umbrella: pedRandom() < 0.22,
      crossTimer: 0, crossTarget: null,
    };
    // pedRandom.stream returns a callable without helpers; pick from the shared palette directly.
    ped.colour = PEDESTRIAN.palette[Math.floor(pedRandom() * PEDESTRIAN.palette.length)];
    state.peds.push(ped);
    return ped;
  }

  function perimeterPoints(block) {
    const l = block.x - 20;
    const t = block.y - 20;
    const r = block.x + block.size + 20;
    const b = block.y + block.size + 20;
    return [
      { x: l, y: t, tx: r, ty: t },
      { x: r, y: t, tx: r, ty: b },
      { x: r, y: b, tx: l, ty: b },
      { x: l, y: b, tx: l, ty: t },
    ];
  }

  function nextPedTarget(ped) {
    if (ped.mode === 'cross' && ped.crossTarget) {
      ped.target = ped.crossTarget;
      ped.crossTarget = null;
      return;
    }
    ped.edge = (ped.edge + 1) % 4;
    const points = perimeterPoints(ped.block);
    const edge = points[ped.edge];
    ped.target = { x: edge.tx, y: edge.ty };
    if (pedRandom() < PEDESTRIAN.crossChance) {
      const nx = Math.cos(ped.angle + Math.PI / 2) * 118;
      const ny = Math.sin(ped.angle + Math.PI / 2) * 118;
      ped.crossTarget = { x: clamp(ped.x + nx, 80, CITY.worldWidth - 80), y: clamp(ped.y + ny, 80, city.dockY - 40) };
      if (!city.isRoad(ped.crossTarget.x, ped.crossTarget.y)) ped.crossTarget = null;
    }
  }

  function solidAt(x, y, radius = 0) {
    if (x < 80 || y < 80 || x > CITY.worldWidth - 80 || y > city.dockY - 18) return true;
    for (let index = 0; index < buildings.length; index += 1) {
      const building = buildings[index];
      if (circleRect(x, y, radius, building)) return true;
    }
    return false;
  }

  function moveWithCollision(entity, dx, dy, radius) {
    const oldX = entity.x;
    const oldY = entity.y;
    entity.x += dx;
    if (solidAt(entity.x, entity.y, radius)) entity.x = oldX;
    entity.y += dy;
    if (solidAt(entity.x, entity.y, radius)) entity.y = oldY;
  }

  function spawnBullet(x, y, angle, speed, damage, owner) {
    state.bullets.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: SHOT_LIFE, damage, owner, angle, trail: 0,
    });
  }

  function addMuzzle(x, y, angle, owner) {
    state.muzzles.push({ x, y, angle, owner, life: 0.11, max: 0.11 });
    if (state.muzzles.length > 48) state.muzzles.shift();
  }

  function addExhaust(x, y, angle, speed, tint = '#a7bdc2') {
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

  function addSpray(x, y, angle, speed, tint = '#cfe8ea') {
    if (state.spray.length > 220) state.spray.shift();
    const side = (Math.random() - 0.5) * 34;
    state.spray.push({
      x: x + Math.cos(angle + Math.PI / 2) * side * 0.35,
      y: y + Math.sin(angle + Math.PI / 2) * side * 0.35,
      vx: -Math.cos(angle) * (18 + Math.random() * 44) + Math.cos(angle + Math.PI / 2) * side,
      vy: -Math.sin(angle) * (18 + Math.random() * 44) + Math.sin(angle + Math.PI / 2) * side,
      life: 0.28 + Math.random() * 0.42, max: 0.7,
      size: 1.2 + Math.random() * 2.8 + Math.min(3, Math.abs(speed) * 0.01),
      tint,
    });
  }

  function addSkid(x1, y1, x2, y2, width = 2.2, strength = 1) {
    if (state.skids.length > 360) state.skids.shift();
    state.skids.push({ x1, y1, x2, y2, width, life: 0.8 + strength * 0.75, max: 1.55, strength });
  }

  function rearWheel(car, side) {
    const px = car.x - Math.cos(car.angle) * car.length * 0.34;
    const py = car.y - Math.sin(car.angle) * car.length * 0.34;
    return {
      x: px + Math.cos(car.angle + Math.PI / 2) * car.width * 0.33 * side,
      y: py + Math.sin(car.angle + Math.PI / 2) * car.width * 0.33 * side,
    };
  }

  function shoot(angle) {
    if (player.dead) return;
    if (state.weapon === 'pistol') {
      if (player.reload > 0) return;
      if (state.pistolRounds <= 0) {
        message('Pistol empty. Press R to reload.', 2.2);
        return;
      }
      if (player.vehicle) {
        const side = player.vehicle.angle + Math.PI / 2;
        spawnBullet(player.vehicle.x + Math.cos(side) * 14, player.vehicle.y + Math.sin(side) * 14, angle, 940, PLAYER.bulletDamage, 'player');
      } else {
        spawnBullet(player.x + Math.cos(angle) * 16, player.y + Math.sin(angle) * 16, angle, 940, PLAYER.bulletDamage, 'player');
      }
      state.pistolRounds -= 1;
      state.playerShots += 1;
      player.reload = PLAYER.pistolCooldown;
      state.shake = Math.max(state.shake, 0.8);
      state.flash = 0.04;
      addMuzzle(player.vehicle ? player.vehicle.x : player.x, player.vehicle ? player.vehicle.y : player.y, angle, 'player');
      audio('shot', { police: false });
      state.alarm = Math.max(state.alarm, 2.4);
      raiseWanted(0.17);
      player.angle = angle;
    } else {
      if (player.reload > 0) return;
      player.reload = PLAYER.fistCooldown;
      state.shake = Math.max(state.shake, 0.25);
      audio('punch');
      hitCone(player.x, player.y, angle, PLAYER.fistRange, PLAYER.fistDamage, 'player');
    }
  }

  function hitCone(x, y, angle, range, damage, owner) {
    const targets = [];
    for (let index = 0; index < state.peds.length; index += 1) {
      const ped = state.peds[index];
      if (ped.dead) continue;
      const d = Math.hypot(ped.x - x, ped.y - y);
      const a = Math.atan2(ped.y - y, ped.x - x);
      if (d < range && Math.abs(angleDelta(angle, a)) < 1.2) targets.push({ target: ped, d });
    }
    for (let index = 0; index < state.police.length; index += 1) {
      const cop = state.police[index];
      if (cop.destroyed) continue;
      const d = Math.hypot(cop.x - x, cop.y - y);
      const a = Math.atan2(cop.y - y, cop.x - x);
      if (d < range && Math.abs(angleDelta(angle, a)) < 1.2) targets.push({ target: cop, d });
    }
    for (let index = 0; index < state.missionActors.length; index += 1) {
      const actor = state.missionActors[index];
      if (actor.dead) continue;
      const d = Math.hypot(actor.x - x, actor.y - y);
      const a = Math.atan2(actor.y - y, actor.x - x);
      if (d < range && Math.abs(angleDelta(angle, a)) < 1.2) targets.push({ target: actor, d });
    }
    targets.sort((a, b) => a.d - b.d);
    if (targets.length) damageTarget(targets[0].target, damage, owner);
  }

  function damageTarget(target, damage, owner) {
    if (target.kind === 'police' || target.kind === 'tern' || target.type === 'tern') {
      target.health -= damage;
      target.lastHit = 1.4;
      if (target.health <= 0) {
        target.destroyed = true;
        target.driver = false;
        state.policeKilled += 1;
        raiseWanted(0.8);
        burst(target.x, target.y, '#ffb24e', 12);
        burst(target.x, target.y, '#6e6252', 12, 'debris');
        audio('explosion');
      }
      return;
    }
    target.health = (target.health ?? 30) - damage;
    target.lastHit = 1.2;
    if (target.health <= 0) {
      if (target.kind === 'ped' || target.kind === 'courier') {
        target.dead = true; target.deadTimer = 0;
        state.pedsKilled += 1;
        raiseWanted(0.45);
        burst(target.x, target.y, '#b93b5a', 8);
      } else if (target.kind === 'foot' || target.kind === 'police') {
        target.destroyed = true;
        state.policeKilled += 1;
        raiseWanted(0.65);
        burst(target.x, target.y, '#4b9be8', 9);
      } else if (target.kind === 'enemy' || target.kind === 'boss') {
        target.dead = true;
        burst(target.x, target.y, '#d7a34e', 10);
        state.money += 25;
        if (target.kind === 'boss') message('Okonkwo goes down. The Exchange falls silent.', 4);
      }
    }
  }

  function burst(x, y, colour, count, kind = 'spark') {
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

  function raiseWanted(amount) {
    if (state.wanted >= WANTED.max) return;
    state.heat += amount;
    state.lastCrime = state.time;
    if (state.heat >= 0.9) {
      state.heat = 0;
      state.wanted = Math.min(WANTED.max, state.wanted + 1);
      state.policeSpawnTimer = Math.min(state.policeSpawnTimer, 0.6);
      audio('siren');
      message(`Wanted level ${state.wanted}. ${WANTED.stars[state.wanted]}`, 3);
    }
  }

  function nearestVehicle(radius = 62) {
    let best = null;
    let bestD = radius * radius;
    for (let index = 0; index < state.traffic.length; index += 1) {
      const car = state.traffic[index];
      if (car.destroyed) continue;
      const d = distanceSq(player.x, player.y, car.x, car.y);
      if (d < bestD) { best = car; bestD = d; }
    }
    return best;
  }

  function enterVehicle(car) {
    if (!car || car.destroyed) return false;
    if (car.driver) {
      car.driver = false;
      const eject = spawnPedestrianAt(car.x + Math.cos(car.angle + Math.PI / 2) * 24, car.y + Math.sin(car.angle + Math.PI / 2) * 24);
      eject.mode = 'flee';
      eject.timer = 5;
      eject.colour = '#d1a070';
      eject.umbrella = false;
      car.ai = false;
      car.playerOwned = true;
      raiseWanted(0.34);
      message('Stolen. The driver is already running.', 2.6);
      audio('engine');
    } else {
      car.playerOwned = true;
      car.ai = false;
    }
    player.vehicle = car;
    player.x = car.x; player.y = car.y;
    car.speed = Math.max(-20, Math.min(car.speed, 90));
    state.currentVehicleName = VEHICLE[car.type]?.name || 'Kestrel coupe';
    state.weapon = 'pistol';
    message(`Entered ${state.currentVehicleName}.`, 2.4);
    return true;
  }

  function spawnPedestrianAt(x, y) {
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

  function exitVehicle() {
    const car = player.vehicle;
    if (!car) return;
    car.playerOwned = false;
    car.ai = false;
    car.speed *= 0.3;
    const side = car.angle + Math.PI / 2;
    let x = car.x + Math.cos(side) * 28;
    let y = car.y + Math.sin(side) * 28;
    if (solidAt(x, y, PLAYER.radius)) {
      x = car.x - Math.cos(side) * 28;
      y = car.y - Math.sin(side) * 28;
    }
    player.x = x; player.y = y;
    player.vehicle = null;
    state.currentVehicleName = '';
    message('On foot.', 1.6);
  }

  function interact() {
    if (player.dead) return;
    if (player.vehicle) { exitVehicle(); return; }
    const car = nearestVehicle(66);
    if (car) { enterVehicle(car); return; }
    // A courier at arm's length hands over whatever Marrow sent you for.
    for (let index = 0; index < state.missionActors.length; index += 1) {
      const actor = state.missionActors[index];
      if (actor.dead) continue;
      if (distanceSq(player.x, player.y, actor.x, actor.y) < 42 * 42) {
        if (actor.kind === 'courier') {
          actor.dead = true;
          message('Ledger taken. Pell is face-down in the rain.', 3.2);
          raiseWanted(0.22);
          return;
        }
      }
    }
    message('Nothing to use here.', 1.3);
  }

  function beginMission(index) {
    missions.begin(state, index);
  }

  function updatePlayer(dt, input) {
    if (player.dead) return;
    if (player.reload > 0) player.reload = Math.max(0, player.reload - dt);
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);
    if (player.vehicle) {
      updateDrivenVehicle(player.vehicle, dt, input);
      return;
    }
    const moving = input.axis;
    const speed = input.aim ? PLAYER.aimWalk : input.sprint ? PLAYER.sprint : PLAYER.walk;
    const length = Math.hypot(moving.x, moving.y);
    player.sprint = input.sprint && length > 0;
    if (length > 0) {
      moveWithCollision(player, moving.x * speed * dt, moving.y * speed * dt, PLAYER.radius);
      if (!input.aim) player.angle = Math.atan2(moving.y, moving.x);
      player.walkPhase += dt * (player.sprint ? 12 : 7);
      if (Math.floor(player.walkPhase) !== Math.floor(player.walkPhase - dt * (player.sprint ? 12 : 7))) audio('footstep', { sprint: player.sprint });
    }
    if (input.aim) {
      const aimAngle = Math.atan2(input.mouseWorld.y - player.y, input.mouseWorld.x - player.x);
      player.angle = aimAngle;
      state.aimAngle = aimAngle;
    }
    state.nearVehicle = nearestVehicle(66);
    if (input.firing || input.firePressed) shoot(player.angle);
  }

  function updateDrivenVehicle(car, dt, input) {
    const spec = VEHICLE[car.type] || VEHICLE.kestrel;
    const forward = (input.up ? 1 : 0) - (input.brake ? 1 : 0);
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (forward > 0) car.speed += spec.accel * dt;
    else if (forward < 0) car.speed -= (car.speed > 0 ? spec.brake : spec.accel * 0.55) * dt;
    else car.speed *= Math.exp(-0.52 * dt);
    car.speed = clamp(car.speed, -spec.reverse, spec.maxSpeed);
    const steerFactor = 0.32 + Math.min(1, Math.abs(car.speed) / 105) * 0.68;
    state.tyreSqueal = Math.abs(steer) > 0 && Math.abs(car.speed) > 82 ? 1 : 0;
    if (Math.abs(car.speed) > 2) {
      const direction = car.speed >= 0 ? 1 : -1;
      car.angle += steer * spec.steer * steerFactor * direction * dt;
    }
    // At low speed the front wheels bite less: the coupe can creep out of a junction without
    // snapping around, while a full-speed handbrake still swings the tail wide.
    if (Math.abs(car.speed) < 14 && steer !== 0) car.angle += steer * 0.3 * dt;
    // Rain on the quay makes every lane a little slick.
    if (Math.abs(car.speed) > 150) car.angle += Math.sin(car.x * 0.01 + car.y * 0.007) * 0.0009;
    car.wheel = (car.wheel || 0) + car.speed * dt * 0.18;
    const oldX = car.x;
    const oldY = car.y;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const damageSpeed = Math.abs(car.speed);
    if (vehicleHitsBuilding(car) || car.x < 70 || car.y < 70 || car.x > CITY.worldWidth - 70 || car.y > city.dockY - 30) {
      car.x = oldX; car.y = oldY;
      if (damageSpeed > 26) {
        const damage = damageSpeed * 0.055;
        car.health -= damage;
        state.shake = Math.max(state.shake, Math.min(9, damageSpeed * 0.035));
        audio('impact', { strength: damageSpeed / 150 });
        burst(car.x, car.y, '#ffcf6c', 12);
        burst(car.x, car.y, '#74675a', 9, 'debris');
      }
      car.speed *= -0.18;
    }
    const slip = Math.abs(car.speed) > 58 && (Math.abs(steer) > 0 || input.brake || Math.abs(car.speed) > 205);
    if (slip) {
      state.skidTimer = (state.skidTimer || 0) + dt;
      const tail = rearWheel(car, 0);
      const tail2 = rearWheel(car, 1);
      const back = Math.abs(car.speed) * dt * 0.92 + 1.5;
      addSkid(tail.x, tail.y, tail.x - Math.cos(car.angle) * back, tail.y - Math.sin(car.angle) * back, 2.4, 1);
      addSkid(tail2.x, tail2.y, tail2.x - Math.cos(car.angle) * back, tail2.y - Math.sin(car.angle) * back, 2.4, 1);
      if (Math.abs(car.speed) > 120 && Math.random() < 0.14) burst(tail.x, tail.y, '#7f9290', 1, 'spark');
    }
    if (Math.abs(car.speed) > 28) {
      state.exhaustTimer = (state.exhaustTimer || 0) + dt;
      if (state.exhaustTimer > 0.035) {
        state.exhaustTimer = 0;
        const tail = rearWheel(car, Math.random() < 0.5 ? -1 : 1);
        addExhaust(tail.x, tail.y, car.angle, car.speed, car.type === 'tern' ? '#8eb1b7' : '#a7bdc2');
      }
    }
    if (Math.abs(car.speed) > 82) {
      state.sprayTimer = (state.sprayTimer || 0) + dt;
      if (state.sprayTimer > 0.028) {
        state.sprayTimer = 0;
        const tail = rearWheel(car, Math.random() < 0.5 ? -1 : 1);
        addSpray(tail.x, tail.y, car.angle, car.speed);
      }
    }
    state.driveDistance += Math.abs(car.speed) * dt;
    state.currentVehicleName = spec.name;
    state.camera.x += (car.x - state.camera.x) * CAMERA.driveFollow;
    state.camera.y += (car.y - state.camera.y) * CAMERA.driveFollow;
    for (let index = 0; index < state.peds.length; index += 1) {
      const ped = state.peds[index];
      if (ped.dead) continue;
      const d = distanceSq(car.x, car.y, ped.x, ped.y);
      if (d < 60 * 60 && Math.abs(car.speed) > 12) {
        const nx = ped.x - car.x;
        const ny = ped.y - car.y;
        const len = Math.hypot(nx, ny) || 1;
        ped.x += nx / len * 18;
        ped.y += ny / len * 18;
        ped.mode = 'flee';
        ped.timer = 3.6;
        if (Math.abs(car.speed) > 55) {
          damageTarget({ ...ped, kind: 'ped' }, 100, 'vehicle');
          ped.dead = true;
          car.speed *= 0.82;
          state.shake = Math.max(state.shake, 4);
        }
      }
    }
    for (let index = 0; index < state.traffic.length; index += 1) {
      const other = state.traffic[index];
      if (other === car || other.destroyed || other.playerOwned) continue;
      const d = distanceSq(car.x, car.y, other.x, other.y);
      if (d < 38 * 38 && damageSpeed > 22) {
        other.health -= damageSpeed * 0.09;
        car.health -= damageSpeed * 0.035;
        other.speed = 0;
        car.speed *= 0.56;
        state.shake = Math.max(state.shake, Math.min(8, damageSpeed * 0.03));
        audio('impact', { strength: damageSpeed / 160 });
        burst((car.x + other.x) / 2, (car.y + other.y) / 2, '#ffcc71', 9);
        burst(other.x, other.y, '#55636a', 7, 'debris');
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
      burst(car.x, car.y, '#ffb24e', 24);
      burst(car.x, car.y, '#6d6152', 16, 'debris');
      audio('explosion');
      message('The car is finished. Get clear.', 3.4);
    }
    if (input.firePressed || input.firing) {
      const aim = Math.atan2(input.mouseWorld.y - car.y, input.mouseWorld.x - car.x);
      shoot(aim);
    }
  }

  function vehicleHitsBuilding(car) {
    const halfLength = car.length * 0.34;
    const halfWidth = car.width * 0.42;
    const cos = Math.cos(car.angle);
    const sin = Math.sin(car.angle);
    for (let index = 0; index < buildings.length; index += 1) {
      const b = buildings[index];
      const nx = clamp(car.x, b.x, b.x + b.w);
      const ny = clamp(car.y, b.y, b.y + b.h);
      const dx = car.x - nx;
      const dy = car.y - ny;
      if (Math.abs(dx * cos + dy * sin) < halfLength && Math.abs(-dx * sin + dy * cos) < halfWidth) return true;
    }
    return false;
  }

  function updatePeds(dt) {
    for (let index = 0; index < state.peds.length; index += 1) {
      const ped = state.peds[index];
      if (ped.dead) { ped.deadTimer += dt; continue; }
      if (ped.timer > 0) ped.timer -= dt;
      let threatX = 0;
      let threatY = 0;
      let fleeing = false;
      if (state.alarm > 0) {
        const d = Math.hypot(player.x - ped.x, player.y - ped.y);
        if (d < 330) { fleeing = true; threatX = player.x; threatY = player.y; }
      }
      if (!fleeing) {
        for (let cIndex = 0; cIndex < state.traffic.length; cIndex += 1) {
          const car = state.traffic[cIndex];
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
        nextPedTarget(ped);
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
        const nx = Math.cos(ped.angle) * speed * dt;
        const ny = Math.sin(ped.angle) * speed * dt;
        if (!solidAt(ped.x + nx, ped.y + ny, 7)) { ped.x += nx; ped.y += ny; }
        else if (ped.mode === 'walk') nextPedTarget(ped);
      }
      ped.speed += (speed - ped.speed) * Math.min(1, dt * 6);
      if (!fleeing && distance < 8 && ped.mode === 'walk') nextPedTarget(ped);
      ped.stride += dt * (ped.mode === 'flee' ? 12 : 5);
      if (state.alarm > 0) state.alarm = Math.max(0, state.alarm - dt);
    }
  }

  function updatePolice(dt) {
    policeSystem.update(state, dt);
    for (let index = 0; index < state.police.length; index += 1) {
      const cop = state.police[index];
      if (cop.destroyed) continue;
      if (cop.kind === 'foot' && player.vehicle) {
        // Foot patrols cannot catch a moving car; they keep their distance.
        const d = Math.hypot(cop.x - player.vehicle.x, cop.y - player.vehicle.y);
        if (d < 44) damagePlayer(14 + state.wanted * 2, 'police');
      }
      if (cop.kind === 'police' && player.vehicle) {
        const d = distanceSq(cop.x, cop.y, player.vehicle.x, player.vehicle.y);
        if (d < 50 * 50 && Math.abs(cop.speed - player.vehicle.speed) > 40) {
          damagePlayer(8 + state.wanted, 'ram');
          player.vehicle.health -= 10;
          state.shake = Math.max(state.shake, 5);
        }
      }
      if (cop.kind === 'police' && !player.vehicle && Math.hypot(cop.x - player.x, cop.y - player.y) < 30) damagePlayer(10, 'ram');
    }
    let visible = false;
    const px = player.vehicle ? player.vehicle.x : player.x;
    const py = player.vehicle ? player.vehicle.y : player.y;
    for (let index = 0; index < state.police.length; index += 1) {
      const cop = state.police[index];
      if (cop.destroyed) continue;
      if (Math.hypot(cop.x - px, cop.y - py) < WANTED.sightRadius) { visible = true; break; }
    }
    state.policeSight = visible ? 1 : 0;
    if (state.wanted > 0) {
      if (visible) state.outOfSight = 0;
      else state.outOfSight = (state.outOfSight || 0) + dt;
      if (state.outOfSight > WANTED.decayAfter) {
        state.heat = Math.max(0, state.heat - WANTED.decayRate * dt);
        if (state.heat <= 0 && state.outOfSight > WANTED.decayAfter + 1.5) {
          state.wanted = Math.max(0, state.wanted - 1);
          state.outOfSight = visible ? 0 : WANTED.decayAfter + 0.8;
          if (state.wanted === 0) message('You lost the division.', 3);
        }
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
    audio('hit');
    if (player.health <= 0) {
      player.health = 0;
      player.dead = true;
      state.dead = true;
      state.deadTimer = 0;
      if (player.vehicle) { player.vehicle.playerOwned = false; player.vehicle.driver = false; player.vehicle = null; }
      message('Flatlined. St. Orra will send a bill.', 4);
    }
  }

  function updateBullets(dt) {
    for (let index = state.bullets.length - 1; index >= 0; index -= 1) {
      const bullet = state.bullets[index];
      bullet.life -= dt;
      bullet.trail += dt;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      let hit = false;
      if (bullet.life <= 0 || solidAt(bullet.x, bullet.y, 2)) hit = true;
      if (!hit && bullet.owner === 'player') {
        for (let p = 0; p < state.police.length; p += 1) {
          const cop = state.police[p];
          if (!cop.destroyed && distanceSq(bullet.x, bullet.y, cop.x, cop.y) < 24 * 24) {
            damageTarget(cop, bullet.damage, 'player'); hit = true; break;
          }
        }
        if (!hit) {
          for (let p = 0; p < state.peds.length; p += 1) {
            const ped = state.peds[p];
            if (!ped.dead && distanceSq(bullet.x, bullet.y, ped.x, ped.y) < 14 * 14) {
              damageTarget({ kind: 'ped', ...ped }, bullet.damage, 'player');
              ped.health -= bullet.damage;
              if (ped.health <= 0) { ped.dead = true; ped.deadTimer = 0; state.pedsKilled += 1; raiseWanted(0.22); }
              hit = true; break;
            }
          }
        }
        if (!hit) {
          for (let p = 0; p < state.missionActors.length; p += 1) {
            const actor = state.missionActors[p];
            if (!actor.dead && distanceSq(bullet.x, bullet.y, actor.x, actor.y) < 22 * 22) {
              damageTarget(actor, bullet.damage, 'player'); hit = true; break;
            }
          }
        }
      } else if (!hit) {
        const px = player.vehicle ? player.vehicle.x : player.x;
        const py = player.vehicle ? player.vehicle.y : player.y;
        if (distanceSq(bullet.x, bullet.y, px, py) < (player.vehicle ? 28 * 28 : 14 * 14)) {
          damagePlayer(bullet.damage, 'bullet');
          burst(bullet.x, bullet.y, '#ff526b', 5);
          hit = true;
        }
      }
      if (hit) {
        burst(bullet.x, bullet.y, bullet.owner === 'player' ? '#ffcf4a' : '#ff6b6b', 5);
        burst(bullet.x, bullet.y, '#6b6560', 2, 'debris');
        state.bullets.splice(index, 1);
      }
    }
  }

  function updateMissionActors(dt) {
    for (let index = 0; index < state.missionActors.length; index += 1) {
      const actor = state.missionActors[index];
      if (actor.dead) continue;
      const px = player.vehicle ? player.vehicle.x : player.x;
      const py = player.vehicle ? player.vehicle.y : player.y;
      const dx = px - actor.x;
      const dy = py - actor.y;
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
          addMuzzle(actor.x, actor.y, actor.angle, 'enemy');
          state.bullets.push({ x: actor.x, y: actor.y, vx: Math.cos(actor.angle) * 470, vy: Math.sin(actor.angle) * 470, life: 0.9, damage: actor.kind === 'boss' ? 15 : 9, owner: 'enemy', angle: actor.angle, trail: 0 });
          audio('policeShot');
        }
      } else if (!actor.chase && distance < 44) {
        // Courier shoves past Vale if you take too long.
        actor.x -= Math.cos(actor.angle) * 32 * dt;
        actor.y -= Math.sin(actor.angle) * 32 * dt;
      }
    }
  }

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

  function updateEffects(dt) {
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
    if (state.trafficPuffTimer > 0.085) {
      state.trafficPuffTimer = 0;
      const px = player.vehicle ? player.vehicle.x : player.x;
      const py = player.vehicle ? player.vehicle.y : player.y;
      for (let index = 0; index < state.traffic.length; index += 1) {
        const car = state.traffic[index];
        if (car === player.vehicle || Math.abs(car.speed) < 28) continue;
        if (Math.abs(car.x - px) > 640 || Math.abs(car.y - py) > 430) continue;
        const tail = rearWheel(car, Math.random() < 0.5 ? -1 : 1);
        addExhaust(tail.x, tail.y, car.angle, car.speed, car.type === 'tern' ? '#8eb1b7' : '#a7bdc2');
      }
      for (let index = 0; index < state.police.length; index += 1) {
        const cop = state.police[index];
        if (cop.kind !== 'police' || cop.destroyed || Math.abs(cop.speed) < 35) continue;
        const tail = rearWheel(cop, Math.random() < 0.5 ? -1 : 1);
        addExhaust(tail.x, tail.y, cop.angle, cop.speed, '#8eb1b7');
      }
    }
  }

  function updateCamera(dt) {
    const targetX = player.vehicle ? player.vehicle.x + Math.cos(player.vehicle.angle) * CAMERA.lookAhead : player.x;
    const targetY = player.vehicle ? player.vehicle.y + Math.sin(player.vehicle.angle) * CAMERA.lookAhead : player.y;
    state.camera.x += (targetX - state.camera.x) * (player.vehicle ? CAMERA.driveFollow : CAMERA.follow);
    state.camera.y += (targetY - state.camera.y) * (player.vehicle ? CAMERA.driveFollow : CAMERA.follow);
    state.camera.zoom = 1;
    state.shake = Math.max(0, state.shake - CAMERA.shakeDecay * dt);
    state.flash = Math.max(0, state.flash - dt);
  }

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
    player.angle = player.angle;
    updatePlayer(dt, input);
    updatePeds(dt);
    trafficSystem.update(dt, state);
    updatePolice(dt);
    updateBullets(dt);
    updateMissionActors(dt);
    missions.update(state, dt);
    updateParticles(dt);
    updateEffects(dt);
    sideJobs.update(state, dt);
    radio.update(state, dt);
    updateCamera(dt);
    state.district = city.districtAt(player.vehicle ? player.vehicle.x : player.x, player.vehicle ? player.vehicle.y : player.y);
    state.nearVehicle = player.vehicle ? null : nearestVehicle(66);
    state.missionMarker = missions.markerFor(state);
    state.objective = missions.objectiveFor(state)?.text || (state.credits ? 'Leave Port Kessel' : state.objective);
    state.driveDistance = Math.min(999999, state.driveDistance);
    if (state.police.length > 32) state.police.length = 32;
    if (state.peds.length > 72) state.peds.splice(0, state.peds.length - 72);
    if (state.bullets.length > 120) state.bullets.splice(0, state.bullets.length - 120);
  }

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
    message(`St. Orra Hospital. Care costs $${fee}. The division lost interest.`, 4.4);
  }

  function save() {
    try {
      const px = player.vehicle ? player.vehicle.x : player.x;
      const py = player.vehicle ? player.vehicle.y : player.y;
      const payload = {
        version: SAVE_VERSION,
        x: px, y: py, onFoot: !player.vehicle,
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
      if (Number.isInteger(data.mission) && data.mission >= 0 && data.mission < 5) {
        missions.resume(state, data.mission, clamp(Number(data.missionStep) || 0, 0, 4));
        state.objective = missionStepText(state);
      }
      state.camera.x = player.x; state.camera.y = player.y;
      state.wanted = clamp(state.wanted, 0, 5);
      radio.sync(state);
      message('Continue: Port Kessel remembers you.', 3.5);
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

  function triggerWanted(level) {
    state.wanted = clamp(level, 0, 5);
    state.heat = 0;
    state.policeSpawnTimer = 0.1;
    for (let index = state.police.length - 1; index >= 0; index -= 1) if (state.police[index].kind === 'police') state.police.splice(index, 1);
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
    const dir = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle)) ? (Math.cos(angle) >= 0 ? 0 : 2) : (Math.sin(angle) >= 0 ? 1 : 3);
    const lane = DIR_LANE[dir];
    const gi = clamp(Math.round((x - city.origin) / city.pitch), 0, 8);
    const gj = clamp(Math.round((y - city.origin) / city.pitch), 0, 8);
    car.dir = dir;
    car.gi = gi; car.gj = gj;
    car.fromX = x + lane.x; car.fromY = y + lane.y;
    const nextGi = gi + (dir === 0 ? 1 : dir === 2 ? -1 : 0);
    const nextGj = gj + (dir === 1 ? 1 : dir === 3 ? -1 : 0);
    car.toX = city.avenue(nextGi) + lane.x;
    car.toY = city.cross(nextGj) + lane.y;
    car.lengthSegment = Math.max(24, Math.hypot(car.toX - car.fromX, car.toY - car.fromY));
    car.progress = 0;
    placeOnRoad(car);
    car.ai = false;
    car.speed = driver ? 54 : 0;
    car.playerOwned = false;
    state.traffic.push(car);
    return car;
  }

  function placeOnRoad(car) {
    const t = clamp(car.progress, 0, 1);
    car.x = car.fromX + (car.toX - car.fromX) * t;
    car.y = car.fromY + (car.toY - car.fromY) * t;
    car.angle = Math.atan2(car.toY - car.fromY, car.toX - car.fromX);
  }

  function spawnPedAt(x, y, mode = 'walk') {
    const ped = spawnPedestrianAt(x, y);
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
    step, reset, interact, save, load, hasSave, teleport, setVehicle, addMuzzle, burst, addExhaust, addSpray, addSkid, radio, sideJobs,
    triggerWanted, addPoliceNear, setMissionDemo, spawnPedestrian, spawnCarAt, spawnPedAt, getClock,
    saveKey: STORAGE_KEY,
  };
}

export { formatClock };
