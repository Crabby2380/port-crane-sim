// HUD & scoring

export class UI {
  constructor() {
    this._score = 0;
    this._total = 0;
    this._placed = 0;

    this._els = {
      hud:        document.getElementById('hud'),
      cranePosEl: document.getElementById('crane-pos'),
      trolleyEl:  document.getElementById('trolley-pos'),
      hoistEl:    document.getElementById('hoist-height'),
      scoreEl:    document.getElementById('score-display'),
      remainEl:   document.getElementById('containers-remaining'),
      spreaderEl: document.getElementById('spreader-state'),
      spreaderPanel: document.getElementById('spreader-status'),
      needle:     document.getElementById('swing-needle'),
      manifest:   document.getElementById('manifest-list'),
      popup:      document.getElementById('score-popup'),
      damagePanel: document.getElementById('damage-bar-panel'),
      damageFill:  document.getElementById('damage-bar-fill'),
      damagePct:   document.getElementById('damage-pct'),
      gameOver:    document.getElementById('game-over-screen'),
      goScore:     document.getElementById('go-score'),
    };

    this._popupTimeout = null;
  }

  show() { this._els.hud.classList.remove('hidden'); }

  setTotal(n) {
    this._total = n;
    this._updateRemaining();
  }

  updateCrane(railPos, trolleyPos, hoistHeight) {
    this._els.cranePosEl.textContent = railPos.toFixed(1) + 'm';
    this._els.trolleyEl.textContent  = trolleyPos.toFixed(1) + 'm';
    this._els.hoistEl.textContent    = hoistHeight.toFixed(1) + 'm';
  }

  updateSwing(swingScore) {
    // swingScore 0..1 (1 = steady)
    const needle = this._els.needle;
    // Map swing score to horizontal position on 80px bar
    // 1 = centre (40px), 0 = extreme left or right
    const deviation = (1 - swingScore);  // 0..1
    const leftPct   = 50 + (Math.random() > 0.5 ? 1 : -1) * deviation * 40;
    needle.style.left = leftPct + '%';
    needle.style.background = swingScore > 0.7 ? '#00ff88' : swingScore > 0.4 ? '#ffcc00' : '#ff3300';
  }

  updateSpreader(locked) {
    this._els.spreaderEl.textContent = locked ? 'LOCKED' : 'FREE';
    this._els.spreaderPanel.classList.toggle('locked', locked);
  }

  addScore(points, label) {
    this._score += points;
    this._els.scoreEl.textContent = this._score.toLocaleString();
    this._showPopup((points >= 0 ? '+' : '') + points + '  ' + label);
  }

  containerPlaced() {
    this._placed++;
    this._updateRemaining();
  }

  _updateRemaining() {
    this._els.remainEl.textContent = `${this._placed} / ${this._total}`;
  }

  _showPopup(text) {
    const el = this._els.popup;
    el.textContent = text;
    el.classList.remove('hidden');
    el.style.opacity = '1';
    clearTimeout(this._popupTimeout);
    this._popupTimeout = setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.classList.add('hidden'), 500);
    }, 1400);
  }

  getScore() { return this._score; }

  showDamageBar()  { this._els.damagePanel.classList.remove('hidden'); }
  hideDamageBar()  { this._els.damagePanel.classList.add('hidden'); }

  // pct: 0.0 – 1.0
  updateDamage(pct) {
    const p = Math.min(1, Math.max(0, pct));
    const pctInt = Math.round(p * 100);
    this._els.damageFill.style.width = pctInt + '%';
    this._els.damagePct.textContent  = pctInt + '%';
    // Colour the border redder as damage mounts
    const r = Math.round(80 + p * 175);
    this._els.damagePanel.style.borderColor = `rgba(${r},${Math.round(60 * (1-p))},0,0.7)`;
    this._els.damagePct.style.color = p > 0.6 ? '#ff2200' : p > 0.3 ? '#ff8800' : '#ff6644';
  }

  showGameOver(score) {
    this._els.goScore.textContent = `Final score: ${score.toLocaleString()}`;
    this._els.gameOver.classList.remove('hidden');
    document.getElementById('restart-btn').addEventListener('click', () => location.reload());
  }

  buildManifest(containers, ships) {
    const el = this._els.manifest;
    el.innerHTML = '';
    // Group by ship
    for (const ship of ships) {
      const hdr = document.createElement('div');
      hdr.style.cssText = 'color:#00cc66;font-size:0.6rem;letter-spacing:0.1em;margin-top:4px;';
      hdr.textContent = ship.def.name.toUpperCase();
      el.appendChild(hdr);

      const shipContainers = containers.filter(c => c.userData.onShip === ship.def.id);
      for (const c of shipContainers.slice(0, 8)) {
        const row = document.createElement('div');
        row.className = 'manifest-item';
        row.dataset.cid = c.userData.containerId;
        const slot = c.userData.currentSlot;
        row.innerHTML = `
          <span>CONT-${String(c.userData.containerId).padStart(4,'0')}</span>
          <span class="slot">B${slot.bay+1}-R${slot.row+1}-T${slot.tier+1}</span>
        `;
        el.appendChild(row);
      }
      if (shipContainers.length > 8) {
        const more = document.createElement('div');
        more.style.cssText = 'color:#446; font-size:0.6rem;';
        more.textContent = `… +${shipContainers.length - 8} more`;
        el.appendChild(more);
      }
    }
  }

  markContainerDone(containerId) {
    const el = this._els.manifest.querySelector(`[data-cid="${containerId}"]`);
    if (el) el.classList.add('done');
  }
}

// ── Scoring helpers ──────────────────────────────────────────────────────────

export function scorePickup(swingScore) {
  // 0–100 based on swing steadiness at moment of pickup
  return Math.round(swingScore * 100);
}

export function scorePlacement(swingScore, correctSlot) {
  const base = correctSlot ? 200 : 50;
  return Math.round(base * (0.4 + swingScore * 0.6));
}
