// Canvas 2D presentation for NEON HARBOR. The city is drawn in metres through one camera
// transform, then the HUD is drawn in the fixed 1280x720 logical frame. No assets are fetched:
// wet asphalt, lit windows, neon tubes, cones and rain are all paths and gradients.

import {
  CITY, DISPLAY_FONT, FONT, FIELD, PALETTE, SAFEHOUSE, VEHICLE, WANTED, WEAPONS,
} from './config.js';
import { clamp, hashSeed } from './random.js';
import { drawCornerTicks, drawMeter, drawWantedStars } from './hud.js';

export const SCREEN = Object.freeze({ title: 'title', play: 'play', paused: 'paused', credits: 'credits' });

const RAIN_COUNT = 145;
const rain = Array.from({ length: RAIN_COUNT }, (_, index) => ({
  x: (hashSeed('x' + index) % 1280),
  y: (hashSeed('y' + index) % 720),
  speed: 340 + (hashSeed('s' + index) % 310),
  length: 10 + (hashSeed('l' + index) % 18),
  layer: index % 3,
}));

function shade(hex, amount) {
  const raw = Number.parseInt(hex.slice(1), 16);
  const r = clamp(((raw >> 16) & 255) + amount, 0, 255);
  const g = clamp(((raw >> 8) & 255) + amount, 0, 255);
  const b = clamp((raw & 255) + amount, 0, 255);
  return `rgb(${r},${g},${b})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const view = { scale: 1, x: 0, y: 0 };
  let width = 1280;
  let height = 720;
  let time = 0;
  const fonts = new Map();

  function resize() {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    width = Math.round(window.innerWidth * ratio);
    height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function font(size, weight = 400, family = FONT) {
    const key = `${weight}:${size}:${family}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${family}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color = PALETTE.text, align = 'left', weight = 400, family = FONT) {
    ctx.font = font(size, weight, family);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function panel(x, y, w, h, fill = PALETTE.hud, edge = PALETTE.hudEdge) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function worldTransform(state) {
    const cam = state.camera;
    const shake = state.shake || 0;
    const sx = shake ? Math.sin(time * 93.1) * shake : 0;
    const sy = shake ? Math.cos(time * 77.7) * shake * 0.7 : 0;
    const zoom = cam.zoom || 1;
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    ctx.save();
    ctx.translate(FIELD.width / 2 + sx, FIELD.height / 2 + sy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x, -cam.y);
    return { sx, sy, zoom };
  }

  function drawWater(city) {
    const water = city.water;
    const gradient = ctx.createLinearGradient(0, water.y, 0, water.y + water.h);
    gradient.addColorStop(0, '#072a38');
    gradient.addColorStop(0.36, PALETTE.water);
    gradient.addColorStop(1, '#031018');
    ctx.fillStyle = gradient;
    ctx.fillRect(-200, water.y, CITY.worldWidth + 400, water.h + 400);
    ctx.strokeStyle = 'rgba(90, 205, 215, 0.16)';
    ctx.lineWidth = 2;
    for (let index = 0; index < 24; index += 1) {
      const y = water.y + 22 + index * 17;
      const phase = Math.sin(time * 0.8 + index) * 22;
      ctx.beginPath();
      ctx.moveTo(120 + (index % 3) * 240 + phase, y);
      ctx.lineTo(360 + (index % 4) * 270 + phase, y + 4);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 178, 78, 0.18)';
    for (let index = 0; index < 9; index += 1) {
      const x = 240 + index * 316;
      ctx.fillRect(x, water.y + 42 + (index % 3) * 19, 11, 82 + (index % 4) * 16);
    }
  }

  function drawRoads(city) {
    ctx.fillStyle = PALETTE.asphalt;
    ctx.fillRect(-200, -200, CITY.worldWidth + 400, city.dockY + 300);
    // Avenues are slightly warmer under the sodium lamps.
    for (let index = 0; index <= CITY.blocksX; index += 1) {
      const x = city.avenue(index) - city.road / 2;
      const gradient = ctx.createLinearGradient(x, 0, x + city.road, 0);
      gradient.addColorStop(0, '#101821');
      gradient.addColorStop(0.5, '#19242e');
      gradient.addColorStop(1, '#101821');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, 0, city.road, city.dockY);
    }
    for (let index = 0; index <= CITY.blocksY; index += 1) {
      const y = city.cross(index) - city.road / 2;
      ctx.fillStyle = '#141e27';
      ctx.fillRect(0, y, CITY.worldWidth, city.road);
    }
    // Sidewalks plus the raised block ground.
    for (let index = 0; index < city.blocks.length; index += 1) {
      const block = city.blocks[index];
      const pad = city.curb;
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(block.x - pad, block.y - pad, block.size + pad * 2, block.size + pad * 2);
      ctx.strokeStyle = PALETTE.curb;
      ctx.lineWidth = 2;
      ctx.strokeRect(block.x - pad, block.y - pad, block.size + pad * 2, block.size + pad * 2);
      if (block.kind === 'park') {
        ctx.fillStyle = '#162e27';
        ctx.fillRect(block.x - pad + 4, block.y - pad + 4, block.size + pad * 2 - 8, block.size + pad * 2 - 8);
      } else if (block.kind === 'plaza') {
        ctx.fillStyle = '#2b3031';
        ctx.fillRect(block.x - pad + 4, block.y - pad + 4, block.size + pad * 2 - 8, block.size + pad * 2 - 8);
      }
    }
    // Lane marks. They stop before junctions so the crossing boxes read cleanly.
    ctx.strokeStyle = 'rgba(201, 184, 121, 0.58)';
    ctx.lineWidth = 3;
    ctx.setLineDash([22, 22]);
    for (let index = 0; index <= CITY.blocksX; index += 1) {
      const x = city.avenue(index);
      ctx.beginPath();
      for (let j = 0; j < CITY.blocksY; j += 1) {
        const y1 = city.cross(j) + city.road / 2 + 12;
        const y2 = city.cross(j + 1) - city.road / 2 - 12;
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
      }
      ctx.stroke();
    }
    for (let index = 0; index <= CITY.blocksY; index += 1) {
      const y = city.cross(index);
      ctx.beginPath();
      for (let j = 0; j < CITY.blocksX; j += 1) {
        const x1 = city.avenue(j) + city.road / 2 + 12;
        const x2 = city.avenue(j + 1) - city.road / 2 - 12;
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Crosswalks at each junction, facing each arm.
    ctx.fillStyle = 'rgba(223, 234, 224, 0.34)';
    for (let i = 0; i <= CITY.blocksX; i += 1) {
      for (let j = 0; j <= CITY.blocksY; j += 1) {
        const x = city.avenue(i);
        const y = city.cross(j);
        for (let stripe = -3; stripe <= 3; stripe += 1) {
          ctx.fillRect(x + stripe * 10 - 3, y - city.road / 2 - 12, 5, 12);
          ctx.fillRect(x + stripe * 10 - 3, y + city.road / 2, 5, 12);
          ctx.fillRect(x - city.road / 2 - 12, y + stripe * 10 - 3, 12, 5);
          ctx.fillRect(x + city.road / 2, y + stripe * 10 - 3, 12, 5);
        }
      }
    }
  }

  function drawDock(city) {
    const dock = city.dock;
    ctx.fillStyle = '#1b2931';
    ctx.fillRect(dock.x, dock.y, dock.w, dock.h);
    ctx.strokeStyle = 'rgba(201, 184, 121, 0.28)';
    ctx.lineWidth = 2;
    ctx.setLineDash([36, 18]);
    ctx.beginPath();
    ctx.moveTo(dock.x + 20, dock.y + 46);
    ctx.lineTo(dock.x + dock.w - 20, dock.y + 46);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let index = 0; index < city.warehouses.length; index += 1) {
      const room = city.warehouses[index];
      ctx.fillStyle = room.color;
      ctx.fillRect(room.x, room.y, room.w, room.h);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let line = 0; line < 6; line += 1) ctx.fillRect(room.x + 12, room.y + 12 + line * 12, room.w - 24, 3);
      ctx.fillStyle = '#ffb24e';
      ctx.fillRect(room.x + room.w - 30, room.y + 10, 17, 9);
    }
    // Rail lines along the quay.
    ctx.strokeStyle = '#5d6c70';
    ctx.lineWidth = 3;
    for (let x = dock.x + 50; x < dock.x + dock.w; x += 480) {
      ctx.beginPath();
      ctx.moveTo(x, dock.y + 10);
      ctx.lineTo(x, dock.y + dock.h - 6);
      ctx.stroke();
    }
    ctx.strokeStyle = '#303e43';
    ctx.lineWidth = 2;
    for (let index = 0; index < 14; index += 1) {
      const x = dock.x + 70 + index * 210;
      ctx.fillStyle = '#59666a';
      ctx.fillRect(x, dock.y + 90, 10, 72);
      ctx.fillStyle = 'rgba(255,178,78,0.58)';
      ctx.fillRect(x + 2, dock.y + 94, 6, 4);
    }
    for (let index = 0; index < city.cranes.length; index += 1) drawCrane(city.cranes[index], index);
    // Containers in the terminal lots.
    for (let index = 0; index < city.lots.length; index += 1) {
      const lot = city.lots[index];
      ctx.fillStyle = lot.color;
      ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.32)';
      ctx.lineWidth = 1;
      for (let rib = 4; rib < lot.w; rib += 7) {
        ctx.beginPath(); ctx.moveTo(lot.x + rib, lot.y + 2); ctx.lineTo(lot.x + rib, lot.y + lot.h - 2); ctx.stroke();
      }
    }
  }

  function drawCrane(crane, index) {
    ctx.save();
    ctx.translate(crane.x, crane.baseY);
    ctx.strokeStyle = index % 2 ? '#b27f4f' : '#a6a694';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -crane.height);
    ctx.lineTo(Math.cos(crane.angle) * crane.arm, -crane.height + Math.sin(crane.angle) * crane.arm);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 178, 78, 0.65)';
    ctx.beginPath(); ctx.arc(Math.cos(crane.angle) * crane.arm, -crane.height + Math.sin(crane.angle) * crane.arm, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -crane.height);
    ctx.lineTo(-24, 0);
    ctx.lineTo(26, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#ff526b';
    ctx.fillRect(-3, -crane.height - 7, 7, 7);
    ctx.restore();
  }

  function drawBuilding(building, state) {
    if (building.x > state.camera.x + 760 || building.x + building.w < state.camera.x - 760) return;
    if (building.y > state.camera.y + 520 || building.y + building.h + 20 < state.camera.y - 520) return;
    const depth = 14 + building.height * 14;
    // Long shadow/depth face away from the street lamps.
    ctx.fillStyle = '#0a1118';
    ctx.fillRect(building.x + 7, building.y + 8, building.w, building.h + depth);
    ctx.fillStyle = shade(PALETTE.building, Math.floor(building.height * 22));
    ctx.fillRect(building.x, building.y, building.w, building.h);
    ctx.fillStyle = shade(PALETTE.buildingTop, Math.floor(12 + building.height * 18));
    ctx.fillRect(building.x, building.y, building.w, Math.max(8, building.h * 0.18));
    ctx.strokeStyle = 'rgba(67, 92, 102, 0.55)';
    ctx.lineWidth = 1.3;
    ctx.strokeRect(building.x + 0.5, building.y + 0.5, building.w - 1, building.h - 1);
    // Roof plant.
    if (building.rooftop === 'ac') {
      ctx.fillStyle = '#293940';
      ctx.fillRect(building.x + building.w * 0.18, building.y + 9, building.w * 0.22, building.h * 0.15);
    } else if (building.rooftop === 'tank') {
      ctx.fillStyle = '#314b53';
      ctx.beginPath(); ctx.arc(building.x + building.w * 0.62, building.y + building.h * 0.19, 9, 0, Math.PI * 2); ctx.fill();
    } else if (building.rooftop === 'antenna') {
      ctx.strokeStyle = '#94745a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(building.x + building.w * 0.78, building.y + 5); ctx.lineTo(building.x + building.w * 0.78, building.y - 16); ctx.stroke();
      ctx.fillStyle = '#ff526b'; ctx.fillRect(building.x + building.w * 0.78 - 2, building.y - 19, 4, 4);
    }
    const cols = building.windows;
    const rows = Math.max(2, Math.floor(building.h / 24));
    const winW = Math.max(4, building.w / (cols * 2.6));
    const winH = Math.max(3, Math.min(9, building.h / (rows * 3.2)));
    const seed = building.x + building.y * 3.1;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const lit = Math.sin(seed + row * 7.13 + col * 3.71 + building.lit * 10) > 0.12;
        if (!lit) continue;
        const cool = Math.sin(seed + row + col * 1.7) > 0.73;
        ctx.fillStyle = cool ? 'rgba(143, 207, 214, 0.78)' : 'rgba(242, 190, 105, 0.82)';
        ctx.fillRect(
          building.x + 9 + col * ((building.w - 18) / cols),
          building.y + 12 + row * ((building.h - 18) / rows),
          winW, winH,
        );
      }
    }
    // Street-facing service door and awning stripes.
    ctx.fillStyle = '#0b1217';
    ctx.fillRect(building.x + building.w * 0.43, building.y + building.h - 14, 13, 14);
    if (building.kind !== 'city') {
      ctx.fillStyle = 'rgba(255,178,78,0.08)';
      ctx.fillRect(building.x - 10, building.y + building.h - 3, building.w + 20, 3);
    }
  }

  function drawSign(sign) {
    ctx.save();
    ctx.translate(sign.x, sign.y);
    const pulse = 0.8 + Math.sin(time * 2.1 + sign.flicker) * 0.18;
    ctx.globalAlpha = pulse;
    if (sign.vertical) {
      ctx.fillStyle = 'rgba(5, 10, 16, 0.8)';
      ctx.fillRect(-4, -2, 17, sign.text.length * 11 + 12);
      ctx.shadowColor = sign.color;
      ctx.shadowBlur = 13;
      ctx.fillStyle = sign.color;
      ctx.font = font(10 * sign.scale, 700, DISPLAY_FONT);
      ctx.textAlign = 'center';
      for (let index = 0; index < sign.text.length; index += 1) ctx.fillText(sign.text[index], 4.5, 8 + index * 11 * sign.scale);
    } else {
      ctx.shadowColor = sign.color;
      ctx.shadowBlur = 15;
      ctx.strokeStyle = sign.color;
      ctx.lineWidth = 1.4;
      ctx.font = font(12 * sign.scale, 700, DISPLAY_FONT);
      const width = ctx.measureText(sign.text).width + 12;
      ctx.strokeRect(-width / 2, -10, width, 17);
      ctx.fillStyle = sign.color;
      ctx.textAlign = 'center';
      ctx.fillText(sign.text, 0, 3);
    }
    ctx.restore();
  }

  function drawParks(city) {
    for (let index = 0; index < city.parks.length; index += 1) {
      const park = city.parks[index];
      ctx.fillStyle = '#18362c';
      ctx.fillRect(park.x, park.y, park.w, park.h);
      ctx.strokeStyle = 'rgba(103, 241, 192, 0.2)';
      ctx.lineWidth = 2;
      ctx.strokeRect(park.x + 3, park.y + 3, park.w - 6, park.h - 6);
      for (let tree = 0; tree < city.trees.length; tree += 1) {
        const item = city.trees[tree];
        if (item.x < park.x || item.x > park.x + park.w || item.y < park.y || item.y > park.y + park.h) continue;
        ctx.fillStyle = '#10251f';
        ctx.beginPath(); ctx.arc(item.x + 2, item.y + 3, item.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = index % 2 ? '#255541' : '#245a4b';
        ctx.beginPath(); ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(201,184,121,0.28)';
      ctx.fillRect(park.x + park.w * 0.34, park.y + 10, 4, park.h - 20);
      if (park.name) text(park.name, park.x + 10, park.y + 18, 10, 'rgba(199,233,220,0.55)', 'left', 600);
    }
  }

  function drawTrafficCar(car, isPlayer = false) {
    if (car.destroyed) {
      ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle);
      ctx.fillStyle = '#15191a'; ctx.fillRect(-car.length / 2, -car.width / 2, car.length, car.width);
      ctx.fillStyle = '#ffb24e'; ctx.fillRect(-8, -4, 20, 8);
      ctx.restore();
      return;
    }
    const spec = VEHICLE[car.type] || VEHICLE.kestrel;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(-car.length / 2 + 5, -car.width / 2 + 5, car.length, car.width);
    // Body.
    ctx.fillStyle = car.type === 'tern' ? '#e8e4d2' : car.playerOwned ? shade(spec.color, 14) : spec.color;
    ctx.fillRect(-car.length / 2, -car.width / 2, car.length, car.width);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(-car.length / 2 + 3, -car.width / 2 + 2, car.length - 6, 3);
    // Cab, windscreen, rear lights.
    ctx.fillStyle = car.type === 'bream' ? '#1b2d33' : '#0d1c25';
    ctx.fillRect(-car.length * 0.26, -car.width * 0.37, car.length * 0.38, car.width * 0.74);
    ctx.fillStyle = '#254a58';
    ctx.fillRect(-car.length * 0.18, -car.width * 0.31, car.length * 0.24, car.width * 0.62);
    if (car.type === 'tern') {
      ctx.fillStyle = '#143f76';
      ctx.fillRect(-car.length * 0.33, -car.width / 2, car.length * 0.22, car.width);
      ctx.fillStyle = '#ed4b54';
      ctx.fillRect(car.length * 0.18, -car.width / 2, car.length * 0.1, car.width);
      const flash = Math.sin(time * 8 + (car.sirenPhase || 0)) > 0;
      ctx.fillStyle = flash ? '#4b9be8' : '#ed4b54';
      ctx.fillRect(-2, -car.width / 2 - 2, 8, 5);
      ctx.fillStyle = flash ? '#ed4b54' : '#4b9be8';
      ctx.fillRect(-2, car.width / 2 - 3, 8, 5);
    }
    ctx.fillStyle = car.brakeFlash > 0 || (isPlayer && car.speed < 0) ? '#ff5b5b' : '#6d2628';
    ctx.fillRect(-car.length / 2 - 1, -car.width / 2 + 3, 3, 5);
    ctx.fillRect(-car.length / 2 - 1, car.width / 2 - 8, 3, 5);
    ctx.fillStyle = '#f3d58d';
    ctx.fillRect(car.length / 2 - 2, -car.width / 2 + 3, 3, 4);
    ctx.fillRect(car.length / 2 - 2, car.width / 2 - 7, 3, 4);
    ctx.restore();
    if (!isPlayer || car.speed !== 0) drawHeadlights(car, spec);
  }

  function drawHeadlights(car, spec) {
    const beamLength = spec.headlights * 0.92;
    const angle = car.angle;
    const left = angle - 0.18;
    const right = angle + 0.18;
    const x = car.x + Math.cos(angle) * car.length * 0.48;
    const y = car.y + Math.sin(angle) * car.length * 0.48;
    const gradient = ctx.createRadialGradient(x, y, 3, x, y, beamLength);
    gradient.addColorStop(0, 'rgba(255, 229, 164, 0.24)');
    gradient.addColorStop(1, 'rgba(255, 229, 164, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(left) * beamLength, y + Math.sin(left) * beamLength);
    ctx.lineTo(x + beamLength, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // A narrow visible filament keeps each cone anchored to a pair of real headlamps.
    ctx.strokeStyle = 'rgba(255, 239, 187, 0.66)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(left) * 5, y + Math.sin(left) * 5);
    ctx.lineTo(x + Math.cos(left) * beamLength * 0.48, y + Math.sin(left) * beamLength * 0.48);
    ctx.stroke();
  }

  function drawPed(ped) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.dead) {
      ctx.rotate(ped.angle);
      ctx.fillStyle = '#2a2528';
      ctx.fillRect(-11, -5, 22, 10);
      ctx.fillStyle = ped.colour;
      ctx.fillRect(-8, -4, 15, 8);
      ctx.restore();
      return;
    }
    ctx.rotate(ped.angle + Math.PI / 2);
    const bob = Math.sin(ped.stride) * 1.7;
    const step = Math.sin(ped.stride) * 2.4;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.ellipse(4, 5, 10, 15, 0, 0, Math.PI * 2); ctx.fill();
    // Legs and a rain-darkened coat give every pedestrian a readable human silhouette.
    ctx.fillStyle = '#19232b';
    ctx.fillRect(-5, 7 + step, 3.5, 8);
    ctx.fillRect(1.5, 7 - step, 3.5, 8);
    ctx.fillStyle = '#252f36';
    ctx.beginPath(); ctx.ellipse(0, 1, 8.4, 12.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.colour;
    ctx.beginPath(); ctx.ellipse(0, -1 + bob * 0.3, 7.2, 9.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(236,248,248,0.28)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-5, 1); ctx.lineTo(5, 1); ctx.stroke();
    ctx.fillStyle = '#d9b89a';
    ctx.beginPath(); ctx.arc(0, -9.2 + bob * 0.3, 3.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1b2429';
    ctx.beginPath(); ctx.arc(0, -10.2 + bob * 0.3, 3.9, Math.PI, Math.PI * 2); ctx.fill();
    if (ped.umbrella) {
      ctx.strokeStyle = 'rgba(220, 242, 242, 0.78)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, -10, 12, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 2); ctx.stroke();
      ctx.fillStyle = 'rgba(220,242,242,0.1)';
      ctx.beginPath(); ctx.arc(0, -10, 12, Math.PI, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer(player, state) {
    if (player.vehicle) return;
    ctx.save();
    ctx.translate(player.x, player.y);
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 12) % 2 === 0) ctx.globalAlpha = 0.4;
    ctx.rotate(player.angle + Math.PI / 2);
    // Long noir shadow and a cyan rim to keep Vale legible on black tar.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.ellipse(5, 6, 9, 15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#263842';
    ctx.beginPath(); ctx.ellipse(0, 0, 7.4, 13.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#14212a';
    ctx.fillRect(-6.5, 3, 13, 8);
    ctx.strokeStyle = 'rgba(57, 233, 237, 0.65)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, 8.2, 14, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#c79c7f';
    ctx.beginPath(); ctx.arc(0, -11, 4.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a2530';
    ctx.fillRect(-5.1, -14.5, 10.2, 3.4);
    // Aim arm and pistol silhouette.
    const aim = state.weapon === 'pistol';
    ctx.strokeStyle = '#c79c7f'; ctx.lineWidth = 2.7;
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, -17); ctx.stroke();
    if (aim) {
      ctx.fillStyle = '#1c252c';
      ctx.fillRect(-1.5, -20, 3, 7);
      ctx.fillStyle = '#ffcf4a';
      ctx.fillRect(-1, -20.5, 2, 2);
    }
    ctx.restore();
    if (state.weapon === 'pistol') {
      ctx.strokeStyle = 'rgba(255,207,74,0.24)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(player.x + Math.cos(player.angle) * 110, player.y + Math.sin(player.angle) * 110);
      ctx.stroke();
    }
  }

  function drawPolice(unit) {
    if (unit.destroyed) {
      if (unit.kind === 'police') drawTrafficCar(unit, false);
      return;
    }
    if (unit.kind === 'police') { drawTrafficCar(unit, false); return; }
    ctx.save();
    ctx.translate(unit.x, unit.y);
    ctx.rotate(unit.angle + Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(4, 5, 8, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1c3d62';
    ctx.fillRect(-5.5, -6, 11, 15);
    ctx.fillStyle = '#d4b08a';
    ctx.beginPath(); ctx.arc(0, -10, 3.6, 0, Math.PI * 2); ctx.fill();
    const flash = Math.sin(time * 9 + unit.sirenPhase) > 0;
    ctx.fillStyle = flash ? '#4b9be8' : '#ed4b54';
    ctx.fillRect(-4, -6, 8, 3);
    ctx.restore();
  }

  function drawActors(state) {
    for (let index = 0; index < state.missionActors.length; index += 1) {
      const actor = state.missionActors[index];
      if (actor.dead) {
        ctx.fillStyle = 'rgba(84,39,50,0.8)';
        ctx.beginPath(); ctx.ellipse(actor.x, actor.y, 12, 5, actor.angle, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      ctx.save();
      ctx.translate(actor.x, actor.y);
      ctx.rotate(actor.angle + Math.PI / 2);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(4, 5, 8, 13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = actor.colour;
      ctx.beginPath(); ctx.ellipse(0, 0, 6.6, 11.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d6b092';
      ctx.beginPath(); ctx.arc(0, -10, 3.8, 0, Math.PI * 2); ctx.fill();
      if (actor.kind === 'boss') {
        ctx.strokeStyle = '#ffcf4a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawBullets(state) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let index = 0; index < state.bullets.length; index += 1) {
      const bullet = state.bullets[index];
      ctx.strokeStyle = bullet.owner === 'player' ? 'rgba(255,207,74,0.95)' : 'rgba(255,82,107,0.94)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bullet.x, bullet.y);
      ctx.lineTo(bullet.x - bullet.vx * 0.016, bullet.y - bullet.vy * 0.016);
      ctx.stroke();
    }
    for (let index = 0; index < state.particles.length; index += 1) {
      const p = state.particles[index];
      ctx.globalAlpha = clamp(p.life * 2, 0, 1);
      ctx.fillStyle = p.colour;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.restore();
  }

  function drawMarker(state) {
    const marker = state.missionMarker;
    if (!marker) return;
    const pulse = (Math.sin(time * 3.4) + 1) * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = marker.color || PALETTE.marker;
    ctx.lineWidth = 3 + pulse * 2;
    ctx.beginPath(); ctx.arc(marker.x, marker.y, marker.r + pulse * 6, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = marker.color || PALETTE.marker;
    ctx.globalAlpha = 0.1 + pulse * 0.07;
    ctx.beginPath(); ctx.arc(marker.x, marker.y, marker.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff2bd';
    ctx.beginPath();
    ctx.moveTo(marker.x, marker.y - marker.r - 20 + pulse * 4);
    ctx.lineTo(marker.x - 8, marker.y - marker.r - 34 + pulse * 4);
    ctx.lineTo(marker.x + 8, marker.y - marker.r - 34 + pulse * 4);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawStreetlights(city, state) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let index = 0; index < city.lamps.length; index += 1) {
      const lamp = city.lamps[index];
      if (Math.abs(lamp.x - state.camera.x) > 820 || Math.abs(lamp.y - state.camera.y) > 540) continue;
      const gradient = ctx.createRadialGradient(lamp.x, lamp.y + 40, 4, lamp.x, lamp.y + 40, 84);
      gradient.addColorStop(0, 'rgba(255, 182, 91, 0.16)');
      gradient.addColorStop(1, 'rgba(255, 182, 91, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.arc(lamp.x, lamp.y + 40, 84, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd79a';
      ctx.fillRect(lamp.x - 1.5, lamp.y + 32, 3, 3);
    }
    ctx.restore();
  }

  function drawRain(state, strength = 1) {
    ctx.save();
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    ctx.strokeStyle = PALETTE.rain;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let index = 0; index < RAIN_COUNT; index += 1) {
      const drop = rain[index];
      const x = (drop.x + time * (drop.speed * 0.22) + drop.layer * 19) % 1320 - 20;
      const y = (drop.y + time * drop.speed) % 780 - 30;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2, y + drop.length);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(20, 44, 54, 0.055)';
    for (let index = 0; index < 18; index += 1) {
      const x = (index * 89.3 + time * 4) % 1400 - 60;
      const y = (index * 61.7 + time * 2) % 780 - 20;
      ctx.beginPath(); ctx.arc(x, y, 8 + (index % 3) * 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawWorld(state) {
    const city = state.city;
    worldTransform(state);
    drawWater(city);
    drawRoads(city);
    drawDock(city);
    drawParks(city);
    for (let index = 0; index < city.buildings.length; index += 1) drawBuilding(city.buildings[index], state);
    for (let index = 0; index < city.signs.length; index += 1) drawSign(city.signs[index]);
    drawStreetlights(city, state);
    drawActors(state);
    for (let index = 0; index < state.peds.length; index += 1) drawPed(state.peds[index]);
    for (let index = 0; index < state.traffic.length; index += 1) {
      const car = state.traffic[index];
      drawTrafficCar(car, car === state.player.vehicle);
    }
    for (let index = 0; index < state.police.length; index += 1) drawPolice(state.police[index]);
    drawPlayer(state.player, state);
    drawMarker(state);
    drawBullets(state);
    ctx.restore();
    drawRain(state);
    // Vignette and a wet cyan haze lift the whole frame off pure black.
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const vignette = ctx.createRadialGradient(640, 360, 180, 640, 360, 740);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.72, 'rgba(2,7,12,0.15)');
    vignette.addColorStop(1, 'rgba(0,3,8,0.72)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 38, 68, ${Math.min(0.28, state.flash)})`;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  function drawCompass(state) {
    const cx = FIELD.width - 112;
    const cy = 118;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(129, 215, 219, 0.36)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(5,10,18,0.5)';
    ctx.beginPath(); ctx.arc(0, 0, 42, 0, Math.PI * 2); ctx.fill();
    const marker = state.missionMarker;
    if (marker) {
      const angle = Math.atan2(marker.y - state.player.y, marker.x - state.player.x);
      ctx.rotate(angle);
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath(); ctx.moveTo(31, 0); ctx.lineTo(19, -7); ctx.lineTo(19, 7); ctx.closePath(); ctx.fill();
      ctx.rotate(-angle);
      text('JOB', 0, 3, 10, '#ffdf9b', 'center', 700);
    } else {
      ctx.fillStyle = PALETTE.muted;
      ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(-5, -18); ctx.lineTo(5, -18); ctx.closePath(); ctx.fill();
      text('N', 0, 15, 11, PALETTE.text, 'center', 700);
    }
    ctx.restore();
  }

  function drawMinimap(state) {
    const size = 214;
    const x = FIELD.width - size - 22;
    const y = 144;
    const radius = 640;
    panel(x - 8, y - 8, size + 16, size + 16, 'rgba(5,10,17,0.8)', 'rgba(100,225,232,0.34)');
    drawCornerTicks(ctx, x - 8, y - 8, size + 16, size + 16, 'rgba(100,225,232,0.52)');
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();
    ctx.fillStyle = '#0a151d';
    ctx.fillRect(x, y, size, size);
    const scale = size / radius;
    const px = state.player.vehicle ? state.player.vehicle.x : state.player.x;
    const py = state.player.vehicle ? state.player.vehicle.y : state.player.y;
    ctx.translate(x + size / 2, y + size / 2);
    ctx.scale(scale, scale);
    ctx.translate(-px, -py);
    ctx.strokeStyle = 'rgba(171, 205, 196, 0.22)';
    ctx.lineWidth = 5 / scale;
    for (let index = 0; index <= CITY.blocksX; index += 1) {
      ctx.beginPath(); ctx.moveTo(state.city.avenue(index), -1200); ctx.lineTo(state.city.avenue(index), CITY.worldHeight); ctx.stroke();
    }
    for (let index = 0; index <= CITY.blocksY; index += 1) {
      ctx.beginPath(); ctx.moveTo(-1200, state.city.cross(index)); ctx.lineTo(CITY.worldWidth + 200, state.city.cross(index)); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(7, 28, 40, 0.9)';
    ctx.fillRect(0, CITY.waterEdge, CITY.worldWidth, 500);
    const marker = state.missionMarker;
    if (marker) {
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath(); ctx.arc(marker.x, marker.y, 11 / scale, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff1b0'; ctx.lineWidth = 2 / scale; ctx.stroke();
    }
    for (let index = 0; index < state.police.length; index += 1) {
      const cop = state.police[index];
      if (cop.destroyed) continue;
      ctx.fillStyle = index % 2 ? PALETTE.police : PALETTE.policeRed;
      ctx.beginPath(); ctx.arc(cop.x, cop.y, 8 / scale, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#edf8fa';
    ctx.beginPath(); ctx.arc(px, py, 10 / scale, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(100,225,232,0.32)';
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    // North/compass seam.
    ctx.strokeStyle = 'rgba(100,225,232,0.24)';
    ctx.beginPath(); ctx.moveTo(x + size / 2, y); ctx.lineTo(x + size / 2, y + 10); ctx.stroke();
    text('PORT KESSEL', x + 10, y + size + 15, 9, 'rgba(180,224,226,0.65)', 'left', 700);
  }

  function drawHud(state, world) {
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    // Top-left: brand, district and 12-hour clock.
    panel(20, 20, 330, 92, 'rgba(5,10,18,0.78)', 'rgba(57,233,237,0.28)');
    text('NEON HARBOR', 38, 47, 20, '#dff9fa', 'left', 700, DISPLAY_FONT);
    text('PORT KESSEL', 236, 46, 10, PALETTE.neonCyan, 'left', 700);
    ctx.fillStyle = 'rgba(57,233,237,0.5)'; ctx.fillRect(38, 56, 294, 1);
    text(state.district.toUpperCase(), 38, 79, 16, '#b6d1d6', 'left', 600);
    text(world.getClock(), 38, 100, 13, '#ffcf4a', 'left', 500);
    text(`$${state.money.toLocaleString()}`, 333, 100, 13, '#ffcf4a', 'right', 600);
    // Wanted block.
    text('DIVISION WATCH', 22, 137, 10, PALETTE.muted, 'left', 700);
    drawWantedStars(ctx, 24, 158, state.wanted);
    if (state.wanted > 0) {
      const label = WANTED.stars[state.wanted].toUpperCase();
      text(state.policeSight ? 'SEEN · ' + label : 'COLD · ' + label, 152, 161, 10, state.policeSight ? '#ff9cac' : '#9fb9c0', 'left', 700);
    }
    drawCompass(state);
    drawMinimap(state);

    // Bottom-left health and armour.
    const hudY = FIELD.height - 142;
    panel(20, hudY, 335, 120, 'rgba(5,10,18,0.82)', 'rgba(57,233,237,0.27)');
    text('VALE', 38, hudY + 28, 15, '#eaf8f9', 'left', 700);
    text(state.weapon === 'pistol' ? 'ARMED · SILENT' : 'UNARMED', 38, hudY + 45, 9, PALETTE.muted, 'left', 600);
    drawMeter(ctx, 38, hudY + 55, 228, 10, state.player.health / 100, state.player.health > 32 ? PALETTE.health : PALETTE.danger);
    drawMeter(ctx, 38, hudY + 73, 228, 7, state.player.armour / 75, PALETTE.armour);
    text(`${Math.ceil(state.player.health)}`, 316, hudY + 64, 14, '#dff9fa', 'right', 700);
    text(`${Math.ceil(state.player.armour)}`, 316, hudY + 80, 11, '#a8d9e6', 'right', 600);
    text('HEALTH', 264, hudY + 96, 8, PALETTE.muted, 'left', 700);
    text('ARMOUR', 189, hudY + 96, 8, PALETTE.muted, 'left', 700);
    // Weapon card.
    panel(370, hudY, 188, 120, 'rgba(5,10,18,0.82)', 'rgba(57,233,237,0.27)');
    const weapon = WEAPONS[state.weapon] || WEAPONS.fists;
    text('WEAPON', 388, hudY + 27, 9, PALETTE.muted, 'left', 700);
    text(weapon.name, 388, hudY + 48, 19, state.weapon === 'pistol' ? '#ffcf4a' : '#dff9fa', 'left', 700, DISPLAY_FONT);
    text(state.weapon === 'pistol' ? `${state.pistolRounds} ROUNDS` : 'MELEE', 388, hudY + 70, 11, '#a8c2c8', 'left', 600);
    text(state.weapon === 'pistol' ? 'R RELOAD' : '1 FISTS · 2 PISTOL', 388, hudY + 94, 9, PALETTE.muted, 'left', 600);
    // Speedometer while driving.
    if (state.player.vehicle) {
      const car = state.player.vehicle;
      const speed = Math.round(Math.abs(car.speed) * 0.72);
      panel(20, hudY - 68, 335, 58, 'rgba(5,10,18,0.8)', 'rgba(57,233,237,0.26)');
      text('SPEED', 38, hudY - 50, 8, PALETTE.muted, 'left', 700);
      text(`${speed}`, 38, hudY - 22, 30, '#ffcf4a', 'left', 700, DISPLAY_FONT);
      text('KM/H', 119, hudY - 23, 10, PALETTE.muted, 'left', 700);
      text(String(VEHICLE[car.type]?.name || 'Kestrel coupe').toUpperCase(), 190, hudY - 51, 7, '#9fb9c0', 'left', 700);
      const carHealth = clamp(car.health / (VEHICLE[car.type]?.health || 1), 0, 1);
      ctx.fillStyle = 'rgba(127,160,168,0.22)'; ctx.fillRect(214, hudY - 36, 121, 5);
      ctx.fillStyle = carHealth > 0.35 ? PALETTE.neonCyan : PALETTE.danger;
      ctx.fillRect(214, hudY - 36, 121 * carHealth, 5);
    }
    // Objective strip, right above the bottom edge, leaving most of the action clear.
    const objective = state.objective || (state.credits ? 'The story is over. The city is not.' : 'Explore Port Kessel');
    panel(576, FIELD.height - 84, 660, 58, 'rgba(5,10,18,0.8)', 'rgba(255,207,74,0.27)');
    text('OBJECTIVE', 596, FIELD.height - 62, 9, PALETTE.marker, 'left', 700);
    text(objective.length > 82 ? objective.slice(0, 79) + '...' : objective, 596, FIELD.height - 40, 15, '#eaf8f9', 'left', 600);
    if (state.mission !== null && state.mission < 5) {
      text(`${state.mission + 1}/5`, 1214, FIELD.height - 62, 11, PALETTE.marker, 'right', 700);
    }
    if (state.nearVehicle && !state.player.vehicle) {
      text('F  TAKE '+ (VEHICLE[state.nearVehicle.type]?.name || 'CAR').toUpperCase(), 640, FIELD.height - 108, 12, '#ffcf4a', 'center', 700);
    }
    // Dialogue sits directly above the objective strip, clear of the driver's horizon.
    if (state.hudDialogue) {
      const dialog = state.hudDialogue;
      const w = 540;
      const h = 78;
      const x = 664;
      const y = FIELD.height - 92 - h;
      panel(x, y, w, h, 'rgba(6,11,18,0.9)', 'rgba(255,207,74,0.4)');
      text(dialog.speaker, x + 18, y + 22, 10, PALETTE.marker, 'left', 700);
      const words = dialog.text.split(' ');
      let line = '';
      let lineIndex = 0;
      for (let index = 0; index < words.length; index += 1) {
        const test = line ? line + ' ' + words[index] : words[index];
        if (test.length > 60 && lineIndex < 2) {
          text(line, x + 18, y + 42 + lineIndex * 16, 12, '#d3e6e7', 'left', 500);
          line = words[index]; lineIndex += 1;
        } else line = test;
      }
      if (lineIndex < 3) text(line, x + 18, y + 42 + lineIndex * 16, 12, '#d3e6e7', 'left', 500);
    }
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 44, 68, ${Math.min(0.18, state.flash)})`;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    if (state.message) {
      ctx.fillStyle = 'rgba(4,9,15,0.74)';
      ctx.fillRect(442, 26, 396, 28);
      text(state.message, 640, 45, 12, '#dbeeee', 'center', 500);
    }
    if (state.dead) {
      ctx.fillStyle = 'rgba(8,3,7,0.52)';
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      text('FLATLINED', 640, 330, 54, '#ff526b', 'center', 700, DISPLAY_FONT);
      text('St. Orra Hospital is expecting you.', 640, 362, 15, '#d8e8ea', 'center', 500);
      text(`Care fee: $${Math.min(state.money, 220)}`, 640, 390, 12, PALETTE.muted, 'center', 600);
    }
    drawCrosshair(state);
  }

  function drawCrosshair(state) {
    if (state.player.vehicle || state.dead) {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(state.crosshair.x, state.crosshair.y, 3, 0, Math.PI * 2); ctx.stroke();
      return;
    }
    const x = state.crosshair.x;
    const y = state.crosshair.y;
    ctx.strokeStyle = state.weapon === 'pistol' ? 'rgba(255,207,74,0.8)' : 'rgba(221,244,245,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.moveTo(x - 13, y); ctx.lineTo(x - 9, y);
    ctx.moveTo(x + 9, y); ctx.lineTo(x + 13, y);
    ctx.moveTo(x, y - 13); ctx.lineTo(x, y - 9);
    ctx.moveTo(x, y + 9); ctx.lineTo(x, y + 13);
    ctx.stroke();
  }

  function drawTitle(state, world, hasSave) {
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const left = ctx.createLinearGradient(0, 0, 680, 0);
    left.addColorStop(0, 'rgba(3,7,13,0.94)');
    left.addColorStop(0.68, 'rgba(3,8,14,0.76)');
    left.addColorStop(1, 'rgba(3,8,14,0)');
    ctx.fillStyle = left; ctx.fillRect(0, 0, 760, 720);
    const right = ctx.createLinearGradient(940, 0, 1280, 0);
    right.addColorStop(0, 'rgba(3,8,14,0)');
    right.addColorStop(1, 'rgba(3,8,14,0.56)');
    ctx.fillStyle = right; ctx.fillRect(940, 0, 340, 720);
    // Neon signage panel.
    ctx.save();
    ctx.translate(76, 76);
    ctx.shadowColor = PALETTE.neonPink; ctx.shadowBlur = 22;
    ctx.strokeStyle = PALETTE.neonPink; ctx.lineWidth = 1.5;
    ctx.strokeRect(0, 0, 474, 274);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(6,14,22,0.7)'; ctx.fillRect(2, 2, 470, 270);
    text('PORT KESSEL', 26, 38, 13, PALETTE.neonCyan, 'left', 700, DISPLAY_FONT);
    ctx.shadowColor = PALETTE.neonCyan; ctx.shadowBlur = 28;
    text('NEON', 22, 129, 82, '#e9ffff', 'left', 700, DISPLAY_FONT);
    ctx.shadowColor = PALETTE.neonPink;
    text('HARBOR', 22, 203, 82, '#ff8bbd', 'left', 700, DISPLAY_FONT);
    ctx.shadowBlur = 0;
    text('AN OPEN-WORLD CRIME STORY', 27, 242, 12, '#a8c5ca', 'left', 600);
    ctx.fillStyle = PALETTE.marker; ctx.fillRect(25, 252, 92, 2);
    ctx.restore();
    // Menu.
    const items = [
      ['NEW GAME', 'N'],
      ['CONTINUE', hasSave ? 'C' : '—'],
      ['SOUND ' + (state.audioMuted ? 'OFF' : 'ON'), 'Q'],
    ];
    for (let index = 0; index < items.length; index += 1) {
      const y = 420 + index * 44;
      const selected = index === state.titleIndex;
      ctx.fillStyle = selected ? 'rgba(255,207,74,0.16)' : 'rgba(5,10,18,0.66)';
      ctx.fillRect(76, y - 24, 344, 32);
      if (selected) { ctx.fillStyle = PALETTE.marker; ctx.fillRect(76, y - 24, 3, 32); }
      text(items[index][0], 94, y - 2, 17, selected ? '#fff1ba' : '#b9cfd3', 'left', 700);
      text(items[index][1], 394, y - 2, 11, selected ? PALETTE.marker : PALETTE.muted, 'right', 700);
    }
    text('ENTER / CLICK  SELECT      ESC  PAUSE', 76, 580, 10, PALETTE.muted, 'left', 600);
    text('WASD MOVE · MOUSE AIM / FIRE · SHIFT SPRINT', 76, 600, 10, PALETTE.muted, 'left', 600);
    text('F ENTER / EXIT CAR · R RELOAD · M SAVE', 76, 620, 10, PALETTE.muted, 'left', 600);
    text('Vale watches the rain. Marrow watches Vale.', 76, 642, 11, 'rgba(199,226,226,0.68)', 'left', 500);
    // Lower-right live framing note, not a control hint.
    text('LIVE FROM LANTERN WARD', 1204, 680, 9, 'rgba(185,224,224,0.54)', 'right', 700);
  }

  function drawPause(state) {
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    ctx.fillStyle = 'rgba(2,6,12,0.68)'; ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    panel(418, 186, 444, 350, 'rgba(6,11,18,0.94)', 'rgba(57,233,237,0.52)');
    text('PAUSED', 640, 242, 38, '#e9ffff', 'center', 700, DISPLAY_FONT);
    text('PORT KESSEL KEEPS RAINING', 640, 267, 10, PALETTE.neonCyan, 'center', 700);
    ctx.fillStyle = 'rgba(57,233,237,0.3)'; ctx.fillRect(460, 283, 360, 1);
    const rows = [
      ['M', 'SAVE GAME'],
      ['Q', 'SOUND ' + (state.audioMuted ? 'OFF' : 'ON')],
      ['ESC', 'RESUME'],
      ['N', 'NEW GAME'],
    ];
    for (let index = 0; index < rows.length; index += 1) {
      const y = 326 + index * 38;
      text(rows[index][0], 486, y, 13, PALETTE.marker, 'left', 700);
      text(rows[index][1], 548, y, 15, index === 0 ? '#e9ffff' : '#bfd3d6', 'left', 500);
    }
    text(state.saveNotice || 'The city holds its breath.', 640, 510, 11, PALETTE.muted, 'center', 500);
    text('WASD · MOUSE · F · R · SHIFT', 640, 552, 9, 'rgba(174,207,210,0.6)', 'center', 600);
  }

  function drawCredits(state) {
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    ctx.fillStyle = 'rgba(2,6,12,0.76)'; ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const scroll = state.creditsTimer * 23;
    const lines = [
      ['NEON HARBOR', 44, '#e9ffff'],
      ['PORT KESSEL', 14, PALETTE.neonCyan],
      ['', 14, '#fff'],
      ['A story of one wet night', 15, '#c6dfe2'],
      ['', 14, '#fff'],
      ['VALE', 17, PALETTE.marker],
      ['MARROW', 17, '#ff8bbd'],
      ['SERGEANT OKONKWO', 17, PALETTE.police],
      ['', 14, '#fff'],
      ['KESTREL COUPE · BREAM VAN · TERN CRUISER', 12, '#bfd3d6'],
      ['', 14, '#fff'],
      ['THE HARBOUR REMAINS OPEN', 13, '#8fb7bb'],
      ['', 14, '#fff'],
      ['EVERY STREET, SIGN AND RAINDROP IS ORIGINAL', 11, '#8fa8b2'],
      ['', 14, '#fff'],
      ['THANK YOU FOR PLAYING', 18, '#ffcf4a'],
    ];
    let y = 660 - scroll;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line[1] > 10) text(line[0], 640, y, line[1], line[2], 'center', line[1] > 30 ? 700 : 500, line[1] > 30 ? DISPLAY_FONT : FONT);
      y += line[1] + 16;
    }
    if (state.creditsTimer > 20) {
      ctx.fillStyle = 'rgba(2,6,12,0.4)'; ctx.fillRect(0, 590, FIELD.width, 130);
      text('ESC  RETURN TO THE HARBOUR', 640, 664, 11, PALETTE.muted, 'center', 700);
    }
  }

  function draw(state, world, screen) {
    time += 1 / 60;
    const ratio = canvas.width / FIELD.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#03070d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(ratio, ratio);
    drawWorld(state);
    ctx.restore();
    if (screen !== SCREEN.title) drawHud(state, world);
    if (screen === SCREEN.title) drawTitle(state, world, world.hasSave());
    else if (screen === SCREEN.paused) drawPause(state);
    else if (screen === SCREEN.credits) drawCredits(state);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, resize, view };
}
