// Lightweight physics — no external lib dependency.
// Simulates a pendulum cable (spreader swings) and container resting.

export class PhysicsWorld {
  constructor() {
    // Pendulum state for the hanging load
    this.pendulum = {
      angleX: 0,   // swing fore-aft (radians)
      angleZ: 0,   // swing side-side
      velX: 0,
      velZ: 0,
    };

    // Damping & gravity constants
    this.gravity = 9.81;
    this.damping = 0.96;       // per-frame velocity multiplier
    this.stiffness = 2.5;      // pendulum restoring force scale

    this.cableLength = 5;      // updated from crane hoist height
    this.isLoaded = false;     // whether spreader carries a container

    // Impulse from crane acceleration
    this._lastTrolleyX = 0;
    this._lastTrolleyZ = 0;
  }

  update(dt, trolleyWorldX, trolleyWorldZ, hoistHeight) {
    this.cableLength = Math.max(1, hoistHeight);

    if (!this.isLoaded) {
      // Dampen quickly when empty
      this.pendulum.velX *= 0.88;
      this.pendulum.velZ *= 0.88;
      this.pendulum.angleX *= 0.88;
      this.pendulum.angleZ *= 0.88;
      this._lastTrolleyX = trolleyWorldX;
      this._lastTrolleyZ = trolleyWorldZ;
      return;
    }

    // Acceleration impulse from trolley movement
    const accelX = (trolleyWorldX - this._lastTrolleyX) / Math.max(dt, 0.001);
    const accelZ = (trolleyWorldZ - this._lastTrolleyZ) / Math.max(dt, 0.001);
    this._lastTrolleyX = trolleyWorldX;
    this._lastTrolleyZ = trolleyWorldZ;

    // Pendulum ODE: θ'' = -(g/L)sinθ + external acceleration / L
    const gOverL = this.gravity / this.cableLength;

    this.pendulum.velX += dt * (
      -gOverL * this.pendulum.angleX * this.stiffness
      - accelX * 0.04
    );
    this.pendulum.velZ += dt * (
      -gOverL * this.pendulum.angleZ * this.stiffness
      - accelZ * 0.04
    );

    this.pendulum.velX *= this.damping;
    this.pendulum.velZ *= this.damping;

    this.pendulum.angleX += this.pendulum.velX * dt;
    this.pendulum.angleZ += this.pendulum.velZ * dt;

    // Clamp to ±35 degrees
    const MAX = 0.61;
    this.pendulum.angleX = Math.max(-MAX, Math.min(MAX, this.pendulum.angleX));
    this.pendulum.angleZ = Math.max(-MAX, Math.min(MAX, this.pendulum.angleZ));
  }

  // World-space offset of the container from directly below the trolley
  getLoadOffset() {
    return {
      x: Math.sin(this.pendulum.angleX) * this.cableLength,
      z: Math.sin(this.pendulum.angleZ) * this.cableLength,
    };
  }

  // 0 = wildly swinging, 1 = perfectly steady
  getSwingScore() {
    const totalAngle = Math.abs(this.pendulum.angleX) + Math.abs(this.pendulum.angleZ);
    return Math.max(0, 1 - totalAngle / 0.4);
  }

  applyImpulse(vx, vz) {
    this.pendulum.velX += vx;
    this.pendulum.velZ += vz;
  }

  reset() {
    this.pendulum.angleX = 0;
    this.pendulum.angleZ = 0;
    this.pendulum.velX = 0;
    this.pendulum.velZ = 0;
  }
}
