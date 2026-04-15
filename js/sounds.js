// Procedural sounds via Web Audio API — no external files needed

export class SoundSystem {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this._travel  = null;
    this._trolley = null;
    this._hoist   = null;
  }

  // Call after a user gesture (start button)
  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._buildMotors();
      this._buildAmbient();
      this.enabled = true;
    } catch (e) {
      console.warn('Web Audio not available', e);
    }
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  // ── Motor channels ────────────────────────────────────────────────────────
  _makeMotor(freq, filterFreq, distortion = false) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;

    osc.connect(gain);
    gain.connect(filter);
    filter.connect(this.ctx.destination);
    osc.start();
    return { osc, gain };
  }

  _buildMotors() {
    this._travel  = this._makeMotor(72,  200);
    this._trolley = this._makeMotor(105, 280);
    this._hoist   = this._makeMotor(145, 380);
  }

  _buildAmbient() {
    // Low-level port atmosphere — distant machinery rumble
    const bufLen = this.ctx.sampleRate * 3;
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 120;

    const g = this.ctx.createGain();
    g.gain.value = 0.018;

    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start();
  }

  // ── Per-frame motor control ───────────────────────────────────────────────
  setMotors(traveling, trolleying, hoisting) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    this._travel.gain.gain.setTargetAtTime( traveling  ? 0.13 : 0, t, 0.07);
    this._trolley.gain.gain.setTargetAtTime(trolleying ? 0.09 : 0, t, 0.07);
    this._hoist.gain.gain.setTargetAtTime(  hoisting   ? 0.11 : 0, t, 0.07);
  }

  // ── One-shot sound events ─────────────────────────────────────────────────
  playPickup() {
    if (!this.enabled) return;
    // Metallic clunk — mid-frequency noise burst
    this._noiseBurst(0.25, 700, 0.6, 0.35);
    // High click
    this._tone(1800, 'sine', 0.06, 0.04);
  }

  playPlace() {
    if (!this.enabled) return;
    // Heavy metal thud
    this._noiseBurst(0.4, 300, 0.4, 0.5);
    this._sweepDown(80, 30, 0.3, 0.25);
  }

  playDropPenalty() {
    if (!this.enabled) return;
    this._noiseBurst(0.5, 200, 0.3, 0.6);
    this._sweepDown(120, 40, 0.5, 0.3);
  }

  playTruckLoaded() {
    if (!this.enabled) return;
    // Two quick horn beeps
    this._tone(520, 'square', 0.08, 0.12);
    setTimeout(() => this._tone(520, 'square', 0.08, 0.12), 180);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────
  _noiseBurst(dur, filterFreq, filterQ, vol) {
    const samples = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, samples, this.ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < samples; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (samples * 0.3));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = filterFreq;
    f.Q.value = filterQ;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start();
  }

  _sweepDown(startFreq, endFreq, dur, vol) {
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(startFreq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start(); osc.stop(this.ctx.currentTime + dur);
  }

  _tone(freq, type, vol, dur) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start(); osc.stop(this.ctx.currentTime + dur);
  }
}
