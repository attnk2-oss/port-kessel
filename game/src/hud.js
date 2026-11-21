// Small HUD drawing primitives shared by the minimap, wanted display and health panel. They keep
// stroke weights crisp at the fixed 1280x720 frame and never mutate game state.

import { PALETTE } from './config.js';

export function drawWantedStars(ctx, x, y, count) {
  for (let index = 0; index < 5; index += 1) {
    const active = index < count;
    const starX = x + index * 24;
    ctx.save();
    ctx.translate(starX, y);
    ctx.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const angle = -Math.PI / 2 + point * Math.PI / 5;
      const radius = point % 2 ? 4.5 : 9;
      if (point === 0) ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      else ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath();
    ctx.fillStyle = active ? (count >= 4 ? PALETTE.danger : PALETTE.marker) : 'rgba(169,188,194,0.22)';
    ctx.fill();
    if (active) {
      ctx.shadowColor = count >= 4 ? PALETTE.danger : PALETTE.marker;
      ctx.shadowBlur = 8;
      ctx.fill();
    }
    ctx.restore();
  }
}

export function drawMeter(ctx, x, y, width, height, fraction, colour) {
  ctx.fillStyle = 'rgba(127,160,168,0.24)';
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, width * Math.max(0, Math.min(1, fraction)), height);
}

export function drawCornerTicks(ctx, x, y, width, height, colour) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 13); ctx.lineTo(x, y); ctx.lineTo(x + 13, y);
  ctx.moveTo(x + width - 13, y); ctx.lineTo(x + width, y); ctx.lineTo(x + width, y + 13);
  ctx.moveTo(x, y + height - 13); ctx.lineTo(x, y + height); ctx.lineTo(x + 13, y + height);
  ctx.moveTo(x + width - 13, y + height); ctx.lineTo(x + width, y + height); ctx.lineTo(x + width, y + height - 13);
  ctx.stroke();
}
