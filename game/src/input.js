// Keyboard and pointer state, translated into the 1280x720 logical frame. Held movement is read
// every render frame; clicks and discrete key presses are queued so a 60 Hz step can consume each
// one exactly once even if several frames elapse between visits.

export const PRESS = Object.freeze({
  pause: 1 << 0,
  interact: 1 << 1,
  fists: 1 << 2,
  pistol: 1 << 3,
  reload: 1 << 4,
  save: 1 << 5,
  sound: 1 << 6,
  confirm: 1 << 7,
  newGame: 1 << 8,
  continueGame: 1 << 9,
});

const PREVENT = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyR', 'KeyM', 'KeyQ', 'KeyE', 'Escape',
]);

export function createInput(canvas) {
  const down = new Set();
  let pressed = 0;
  let mouseDown = false;
  let pointer = { x: 640, y: 360 };
  const clicks = [];

  function toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const width = window.innerWidth || rect.width;
    const height = window.innerHeight || rect.height;
    const scale = Math.min(width / 1280, height / 720);
    const offsetX = (width - 1280 * scale) / 2;
    const offsetY = (height - 720 * scale) / 2;
    return {
      x: Math.max(0, Math.min(1280, (clientX - rect.left - offsetX) / scale)),
      y: Math.max(0, Math.min(720, (clientY - rect.top - offsetY) / scale)),
    };
  }

  window.addEventListener('keydown', (event) => {
    if (PREVENT.has(event.code)) event.preventDefault();
    if (!down.has(event.code)) {
      if (event.code === 'Escape') pressed |= PRESS.pause;
      else if (event.code === 'KeyF' || event.code === 'KeyE') pressed |= PRESS.interact;
      else if (event.code === 'Digit1') { pressed |= PRESS.fists; }
      else if (event.code === 'Digit2') { pressed |= PRESS.pistol; }
      else if (event.code === 'KeyR') pressed |= PRESS.reload;
      else if (event.code === 'KeyM') pressed |= PRESS.save;
      else if (event.code === 'KeyQ') pressed |= PRESS.sound;
      else if (event.code === 'Enter' || event.code === 'Space') pressed |= PRESS.confirm;
      else if (event.code === 'KeyN') pressed |= PRESS.newGame;
      else if (event.code === 'KeyC') pressed |= PRESS.continueGame;
    }
    down.add(event.code);
  });
  window.addEventListener('keyup', (event) => down.delete(event.code));
  window.addEventListener('blur', () => { down.clear(); mouseDown = false; });

  canvas.addEventListener('pointermove', (event) => { pointer = toField(event.clientX, event.clientY); });
  canvas.addEventListener('pointerdown', (event) => {
    pointer = toField(event.clientX, event.clientY);
    clicks.push({ x: pointer.x, y: pointer.y });
    if (event.button === 0) mouseDown = true;
  });
  window.addEventListener('pointerup', () => { mouseDown = false; });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    isDown(code) { return down.has(code); },
    get mouse() { return pointer; },
    get firing() { return mouseDown; },
    takePressed() { const result = pressed; pressed = 0; return result; },
    takeClicks() { const result = clicks.slice(); clicks.length = 0; return result; },
    axis() {
      const x = (down.has('KeyD') || down.has('ArrowRight') ? 1 : 0) - (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0);
      const y = (down.has('KeyS') || down.has('ArrowDown') ? 1 : 0) - (down.has('KeyW') || down.has('ArrowUp') ? 1 : 0);
      const length = Math.hypot(x, y);
      return length > 1 ? { x: x / length, y: y / length } : { x, y };
    },
    snapshot() {
      return {
        axis: this.axis(),
        sprint: down.has('ShiftLeft') || down.has('ShiftRight'),
        mouse: pointer,
        firing: mouseDown,
        up: down.has('KeyW') || down.has('ArrowUp'),
        brake: down.has('KeyS') || down.has('ArrowDown'),
        left: down.has('KeyA') || down.has('ArrowLeft'),
        right: down.has('KeyD') || down.has('ArrowRight'),
      };
    },
  };
}
