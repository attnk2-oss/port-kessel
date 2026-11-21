// Synthesised harbour sound. No files, no network: engines, a siren, filtered rain, lapping water,
// distant horns, gulls and one-shot envelopes are created when the browser allows it after a
// gesture. Every entry point is guarded, because a page with no AudioContext must still play the
// game silently.

import { clamp } from './random.js';

export function createAudio() {
  let context = null;
  let master = null;
  let compressor = null;
  let ambientGain = null;
  let rainGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let started = false;
  let engineLevel = 0;
  let sirenLevel = 0;
  let rainLevel = 0;
  let waterBedLevel = 0;
  let stepClock = 0;
  let skidClock = 0;
  let waterBedGain = null;
  let waterLapGain = null;
  let hornGain = null;
  let gullOsc = null;
  let gullGain = null;
  let waterClock = 0;
  let hornClock = 0;
  let gullClock = 0;
  let nextWaterLap = 1.5 + Math.random() * 2.5;
  let nextHorn = 25 + Math.random() * 35;
  let nextGulls = 8 + Math.random() * 12;

  try {
    const saved = window.localStorage.getItem('neon-harbor.sound');
    if (saved === 'off') muted = true;
  } catch {
    muted = false;
  }

  function buildAudioGraph() {
    if (context) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      context = new Ctx();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.34;
      compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 14;
      compressor.ratio.value = 5;
      master.connect(compressor);
      compressor.connect(context.destination);

      ambientGain = context.createGain();
      ambientGain.gain.value = 0.12;
      ambientGain.connect(master);
      const padA = context.createOscillator();
      const padB = context.createOscillator();
      const padFilter = context.createBiquadFilter();
      padA.type = 'sine'; padA.frequency.value = 55;
      padB.type = 'triangle'; padB.frequency.value = 82.5;
      padFilter.type = 'lowpass'; padFilter.frequency.value = 210; padFilter.Q.value = 3;
      padA.connect(padFilter); padB.connect(padFilter); padFilter.connect(ambientGain);
      padA.start(); padB.start();

      rainGain = context.createGain();
      rainGain.gain.value = 0.0;
      rainGain.connect(master);
      const length = Math.floor(context.sampleRate * 2);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      let tail = 0;
      for (let index = 0; index < length; index += 1) {
        tail = tail * 0.93 + (Math.random() * 2 - 1) * 0.07;
        data[index] = tail * 3.2;
      }
      const rain = context.createBufferSource();
      rain.buffer = buffer; rain.loop = true;
      const rainFilter = context.createBiquadFilter();
      rainFilter.type = 'bandpass'; rainFilter.frequency.value = 2300; rainFilter.Q.value = 0.6;
      rain.connect(rainFilter); rainFilter.connect(rainGain); rain.start();

      // A slow brown-noise bed and a separate gain for lapping pulses. Both stay below the rain
      // because the harbour should sit around the scene, not over it.
      const lapLength = Math.floor(context.sampleRate * 3);
      const lapBuffer = context.createBuffer(1, lapLength, context.sampleRate);
      const lapData = lapBuffer.getChannelData(0);
      let lapTail = 0;
      for (let index = 0; index < lapLength; index += 1) {
        lapTail = lapTail * 0.985 + (Math.random() * 2 - 1) * 0.015;
        lapData[index] = lapTail * 4.2;
      }
      const water = context.createBufferSource();
      water.buffer = lapBuffer; water.loop = true;
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

      // 110 Hz against 165 Hz gives the horn its fifth; the lowpass keeps the pair off the fore.
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

      gullOsc = context.createOscillator();
      gullOsc.type = 'triangle';
      gullOsc.frequency.value = 900;
      gullGain = context.createGain();
      gullGain.gain.value = 0;
      gullOsc.connect(gullGain); gullGain.connect(master);
      gullOsc.start();

      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 54;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass'; engineFilter.frequency.value = 420; engineFilter.Q.value = 4;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(master);
      engineOsc.start();

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
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, now);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, frequency + slide), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(destination || master);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch {
      // Sound is decoration; never let a refused node stop a frame.
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
      // Ignore a transient audio allocation failure.
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
      // A scheduled breath of water is optional decoration.
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
    if (master && context) master.gain.setTargetAtTime(muted ? 0 : 0.34, context.currentTime, 0.03);
    try { window.localStorage.setItem('neon-harbor.sound', muted ? 'off' : 'on'); } catch { /* private mode */ }
  }

  function updateAudio(state, dt) {
    if (!started || !context) return;
    const player = state.player;
    const vehicle = player.vehicle;
    const speed = vehicle ? Math.abs(vehicle.speed) : 0;
    const nearSiren = state.police.some((cop) => Math.hypot(cop.x - player.x, cop.y - player.y) < 820);
    const targetEngine = vehicle ? clamp(0.035 + speed / 900, 0.035, 0.22) : 0;
    const targetSiren = nearSiren && state.wanted > 0 ? 0.035 : 0;
    const targetRain = state.mode === 'title' ? 0.045 : 0.075;
    const waterY = state.city && state.city.water ? state.city.water.y : null;
    const waterDistance = Number.isFinite(waterY) && Number.isFinite(player.y)
      ? Math.max(0, Math.abs(waterY - player.y)) : null;
    const dockCloseness = waterDistance === null ? 0.35 : clamp(1 - waterDistance / 1150, 0.08, 1);
    const gearRatios = [0.55, 0.75, 0.95, 1.17, 1.4];
    const gear = Math.min(gearRatios.length - 1, Math.floor(speed / 58));
    const engineFrequency = speed > 1 ? 48 + 145 * gearRatios[gear] : 48;
    engineLevel += (targetEngine - engineLevel) * Math.min(1, dt * 4);
    sirenLevel += (targetSiren - sirenLevel) * Math.min(1, dt * 3);
    rainLevel += (targetRain - rainLevel) * Math.min(1, dt * 2);
    waterBedLevel += ((state.mode === 'title' ? 0.014 : 0.022) * dockCloseness - waterBedLevel) * Math.min(1, dt * 1.5);
    try {
      engineGain.gain.setTargetAtTime(engineLevel, context.currentTime, 0.04);
      engineOsc.frequency.setTargetAtTime(engineFrequency, context.currentTime, 0.04);
      sirenGain.gain.setTargetAtTime(sirenLevel, context.currentTime, 0.05);
      sirenOsc.frequency.setTargetAtTime(640 + Math.sin(state.time * 7) * 180, context.currentTime, 0.02);
      rainGain.gain.setTargetAtTime(rainLevel, context.currentTime, 0.1);
      if (waterBedGain) waterBedGain.gain.setTargetAtTime(waterBedLevel, context.currentTime, 0.18);
    } catch {
      // Audio nodes can be closed by the browser when a tab sleeps.
    }
    waterClock += dt;
    if (waterClock >= nextWaterLap) {
      waterClock = 0;
      nextWaterLap = 1.5 + Math.random() * 2.5;
      scheduleWaterLap(context.currentTime, 0.018 * dockCloseness);
    }
    hornClock += dt;
    if (hornClock >= nextHorn) {
      hornClock = 0;
      nextHorn = 25 + Math.random() * 35;
      scheduleHorn(context.currentTime);
    }
    gullClock += dt;
    if (gullClock >= nextGulls) {
      gullClock = 0;
      nextGulls = 8 + Math.random() * 12;
      scheduleGulls(context.currentTime);
    }
    if (vehicle && speed > 30) {
      stepClock += dt * (speed / 110);
      if (stepClock > 0.27) {
        stepClock = 0;
        playTone(72 + Math.random() * 14, 0.05, 'square', 0.008, -18);
      }
    }
    if (vehicle && state.tyreSqueal) {
      skidClock += dt;
      if (skidClock > 0.17) {
        skidClock = 0;
        playTone(1380 + Math.random() * 180, 0.11, 'sawtooth', 0.022, -260);
      }
    } else skidClock = 0;
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
