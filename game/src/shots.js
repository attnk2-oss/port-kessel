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

export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  state.message = '';
  state.messageTimer = 0;
  state.paused = false;
  state.audioMuted = false;
  state.titleIndex = 0;

  if (name === 'street') {
    world.teleport(1715, 1798);
    state.player.angle = -0.35;
    state.weapon = 'pistol';
    state.pistolRounds = 22;
    state.money = 1840;
    world.setMissionDemo(0);
    state.objective = 'Walk the Neon Strip. Press F beside a car to take it.';
    state.missionMarker = null;
    state.hudDialogue = { speaker: 'MARROW', text: 'The Strip is loud tonight. Keep your collar up and your eyes on the street.', timer: 30 };
    faceMouse(state, 0.15);
    const player = state.player;
    state.alarm = 0;
    world.spawnCarAt('kestrel', 1840, 1815, Math.PI, true);
    world.spawnCarAt('bream', 1560, 1840, 0, true);
    world.spawnCarAt('kestrel', 2140, 1815, Math.PI, true);
    world.spawnCarAt('kestrel', 1460, 1720, 0, false);
    for (let index = 0; index < 16; index += 1) {
      const ped = world.spawnPedAt(1460 + (index % 8) * 31, 1650 + Math.floor(index / 8) * 38, 'walk');
      ped.angle = 0.1;
      ped.target = { x: ped.x + 140, y: ped.y + 30 };
      ped.umbrella = index % 3 === 0;
    }
    world.spawnPedAt(1570, 1935, 'flee');
    settle(world, 2.6, makeInput({ axis: { x: Math.cos(0.3), y: Math.sin(0.3) }, mouseWorld: { x: player.x + 240, y: player.y - 40 } }));
    state.alarm = 0;
    state.camera.x += 62;
    state.camera.y += 10;
    state.shake = 0;
    return { screen: SCREEN.play, world };
  }

  if (name === 'drive') {
    const car = world.setVehicle('kestrel', 1110, 1566, 0);
    car.x = 1280; car.y = 1566; car.angle = 0;
    car.speed = 168;
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
    state.missionMarker = { x: 866, y: 2266, r: 72, color: '#ffcf4a' };
    for (let index = 0; index < 5; index += 1) {
      const carAhead = world.spawnCarAt(index % 2 ? 'bream' : 'kestrel', 1550 + index * 92, 1545, 0, true);
      carAhead.speed = 44;
    }
    world.spawnCarAt('kestrel', 1540, 1587, 0, true);
    world.spawnCarAt('bream', 1320, 1608, 0, true);
    state.crosshair.x = 760;
    state.crosshair.y = 330;
    settle(world, 0.55, makeInput({ up: true, mouseWorld: { x: 1000, y: 1000 } }));
    state.player.vehicle.speed = 176;
    state.camera.x = state.player.vehicle.x + 120;
    state.camera.y = state.player.vehicle.y + 92;
    state.shake = 0;
    return { screen: SCREEN.play, world };
  }

  if (name === 'chase') {
    world.teleport(1730, 1566);
    state.player.angle = Math.PI;
    state.weapon = 'pistol';
    state.pistolRounds = 18;
    state.money = 3260;
    world.triggerWanted(3);
    world.addPoliceNear(1730, 1566, 3);
    world.addPoliceNear(1620, 1690, 2);
    state.outOfSight = 0;
    state.policeSight = 1;
    state.heat = 0.6;
    state.hudDialogue = { speaker: 'OKONKWO', text: 'Vale! You are not a rumour any more. You are a headline.', timer: 30 };
    state.objective = 'THREE-STAR NIGHT · Hold the heat for 28 seconds';
    state.mission = 2;
    state.missionStep = 1;
    state.missionMarker = { x: 820, y: 1566, r: 74, color: '#ffcf4a' };
    faceMouse(state, Math.PI + 0.25);
    settle(world, 1.1, makeInput({ axis: { x: -0.4, y: 0.4 }, mouseWorld: { x: 1550, y: 1500 } }));
    state.wanted = 3;
    state.policeSight = 1;
    state.camera.x = state.player.x + 50;
    state.camera.y = state.player.y + 8;
    state.shake = 2.2;
    return { screen: SCREEN.play, world };
  }

  // The job: Marrow's first handoff under way, with the gold objective live.
  world.teleport(1780, 1566);
  state.player.angle = -0.65;
  state.weapon = 'pistol';
  state.pistolRounds = 29;
  state.money = 1460;
  world.setMissionDemo(0);
  state.missionStep = 0;
  state.objective = 'Meet Marrow at the Night Tide diner';
  state.missionMarker = { x: 2016, y: 1566, r: 54, color: '#ffcf4a' };
  state.hudDialogue = { speaker: 'VALE', text: 'Marrow says Pell is walking the rain line. Take the ledger. Leave the coat. Meet him at the diner.', timer: 30 };
  faceMouse(state, -0.6);
  settle(world, 1.2, makeInput({ axis: { x: 0.1, y: 0.04 }, mouseWorld: { x: 2016, y: 1566 } }));
  state.camera.x += 34;
  state.camera.y -= 10;
  state.shake = 0;
  return { screen: SCREEN.play, world };
}
