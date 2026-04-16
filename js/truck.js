import * as THREE from 'three';
import { containerSize } from './container.js';

const TRUCK_COLORS = [0xcc3300, 0x1144aa, 0x228833, 0xcc8800, 0x663388];

// Truck bay positions — within crane trolley reach (trolley max Z ~40)
// rotation.y = 0 → cab faces +X, flatbed runs along X axis
const BAYS = [
  { x: -100, z: 36 },
  { x:  -65, z: 36 },
  { x:  -30, z: 36 },
  { x:    5, z: 36 },
  { x:   40, z: 36 },
  { x:   75, z: 36 },
];

// Arc departure constants
const TURN_R    = 10;   // metres — radius of 90° right-hand arc
const TURN_DUR  = 2.5;  // seconds — time to complete the 90° arc
const DRIVE_SPD = 16;   // m/s — straight drive speed into background

export class TruckManager {
  constructor(scene) {
    this.scene  = scene;
    this.trucks = [];
    BAYS.forEach((bay, i) => this.trucks.push(this._build(bay, i)));
    this._buildBayMarkings();
  }

  // ── Build one truck ───────────────────────────────────────────────────────
  _build(bay, idx) {
    const group   = new THREE.Group();
    const color   = TRUCK_COLORS[idx % TRUCK_COLORS.length];
    const cabMat  = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.2 });
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 });
    const wheelMat  = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8, roughness: 0.2 });

    // rotation.y = 0 → cab faces +X (right).  Flatbed extends to -X (left).
    // When driving front-first into background, rotation.y = -π/2 (cab faces +Z).

    // Cab body — at local +X
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.4, 2.5), cabMat);
    cab.position.set(3.8, 1.7, 0);
    cab.castShadow = true;
    group.add(cab);

    // Cab roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 2.3), cabMat);
    roof.position.set(3.4, 3.15, 0);
    roof.castShadow = true;
    group.add(roof);

    // Windscreen
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.1, transparent: true, opacity: 0.7 });
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 2.1), glassMat);
    screen.position.set(2.15, 1.9, 0);
    group.add(screen);

    // Exhaust stack
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.8, 8), chromeMat);
    stack.position.set(5.1, 2.9, -0.9);
    group.add(stack);

    // Chassis frame rails
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(11, 0.3, 0.4), bodyMat);
    chassis.position.set(0, 0.6, 1.0);
    group.add(chassis);
    const chassis2 = chassis.clone();
    chassis2.position.z = -1.0;
    group.add(chassis2);

    // Trailer flatbed (centred at local -1.5 x)
    const bed = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.25, 2.7), bodyMat);
    bed.position.set(-1.5, 1.25, 0);
    bed.castShadow = true; bed.receiveShadow = true;
    group.add(bed);

    // Flatbed side rails
    for (const z of [-1.3, 1.3]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.25, 0.1), chromeMat);
      rail.position.set(-1.5, 1.5, z);
      group.add(rail);
    }

    // Wheels — 3 axles × 2 sides
    const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.45, 12);
    const hubGeo   = new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8);
    const hubMat   = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6 });
    for (const ax of [4.5, 1.5, -4.0]) {
      for (const z of [-1.6, 1.6]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(ax, 0.55, z);
        w.castShadow = true;
        group.add(w);
        const hub = new THREE.Mesh(hubGeo, hubMat);
        hub.rotation.z = Math.PI / 2;
        hub.position.set(ax, 0.55, z);
        group.add(hub);
      }
    }

    // Head lights — at cab front (+X side)
    const lightGeo = new THREE.BoxGeometry(0.15, 0.35, 0.5);
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffee, emissiveIntensity: 0.5 });
    for (const z of [-0.8, 0.8]) {
      const hl = new THREE.Mesh(lightGeo, lightMat);
      hl.position.set(5.45, 1.4, z);
      group.add(hl);
    }

    // Number plate
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 48;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(0, 0, 128, 48);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 26px monospace';
    ctx.fillText(`T-${String(idx + 1).padStart(2, '0')}`, 20, 34);
    const plateMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas) });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.35), plateMat);
    plate.position.set(5.46, 1.0, 0);
    group.add(plate);

    group.position.set(bay.x, 0, bay.z);
    group.rotation.y = 0;  // cab faces +X, waiting to be loaded

    group.userData = {
      bay,
      loaded:      false,
      container:   null,
      phase:       'idle',     // 'idle' | 'waiting' | 'turning' | 'driving'
      departDelay: 0,
      turnT:       0,
      startX:      bay.x,
      startZ:      bay.z,
      initialX:    bay.x,
      initialZ:    bay.z,
      // Shake state
      shakeAmp:    0,
      shakeT:      0,
    };

    this.scene.add(group);
    return group;
  }

  // ── Bay ground markings ───────────────────────────────────────────────────
  _buildBayMarkings() {
    const Y  = 0.15;
    const PO = { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 };
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xffdd00, ...PO });

    for (let i = 0; i < BAYS.length; i++) {
      const { x, z } = BAYS[i];
      const W = 13, D = 9;

      const strips = [
        [W, 0.12, x,         Y, z - D / 2],
        [W, 0.12, x,         Y, z + D / 2],
        [0.12, D, x - W / 2, Y, z],
        [0.12, D, x + W / 2, Y, z],
      ];
      for (const [sw, sd, sx, sy, sz] of strips) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.05, sd), stripMat);
        mesh.position.set(sx, sy, sz);
        this.scene.add(mesh);
      }

      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 96;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(255,220,0,0.9)';
      ctx.font = 'bold 42px monospace';
      ctx.fillText(`TRUCK ${i + 1}`, 8, 64);
      const tex = new THREE.CanvasTexture(canvas);
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 3),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, ...PO })
      );
      label.rotation.x = -Math.PI / 2;
      label.position.set(x, Y + 0.01, z);
      this.scene.add(label);
    }
  }

  // ── Find nearest available (idle, empty) truck ────────────────────────────
  // Returns { truck, dist, quality } or null
  findNearby(worldPos, range = 14) {
    let best = null, bestDist = range;
    for (const t of this.trucks) {
      if (t.userData.loaded || t.userData.phase !== 'idle') continue;

      // Ideal placement = centre of flatbed: local (-1.5, 0, 0) at rotation.y=0 → world (truck.x - 1.5, *, truck.z)
      const idealX = t.position.x - 1.5;
      const idealZ = t.position.z;
      const dx   = worldPos.x - idealX;
      const dz   = worldPos.z - idealZ;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < bestDist) {
        bestDist = dist;
        const quality = dist < 1.5 ? 'perfect' : dist < 3.5 ? 'good' : dist < 6.0 ? 'near' : 'none';
        best = { truck: t, dist, quality };
      }
    }
    return best;
  }

  // ── Load container onto truck — damage tints the container body ───────────
  loadContainer(truck, container, damage = 0) {
    const sz = containerSize(container.userData.is40ft);
    // Place container on flatbed (local -1.5 offset → world truck.x - 1.5)
    container.position.set(truck.position.x - 1.5, 1.4 + sz.h / 2, truck.position.z);
    container.rotation.set(0, truck.rotation.y, 0);

    // Tint towards orange-red based on damage level
    if (damage > 0.05) {
      container.traverse(child => {
        if (child.isMesh && child.material && !child.userData.isLabel) {
          const m = child.material.clone();
          const base = new THREE.Color(m.color);
          base.lerp(new THREE.Color(0x8b2500), Math.min(damage * 1.3, 1.0));
          m.color.copy(base);
          child.material = m;
        }
      });
    }

    truck.userData.loaded      = true;
    truck.userData.container   = container;
    truck.userData.phase       = 'waiting';
    truck.userData.departDelay = 1.8;
    truck.userData.startX      = truck.position.x;
    truck.userData.startZ      = truck.position.z;
    truck.userData.turnT       = 0;
  }

  // ── Trigger a shake on the truck (call when container impacts) ────────────
  // intensity: 0 (tap) → 1 (hard slam)
  shakeTruck(truck, intensity = 0.5) {
    truck.userData.shakeAmp = 0.06 + intensity * 0.22;
    truck.userData.shakeT   = 0.5 + intensity * 0.4;  // shake duration in seconds
  }

  // ── Per-frame update ──────────────────────────────────────────────────────
  update(dt) {
    for (const t of this.trucks) {
      const ud = t.userData;

      // ── Shake (independent of movement phase) ──
      if (ud.shakeT > 0) {
        ud.shakeT -= dt;
        if (ud.shakeT <= 0) {
          ud.shakeT = 0;
          t.position.y = 0;
        } else {
          // Decaying oscillation
          t.position.y = Math.sin(ud.shakeT * 38) * ud.shakeAmp * ud.shakeT;
        }
      }

      if (!ud.loaded) continue;

      // ── Waiting before departure ──
      if (ud.phase === 'waiting') {
        ud.departDelay -= dt;
        if (ud.departDelay <= 0) ud.phase = 'turning';
        this._syncContainer(t);
        continue;
      }

      // ── 90° right-hand arc turn ──
      // Truck starts facing +X (rotation.y=0).
      // Turning right (CW from above): rotation.y goes 0 → -π/2 (cab ends up facing +Z = into background).
      // Arc pivot is TURN_R ahead in the +Z direction from start.
      // Position formula (CW rotation of offset vector):
      //   x = startX − TURN_R · sin(φ)
      //   z = startZ + TURN_R · (1 − cos(φ))        φ: 0 → π/2
      if (ud.phase === 'turning') {
        ud.turnT = Math.min(ud.turnT + dt / TURN_DUR, 1);
        const phi = ud.turnT * (Math.PI / 2);

        t.position.x = ud.startX - TURN_R * Math.sin(phi);
        t.position.z = ud.startZ + TURN_R * (1 - Math.cos(phi));
        t.rotation.y = -phi;  // 0 = facing +X → −π/2 = facing +Z

        this._syncContainer(t);
        if (ud.turnT >= 1) ud.phase = 'driving';
        continue;
      }

      // ── Straight drive cab-first into background (+Z) ──
      if (ud.phase === 'driving') {
        t.position.z += DRIVE_SPD * dt;
        this._syncContainer(t);

        if (t.position.z > 240) this._resetTruck(t);
      }
    }
  }

  // ── Keep container locked to flatbed while truck moves ────────────────────
  _syncContainer(truck) {
    const c = truck.userData.container;
    if (!c) return;
    const sz = containerSize(c.userData.is40ft);
    // Flatbed centre at local (-1.5, 1.4 + sz.h/2, 0) — rotate by truck heading, then add truck world pos
    const local = new THREE.Vector3(-1.5, 0, 0);
    local.applyEuler(new THREE.Euler(0, truck.rotation.y, 0));
    c.position.set(
      truck.position.x + local.x,
      truck.position.y + 1.4 + sz.h / 2,
      truck.position.z + local.z
    );
    c.rotation.set(0, truck.rotation.y, 0);
  }

  _resetTruck(truck) {
    const ud = truck.userData;
    truck.position.set(ud.initialX, 0, ud.initialZ);
    truck.rotation.y = 0;
    ud.phase       = 'idle';
    ud.loaded      = false;
    ud.departDelay = 0;
    ud.turnT       = 0;
    ud.shakeAmp    = 0;
    ud.shakeT      = 0;
    if (ud.container) {
      ud.container.visible = false;
      ud.container = null;
    }
  }
}
