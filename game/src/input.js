// Keyboard and pointer state, translated into the 1280x720 logical frame. Held movement is read
// every render frame; clicks and discrete key presses are queued so a simulation step can consume
// each one exactly once even if several frames elapse between visits.

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

// Keys the game owns; prevent their browser defaults while play is focused.
const PREVENT = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyR', 'KeyM', 'KeyQ', 'KeyE', 'Escape',
]);

export function createInput(canvas) {
  const heldKeys = new Set();
  let pressed = 0;
  let mouseDown = false;
  let pointer = { x: 640, y: 360 };
  const clickQueue = [];

  // Canvas coordinates include letterboxing and device scaling; the game wants field coordinates.
  function toLogicalFrame(clientX, clientY) {
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
    if (!heldKeys.has(event.code)) {
      if (event.code === 'Escape') pressed |= PRESS.pause;
      else if (event.code === 'KeyF' || event.code === 'KeyE') pressed |= PRESS.interact;
      else if (event.code === 'Digit1') pressed |= PRESS.fists;
      else if (event.code === 'Digit2') pressed |= PRESS.pistol;
      else if (event.code === 'KeyR') pressed |= PRESS.reload;
      else if (event.code === 'KeyM') pressed |= PRESS.save;
      else if (event.code === 'KeyQ') pressed |= PRESS.sound;
      else if (event.code === 'Enter' || event.code === 'Space') pressed |= PRESS.confirm;
      else if (event.code === 'KeyN') pressed |= PRESS.newGame;
      else if (event.code === 'KeyC') pressed |= PRESS.continueGame;
    }
    heldKeys.add(event.code);
  });
  window.addEventListener('keyup', (event) => heldKeys.delete(event.code));
  window.addEventListener('blur', () => { heldKeys.clear(); mouseDown = false; });

  canvas.addEventListener('pointermove', (event) => { pointer = toLogicalFrame(event.clientX, event.clientY); });
  canvas.addEventListener('pointerdown', (event) => {
    pointer = toLogicalFrame(event.clientX, event.clientY);
    clickQueue.push({ x: pointer.x, y: pointer.y });
    if (event.button === 0) mouseDown = true;
  });
  window.addEventListener('pointerup', () => { mouseDown = false; });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function movementAxis() {
    const x = (heldKeys.has('KeyD') || heldKeys.has('ArrowRight') ? 1 : 0)
      - (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft') ? 1 : 0);
    const y = (heldKeys.has('KeyS') || heldKeys.has('ArrowDown') ? 1 : 0)
      - (heldKeys.has('KeyW') || heldKeys.has('ArrowUp') ? 1 : 0);
    const length = Math.hypot(x, y);
    return length > 1 ? { x: x / length, y: y / length } : { x, y };
  }

  return {
    isDown(code) { return heldKeys.has(code); },
    get mouse() { return pointer; },
    get firing() { return mouseDown; },
    takePressed() { const result = pressed; pressed = 0; return result; },
    takeClicks() { const result = clickQueue.slice(); clickQueue.length = 0; return result; },
    axis: movementAxis,
    snapshot() {
      return {
        axis: movementAxis(),
        sprint: heldKeys.has('ShiftLeft') || heldKeys.has('ShiftRight'),
        mouse: pointer,
        firing: mouseDown,
        up: heldKeys.has('KeyW') || heldKeys.has('ArrowUp'),
        brake: heldKeys.has('KeyS') || heldKeys.has('ArrowDown'),
        left: heldKeys.has('KeyA') || heldKeys.has('ArrowLeft'),
        right: heldKeys.has('KeyD') || heldKeys.has('ArrowRight'),
      };
    },
  };
}
