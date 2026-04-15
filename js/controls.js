// Keyboard + mouse input handler

export class Controls {
  constructor(canvas) {
    this.keys = {};
    this.mouse = { dx: 0, dy: 0, down: false };
    this._rawDx = 0;
    this._rawDy = 0;

    // Accumulated camera angles
    this.yaw   = 0;    // horizontal look (radians)
    this.pitch = 0;    // vertical look

    const onKey = (e, down) => {
      this.keys[e.code] = down;
      // Prevent default for game keys to stop page scroll
      if (['Space','KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE'].includes(e.code)) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', e => onKey(e, true));
    window.addEventListener('keyup',   e => onKey(e, false));

    // Mouse drag for camera look
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) this.mouse.down = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.down = false;
    });
    window.addEventListener('mousemove', e => {
      if (this.mouse.down) {
        this._rawDx += e.movementX;
        this._rawDy += e.movementY;
      }
    });

    // Pointer lock for smoother look
    canvas.addEventListener('click', () => {
      canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this._pointerLocked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', e => {
      if (this._pointerLocked) {
        this._rawDx += e.movementX;
        this._rawDy += e.movementY;
      }
    });
  }

  // Call once per frame — returns consumed deltas
  consumeMouseDelta() {
    const SENSITIVITY = 0.003;
    const dx = this._rawDx * SENSITIVITY;
    const dy = this._rawDy * SENSITIVITY;
    this._rawDx = 0;
    this._rawDy = 0;

    this.yaw   -= dx;
    this.pitch -= dy;

    // Clamp pitch: look mostly down (crane cabin) with some freedom
    this.pitch = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.15, this.pitch));

    return { dx, dy };
  }

  isDown(code)  { return !!this.keys[code]; }
  justPressed(code) {
    const v = !!this.keys[code];
    // One-shot — caller must track edge themselves if needed
    return v;
  }
}
