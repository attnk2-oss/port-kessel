// Radio 9 is a tiny, always-on city service: it announces the district Vale enters and the
// division's current wanted response, and exposes one short line for the HUD ticker. It owns no
// timers that can stall play; it only notices state changes the simulation has already made.

import { WANTED } from './config.js';

const STATION = 'RADIO 9';

function responseLine(state) {
  const district = String(state.district || 'Port Kessel').toUpperCase();
  if (state.wanted > 0) {
    return `${district} · ${WANTED.stars[state.wanted].toUpperCase()} RESPONSE`;
  }
  return `${district} · RAIN WATCH`;
}

export function createRadio() {
  let lastDistrict = null;
  let lastWanted = -1;
  let pulse = 0;

  function reset(state) {
    state.radio = { station: STATION, line: responseLine(state), pulse: 0 };
    lastDistrict = state.district;
    lastWanted = state.wanted;
    pulse = 1;
  }

  function sync(state) {
    if (!state.radio) state.radio = { station: STATION, line: '', pulse: 0 };
    state.radio.station = STATION;
    state.radio.line = responseLine(state);
    state.radio.pulse = 0;
    lastDistrict = state.district;
    lastWanted = state.wanted;
  }

  function update(state, dt) {
    if (!state.radio) reset(state);
    state.radio.pulse = Math.max(0, state.radio.pulse - dt * 1.8);
    if (state.district !== lastDistrict || state.wanted !== lastWanted) {
      pulse = 1;
      sync(state);
      state.radio.pulse = pulse;
    }
    pulse = Math.max(0, pulse - dt * 1.8);
  }

  return { reset, sync, update, station: STATION };
}
