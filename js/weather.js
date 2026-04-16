import * as THREE from 'three';

// ── Weather system ─────────────────────────────────────────────────────────────
// Four states: sunny → cloudy → rainy → windy, cycle randomly.
// Provides: rain particles, sky-colour transitions, wind force for physics.

const STATES = ['sunny', 'cloudy', 'rainy', 'windy'];

const SKY_COLORS = {
  sunny:  new THREE.Color(0x87ceeb),
  cloudy: new THREE.Color(0x8a9aaa),
  rainy:  new THREE.Color(0x4d6070),
  windy:  new THREE.Color(0x9aaabb),
};

const WIND_BASE = {
  sunny:  { x: 0,   z: 0   },
  cloudy: { x: 1.5, z: 0.4 },
  rainy:  { x: 3.5, z: 1.2 },
  windy:  { x: 6.5, z: 2.0 },
};

export class WeatherSystem {
  constructor(scene, sounds) {
    this.scene  = scene;
    this.sounds = sounds;

    this._state      = 'sunny';
    this._stateTimer = 50 + Math.random() * 60;
    this._skyNow     = new THREE.Color(SKY_COLORS.sunny);
    this._skyTarget  = new THREE.Color(SKY_COLORS.sunny);
    this._wind       = { x: 0, z: 0 };
    this._windTarget = { x: 0, z: 0 };

    this._buildRain();
    this._uiEl = document.getElementById('weather-state');
    this._applyState('sunny');
  }

  get wind()  { return this._wind; }
  get state() { return this._state; }

  // ── Rain particle system ──────────────────────────────────────────────────
  _buildRain() {
    const N = 1600;
    const pos = new Float32Array(N * 6); // 2 vertices per line-segment drop
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 300;
      const y = Math.random() * 75;
      const z = (Math.random() - 0.5) * 200;
      pos[i*6]   = x;   pos[i*6+1] = y;        pos[i*6+2] = z;
      pos[i*6+3] = x;   pos[i*6+4] = y - 1.3;  pos[i*6+5] = z;
    }
    this._rainPos = pos;
    this._rainGeo = new THREE.BufferGeometry();
    this._rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xaaccee, transparent: true, opacity: 0.55,
    });
    this._rainMesh = new THREE.LineSegments(this._rainGeo, mat);
    this._rainMesh.visible = false;
    this.scene.add(this._rainMesh);
  }

  // ── Apply a new weather state ─────────────────────────────────────────────
  _applyState(newState) {
    this._state = newState;
    this._skyTarget.copy(SKY_COLORS[newState]);

    // Add randomness to wind
    const base = WIND_BASE[newState];
    this._windTarget = {
      x: base.x + (Math.random() - 0.5) * 2,
      z: base.z + (Math.random() - 0.5) * 1,
    };

    this._rainMesh.visible = (newState === 'rainy');

    // Update UI
    if (this._uiEl) {
      const labels = { sunny: '☀ SUNNY', cloudy: '☁ OVERCAST', rainy: '⛆ RAIN', windy: '⇶ WINDY' };
      this._uiEl.textContent = labels[newState] ?? newState.toUpperCase();
      this._uiEl.style.color = newState === 'rainy' ? '#88aacc'
                              : newState === 'windy' ? '#aaccaa'
                              : '#00ff88';
    }

    // Update sounds
    if (this.sounds?.setWeather) this.sounds.setWeather(newState);
  }

  // ── Per-frame update ──────────────────────────────────────────────────────
  update(dt) {
    // State transitions
    this._stateTimer -= dt;
    if (this._stateTimer <= 0) {
      const opts = STATES.filter(s => s !== this._state);
      this._applyState(opts[Math.floor(Math.random() * opts.length)]);
      this._stateTimer = 40 + Math.random() * 70;
    }

    // Lerp sky colour (smooth 5-second transition)
    const lf = Math.min(dt * 0.2, 1);
    this._skyNow.lerp(this._skyTarget, lf);
    this.scene.background.copy(this._skyNow);
    this.scene.fog.color.copy(this._skyNow);

    // Lerp wind force
    const wf = Math.min(dt * 0.4, 1);
    this._wind.x += (this._windTarget.x - this._wind.x) * wf;
    this._wind.z += (this._windTarget.z - this._wind.z) * wf;

    // Animate rain
    if (this._rainMesh.visible) {
      const pos   = this._rainPos;
      const N     = pos.length / 6;
      const fall  = 32 * dt;
      const drift = this._wind.x * dt * 0.4;
      for (let i = 0; i < N; i++) {
        pos[i*6+1] -= fall;  pos[i*6+4] -= fall;
        pos[i*6]   += drift; pos[i*6+3] += drift;
        if (pos[i*6+4] < -1) {
          const x = (Math.random() - 0.5) * 300;
          const y = 75 + Math.random() * 20;
          const z = (Math.random() - 0.5) * 200;
          pos[i*6] = x;  pos[i*6+1] = y;        pos[i*6+2] = z;
          pos[i*6+3] = x; pos[i*6+4] = y - 1.3; pos[i*6+5] = z;
        }
      }
      this._rainGeo.attributes.position.needsUpdate = true;
    }
  }
}
