import * as THREE from 'three';
import { containerSize } from './container.js';

const TRUCK_COLORS = [0xcc3300, 0x1144aa, 0x228833, 0xcc8800, 0x663388, 0x886622];

// Bay centre positions (unchanged — bay markings and container targets use these)
const BAYS = [
  { x: -100, z: 36, size: 'small' },
  { x:  -65, z: 36, size: 'small' },
  { x:  -30, z: 36, size: 'small' },
  { x:    5, z: 36, size: 'large' },
  { x:   40, z: 36, size: 'large' },
  { x:   75, z: 36, size: 'large' },
];

// The truck group origin (= hitch / 5th-wheel) is offset forward of bay.x so the
// container target (hitch + FLATBED_OFFSET) equals the old bay.x + old-fo values,
// keeping main.js's  t.position.x + flatbedOffset  consistent.
//   small: (bay.x + 2.0) + (-3.5) = bay.x – 1.5  (old value)
//   large: (bay.x + 3.0) + (-6.0) = bay.x – 3.0  (old value)
const HITCH_FWD     = { small: 2.0, large: 3.0  };
const FLATBED_OFFSET = { small: -3.5, large: -6.0 };

const DRIVE_SPD  = 16;
const TURN_RATE  = (Math.PI / 2) / 2.8;   // 90° right turn over 2.8 s

// Dimensions measured from the hitch point (+X = toward cab front, -X = toward trailer rear)
const DIMS = {
  small: {
    cabFront:     5.5,
    frontAxleX:   4.5,
    driveAxles:   [-0.3, -1.5],
    cabLen:       5.5,
    trailerLen:   9.5,
    bedLen:       9.0,
    trailerAxles: [-8.0, -9.0],
  },
  large: {
    cabFront:     7.5,
    frontAxleX:   6.8,
    driveAxles:   [-0.3, -1.8],
    cabLen:       7.5,
    trailerLen:   14.5,
    bedLen:       13.5,
    trailerAxles: [-12.5, -14.0],
  },
};

export class TruckManager {
  constructor(scene) {
    this.scene  = scene;
    this.trucks = [];
    BAYS.forEach((bay, i) => this.trucks.push(this._build(bay, i)));
    this._buildBayMarkings();
  }

  // ── Build one truck (cab + trailer as separate scene objects) ─────────────
  _build(bay, idx) {
    const isLarge  = bay.size === 'large';
    const color    = TRUCK_COLORS[idx % TRUCK_COLORS.length];
    const d        = DIMS[bay.size];
    const hitchX   = bay.x + HITCH_FWD[bay.size];
    const hitchZ   = bay.z;

    const cabMat    = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.2 });
    const bodyMat   = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 });
    const wheelMat  = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8, roughness: 0.2 });
    const glassMat  = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.1, transparent: true, opacity: 0.7 });
    const hubMat    = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6 });

    const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.45, 12);
    const hubGeo   = new THREE.CylinderGeometry(0.2,  0.2,  0.5,  8);

    const addWheel = (group, x, z) => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.x = Math.PI / 2; w.position.set(x, 0.55, z); w.castShadow = true;
      group.add(w);
      const h = new THREE.Mesh(hubGeo, hubMat);
      h.rotation.x = Math.PI / 2; h.position.set(x, 0.55, z);
      group.add(h);
    };

    // ── CAB GROUP  (origin = hitch point, cab extends in +X) ────────────────
    const cabGroup = new THREE.Group();

    // Cab body
    const cab = new THREE.Mesh(new THREE.BoxGeometry(d.cabLen, 2.4, 2.5), cabMat);
    cab.position.set(d.cabFront * 0.5, 1.7, 0);
    cab.castShadow = true; cabGroup.add(cab);

    // Sleeper roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(d.cabLen * 0.65, 0.7, 2.3), cabMat);
    roof.position.set(d.cabFront * 0.6, 3.15, 0); cabGroup.add(roof);

    // Windscreen (front face of cab)
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 2.1), glassMat);
    screen.position.set(d.cabFront - 0.05, 1.9, 0); cabGroup.add(screen);

    // Exhaust stack
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.8, 8), chromeMat);
    stack.position.set(d.cabFront * 0.65, 2.9, -0.9); cabGroup.add(stack);

    // Chassis rails (hitch → front)
    for (const z of [1.0, -1.0]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(d.cabFront + 0.5, 0.3, 0.4), bodyMat);
      rail.position.set(d.cabFront / 2, 0.6, z); cabGroup.add(rail);
    }

    // Fifth-wheel plate at hitch (= group origin)
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.15, 12), chromeMat);
    plate.position.set(0, 1.3, 0); cabGroup.add(plate);

    // Head lights
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffee, emissiveIntensity: 0.5 });
    for (const z of [-0.8, 0.8]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.35, 0.5), lightMat);
      hl.position.set(d.cabFront + 0.06, 1.4, z); cabGroup.add(hl);
    }

    // Steerable front wheel group
    const frontWheelGroup = new THREE.Group();
    frontWheelGroup.position.set(d.frontAxleX, 0, 0);
    for (const z of [-1.6, 1.6]) addWheel(frontWheelGroup, 0, z);
    cabGroup.add(frontWheelGroup);

    // Drive axles
    for (const ax of d.driveAxles) for (const z of [-1.6, 1.6]) addWheel(cabGroup, ax, z);

    // ── TRAILER GROUP  (origin = hitch point, trailer extends in -X) ─────────
    const trailerGroup = new THREE.Group();

    const bedCtrX = -d.bedLen / 2;

    // Flatbed deck
    const bed = new THREE.Mesh(new THREE.BoxGeometry(d.bedLen, 0.25, 2.7), bodyMat);
    bed.position.set(bedCtrX, 1.25, 0);
    bed.castShadow = true; bed.receiveShadow = true;
    trailerGroup.add(bed);

    // Flatbed side rails
    for (const z of [-1.3, 1.3]) {
      const sr = new THREE.Mesh(new THREE.BoxGeometry(d.bedLen, 0.25, 0.1), bodyMat);
      sr.position.set(bedCtrX, 1.5, z); trailerGroup.add(sr);
    }

    // Chassis rails
    for (const z of [1.0, -1.0]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(d.trailerLen, 0.3, 0.4), bodyMat);
      rail.position.set(-d.trailerLen / 2, 0.6, z); trailerGroup.add(rail);
    }

    // Trailer axles (near rear)
    for (const ax of d.trailerAxles) for (const z of [-1.6, 1.6]) addWheel(trailerGroup, ax, z);

    // Size badge
    const badgeCvs = document.createElement('canvas');
    badgeCvs.width = 128; badgeCvs.height = 48;
    const bctx = badgeCvs.getContext('2d');
    bctx.fillStyle = isLarge ? '#ffaa00' : '#00aaff';
    bctx.fillRect(0, 0, 128, 48);
    bctx.fillStyle = '#000'; bctx.font = 'bold 22px monospace';
    bctx.fillText(isLarge ? '40FT' : '20FT', 28, 32);
    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.45),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(badgeCvs) })
    );
    badge.position.set(bedCtrX * 0.5, 2.2, 0);
    trailerGroup.add(badge);

    // Initial placement — both at hitch world position
    cabGroup.position.set(hitchX, 0, hitchZ);
    trailerGroup.position.set(hitchX, 0, hitchZ);
    this.scene.add(cabGroup);
    this.scene.add(trailerGroup);

    const ud = {
      bay, size: bay.size,
      // t.position.x + flatbedOffset = hitchX + fo = bay.x – 1.5 or –3.0
      // (matches old gameplay targets, see constants at top)
      flatbedOffset: FLATBED_OFFSET[bay.size],
      cabGroup, trailerGroup, frontWheelGroup,
      trailerLen: d.trailerLen,

      // Kinematic state (world coords)
      hitchX, hitchZ,
      cabAngle:     0,
      trailerAngle: 0,
      trailerRearX: hitchX - d.trailerLen,
      trailerRearZ: hitchZ,

      loaded: false, container: null,
      phase: 'idle', departDelay: 0,
      initialHitchX: hitchX,
      initialHitchZ: hitchZ,
      shakeAmp: 0, shakeT: 0,
    };

    // Share the same userData object on both groups so either can be used as a handle
    cabGroup.userData    = ud;
    trailerGroup.userData = ud;
    return cabGroup;   // primary reference in this.trucks[]
  }

  // ── Bay ground markings ───────────────────────────────────────────────────
  _buildBayMarkings() {
    const Y  = 0.15;
    const PO = { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 };

    for (let i = 0; i < BAYS.length; i++) {
      const { x, z, size } = BAYS[i];
      const W = size === 'large' ? 20 : 13, D = 9;
      const lineColor = size === 'large' ? 0xffaa00 : 0x00aaff;
      const stripMat  = new THREE.MeshBasicMaterial({ color: lineColor, ...PO });

      for (const [sw, sd, sx, sy, sz] of [
        [W,    0.12, x,       Y, z - D/2],
        [W,    0.12, x,       Y, z + D/2],
        [0.12, D,    x - W/2, Y, z      ],
        [0.12, D,    x + W/2, Y, z      ],
      ]) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.05, sd), stripMat);
        mesh.position.set(sx, sy, sz);
        this.scene.add(mesh);
      }

      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 96;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = size === 'large' ? 'rgba(255,170,0,0.9)' : 'rgba(0,170,255,0.9)';
      ctx.font = 'bold 36px monospace';
      ctx.fillText(`${size === 'large' ? '40FT' : '20FT'} #${i + 1}`, 8, 60);
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 3),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true,
          side: THREE.DoubleSide, depthWrite: false, ...PO })
      );
      label.rotation.x = -Math.PI / 2;
      label.position.set(x, Y + 0.01, z);
      this.scene.add(label);
    }
  }

  // ── Find nearest idle truck for a container size ──────────────────────────
  findNearby(worldPos, containerIs40ft = false, range = 14) {
    const needSize = containerIs40ft ? 'large' : 'small';
    let best = null, bestDist = range;

    for (const t of this.trucks) {
      const ud = t.userData;
      if (ud.loaded || ud.phase !== 'idle') continue;
      if (ud.size !== needSize) continue;

      // t.position.x = hitchX;  t.position.x + fo = container target X
      const idealX = t.position.x + ud.flatbedOffset;
      const idealZ = t.position.z;
      const dx = worldPos.x - idealX, dz = worldPos.z - idealZ;
      const dist = Math.sqrt(dx*dx + dz*dz);

      if (dist < bestDist) {
        bestDist = dist;
        const quality = dist < 1.5 ? 'perfect' : dist < 3.5 ? 'good' : dist < 6.0 ? 'near' : 'none';
        best = { truck: t, dist, quality };
      }
    }
    return best;
  }

  // ── Place a container on the trailer flatbed ──────────────────────────────
  loadContainer(truck, container, damage = 0) {
    const ud = truck.userData;
    const sz = containerSize(container.userData.is40ft);

    // Truck is idle and straight: container sits at hitch + flatbedOffset in +X
    container.position.set(ud.hitchX + ud.flatbedOffset, 1.4 + sz.h / 2, ud.hitchZ);
    container.rotation.set(0, 0, 0);

    if (damage > 0.05) {
      container.traverse(child => {
        if (child.isMesh && child.material && !child.userData.isLabel) {
          const m    = child.material.clone();
          const base = new THREE.Color(m.color);
          base.lerp(new THREE.Color(0x8b2500), Math.min(damage * 1.3, 1.0));
          m.color.copy(base);
          child.material = m;
        }
      });
    }

    ud.loaded      = true;
    ud.container   = container;
    ud.phase       = 'waiting';
    ud.departDelay = 1.8;
  }

  // ── Shake trailer on impact ───────────────────────────────────────────────
  shakeTruck(truck, intensity = 0.5) {
    truck.userData.shakeAmp = 0.06 + intensity * 0.22;
    truck.userData.shakeT   = 0.5  + intensity * 0.4;
  }

  // ── Per-frame update ──────────────────────────────────────────────────────
  update(dt) {
    for (const t of this.trucks) {
      const ud = t.userData;

      // ── Shake (impact vibration) ──
      if (ud.shakeT > 0) {
        ud.shakeT -= dt;
        const yOff = ud.shakeT > 0
          ? Math.sin(ud.shakeT * 38) * ud.shakeAmp * ud.shakeT
          : 0;
        ud.cabGroup.position.y     = yOff * 0.3;
        ud.trailerGroup.position.y = yOff;
        if (ud.shakeT <= 0) {
          ud.cabGroup.position.y     = 0;
          ud.trailerGroup.position.y = 0;
        }
      }

      if (!ud.loaded) continue;

      // ── Waiting before departure ──
      if (ud.phase === 'waiting') {
        ud.departDelay -= dt;
        if (ud.departDelay <= 0) ud.phase = 'departing';
        this._syncContainer(ud);
        continue;
      }

      // ── Departing: drive forward + steer right simultaneously ──────────────
      // The cab steers right (cabAngle decreases 0 → -π/2) while moving.
      // The trailer follows kinematically — it doesn't steer, it just drags.
      if (ud.phase === 'departing') {
        // Steer cab right until facing +Z (−π/2)
        if (ud.cabAngle > -Math.PI / 2) {
          ud.cabAngle = Math.max(-Math.PI / 2, ud.cabAngle - TURN_RATE * dt);
          ud.frontWheelGroup.rotation.y = -Math.PI / 3;   // front wheels steer hard right
        } else {
          ud.frontWheelGroup.rotation.y = 0;               // straight ahead
        }

        // Move hitch forward along cab heading
        // THREE.js rotation.y convention: forward = (cos θ, 0, –sin θ)
        const nx = ud.hitchX + Math.cos(ud.cabAngle) * DRIVE_SPD * dt;
        const nz = ud.hitchZ - Math.sin(ud.cabAngle) * DRIVE_SPD * dt;

        // ── Kinematic trailer ──────────────────────────────────────────────
        // New trailer heading = direction from trailer's (unchanged) rear axle
        // toward the new hitch position.  This is the physical constraint that
        // the trailer can only be pushed/pulled along its own axis.
        const dx = nx - ud.trailerRearX;
        const dz = nz - ud.trailerRearZ;
        ud.trailerAngle = Math.atan2(-dz, dx);   // matches THREE.js rotation.y

        // Slide the trailer rear axle to maintain a fixed hitch→rear distance
        ud.trailerRearX = nx - Math.cos(ud.trailerAngle) * ud.trailerLen;
        ud.trailerRearZ = nz + Math.sin(ud.trailerAngle) * ud.trailerLen;

        ud.hitchX = nx;
        ud.hitchZ = nz;

        // Apply transforms: both groups share the same hitch world position;
        // they differ only in their rotation.y (= their individual headings).
        ud.cabGroup.position.x     = nx;
        ud.cabGroup.position.z     = nz;
        ud.cabGroup.rotation.y     = ud.cabAngle;
        ud.trailerGroup.position.x = nx;
        ud.trailerGroup.position.z = nz;
        ud.trailerGroup.rotation.y = ud.trailerAngle;

        this._syncContainer(ud);

        if (nx > 220 || nz > 220) this._resetTruck(t);
      }
    }
  }

  // ── Sync container to trailer heading ────────────────────────────────────
  _syncContainer(ud) {
    const c = ud.container;
    if (!c) return;
    const sz = containerSize(c.userData.is40ft);
    const fo = ud.flatbedOffset;   // negative: behind hitch in trailer-local +X
    // World position = hitch + (fo units along trailerAngle forward direction)
    const cx = ud.hitchX + Math.cos(ud.trailerAngle) * fo;
    const cz = ud.hitchZ - Math.sin(ud.trailerAngle) * fo;
    c.position.set(cx, ud.trailerGroup.position.y + 1.4 + sz.h / 2, cz);
    c.rotation.set(0, ud.trailerAngle, 0);
  }

  // ── Reset truck to its home bay ───────────────────────────────────────────
  _resetTruck(truck) {
    const ud = truck.userData;
    const hx = ud.initialHitchX, hz = ud.initialHitchZ;

    ud.hitchX = hx;  ud.hitchZ = hz;
    ud.cabAngle = 0; ud.trailerAngle = 0;
    ud.trailerRearX = hx - ud.trailerLen;
    ud.trailerRearZ = hz;

    ud.cabGroup.position.set(hx, 0, hz);
    ud.cabGroup.rotation.y = 0;
    ud.trailerGroup.position.set(hx, 0, hz);
    ud.trailerGroup.rotation.y = 0;
    ud.frontWheelGroup.rotation.y = 0;

    ud.phase       = 'idle';
    ud.loaded      = false;
    ud.departDelay = 0;
    if (ud.container) { ud.container.visible = false; ud.container = null; }
  }
}
