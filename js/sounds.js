// ── Port Crane Simulator — Sound System ──────────────────────────────────────
// All sounds are procedurally synthesised via Web Audio API.
// Dock worker callouts use the Web Speech API where available.

export class SoundSystem {
  constructor() {
    this.ctx     = null;
    this.enabled = false;
    this._motors = {};
    this._speechQueue = [];
    this._speechBusy  = false;
    this._ambientTimer  = 0;
    this._seagullTimer  = 4 + Math.random() * 6; // first call in 4-10s
  }

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._buildMasterChain();
      this._buildMotors();
      this._buildAmbience();
      this.enabled = true;
    } catch (e) {
      console.warn('Web Audio unavailable', e);
    }
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  // ── Master chain (compressor + limiter) ──────────────────────────────────
  _buildMasterChain() {
    this._master = this.ctx.createDynamicsCompressor();
    this._master.threshold.value = -18;
    this._master.knee.value      = 6;
    this._master.ratio.value     = 4;
    this._master.attack.value    = 0.003;
    this._master.release.value   = 0.15;
    this._master.connect(this.ctx.destination);
  }

  // ── FM motor helper ───────────────────────────────────────────────────────
  // Creates an electric-motor sound via frequency modulation:
  //   modulator → adds sidebands → gritty mechanical timbre
  _makeFMMotor(carrierHz, modHz, modDepth, lpHz, vol = 0) {
    const mod     = this.ctx.createOscillator();
    mod.type      = 'sine';
    mod.frequency.value = modHz;

    const modGain = this.ctx.createGain();
    modGain.gain.value = modDepth;
    mod.connect(modGain);

    const carrier = this.ctx.createOscillator();
    carrier.type  = 'sawtooth';
    carrier.frequency.value = carrierHz;
    modGain.connect(carrier.frequency); // FM

    // Add a second harmonic carrier for richer texture
    const carrier2 = this.ctx.createOscillator();
    carrier2.type = 'sawtooth';
    carrier2.frequency.value = carrierHz * 2.01; // slight detune
    modGain.connect(carrier2.frequency);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lpHz;
    lp.Q.value = 0.6;

    const gain = this.ctx.createGain();
    gain.gain.value = vol;

    carrier.connect(lp);
    carrier2.connect(lp);
    lp.connect(gain);
    gain.connect(this._master);

    mod.start(); carrier.start(); carrier2.start();
    return { gain, carrier, mod };
  }

  // ── Build three crane motors ──────────────────────────────────────────────
  _buildMotors() {
    // Travel motor: heavy gantry drive — low, throbbing
    this._motors.travel  = this._makeFMMotor(58,  11, 28, 220);
    // Trolley motor: lighter cross-travel — slightly higher
    this._motors.trolley = this._makeFMMotor(84,  17, 22, 320);
    // Hoist motor: rope drum — higher pitched, tighter
    this._motors.hoist   = this._makeFMMotor(118, 23, 18, 480);

    // Hydraulic whine layer (always-on at very low level when any motor runs)
    this._hydraulicOsc = this.ctx.createOscillator();
    this._hydraulicOsc.type = 'sine';
    this._hydraulicOsc.frequency.value = 680;
    this._hydraulicGain = this.ctx.createGain();
    this._hydraulicGain.gain.value = 0;
    this._hydraulicOsc.connect(this._hydraulicGain);
    this._hydraulicGain.connect(this._master);
    this._hydraulicOsc.start();
  }

  setMotors(traveling, trolleying, hoisting) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const sm = (node, target, tc) => node.gain.setTargetAtTime(target, t, tc);

    sm(this._motors.travel.gain,  traveling  ? 0.18 : 0, 0.06);
    sm(this._motors.trolley.gain, trolleying ? 0.12 : 0, 0.06);
    sm(this._motors.hoist.gain,   hoisting   ? 0.14 : 0, 0.06);

    const anyOn = traveling || trolleying || hoisting;
    sm(this._hydraulicGain, anyOn ? 0.025 : 0, 0.1);
  }

  // ── Ambience ──────────────────────────────────────────────────────────────
  _buildAmbience() {
    // 1. Port machinery rumble — three detuned oscillators, very low
    for (const [f, vol] of [[38, 0.04], [51, 0.03], [67, 0.025]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const lfo = this.ctx.createOscillator(); // subtle beating
      lfo.frequency.value = 0.07 + Math.random() * 0.05;
      const lfog = this.ctx.createGain();
      lfog.gain.value = f * 0.04;
      lfo.connect(lfog); lfog.connect(o.frequency);
      const g = this.ctx.createGain();
      g.gain.value = vol;
      o.connect(g); g.connect(this._master);
      o.start(); lfo.start();
    }

    // 2. Distant machinery noise — band-limited noise loop
    this._makeNoiseLayer(300, 800, 0.4, 0.032);   // mid machinery
    this._makeNoiseLayer(60,  200, 0.3, 0.028);   // low thrum

    // 3. Wind / sea wash — low-pass filtered noise
    this._makeNoiseLayer(20, 400, 0.15, 0.018);

    // 4. Occasional seagull calls & ship sounds — scheduled by update()
    // (handled in tick())
  }

  _makeNoiseLayer(lpFreq, hpFreq, q, vol) {
    const len = this.ctx.sampleRate * 4;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = hpFreq; hp.Q.value = q;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = lpFreq;

    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(this._master);
    src.start();
  }

  // ── Pickup — metallic clank + resonance ──────────────────────────────────
  playPickup() {
    if (!this.enabled) return;
    // Impact transient (fast noise burst, steel-on-steel band)
    this._metalImpact(0.18, 1400, 1.2, 0.5);
    // Resonant ring (spreader twist-locks engaging)
    this._resonantRing(820, 0.12, 0.6);
    this._resonantRing(1240, 0.06, 0.4);
    // Mechanical clunk underneath
    this._sweepDown(95, 35, 0.18, 0.3);
  }

  // ── Placement — heavy thud + metal settle ────────────────────────────────
  playPlace() {
    if (!this.enabled) return;
    this._metalImpact(0.35, 320, 0.5, 0.6);
    this._sweepDown(110, 28, 0.3, 0.5);
    // Metal settle creak after 200ms
    setTimeout(() => {
      if (!this.enabled) return;
      this._resonantRing(420, 0.08, 0.7);
    }, 200);
    this._dockWorkerCall(['Container secure!', 'Hook clear!', 'Down!', 'Set it!']);
  }

  // ── Drop penalty — crash + clatter ───────────────────────────────────────
  playDropPenalty() {
    if (!this.enabled) return;
    this._metalImpact(0.5, 280, 0.4, 0.8);
    this._metalImpact(0.3, 600, 0.6, 0.4);
    this._sweepDown(130, 30, 0.45, 0.55);
    setTimeout(() => {
      if (!this.enabled) return;
      this._metalImpact(0.2, 800, 0.8, 0.3); // secondary clatter
    }, 120);
    this._dockWorkerCall(['Watch it!', 'Heads up!', 'Careful!', 'Oi!']);
  }

  // ── Truck loaded — two horn beeps ────────────────────────────────────────
  playTruckLoaded() {
    if (!this.enabled) return;
    this._airHorn(0.18, 0.14);
    setTimeout(() => this._airHorn(0.18, 0.14), 260);
    this._dockWorkerCall(['Truck loaded!', 'Moving out!', 'Clear the way!']);
  }

  // ── Periodic ambience tick (call from game loop) ──────────────────────────
  tick(dt) {
    if (!this.enabled) return;

    // Seagulls — frequent, independent timer (every 6–18s)
    this._seagullTimer -= dt;
    if (this._seagullTimer <= 0) {
      this._seagullTimer = 6 + Math.random() * 12;
      // 1–3 gulls calling in quick succession
      const count = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        setTimeout(() => { if (this.enabled) this._seagullCall(); }, i * 380);
      }
    }

    // Other ambient events (ship horn, machinery, worker voices)
    this._ambientTimer -= dt;
    if (this._ambientTimer <= 0) {
      this._ambientTimer = 14 + Math.random() * 20;
      this._randomAmbientEvent();
    }
  }

  _randomAmbientEvent() {
    const r = Math.random();
    if      (r < 0.35) this._distantShipHorn();
    else if (r < 0.65) this._backgroundMachinery();
    else               this._dockWorkerCall(['Stand clear!', 'Coming through!', 'All clear!', 'Watch your back!', 'Lift ready!', 'Lower away!']);
  }

  // ── Sound primitives ──────────────────────────────────────────────────────

  _metalImpact(dur, bandFreq, q, vol) {
    const samples = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, samples, this.ctx.sampleRate);
    const d   = buf.getChannelData(0);
    // Combine two noise envelopes: fast attack, two decay rates
    for (let i = 0; i < samples; i++) {
      const env = Math.exp(-i / (samples * 0.08)) * 0.6
                + Math.exp(-i / (samples * 0.35)) * 0.4;
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = bandFreq; bp.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(bp); bp.connect(g); g.connect(this._master);
    src.start();
  }

  _resonantRing(freq, vol, decay) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + decay);
    osc.connect(g); g.connect(this._master);
    osc.start(); osc.stop(this.ctx.currentTime + decay);
  }

  _sweepDown(startHz, endHz, dur, vol) {
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(startHz, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endHz, this.ctx.currentTime + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    osc.connect(g); g.connect(this._master);
    osc.start(); osc.stop(this.ctx.currentTime + dur);
  }

  _airHorn(dur, vol) {
    // Layered oscillators = compressed air horn
    for (const [f, v] of [[180, vol], [270, vol * 0.6], [360, vol * 0.3]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth'; osc.frequency.value = f;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1200;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(v, this.ctx.currentTime);
      g.gain.setValueAtTime(0.0001, this.ctx.currentTime + dur);
      osc.connect(lp); lp.connect(g); g.connect(this._master);
      osc.start(); osc.stop(this.ctx.currentTime + dur + 0.05);
    }
  }

  _seagullCall() {
    // Three rising-falling frequency sweeps = seagull cry
    const delays = [0, 0.28, 0.52];
    for (const delay of delays) {
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(900, t);
      osc.frequency.linearRampToValueAtTime(1600, t + 0.1);
      osc.frequency.linearRampToValueAtTime(800,  t + 0.22);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.04, t + 0.04);
      g.gain.linearRampToValueAtTime(0, t + 0.22);
      osc.connect(g); g.connect(this._master);
      osc.start(t); osc.stop(t + 0.25);
    }
  }

  _distantShipHorn() {
    // Low, long blast — classic container ship fog horn
    const t = this.ctx.currentTime;
    for (const [f, v] of [[62, 0.12], [93, 0.07], [125, 0.04]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth'; osc.frequency.value = f;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 300;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.4);
      g.gain.setValueAtTime(v, t + 2.5);
      g.gain.linearRampToValueAtTime(0, t + 3.2);
      osc.connect(lp); lp.connect(g); g.connect(this._master);
      osc.start(t); osc.stop(t + 3.5);
    }
  }

  _backgroundMachinery() {
    // Short burst of industrial noise — forklift, distant compressor, etc.
    const dur = 0.8 + Math.random() * 1.2;
    const t = this.ctx.currentTime;
    const samples = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, samples, this.ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < samples; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 150 + Math.random() * 300; bp.Q.value = 0.4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.1);
    g.gain.setValueAtTime(0.035, t + dur - 0.15);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(bp); bp.connect(g); g.connect(this._master);
    src.start(t);
  }

  // ── Dock worker callouts (Web Speech API) ─────────────────────────────────
  _dockWorkerCall(phrases) {
    if (!window.speechSynthesis) return;
    // Queue to avoid overlapping voices
    this._speechQueue.push(phrases[Math.floor(Math.random() * phrases.length)]);
    if (!this._speechBusy) this._drainSpeech();
  }

  _drainSpeech() {
    if (!this._speechQueue.length) { this._speechBusy = false; return; }
    this._speechBusy = true;
    const text = this._speechQueue.shift();
    const utt  = new SpeechSynthesisUtterance(text);
    utt.rate   = 1.1 + Math.random() * 0.3;
    utt.pitch  = 0.85 + Math.random() * 0.4;
    utt.volume = 0.55;
    // Prefer a male voice if available
    const voices = window.speechSynthesis.getVoices();
    const male   = voices.find(v => /male|man|david|james|daniel/i.test(v.name));
    if (male) utt.voice = male;
    utt.onend = () => setTimeout(() => this._drainSpeech(), 300);
    window.speechSynthesis.speak(utt);
  }
}
