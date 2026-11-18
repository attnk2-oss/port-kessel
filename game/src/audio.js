// Synthesised harbour sound. No files, no network: two engines, a siren, filtered rain noise and
// one-shot envelopes are created when the browser allows it after a gesture. Every entry point
// is guarded, because a page with no AudioContext must still play the game silently.

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
  let stepClock = 0;
  let skidClock = 0;

  try {
    const saved = window.localStorage.getItem('neon-harbor.sound');
    if (saved === 'off') muted = true;
  } catch {
    muted = false;
  }

  function build() {
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
    build();
    if (context && context.state === 'suspended') context.resume().catch(() => {});
  }

  function tone(frequency, duration, type, volume, slide, destination) {
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

  function noiseBurst(duration, volume, frequency) {
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

  function setMuted(next) {
    muted = next;
    if (master && context) master.gain.setTargetAtTime(muted ? 0 : 0.34, context.currentTime, 0.03);
    try { window.localStorage.setItem('neon-harbor.sound', muted ? 'off' : 'on'); } catch { /* private mode */ }
  }

  function update(state, dt) {
    if (!started || !context) return;
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
    try {
      engineGain.gain.setTargetAtTime(engineLevel, context.currentTime, 0.04);
      engineOsc.frequency.setTargetAtTime(48 + speed * 0.72, context.currentTime, 0.04);
      sirenGain.gain.setTargetAtTime(sirenLevel, context.currentTime, 0.05);
      sirenOsc.frequency.setTargetAtTime(640 + Math.sin(state.time * 7) * 180, context.currentTime, 0.02);
      rainGain.gain.setTargetAtTime(rainLevel, context.currentTime, 0.1);
    } catch {
      // Audio nodes can be closed by the browser when a tab sleeps.
    }
    if (vehicle && speed > 30) {
      stepClock += dt * (speed / 110);
      if (stepClock > 0.27) {
        stepClock = 0;
        tone(72 + Math.random() * 14, 0.05, 'square', 0.008, -18);
      }
    }
    if (vehicle && state.tyreSqueal) {
      skidClock += dt;
      if (skidClock > 0.17) {
        skidClock = 0;
        tone(1380 + Math.random() * 180, 0.11, 'sawtooth', 0.022, -260);
      }
    } else skidClock = 0;
  }

  return {
    unlock,
    update,
    isMuted() { return muted; },
    toggle() { setMuted(!muted); return muted; },
    shot(kind) {
      if (!started) return;
      if (kind === 'police') tone(1040, 0.09, 'square', 0.08, -520);
      else {
        noiseBurst(0.18, 0.38, 3600);
        tone(148, 0.13, 'sawtooth', 0.13, -90);
      }
    },
    footstep(sprint) { tone(sprint ? 118 : 92, 0.045, 'triangle', sprint ? 0.045 : 0.026, -28); },
    impact(strength) {
      noiseBurst(0.12 + Math.min(0.2, strength), Math.min(0.45, 0.1 + strength), 900);
      tone(54, 0.18, 'sine', Math.min(0.35, strength), -22);
    },
    sirenBlip() { tone(880, 0.12, 'square', 0.03, 220); },
    pickup() { tone(580, 0.08, 'sine', 0.08, 240); tone(880, 0.15, 'triangle', 0.05, 140); },
    hit() { noiseBurst(0.1, 0.32, 1700); tone(90, 0.15, 'sine', 0.2, -40); },
    setEngine(hot) { if (engineGain && hot) tone(66, 0.4, 'sawtooth', 0.04, 30); },
  };
}
