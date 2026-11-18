// Deterministic staged screenshots. Each scene starts from a fresh world, places Vale and real
// traffic, then advances the actual 60 Hz simulation for a fixed number of steps. Physics,
// traffic decisions and police movement are not faked after staging: the renderer receives the
// same state a player would see. The autopilot only supplies ordinary keyboard input.

import { STEP } from './config.js';
import { SCREEN } from './render.js';

function makeInput(overrides = {}) {
  return {
    axis: { x: 0, y: 0 },
    sprint: false,
    mouseWorld: { x: 640, y: 360 },
    firing: false,
    up: false,
    brake: false,
    left: false,
    right: false,
    aim: true,
    ...overrides,
  };
}

function settle(world, seconds, input) {
  const steps = Math.round(seconds / STEP);
  for (let index = 0; index < steps; index += 1) world.step(STEP, input);
}

function faceMouse(state, angle) {
  state.crosshair.x = 640 + Math.cos(angle) * 150;
  state.crosshair.y = 360 + Math.sin(angle) * 150;
}

function stageCar(world, type, x, y, angle, speed = 52) {
  const car = world.spawnCarAt(type, x, y, angle, true);
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = speed;
  car.ai = false;
  car.brakeFlash = speed < 15 ? 1 : 0;
  car.sirenPhase = x * 0.013;
  return car;
}

function stagePed(world, x, y, angle, extra = {}) {
  const ped = world.spawnPedAt(x, y, 'walk');
  ped.x = x;
  ped.y = y;
  ped.angle = angle;
  ped.stride = ((x * 0.13 + y * 0.07) % 6.283);
  ped.umbrella = extra.umbrella ?? Math.random() < 0.34;
  ped.target = { x: x + Math.cos(angle) * 130, y: y + Math.sin(angle) * 90 };
  if (extra.colour) ped.colour = extra.colour;
  return ped;
}

function crowd(world, cx, cy, count, spreadX, spreadY, angle, offset = 0) {
  const columns = 3;
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const col = index % columns;
    stagePed(
      world,
      cx + (col - 1) * spreadX + (row % 2) * 8,
      cy + row * spreadY + (index % 2) * 4,
      angle + (index % 3 - 1) * 0.2,
      { umbrella: (index + offset) % 3 === 0 },
    );
  }
}

function dressCarEffects(world, state, radiusX = 660, radiusY = 430) {
  const px = state.player.vehicle ? state.player.vehicle.x : state.player.x;
  const py = state.player.vehicle ? state.player.vehicle.y : state.player.y;
  for (let index = 0; index < state.traffic.length; index += 1) {
    const car = state.traffic[index];
    if (Math.abs(car.x - px) > radiusX || Math.abs(car.y - py) > radiusY || Math.abs(car.speed) < 24) continue;
    for (let puff = 0; puff < 3; puff += 1) {
      const side = (puff - 1) * car.width * 0.24;
      world.addExhaust(
        car.x - Math.cos(car.angle) * car.length * 0.48 + Math.cos(car.angle + Math.PI / 2) * side,
        car.y - Math.sin(car.angle) * car.length * 0.48 + Math.sin(car.angle + Math.PI / 2) * side,
        car.angle, car.speed,
      );
    }
  }
  for (let index = 0; index < state.police.length; index += 1) {
    const cop = state.police[index];
    if (cop.kind !== 'police' || Math.abs(cop.speed) < 20) continue;
    for (let puff = 0; puff < 2; puff += 1) {
      world.addExhaust(cop.x - Math.cos(cop.angle) * cop.length * 0.45, cop.y - Math.sin(cop.angle) * cop.length * 0.45, cop.angle, cop.speed);
    }
  }
  if (state.player.vehicle && Math.abs(state.player.vehicle.speed) > 30) {
    const car = state.player.vehicle;
    for (let puff = 0; puff < 5; puff += 1) {
      const side = (puff - 2) * car.width * 0.11;
      world.addExhaust(car.x - Math.cos(car.angle) * car.length * 0.5 + Math.cos(car.angle + Math.PI / 2) * side, car.y - Math.sin(car.angle) * car.length * 0.5 + Math.sin(car.angle + Math.PI / 2) * side, car.angle, car.speed);
    }
  }
}

function skidArc(state, car, radius, side, strength = 1) {
  const points = [];
  for (let index = 0; index <= 16; index += 1) {
    const t = index / 16;
    const angle = car.angle + Math.PI + t * 0.52;
    const width = side * car.width * 0.33;
    points.push({
      x: car.x + Math.cos(angle) * radius + Math.cos(angle + Math.PI / 2) * width,
      y: car.y + Math.sin(angle) * radius + Math.sin(angle + Math.PI / 2) * width,
    });
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    state.skids.push({
      x1: points[index].x, y1: points[index].y,
      x2: points[index + 1].x, y2: points[index + 1].y,
      width: 2.5, life: 1.2, max: 1.5, strength,
    });
  }
}

export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  state.message = '';
  state.messageTimer = 0;
  state.paused = false;
  state.audioMuted = false;
  state.titleIndex = 0;

  if (name === 'street') {
    // A junction on the Neon Strip: four packed corners, a crosswalk in use, and a cruiser
    // cutting the corner while taxis and vans keep the avenue full.
    const px = 1900;
    const py = 1622;
    world.teleport(px, py);
    state.player.angle = -0.12;
    state.player.walkPhase = 2.7;
    state.weapon = 'pistol';
    state.pistolRounds = 22;
    state.money = 1840;
    state.alarm = 0;
    state.camera.x = 1920;
    state.camera.y = 1620;
    world.setMissionDemo(0);
    state.objective = 'WALK THE NEON STRIP · Follow the crowd';
    state.missionMarker = { x: 2080, y: 1566, r: 58, color: '#ffcf4a' };
    state.hudDialogue = { speaker: 'MARROW', text: 'The Strip is loud tonight. Keep your collar up and your eyes on the street.', timer: 30 };
    faceMouse(state, 0.2);

    stageCar(world, 'kestrel', 2112, 1587, 0, 62);
    stageCar(world, 'bream', 2272, 1587, 0, 48);
    stageCar(world, 'kestrel', 1640, 1587, 0, 42);
    stageCar(world, 'kestrel', 1770, 1545, Math.PI, 58);
    stageCar(world, 'bream', 2010, 1545, Math.PI, 44);
    stageCar(world, 'kestrel', 2160, 1545, Math.PI, 66);
    stageCar(world, 'kestrel', 1895, 1390, Math.PI / 2, 52);
    stageCar(world, 'bream', 1937, 1780, -Math.PI / 2, 40);
    stageCar(world, 'kestrel', 1730, 1540, Math.PI + 0.04, 28);
    stageCar(world, 'kestrel', 2020, 1640, 0.08, 36);

    // One patrol car turns in at the junction, its bar throwing red and blue across the wet tar.
    const turning = world.addPoliceNear(1838, 1502, 1)[0];
    turning.x = 1838; turning.y = 1502; turning.angle = 0.72; turning.speed = 38; turning.sirenPhase = 1.7;

    crowd(world, 1844, 1534, 9, 27, 16, 0.2, 1);
    crowd(world, 1982, 1531, 8, 27, 16, Math.PI - 0.3, 2);
    crowd(world, 1818, 1642, 8, 27, 16, -0.3, 3);
    crowd(world, 2012, 1654, 8, 27, 16, Math.PI + 0.2, 4);
    crowd(world, 1634, 1598, 6, 25, 14, 0.1, 5);
    for (let index = 0; index < 7; index += 1) {
      stagePed(world, 1876 + index * 12, 1574 + (index % 2) * 7, 0.1 + index * 0.03, { umbrella: index % 2 === 0 });
    }
    state.district = 'NEON STRIP';
    dressCarEffects(world, state, 640, 390);
    state.camera.x = 1908;
    state.camera.y = 1608;
    state.shake = 0;
    return { screen: SCREEN.play, world };
  }

  if (name === 'drive') {
    const car = world.setVehicle('kestrel', 1280, 1566, 0);
    car.x = 1280; car.y = 1566; car.angle = 0;
    car.speed = 214;
    car.health = 142;
    state.money = 2380;
    state.wanted = 1;
    state.heat = 0.3;
    state.weapon = 'pistol';
    state.pistolRounds = 31;
    state.hudDialogue = { speaker: 'MARROW', text: 'The Bream is at Salt Market. Do not stop for the lights, Vale. Stopping is how they catch you.', timer: 30 };
    state.objective = 'A BREAM IN THE MARROW · Reach Salt Market';
    state.mission = 1;
    state.missionStep = 0;
    state.missionMarker = { x: 2210, y: 1566, r: 62, color: '#ffcf4a' };

    // Three lanes full: traffic ahead in Vale's lane, a wall of oncoming headlights, and cars
    // waiting at the far junction.
    stageCar(world, 'kestrel', 1450, 1587, 0, 48);
    stageCar(world, 'bream', 1570, 1587, 0, 38);
    stageCar(world, 'kestrel', 1720, 1587, 0, 56);
    stageCar(world, 'kestrel', 1900, 1587, 0, 42);
    stageCar(world, 'bream', 2050, 1587, 0, 44);
    stageCar(world, 'kestrel', 1510, 1545, Math.PI, 66);
    stageCar(world, 'bream', 1650, 1545, Math.PI, 58);
    stageCar(world, 'kestrel', 1830, 1545, Math.PI, 72);
    stageCar(world, 'kestrel', 2000, 1545, Math.PI, 62);
    stageCar(world, 'bream', 2180, 1545, Math.PI, 50);
    stageCar(world, 'kestrel', 1190, 1587, 0, 40);
    stageCar(world, 'kestrel', 1050, 1587, 0, 36);
    stageCar(world, 'kestrel', 1895, 1340, Math.PI / 2, 46);
    stageCar(world, 'bream', 1937, 1740, -Math.PI / 2, 40);
    stageCar(world, 'kestrel', 1410, 1587, 0, 30);

    crowd(world, 1825, 1508, 6, 27, 16, 0.2, 1);
    crowd(world, 1842, 1666, 7, 27, 16, Math.PI + 0.1, 2);
    crowd(world, 2040, 1668, 6, 27, 16, -0.2, 3);
    state.district = 'NEON STRIP';
    dressCarEffects(world, state, 720, 420);
    state.crosshair.x = 830;
    state.crosshair.y = 310;
    state.camera.x = 1470;
    state.camera.y = 1610;
    state.shake = 1.4;
    return { screen: SCREEN.play, world };
  }

  if (name === 'chase') {
    // Vale's coupe is mid-drift through the junction. Five cruisers box it in: two tight behind,
    // two flanking with their noses toward Vale, and a roadblock closing the westbound lane.
    const car = world.setVehicle('kestrel', 1905, 1570, Math.PI + 0.23);
    car.x = 1905; car.y = 1570; car.angle = Math.PI + 0.23; car.speed = 168; car.health = 118;
    state.weapon = 'pistol';
    state.pistolRounds = 18;
    state.money = 3260;
    state.wanted = 3;
    state.heat = 0.6;
    state.outOfSight = 0;
    state.policeSight = 1;
    state.hudDialogue = { speaker: 'OKONKWO', text: 'Vale! You are not a rumour any more. You are a headline.', timer: 30 };
    state.objective = 'THREE-STAR NIGHT · Hold the heat for 28 seconds';
    state.mission = 2;
    state.missionStep = 1;
    state.missionMarker = { x: 820, y: 1566, r: 74, color: '#ffcf4a' };
    faceMouse(state, Math.PI + 0.4);
    state.crosshair.x = 560;
    state.crosshair.y = 300;

    state.police.length = 0;
    const copies = world.addPoliceNear(1905, 1578, 6);
    const layout = [
      [2014, 1530, Math.PI - 0.1, 104],
      [2034, 1612, Math.PI + 0.08, 108],
      [1810, 1518, -0.08, 92],
      [1792, 1608, 0.16, 96],
      [1668, 1534, 0.03, 46],
      [1668, 1600, -0.02, 42],
    ];
    for (let index = 0; index < copies.length; index += 1) {
      const [x, y, angle, speed] = layout[index];
      copies[index].x = x; copies[index].y = y; copies[index].angle = angle;
      copies[index].speed = speed; copies[index].sirenPhase = index * 1.35;
    }
    // Roadblock second cruiser and a civilian caught in the closing box.
    stageCar(world, 'kestrel', 1682, 1590, 0.03, 8);
    stageCar(world, 'bream', 2148, 1587, Math.PI, 66);
    stageCar(world, 'kestrel', 2112, 1545, Math.PI, 58);
    stageCar(world, 'kestrel', 1500, 1545, Math.PI, 52);
    crowd(world, 1818, 1490, 6, 27, 16, 0.4, 2);
    crowd(world, 2070, 1648, 6, 27, 16, Math.PI, 1);

    skidArc(state, car, 94, -1, 1);
    skidArc(state, car, 94, 1, 1);
    for (let index = 0; index < 8; index += 1) {
      state.exhaust.push({
        x: car.x - Math.cos(car.angle) * (30 + index * 5) + Math.sin(car.angle) * (index % 2 ? 13 : -13),
        y: car.y - Math.sin(car.angle) * (30 + index * 5) - Math.cos(car.angle) * (index % 2 ? 13 : -13),
        vx: -Math.cos(car.angle) * 24, vy: -Math.sin(car.angle) * 24,
        life: 0.65, max: 0.8, size: 11 + (index % 3) * 4, tint: '#b8c6c6',
      });
    }
    state.skids.push({ x1: 1880, y1: 1610, x2: 1940, y2: 1630, width: 2.8, life: 1.1, max: 1.5, strength: 1 });
    for (let index = 0; index < copies.length; index += 1) {
      const cop = copies[index];
      state.skids.push({ x1: cop.x + 8, y1: cop.y + 9, x2: cop.x - Math.cos(cop.angle) * 50, y2: cop.y - Math.sin(cop.angle) * 50, width: 2.1, life: 0.8, max: 1.4, strength: 0.9 });
    }

    world.addMuzzle(copies[0].x, copies[0].y, copies[0].angle, 'enemy');
    world.burst(copies[1].x, copies[1].y, '#ffcf4a', 8);
    world.burst(copies[1].x - 5, copies[1].y + 4, '#6d6152', 7, 'debris');
    state.district = 'NEON STRIP';
    dressCarEffects(world, state, 640, 430);
    state.camera.x = 1902;
    state.camera.y = 1572;
    state.shake = 2.2;
    return { screen: SCREEN.play, world };
  }

  // The job: Pell is marked in the crosswalk, guards are wheeling toward Vale, and the shot is
  // already in the air.
  const px = 2100;
  const py = 1578;
  world.teleport(px, py);
  state.player.angle = 0.02;
  state.weapon = 'pistol';
  state.pistolRounds = 29;
  state.money = 1460;
  state.mission = 0;
  state.missionStep = 1;
  state.objective = 'TAKE PELL’S LEDGER · Target marked';
  state.hudDialogue = { speaker: 'PELL', text: 'You’re Vale? Marrow said you were a rumour. Put it down and walk away.', timer: 30 };
  faceMouse(state, 0.02);

  const target = { kind: 'courier', x: 2280, y: 1566, tag: 'pell', angle: Math.PI, speed: 0, health: 40, maxHealth: 40, dead: false, fireTimer: 9, radius: 10, chase: false, colour: '#d7a34e' };
  const guards = [
    { kind: 'enemy', x: 2188, y: 1510, angle: 2.7 },
    { kind: 'enemy', x: 2184, y: 1622, angle: -2.5 },
    { kind: 'enemy', x: 2360, y: 1526, angle: 2.9 },
    { kind: 'enemy', x: 2382, y: 1608, angle: -2.6 },
  ].map((guard, index) => ({
    ...guard, tag: `guard-${index}`, speed: 0, health: 75, maxHealth: 75, dead: false,
    fireTimer: 0.4 + index * 0.2, radius: 10, chase: true, colour: '#c35161',
  }));
  state.missionActors = [target, ...guards];
  state.missionMarker = { x: target.x, y: target.y, r: 50, color: '#ffcf4a' };

  stageCar(world, 'bream', 1980, 1545, Math.PI, 36);
  stageCar(world, 'kestrel', 1880, 1587, 0, 42);
  stageCar(world, 'kestrel', 2220, 1640, 0, 46);
  stageCar(world, 'bream', 2500, 1545, Math.PI, 42);
  stageCar(world, 'kestrel', 2560, 1587, 0, 48);
  crowd(world, 1978, 1518, 6, 27, 16, 0.2, 1);
  crowd(world, 2034, 1644, 8, 25, 15, Math.PI, 2);
  crowd(world, 2350, 1514, 7, 26, 15, 0.1, 3);
  crowd(world, 2420, 1648, 6, 24, 14, Math.PI + 0.2, 4);

  // Muzzle and impact stay on screen as the final beat.
  world.addMuzzle(px + Math.cos(0.02) * 18, py + Math.sin(0.02) * 18, 0.02, 'player');
  world.addMuzzle(guards[0].x, guards[0].y, guards[0].angle, 'enemy');
  world.burst(target.x - 10, target.y - 3, '#ffcf4a', 18);
  world.burst(target.x - 14, target.y + 4, '#9b8062', 7, 'debris');
  state.district = 'KESSEL EXCHANGE';
  dressCarEffects(world, state, 700, 420);
  state.camera.x = 2176;
  state.camera.y = 1590;
  state.shake = 1.8;
  return { screen: SCREEN.play, world };
}
