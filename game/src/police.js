// Port Kessel Police Division. Cruisers are spawned beyond the camera frustum and steer toward
// the player through the street grid; higher wanted levels bring more cars, foot patrols and
// live fire. The module only moves and shoots; world.js owns hits, wanted decay and the HUD.

import { VEHICLE, WANTED } from './config.js';
import { clamp, distanceSq, angleDelta } from './random.js';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export function createPolice(city, random) {
  function spawnCruiser(state) {
    const angle = random() * Math.PI * 2;
    const radius = WANTED.spawnRadius + random() * 180;
    let x = state.player.x + Math.cos(angle) * radius;
    let y = state.player.y + Math.sin(angle) * radius;
    // Snap to the nearest road lane so a cruiser never starts inside a tenement.
    let road = -1;
    let along = 0;
    const hx = city.avenue(clamp(Math.round((x - city.origin) / city.pitch), 0, 8));
    const vy = city.cross(clamp(Math.round((y - city.origin) / city.pitch), 0, 8));
    if (Math.abs(x - hx) < Math.abs(y - vy)) {
      road = 0; along = hx; y = clamp(y, 210, city.dockY - 50);
    } else {
      road = 1; along = vy; x = clamp(x, 210, city.worldWidth - 210);
    }
    const heading = road === 0 ? (random() < 0.5 ? 0 : Math.PI) : (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const cruiser = {
      kind: 'police', type: 'tern', x, y, angle: heading, speed: 82,
      health: VEHICLE.tern.health, width: VEHICLE.tern.width, length: VEHICLE.tern.length,
      color: VEHICLE.tern.color, driver: true, playerOwned: false,
      ai: true, destroyed: false, sirenPhase: random() * Math.PI * 2,
      fireTimer: 0.8 + random() * 0.7, ramBoost: 0, stuck: 0, wheel: 0,
      plate: 'PKPD-' + Math.floor(random() * 900 + 100),
    };
    state.police.push(cruiser);
    return cruiser;
  }

  function spawnFoot(state) {
    const angle = random() * Math.PI * 2;
    const distance = 440 + random() * 160;
    const x = state.player.x + Math.cos(angle) * distance;
    const y = state.player.y + Math.sin(angle) * distance;
    state.police.push({
      kind: 'foot', x, y, angle, speed: 0, health: 90, width: 10, length: 10,
      driver: false, playerOwned: false, ai: true, destroyed: false,
      fireTimer: 0.9 + random() * 0.9, sirenPhase: random() * 6,
    });
  }

  function desiredCount(wanted) {
    if (wanted <= 0) return 0;
    if (wanted === 1) return 1;
    if (wanted === 2) return 2;
    if (wanted === 3) return 4;
    if (wanted === 4) return 6;
    return 8;
  }

  function footCount(wanted) {
    if (wanted < 2) return 0;
    return Math.min(5, wanted - 1);
  }

  function countUnits(state, kind) {
    let count = 0;
    for (let index = 0; index < state.police.length; index += 1) {
      const unit = state.police[index];
      if (unit.kind === kind && !unit.destroyed) count += 1;
    }
    return count;
  }

  function updateCruiser(cruiser, state, dt) {
    const player = state.player;
    const targetX = player.vehicle ? player.vehicle.x : player.x;
    const targetY = player.vehicle ? player.vehicle.y : player.y;
    const dx = targetX - cruiser.x;
    const dy = targetY - cruiser.y;
    const distance = Math.hypot(dx, dy);
    const wantedAngle = Math.atan2(dy, dx);
    const turnRate = 1.6 + state.wanted * 0.18;
    cruiser.angle += clamp(angleDelta(cruiser.angle, wantedAngle), -turnRate * dt, turnRate * dt);
    const desiredSpeed = distance > 700 ? 150 : distance > 260 ? 135 : distance < 90 ? 70 : 112;
    cruiser.speed += clamp(desiredSpeed - cruiser.speed, -130 * dt, 95 * dt);
    cruiser.speed = clamp(cruiser.speed, 0, VEHICLE.tern.maxSpeed);
    cruiser.x += Math.cos(cruiser.angle) * cruiser.speed * dt;
    cruiser.y += Math.sin(cruiser.angle) * cruiser.speed * dt;
    cruiser.sirenPhase += dt * 7;
    cruiser.fireTimer -= dt;
    if (state.wanted >= 2 && cruiser.fireTimer <= 0 && distance < 455) {
      cruiser.fireTimer = 0.95 + random() * (1.5 - state.wanted * 0.12);
      state.bullets.push({ x: cruiser.x, y: cruiser.y, vx: Math.cos(Math.atan2(targetY - cruiser.y, targetX - cruiser.x)) * 560, vy: Math.sin(Math.atan2(targetY - cruiser.y, targetX - cruiser.x)) * 560, life: 1, damage: 11 + state.wanted * 2, owner: 'police', angle: cruiser.angle, trail: 0 });
      state.policeShots += 1;
    }
    // Keep cruisers clear of buildings by projecting them back toward the nearest street.
    const nearestX = city.avenue(clamp(Math.round((cruiser.x - city.origin) / city.pitch), 0, 8));
    const nearestY = city.cross(clamp(Math.round((cruiser.y - city.origin) / city.pitch), 0, 8));
    if (!city.isRoad(cruiser.x, cruiser.y) && city.isRoad(nearestX, cruiser.y)) {
      cruiser.x += clamp(nearestX - cruiser.x, -90 * dt, 90 * dt);
    } else if (!city.isRoad(cruiser.x, cruiser.y) && city.isRoad(cruiser.x, nearestY)) {
      cruiser.y += clamp(nearestY - cruiser.y, -90 * dt, 90 * dt);
    }
    cruiser.wheel += cruiser.speed * dt;
  }

  function updateFoot(cop, state, dt) {
    const player = state.player;
    const px = player.vehicle ? player.vehicle.x : player.x;
    const py = player.vehicle ? player.vehicle.y : player.y;
    const dx = px - cop.x;
    const dy = py - cop.y;
    const distance = Math.hypot(dx, dy);
    const desired = Math.atan2(dy, dx);
    cop.angle += clamp(angleDelta(cop.angle, desired), -4.2 * dt, 4.2 * dt);
    const speed = distance > 42 ? 76 : 0;
    cop.speed += clamp(speed - cop.speed, -220 * dt, 180 * dt);
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    cop.fireTimer -= dt;
    if (cop.fireTimer <= 0 && distance < 360) {
      cop.fireTimer = 1.25 + random() * (1.8 - state.wanted * 0.12);
      state.bullets.push({ x: cop.x, y: cop.y, vx: Math.cos(Math.atan2(py - cop.y, px - cop.x)) * 500, vy: Math.sin(Math.atan2(py - cop.y, px - cop.x)) * 500, life: 1, damage: 9 + state.wanted, owner: 'police', angle: cop.angle, trail: 0 });
      state.policeShots += 1;
    }
  }

  function update(state, dt) {
    const wanted = state.wanted;
    for (let index = state.police.length - 1; index >= 0; index -= 1) {
      const unit = state.police[index];
      if (unit.destroyed) {
        unit.destroyTimer = (unit.destroyTimer || 0) + dt;
        if (unit.destroyTimer > 16) state.police.splice(index, 1);
        continue;
      }
      if (unit.kind === 'police') updateCruiser(unit, state, dt);
      else updateFoot(unit, state, dt);
    }
    if (wanted <= 0) {
      if (state.police.length) state.police.length = 0;
      return;
    }
    const cruisers = countUnits(state, 'police');
    const foot = countUnits(state, 'foot');
    if (cruisers < desiredCount(wanted) && state.policeSpawnTimer <= 0) {
      spawnCruiser(state);
      state.policeSpawnTimer = Math.max(0.8, 3.4 - wanted * 0.42);
    }
    if (foot < footCount(wanted) && state.footSpawnTimer <= 0) {
      spawnFoot(state);
      state.footSpawnTimer = 2.6;
    }
    state.policeSpawnTimer = Math.max(0, state.policeSpawnTimer - dt);
    state.footSpawnTimer = Math.max(0, state.footSpawnTimer - dt);
  }

  return { update, spawnCruiser, spawnFoot };
}
