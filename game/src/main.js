// Boot, screen flow and the fixed-step loop. The browser supplies input and sound; world.js
// supplies rules; render.js and hud.js paint a complete 1280x720 frame into a responsive canvas.

import { FIELD, STEP } from './config.js';
import { createWorld, formatClock } from './world.js';
import { createInput, PRESS } from './input.js';
import { createRenderer, SCREEN } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const input = createInput(canvas);
const world = createWorld(seed);
const trafficSystem = world.trafficSystem;
const renderer = createRenderer(canvas);
const audio = createAudio();

world.state.audioMuted = audio.isMuted();
world.state.titleIndex = 0;
world.state.saveNotice = 'M saves the night; Continue brings it back.';

function announce(message) {
  status.textContent = message;
}

function frameInput() {
  const live = input.snapshot();
  const camera = world.state.camera;
  const mouseWorld = {
    x: camera.x + (live.mouse.x - FIELD.width / 2),
    y: camera.y + (live.mouse.y - FIELD.height / 2),
  };
  world.state.crosshair.x = live.mouse.x;
  world.state.crosshair.y = live.mouse.y;
  return {
    ...live,
    axis: live.axis,
    mouseWorld,
    aim: world.state.weapon === 'pistol' || live.firing,
  };
}

let screen = SCREEN.title;
let accumulator = 0;
let last = performance.now();
let titleTimer = 0;
let saveToast = 0;
let audioReady = false;

function unlockAudio() {
  if (audioReady) return;
  audioReady = true;
  audio.unlock();
}
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

function newGame() {
  unlockAudio();
  world.reset();
  world.state.audioMuted = audio.isMuted();
  world.state.titleIndex = 0;
  accumulator = 0;
  screen = SCREEN.play;
  announce('New game. Port Kessel. Follow the gold marker to Marrow.');
  audio.setEngine(true);
}

function continueGame() {
  unlockAudio();
  const loaded = world.load();
  if (!loaded) {
    newGame();
    return;
  }
  world.state.audioMuted = audio.isMuted();
  accumulator = 0;
  screen = SCREEN.play;
  announce('Continue. Vale is back on the street.');
}

function saveGame() {
  const ok = world.save();
  world.state.saveNotice = ok ? 'SAVED · ' + formatClock(world.state.clockMinutes) + ' · Port Kessel will remember.' : 'SAVE FAILED · browser storage is unavailable.';
  saveToast = 3.5;
  announce(ok ? 'Game saved.' : 'Save failed.');
}

function pauseMenu() {
  if (screen === SCREEN.play) {
    screen = SCREEN.paused;
    announce('Paused.');
  } else if (screen === SCREEN.paused) {
    screen = SCREEN.play;
    announce('Resumed.');
  }
}

function handlePressed() {
  const pressed = input.takePressed();
  const clicks = input.takeClicks();
  if (screen === SCREEN.title) {
    if (pressed & PRESS.newGame) newGame();
    else if (pressed & PRESS.continueGame) continueGame();
    else if (pressed & PRESS.sound) world.state.audioMuted = audio.toggle();
    else if (pressed & PRESS.confirm) {
      if (world.state.titleIndex === 1 && world.hasSave()) continueGame();
      else if (world.state.titleIndex === 2) world.state.audioMuted = audio.toggle();
      else newGame();
    }
    if (clicks.length) {
      const click = clicks[0];
      if (click.y > 394 && click.y < 570 && click.x > 76 && click.x < 424) {
        const index = Math.max(0, Math.min(2, Math.floor((click.y - 396) / 44)));
        world.state.titleIndex = index;
        if (index === 0) newGame();
        else if (index === 1) continueGame();
        else world.state.audioMuted = audio.toggle();
      }
    }
    return;
  }
  if (screen === SCREEN.credits) {
    if (pressed & PRESS.pause) { screen = SCREEN.title; world.reset(); world.teleport(1620, 1390); }
    return;
  }
  if (screen === SCREEN.paused) {
    if (pressed & PRESS.pause) screen = SCREEN.play;
    else if (pressed & PRESS.save) saveGame();
    else if (pressed & PRESS.sound) world.state.audioMuted = audio.toggle();
    else if (pressed & PRESS.newGame) newGame();
    if (clicks.length) screen = SCREEN.play;
    return;
  }
  if (pressed & PRESS.pause) { pauseMenu(); return; }
  if (pressed & PRESS.interact) world.interact();
  if (pressed & PRESS.fists) world.state.weapon = 'fists';
  if (pressed & PRESS.pistol) world.state.weapon = 'pistol';
  if (pressed & PRESS.reload) {
    world.state.pistolRounds = 36;
    world.state.player.reload = 0.45;
    announce('Pistol reloaded.');
  }
  if (pressed & PRESS.save) saveGame();
  if (pressed & PRESS.sound) world.state.audioMuted = audio.toggle();
}

function stepGame(dt) {
  if (screen !== SCREEN.play && screen !== SCREEN.title) return;
  if (screen === SCREEN.title) {
    titleTimer += dt;
    const angle = titleTimer * 0.04;
    world.state.camera.x = 1580 + Math.cos(angle) * 190;
    world.state.camera.y = 1510 + Math.sin(angle) * 52;
    // Keep a slow patrol of traffic and footfall behind the title without advancing the story,
    // firing bullets or spawning police while the player is still deciding.
    trafficSystem.update(dt, world.state);
    world.state.time += dt;
    world.state.shake = Math.max(0, world.state.shake - dt);
    world.state.clockMinutes = (22 * 60 + 40 + world.state.time / 6) % (24 * 60);
    world.state.hudDialogue = null;
    world.state.missionMarker = null;
    return;
  }
  world.state.titleIndex = 0;
  const live = frameInput();
  world.step(dt, live);
  if (world.state.credits) screen = SCREEN.credits;
  if (saveToast > 0) {
    saveToast -= dt;
    if (saveToast <= 0) world.state.saveNotice = 'The city holds its breath.';
  }
  audio.update(world.state, dt);
}

function frame(now) {
  requestAnimationFrame(frame);
  const delta = Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;
  handlePressed();
  if (screen === SCREEN.play || screen === SCREEN.title) {
    accumulator += delta;
    while (accumulator >= STEP) {
      stepGame(STEP);
      accumulator -= STEP;
      if (screen !== SCREEN.play && screen !== SCREEN.title) break;
    }
  } else {
    accumulator = 0;
  }
  renderer.draw(world.state, world, screen);
}

function bootShot() {
  stageShot(shotName, world);
  world.state.audioMuted = true;
  let frames = 0;
  function paint() {
    renderer.draw(world.state, world, SCREEN.play);
    frames += 1;
    if (frames >= 3) {
      window.__shotReady = true;
      announce('Screenshot ready: ' + shotName);
      return;
    }
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

// A small read-only testing handle for the competition harness and accessibility probes.
window.__neonHarbor = { world, input, audio, renderer, getScreen: () => screen };

if (shotName) {
  bootShot();
} else {
  // The start screen sits over a live rain-soaked scene, not a painted still.
  world.teleport(1620, 1390);
  world.state.camera.x = 1580;
  world.state.camera.y = 1460;
  announce('NEON HARBOR. Press Enter for New Game, or C to Continue.');
  requestAnimationFrame(frame);
}
