// The eight-job story chain. Missions are data plus a small set of objective verbs, so world.js
// remains the only place that advances real time and render.js can ask one function where to put
// the gold marker. Marrow sends Vale through the city; Okonkwo closes in as the jobs get dirtier.

import { PLAYER } from './config.js';
import { distanceSq } from './random.js';

const M = [
  {
    id: 'tide-ledger',
    title: 'THE TIDE LEDGER',
    giver: 'MARROW',
    intro: 'Marrow: "Vale. The Bream has a ledger in it. A courier named Pell is carrying it through Kessel Exchange. Bring it here before the tide turns."',
    steps: [
      {
        type: 'goto', x: 2016, y: 1566, r: 70,
        text: 'Meet Marrow at the Night Tide diner',
        dialogue: 'Marrow: "There he is. Pell. Thinks a raincoat makes him invisible. Take the ledger, leave the coat."',
      },
      {
        type: 'target', tag: 'pell', x: 2240, y: 1566,
        text: 'Take Pell’s ledger',
        dialogue: 'Pell: "You’re Vale? Marrow said you were a rumour."',
      },
      {
        type: 'goto', x: 820, y: 1566, r: 64,
        text: 'Return the ledger to Vale’s room',
        dialogue: 'Marrow: "Good. Clean. That ledger buys us a way into the dock. Get some sleep. Okonkwo will be sniffing around by dawn."',
      },
    ],
    reward: 450,
  },
  {
    id: 'bream-run',
    title: 'A BREAM IN THE MARROW',
    giver: 'MARROW',
    intro: 'Marrow: "The dock crew left a Bream van at Salt Market. Two crates of radio parts, one nervous driver. Deliver it to Pier Nine and I’ll forget the ledger."',
    steps: [
      {
        type: 'goto', x: 866, y: 2266, r: 72,
        text: 'Find the Bream van in Salt Market',
        dialogue: 'Marrow: "That’s the van. It handles like a wet mattress. Don’t let the harbour police see the crates."',
      },
      {
        type: 'drive', x: 2030, y: 3040, r: 96,
        text: 'Drive the Bream to Pier Nine',
        dialogue: 'Marrow: "Pier Nine. Container row. A man called Ivo will wave you through."',
      },
      {
        type: 'goto', x: 2016, y: 1566, r: 70,
        text: 'Report back to Marrow',
        dialogue: 'Marrow: "Ivo says the crates were already open. Someone in the division is reading our mail. Okonkwo is coming."',
      },
    ],
    reward: 650,
  },
  {
    id: 'salt-trap',
    title: 'THE SALT TRAP',
    giver: 'MARROW',
    intro: 'Marrow: "Someone in the division read our crates. I set a meet at Salt Market through the mole. Bring a second gun. It is going to be an ambush, just not for us."',
    steps: [
      {
        type: 'goto', x: 866, y: 2266, r: 72,
        text: 'Take the bait at Salt Market',
        dialogue: 'Marrow: "Stand in the light, look nervous. The mole will bring his friends."',
      },
      {
        type: 'kill', count: 3, x: 866, y: 2266, r: 210,
        text: 'Break the ambush (0/3)',
        dialogue: 'Marrow: "Three badges down and not one of them ours. The division will call it gang paperwork."',
      },
      {
        type: 'goto', x: 820, y: 1566, r: 72,
        text: 'Lay low at Lantern Ward',
        dialogue: 'Marrow: "You just bought us a week of quiet. Okonkwo will spend it looking at his own house."',
      },
    ],
    reward: 750,
  },
  {
    id: 'three-star-night',
    title: 'THREE-STAR NIGHT',
    giver: 'MARROW',
    intro: 'Marrow: "Okonkwo has a witness at the Neon Strip. I don’t want a body. I want a circus. Make the stars shine, then lose them in Lantern Ward."',
    steps: [
      {
        type: 'goto', x: 1760, y: 1566, r: 82,
        text: 'Start trouble on the Neon Strip',
        dialogue: 'Marrow: "That’s the signal. Let Okonkwo see you. Then make the city forget where you went."',
      },
      {
        type: 'survive', seconds: 28, x: 1760, y: 1566, r: 600, wanted: 3,
        text: 'Hold the heat for 28 seconds',
        dialogue: 'Marrow: "Cruisers coming. Keep moving. Use the alleys, not the avenue."',
      },
      {
        type: 'goto', x: 820, y: 1566, r: 74, clear: true,
        text: 'Lose the police at the Lantern Ward safehouse',
        dialogue: 'Marrow: "Still breathing? Good. The division is spread thin along the dock. We move tonight."',
      },
    ],
    reward: 900,
  },
  {
    id: 'harbor-tail',
    title: 'HARBOR TAIL',
    giver: 'MARROW',
    intro: 'Marrow: "A runner named Pavel moves Ivo\'s paper along the Neon Strip every night. Silence him before he reaches the exchange, then disappear. No noise, no parade."',
    steps: [
      {
        type: 'goto', x: 1760, y: 1566, r: 82,
        text: 'Pick up Pavel\'s route on the Neon Strip',
        dialogue: 'Marrow: "Grey coat, quick step, crooked tie. He counts the arcade signs when he walks."',
      },
      {
        type: 'target', tag: 'pavel', x: 2210, y: 1470,
        text: 'Silence Pavel before the exchange',
        dialogue: 'Marrow: "Pavel is fast but he is not lucky. Make sure the paper never gets read."',
      },
      {
        type: 'survive', seconds: 24, x: 1760, y: 1566, r: 600, wanted: 2,
        text: 'Shake the response for 24 seconds',
        dialogue: 'Marrow: "That was loud, Vale. Walk it off under the awnings."',
      },
      {
        type: 'goto', x: 2016, y: 1566, r: 70,
        text: 'Report to Marrow at the Night Tide',
        dialogue: 'Marrow: "Ivo\'s paper says berth seven. Container Mile. That is our way into the division\'s pocketbook."',
      },
    ],
    reward: 1000,
  },
  {
    id: 'container-job',
    title: 'THE CONTAINER JOB',
    giver: 'MARROW',
    intro: 'Marrow: "Container Mile, berth seven. There’s a manifest with every badge number in Port Kessel on it. Get past Ivo’s crew and bring the manifest to the old crane."',
    steps: [
      {
        type: 'goto', x: 2320, y: 2966, r: 88,
        text: 'Reach berth seven in Container Mile',
        dialogue: 'Marrow: "Ivo sold us out. His crew is waiting. Don’t let the manifest burn."',
      },
      {
        type: 'kill', count: 3, x: 2320, y: 2966, r: 220,
        text: 'Clear Ivo’s crew (0/3)',
        dialogue: 'Marrow: "That’s Ivo’s whole crew. The manifest is in the blue container. Take it to the crane."',
      },
      {
        type: 'drive', x: 2320, y: 3048, r: 120,
        text: 'Drive the manifest to Crane Five',
        dialogue: 'Marrow: "Crane Five. Okonkwo is already moving. Whatever happens, the manifest leaves this city."',
      },
      {
        type: 'goto', x: 820, y: 1566, r: 72,
        text: 'Escape to Lantern Ward',
        dialogue: 'Marrow: "You made it. They’re locking down the docks. One last job, Vale. Then you disappear."',
      },
    ],
    reward: 1200,
  },
  {
    id: 'crane-forgery',
    title: 'CRANE FIVE FORGERY',
    giver: 'MARROW',
    intro: 'Marrow: "The manifest is real, which makes it useless. My forger works under Crane Five tonight. Hold the yard while he inks the division\'s own signatures onto a copy."',
    steps: [
      {
        type: 'goto', x: 2320, y: 3048, r: 110,
        text: 'Reach Crane Five',
        dialogue: 'Marrow: "Wren is under the crane with a lamp and a steady hand. Nobody crosses the yard while he works."',
      },
      {
        type: 'survive', seconds: 30, x: 2320, y: 3048, r: 280, wanted: 3,
        text: 'Hold the yard for 30 seconds',
        dialogue: 'Marrow: "Okonkwo knows the paper is out. Whatever comes down that road, Wren needs more time. Give him thirty seconds, Vale."',
      },
      {
        type: 'goto', x: 820, y: 1566, r: 72,
        text: 'Bring the copy to Lantern Ward',
        dialogue: 'Marrow: "Now the division chases a manifest that hangs them. One last job at the exchange, Vale. Then the tide."',
      },
    ],
    reward: 1350,
  },
  {
    id: 'last-call',
    title: 'LAST CALL AT KESSEL',
    giver: 'MARROW',
    intro: 'Marrow: "Okonkwo has the manifest. He’s waiting at the old Kessel Exchange with the divisions’ whole night shift. End this, Vale. Or this city ends us."',
    steps: [
      {
        type: 'goto', x: 2266, y: 610, r: 94,
        text: 'Meet Okonkwo at Kessel Exchange',
        dialogue: 'Okonkwo: "Vale. You have a talent for arriving when the rain gets worse. Put the gun down and we can both retire."',
      },
      {
        type: 'kill', count: 4, x: 2266, y: 610, r: 260,
        text: 'Survive Okonkwo’s ambush (0/4)',
        dialogue: 'Okonkwo: "You picked the wrong city, Vale. There’s no horizon here. Only bills."',
      },
      {
        type: 'escape', x: 2700, y: 3260, r: 120, distance: 900,
        text: 'Escape to the harbour seaplane',
        dialogue: 'Marrow: "Seaplane at the north end of the dock. Don’t look back. The tide is already taking the rest."',
      },
    ],
    reward: 2500,
    finale: true,
  },
];

export function createMissions(city, random) {
  function definition(index) {
    return Number.isInteger(index) && index >= 0 && index < M.length ? M[index] : null;
  }

  function objectiveFor(state) {
    if (state.mission === null) return null;
    if (state.mission >= M.length) return null;
    const mission = M[state.mission];
    const step = mission.steps[state.missionStep];
    return step || null;
  }

  function markerFor(state) {
    if (state.mission === null || state.mission >= M.length || state.missionComplete) return null;
    const mission = M[state.mission];
    const step = mission.steps[state.missionStep];
    if (!step) return null;
    if (step.type === 'target') {
      const actor = state.missionActors.find((item) => item.tag === step.tag && !item.dead);
      if (actor) return { x: actor.x, y: actor.y, r: 44, color: '#ffcf4a' };
      return null;
    }
    if (step.type === 'kill') {
      const actor = state.missionActors.find((item) => item.kind === 'enemy' && !item.dead);
      if (actor) return { x: actor.x, y: actor.y, r: 44, color: '#ff526b' };
    }
    const markerRadius = step.type === 'survive' ? 90 : step.r || 72;
    return { x: step.x, y: step.y, r: markerRadius, color: '#ffcf4a' };
  }

  function spawnActor(kind, x, y, tag, extra = {}) {
    return {
      kind, x, y, tag, angle: random() * Math.PI * 2, speed: 0,
      health: kind === 'boss' ? 150 : kind === 'enemy' ? 75 : 55,
      maxHealth: kind === 'boss' ? 150 : kind === 'enemy' ? 75 : 55,
      dead: false, fireTimer: 0.7 + random() * 0.8, radius: 10,
      chase: kind === 'enemy' || kind === 'boss', colour: kind === 'boss' ? '#e1b16b' : '#c35161',
      ...extra,
    };
  }

  function spawnForStep(state, step) {
    state.missionActors = [];
    if (step.type === 'target') {
      const tag = step.tag || 'target';
      state.missionActors.push(spawnActor('courier', step.x, step.y, tag, { chase: false, health: 40, maxHealth: 40 }));
    }
    if (step.type === 'kill') {
      const count = step.count || 3;
      for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * Math.PI * 2;
        const kind = M[state.mission]?.finale && index === 0 ? 'boss' : 'enemy';
        state.missionActors.push(spawnActor(kind, step.x + Math.cos(angle) * 62, step.y + Math.sin(angle) * 62, kind === 'boss' ? 'okonkwo' : `crew-${index}`));
      }
    }
  }

  function announceStep(state, mission, index) {
    const step = mission.steps[index];
    state.hudDialogue = { speaker: mission.giver, text: step.dialogue || mission.intro, timer: 6.5 };
    state.objective = step.text;
    state.missionMarker = markerFor(state);
    spawnForStep(state, step);
    state.missionStepStart = state.time;
    state.surviveTimer = 0;
    state.lastForward = { x: state.player.x, y: state.player.y };
    if (step.type === 'survive' && step.wanted) {
      state.wanted = Math.max(state.wanted, step.wanted);
    }
  }

  function begin(state, index) {
    if (index < 0 || index >= M.length) return false;
    state.mission = index;
    state.missionStep = 0;
    state.missionComplete = false;
    state.credits = false;
    state.missionFinished = false;
    state.hudDialogue = { speaker: 'MARROW', text: M[index].intro, timer: 8 };
    announceStep(state, M[index], 0);
    return true;
  }

  function complete(state) {
    const mission = M[state.mission];
    state.money += mission.reward;
    state.hudDialogue = { speaker: mission.giver, text: `${mission.title} complete. $${mission.reward} wired.`, timer: 7 };
    state.missionComplete = true;
    state.missionsDone = Math.max(state.missionsDone, state.mission + 1);
    if (mission.finale) {
      state.missionFinished = true;
      state.credits = true;
      state.creditsTimer = 0;
      state.wanted = 0;
      state.objective = 'The harbour goes dark behind you.';
    } else {
      state.nextMissionTimer = 3.5;
      state.objective = 'Marrow has another job';
    }
  }

  function advance(state) {
    const mission = M[state.mission];
    const next = state.missionStep + 1;
    if (state.missionStep >= mission.steps.length - 1) complete(state);
    else {
      state.missionStep = next;
      announceStep(state, mission, next);
      state.shake = Math.max(state.shake, 1.2);
    }
  }

  function update(state, dt) {
    if (state.mission === null || state.mission >= M.length || state.missionComplete) {
      if (state.nextMissionTimer > 0) {
        state.nextMissionTimer -= dt;
        if (state.nextMissionTimer <= 0 && state.mission + 1 < M.length) begin(state, state.mission + 1);
      }
      return;
    }
    const mission = M[state.mission];
    const step = mission.steps[state.missionStep];
    if (!step) return;
    const player = state.player;
    const px = player.vehicle ? player.vehicle.x : player.x;
    const py = player.vehicle ? player.vehicle.y : player.y;
    if (step.type === 'goto') {
      if (distanceSq(px, py, step.x, step.y) < step.r * step.r) advance(state);
    } else if (step.type === 'target') {
      const target = state.missionActors.find((actor) => actor.tag === step.tag);
      if (!target || target.dead) advance(state);
    } else if (step.type === 'drive') {
      if (player.vehicle && distanceSq(px, py, step.x, step.y) < step.r * step.r) advance(state);
    } else if (step.type === 'survive') {
      if (distanceSq(px, py, step.x, step.y) < step.r * step.r) state.surviveTimer += dt;
      state.objective = `${step.text} (${Math.ceil(step.seconds - state.surviveTimer)}s)`;
      if (state.surviveTimer >= step.seconds) advance(state);
    } else if (step.type === 'kill') {
      const alive = state.missionActors.filter((actor) => actor.kind !== 'courier' && !actor.dead).length;
      state.objective = `${step.text.replace(/\(\d+\/\d+\)/, '')} (${step.count - alive}/${step.count})`;
      if (alive === 0) advance(state);
    } else if (step.type === 'escape') {
      if (distanceSq(px, py, step.x, step.y) < step.r * step.r) advance(state);
    }
    if (step.type !== 'kill') {
      state.missionMarker = markerFor(state);
    }
    if (state.credits) state.creditsTimer += dt;
  }

  function missionBrief(state) {
    if (state.mission === null) return 'No active job';
    if (state.mission >= M.length) return 'Port Kessel is quiet';
    const mission = M[state.mission];
    return `${mission.title} · ${state.mission + 1}/${M.length}`;
  }

  function resume(state, index, step) {
    if (!begin(state, index)) return false;
    const mission = M[index];
    const safeStep = Math.max(0, Math.min(step, mission.steps.length - 1));
    state.missionStep = safeStep;
    announceStep(state, mission, safeStep);
    return true;
  }

  return { definitions: M, definition, begin, resume, update, objectiveFor, markerFor, missionBrief };
}

export function missionStepText(state) {
  if (state.mission === null || state.mission >= M.length) return '';
  const mission = M[state.mission];
  return mission.steps[state.missionStep]?.text || '';
}

export function missionTitle(index) {
  return M[index]?.title || '';
}

export function missionCount() {
  return M.length;
}
