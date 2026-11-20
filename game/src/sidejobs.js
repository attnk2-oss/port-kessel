// Three repeatable courier drops, deliberately smaller than Marrow's story jobs. A cyan marker
// appears on the minimap as soon as Vale steps outside; reaching it pays cash, then the next
// drop opens after a short radio pause. The system touches only money, messages and its marker.

import { distanceSq } from './random.js';

const DROPS = [
  { id: 'lantern-packet', label: 'Lantern Ward packet', x: 1030, y: 1566, r: 58, pay: 180 },
  { id: 'salt-crate', label: 'Salt Market crate', x: 1370, y: 2310, r: 64, pay: 240 },
  { id: 'quay-film', label: 'Glass Quay film can', x: 2510, y: 1216, r: 60, pay: 320 },
];

export function createSideJobs() {
  let index = 0;
  let cooldown = 0;

  function arm(state) {
    const drop = DROPS[index % DROPS.length];
    state.sideJob = { ...drop, kind: 'courier', index: index % DROPS.length };
    state.radioHush = 0;
  }

  function reset(state) {
    index = 0;
    cooldown = 0;
    state.sideJobsDone = 0;
    arm(state);
  }

  function update(state, dt) {
    if (!state.sideJob) {
      cooldown = Math.max(0, cooldown - dt);
      if (cooldown <= 0) arm(state);
      return;
    }
    const px = state.player.vehicle ? state.player.vehicle.x : state.player.x;
    const py = state.player.vehicle ? state.player.vehicle.y : state.player.y;
    if (distanceSq(px, py, state.sideJob.x, state.sideJob.y) >= state.sideJob.r * state.sideJob.r) return;
    const paid = state.sideJob.pay;
    state.money += paid;
    state.sideJobsDone += 1;
    state.message = `SIDE JOB PAID · $${paid} · Radio 9 has the next drop.`;
    state.messageTimer = 3.4;
    state.sideJob = null;
    index += 1;
    cooldown = 9;
  }

  return { reset, update, drops: DROPS };
}
