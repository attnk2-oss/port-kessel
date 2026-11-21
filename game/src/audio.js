// Synthesised harbour soundscape. No files, no network: the pad, rain, water, ship horn, gulls,
// engine, siren and one-shot effects are all WebAudio nodes created after the first gesture.
// Every layer is driven from update() below; mute is a single master-gain target, so it silences
// both loops and one-shots without tearing down the graph.

import { SOUND_KEY } from './config.js';
import { clamp } from './random.js';

const MASTER_VOLUME = 0.34;
const WATER_LAP_RANGE = [1.5, 4];
const HORN_RANGE = [25, 60];
const GULL_RANGE = [8, 20];

export function createAudio() {
  let context = null;
  let master = null;
  let compressor = null;
  let muted = false;
  let started = false;

  // Continuous beds: each destination gain is ramped from update().
  let padGain = null;
  let rainGain = null;
  let waterBedGain = null;
  let waterLapGain = null;
  let hornGain = null;
  let gullGain = null;
  let engineGain = null;
  let sirenGain = null;

  // Oscillators whose pitch tracks the player or the siren.
  let gullOsc = null;
  let engineOsc = null;
  let sirenOsc = null;

  // Smoothed levels avoid clicks when a car is entered or a cruiser arrives.
  let engineLevel = 0;
  let sirenLevel = 0;
  let rainLevel = 0;
  let waterBedLevel = 0;
  let stepClock = 0;
  let skidClock = 0;

  // Harbour events run on independent clocks so a horn never resets the water rhythm.
  let waterClock = 0;
  let hornClock = 0;
  let gullClock = 0;
  let nextWaterLap = randomBetween(WATER_LAP_RANGE);
  let nextHorn = randomBetween(HORN_RANGE);
  let nextGulls = randomBetween(GULL_RANGE);

  try {
    if (window.localStorage.getItem(SOUND_KEY) === 'off') muted = true;
  } catch {
    // Private browsing can refuse storage; start with sound on.
  }

  function randomBetween([low, high]) {
    return low + Math.random() * (high - low);
  }

  function buildAudioGraph() {
    if (context) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = muted ? 0 : MASTER_VOLUME;
      compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 14;
      compressor.ratio.value = 5;
      master.connect(compressor);
      compressor.connect(context.destination);

      // Low harbour pad: two close tones through a soft lowpass.
      padGain = context.createGain();
      padGain.gain.value = 0.12;
      padGain.connect(master);
      const padLow = context.createOscillator();
      const padHigh = context.createOscillator();
      const padFilter = context.createBiquadFilter();
      padLow.type = 'sine'; padLow.frequency.value = 55;
      padHigh.type = 'triangle'; padHigh.frequency.value = 82.5;
      padFilter.type = 'lowpass'; padFilter.frequency.value = 210; padFilter.Q.value = 3;
      padLow.connect(padFilter); padHigh.connect(padFilter); padFilter.connect(padGain);
      padLow.start(); padHigh.start();

      // Filtered noise gives the rain its hiss and its slow swell.
      rainGain = context.createGain();
      rainGain.gain.value = 0;
      rainGain.connect(master);
      const rainLength = Math.floor(context.sampleRate * 2);
      const rainBuffer = context.createBuffer(1, rainLength, context.sampleRate);
      const rainData = rainBuffer.getChannelData(0);
      let rainTail = 0;
      for (let index = 0; index < rainLength; index += 1) {
        rainTail = rainTail * 0.93 + (Math.random() * 2 - 1) * 0.07;
        rainData[index] = rainTail * 3.2;
      }
      const rain = context.createBufferSource();
      rain.buffer = rainBuffer; rain.loop = true;
      const rainFilter = context.createBiquadFilter();
      rainFilter.type = 'bandpass'; rainFilter.frequency.value = 2300; rainFilter.Q.value = 0.6;
      rain.connect(rainFilter); rainFilter.connect(rainGain); rain.start();

      // Brown-noise water has a constant bed plus a second gain for individual lapping pulses.
      const waterLength = Math.floor(context.sampleRate * 3);
      const waterBuffer = context.createBuffer(1, waterLength, context.sampleRate);
      const waterData = waterBuffer.getChannelData(0);
      let waterTail = 0;
      for (let index = 0; index < waterLength; index += 1) {
        waterTail = waterTail * 0.985 + (Math.random() * 2 - 1) * 0.015;
        waterData[index] = waterTail * 4.2;
      }
      const water = context.createBufferSource();
      water.buffer = waterBuffer; water.loop = true;
      const waterFilter = context.createBiquadFilter();
      waterFilter.type = 'lowpass'; waterFilter.frequency.value = 360; waterFilter.Q.value = 0.8;
      waterBedGain = context.createGain();
      waterBedGain.gain.value = 0;
      waterLapGain = context.createGain();
      waterLapGain.gain.value = 0;
      water.connect(waterFilter);
      waterFilter.connect(waterBedGain); waterBedGain.connect(master);
      waterFilter.connect(waterLapGain); waterLapGain.connect(master);
      water.start();

      // A 110/165 Hz fifth through a lowpass reads as a ship's horn far across the basin.
      hornGain = context.createGain();
      hornGain.gain.value = 0;
      const hornFilter = context.createBiquadFilter();
      hornFilter.type = 'lowpass'; hornFilter.frequency.value = 260; hornFilter.Q.value = 0.55;
      const hornLow = context.createOscillator();
      const hornHigh = context.createOscillator();
      hornLow.type = 'sine'; hornLow.frequency.value = 110;
      hornHigh.type = 'sine'; hornHigh.frequency.value = 165;
      hornLow.connect(hornFilter); hornHigh.connect(hornFilter);
      hornFilter.connect(hornGain); hornGain.connect(master);
      hornLow.start(); hornHigh.start();

      // One gull oscillator is enough: each cry is a short downward pitch envelope.
      gullOsc = context.createOscillator();
      gullOsc.type = 'triangle';
      gullOsc.frequency.value = 900;
      gullGain = context.createGain();
      gullGain.gain.value = 0;
      gullOsc.connect(gullGain); gullGain.connect(master);
      gullOsc.start();

      // Engine sawtooth, filtered low enough that gear changes read as pitch rather than buzz.
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 54;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass'; engineFilter.frequency.value = 420; engineFilter.Q.value = 4;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(master);
      engineOsc.start();

      // Siren loop; update() moves its pitch and gain when a cruiser is close.
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 680;
      const sirenFilter = context.createBiquadFilter();
      sirenFilter.type = 'bandpass'; sirenFilter.frequency.value = 760; sirenFilter.Q.value = 2.2;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenFilter); sirenFilter.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start();
      started = true;
    } catch {
      context = null;
      started = false;
    }
  }

  function unlock() {
    buildAudioGraph();
    if (context && context.state === 'suspended') context.resume().catch(() => {});
  }

  function playTone(frequency, duration, type, volume, slide, destination) {
    if (!started || muted || !context) return;
    try {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency + slide), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain);
      gain.connect(destination || master);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    } catch {
      // Sound is decoration; a refused node must never stop a frame.
    }
  }

  function playNoiseBurst(duration, volume, frequency) {
    if (!started || muted || !context) return;
    try {
      const length = Math.max(1, Math.floor(context.sampleRate * duration));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) {
        const fall = 1 - index / length;
        data[index] = (Math.random() * 2 - 1) * fall * fall;
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = frequency;
      const gain = context.createGain();
      gain.gain.value = volume;
      source.connect(filter); filter.connect(gain); gain.connect(master);
      source.start();
    } catch {
      // A transient allocation failure should only lose that effect.
    }
  }

  function scheduleWaterLap(now, level) {
    if (!waterLapGain || muted) return;
    try {
      const gain = waterLapGain.gain;
      const start = now + 0.01;
      gain.setValueAtTime(0, start);
      gain.linearRampToValueAtTime(level, start + 0.16);
      gain.linearRampToValueAtTime(level * 0.35, start + 0.38);
      gain.linearRampToValueAtTime(level * 0.72, start + 0.62);
      gain.linearRampToValueAtTime(0, start + 0.95);
      gain.setValueAtTime(0, start + 1.1);
    } catch {
      // A missed lap is optional decoration.
    }
  }

  function scheduleHorn(now) {
    if (!hornGain || muted) return;
    try {
      const gain = hornGain.gain;
      gain.setValueAtTime(0, now);
      gain.linearRampToValueAtTime(0.018, now + 1.6);
      gain.setValueAtTime(0.018, now + 2.9);
      gain.linearRampToValueAtTime(0, now + 5.2);
    } catch {
      // Ignore a refused horn envelope.
    }
  }

  function scheduleGulls(now) {
    if (!gullOsc || !gullGain || muted) return;
    try {
      const gain = gullGain.gain;
      const count = 2 + Math.floor(Math.random() * 2);
      gain.setValueAtTime(0, now);
      for (let index = 0; index < count; index += 1) {
        const start = now + index * 0.27;
        gullOsc.frequency.setValueAtTime(880 + Math.random() * 50, start);
        gullOsc.frequency.exponentialRampToValueAtTime(500, start + 0.18);
        gain.setValueAtTime(0, start);
        gain.linearRampToValueAtTime(0.007, start + 0.012);
        gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
        gain.setValueAtTime(0, start + 0.2);
      }
    } catch {
      // Gulls are the first thing to drop if a browser refuses an envelope.
    }
  }

  function setAudioMuted(next) {
    muted = next;
    if (master && context) master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, context.currentTime, 0.03);
    try { window.localStorage.setItem(SOUND_KEY, muted ? 'off' : 'on'); } catch { /* private mode */ }
  }

  // Five gears give the engine a stepped rise; between changes the pitch still follows speed.
  function enginePitch(speed) {
    const gearRatios = [0.55, 0.75, 0.95, 1.17, 1.4];
    const gear = Math.min(gearRatios.length - 1, Math.floor(speed / 58));
    return speed > 1 ? 48 + 145 * gearRatios[gear] : 48;
  }

  // Water is loudest at the quay and fades as Vale walks inland.
  function shoreCloseness(state) {
    const waterY = state.city && state.city.water ? state.city.water.y : null;
    const playerY = state.player.y;
    if (!Number.isFinite(waterY) || !Number.isFinite(playerY)) return 0.35;
    const distance = Math.max(0, Math.abs(waterY - playerY));
    return clamp(1 - distance / 1150, 0.08, 1);
  }

  function updateContinuousMix(state, dt, shore) {
    const player = state.player;
    const vehicle = player.vehicle;
    const speed = vehicle ? Math.abs(vehicle.speed) : 0;
    const nearSiren = state.police.some((cop) => Math.hypot(cop.x - player.x, cop.y - player.y) < 820);
    const targetEngine = vehicle ? clamp(0.035 + speed / 900, 0.035, 0.22) : 0;
    const targetSiren = nearSiren && state.wanted > 0 ? 0.035 : 0;
    const targetRain = state.mode === 'title' ? 0.045 : 0.075;
    engineLevel += (targetEngine - engineLevel) * Math.min(1, dt * 4);
    sirenLevel += (targetSiren - sirenLevel) * Math.min(1, dt * 3);
    rainLevel += (targetRain - rainLevel) * Math.min(1, dt * 2);
    waterBedLevel += ((state.mode === 'title' ? 0.014 : 0.022) * shore - waterBedLevel) * Math.min(1, dt * 1.5);
    try {
      engineGain.gain.setTargetAtTime(engineLevel, context.currentTime, 0.04);
      engineOsc.frequency.setTargetAtTime(enginePitch(speed), context.currentTime, 0.04);
      sirenGain.gain.setTargetAtTime(sirenLevel, context.currentTime, 0.05);
      sirenOsc.frequency.setTargetAtTime(640 + Math.sin(state.time * 7) * 180, context.currentTime, 0.02);
      rainGain.gain.setTargetAtTime(rainLevel, context.currentTime, 0.1);
      if (waterBedGain) waterBedGain.gain.setTargetAtTime(waterBedLevel, context.currentTime, 0.18);
    } catch {
      // Audio nodes can be closed by the browser when a tab sleeps.
    }
  }

  function updateHarbourEvents(dt, shore) {
    waterClock += dt;
    if (waterClock >= nextWaterLap) {
      waterClock = 0;
      nextWaterLap = randomBetween(WATER_LAP_RANGE);
      scheduleWaterLap(context.currentTime, 0.018 * shore);
    }
    hornClock += dt;
    if (hornClock >= nextHorn) {
      hornClock = 0;
      nextHorn = randomBetween(HORN_RANGE);
      scheduleHorn(context.currentTime);
    }
    gullClock += dt;
    if (gullClock >= nextGulls) {
      gullClock = 0;
      nextGulls = randomBetween(GULL_RANGE);
      scheduleGulls(context.currentTime);
    }
  }

  function updateVehicleDetails(state, dt) {
    const vehicle = state.player.vehicle;
    if (!vehicle) {
      skidClock = 0;
      return;
    }
    const speed = Math.abs(vehicle.speed);
    if (speed > 30) {
      stepClock += dt * (speed / 110);
      if (stepClock > 0.27) {
        stepClock = 0;
        playTone(72 + Math.random() * 14, 0.05, 'square', 0.008, -18);
      }
    }
    if (state.tyreSqueal) {
      skidClock += dt;
      if (skidClock > 0.17) {
        skidClock = 0;
        playTone(1380 + Math.random() * 180, 0.11, 'sawtooth', 0.022, -260);
      }
    } else {
      skidClock = 0;
    }
  }

  function updateAudio(state, dt) {
    if (!started || !context) return;
    const shore = shoreCloseness(state);
    updateContinuousMix(state, dt, shore);
    updateHarbourEvents(dt, shore);
    updateVehicleDetails(state, dt);
  }

  return {
    unlock,
    update: updateAudio,
    isMuted() { return muted; },
    toggle() { setAudioMuted(!muted); return muted; },
    shot(kind) {
      if (!started) return;
      if (kind === 'police') playTone(1040, 0.09, 'square', 0.08, -520);
      else {
        playNoiseBurst(0.18, 0.38, 3600);
        playTone(148, 0.13, 'sawtooth', 0.13, -90);
      }
    },
    footstep(sprint) { playTone(sprint ? 118 : 92, 0.045, 'triangle', sprint ? 0.045 : 0.026, -28); },
    impact(strength) {
      playNoiseBurst(0.12 + Math.min(0.2, strength), Math.min(0.45, 0.1 + strength), 900);
      playTone(54, 0.18, 'sine', Math.min(0.35, strength), -22);
    },
    sirenBlip() { playTone(880, 0.12, 'square', 0.03, 220); },
    pickup() { playTone(580, 0.08, 'sine', 0.08, 240); playTone(880, 0.15, 'triangle', 0.05, 140); },
    hit() { playNoiseBurst(0.1, 0.32, 1700); playTone(90, 0.15, 'sine', 0.2, -40); },
    setEngine(hot) { if (engineGain && hot) playTone(66, 0.4, 'sawtooth', 0.04, 30); },
  };
}
