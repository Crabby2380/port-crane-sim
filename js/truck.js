import * as THREE from 'three';
import { containerSize } from './container.js';

const TRUCK_COLORS = [0xcc3300, 0x1144aa, 0x228833, 0xcc8800, 0x663388, 0x886622];

// Bay layout: first 3 = SMALL (20ft), last 3 = LARGE (40ft)
const BAYS = [
  { x: -100, z: 36, size: 'small' },
  { x:  -65, z: 36, size: 'small' },
  { x:  -30, z: 36, size: 'small' },
  { x:    5, z: 36, size: 'large' },
  { x:   40, z: 36, size: 'large' },
  { x:   75, z: 36, size: 'large' },
];

const TURN_R    = 10;
const TURN_DUR  = 2.5;
const DRIVE_SPD = 16;

// Flatbed offset from truck origin (container centre X in truck-local space)
const FLATBED_OFFSET = { small: -1.5, large: -3.0 };

export class TruckManager {
  constructor(scene) {
    this.scene  = scene;
    this.trucks = [];
    BAYS.forEach((bay, i) => this.trucks.push(this._build(bay, i)));
    this._buildBayMarkings();
  }

  // ── Build one truck ───────────────────────────────────────────────────────
  _build(bay, idx) {
    const group     = new THREE.Group();
    const isLarge   = bay.size === 'large';
    const color     = TRUCK_COLORS[idx % TRUCK_COLORS.length];
    const cabMat    = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.2 });
    const bodyMat   = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 });
    const wheelMat  = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8, roughness: 0.2 });

    // ── Cab (at +X end) ────────────────────────────────────────────────────
    const cabW = isLarge ? 3.6 : 3.2;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(cabW, 2.4, 2.5), cabMat);
    cab.position.set(isLarge ? 5.5 : 3.8, 1.7, 0);
    cab.castShadow = true;
    group.add(cab);

    const roofW = isLarge ? 2.6 : 2.2;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.7, 2.3), cabMat);
    roof.position.set(isLarge ? 5.2 : 3.4, 3.15, 0);
    roof.castShadow = true;
    group.add(roof);

    // Windscreen
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.1, transparent: true, opacity: 0.7 });
    const screenX  = isLarge ? 3.5 : 2.15;
    const screen   = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 2.1), glassMat);
    screen.position.set(screenX, 1.9, 0);
    group.add(screen);

    // Exhaust stack
    const stackX = isLarge ? 7.2 : 5.1;
    const stack  = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.8, 8), chromeMat);
    stack.position.set(stackX, 2.9, -0.9);
    group.add(stack);

    // Chassis frame rails
    const chassisLen = isLarge ? 19 : 11;
    const chassisX   = isLarge ? -1.5 : 0;
    for (const z of [1.0, -1.0]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(chassisLen, 0.3, 0.4), bodyMat);
      rail.position.set(chassisX, 0.6, z);
      group.add(rail);
    }

    // Trailer flatbed
    const bedLen = isLarge ? 14.0 : 8.5;
    const bedX   = isLarge ? -3.0 : -1.5;
    const bed    = new THREE.Mesh(new THREE.BoxGeometry(bedLen, 0.25, 2.7), bodyMat);
    bed.position.set(bedX, 1.25, 0);
    bed.castShadow = true; bed.receiveShadow = true;
    group.add(bed);

    // Flatbed side rails
    for (const z of [-1.3, 1.3]) {
      const sideRail = new THREE.Mesh(new THREE.BoxGeometry(bedLen, 0.25, 0.1), chromeMat);
      sideRail.position.set(bedX, 1.5, z);
      group.add(sideRail);
    }

    // ── Wheels ────────────────────────────────────────────────────────────
    const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.45, 12);
    const hubGeo   = new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8);
    const hubMat   = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6 });

    // Front axle (steerable) — stored separately for animation
    const frontAxleX = isLarge ? 6.8 : 4.5;
    const frontWheelGroup = new THREE.Group();
    frontWheelGroup.position.set(frontAxleX, 0, 0);
    for (const z of [-1.6, 1.6]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.x = Math.PI / 2;
      w.position.set(0, 0.55, z);
      w.castShadow = true;
      frontWheelGroup.add(w);
      const hub = new THREE.Mesh(hubGeo, hubMat);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(0, 0.55, z);
      frontWheelGroup.add(hub);
    }
    group.add(frontWheelGroup);

    // Drive axles
    const driveAxles = isLarge ? [2.5, -0.5, -4.5, -7.5] : [1.5, -4.0];
    for (const ax of driveAxles) {
      for (const z of [-1.6, 1.6]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.x = Math.PI / 2;
        w.position.set(ax, 0.55, z);
        w.castShadow = true;
        group.add(w);
        const hub = new THREE.Mesh(hubGeo, hubMat);
        hub.rotation.x = Math.PI / 2;
        hub.position.set(ax, 0.55, z);
        group.add(hub);
      }
    }

    // Head lights
    const lightGeo = new THREE.BoxGeometry(0.15, 0.35, 0.5);
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffee, emissiveIntensity: 0.5 });
    const lightX   = isLarge ? 7.45 : 5.45;
    for (const z of [-0.8, 0.8]) {
      const hl = new THREE.Mesh(lightGeo, lightMat);
      hl.position.set(lightX, 1.4, z);
      group.add(hl);
    }

    // Size label badge
    const badgeCvs = document.createElement('canvas');
    badgeCvs.width = 128; badgeCvs.height = 48;
    const bctx = badgeCvs.getContext('2d');
    bctx.fillStyle = isLarge ? '#ffaa00' : '#00aaff';
    bctx.fillRect(0, 0, 128, 48);
    bctx.fillStyle = '#000';
    bctx.font = 'bold 22px monospace';
    bctx.fillText(isLarge ? '40FT' : '20FT', 28, 32);
    const badgeMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(badgeCvs) });
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.45), badgeMat);
    badge.position.set(lightX + 0.08, 2.2, 0);
    group.add(badge);

    group.position.set(bay.x, 0, bay.z);
    group.rotation.y = 0;

    group.userData = {
      bay,
      size:           bay.size,
      flatbedOffset:  FLATBED_OFFSET[bay.size],
      frontWheelGroup,
      loaded:      false,
      container:   null,
      phase:       'idle',
      departDelay: 0,
      turnT:       0,
      startX:      bay.x,
      startZ:      bay.z,
      initialX:    bay.x,
      initialZ:    bay.z,
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

    for (let i = 0; i < BAYS.length; i++) {
      const { x, z, size } = BAYS[i];
      const W = size === 'large' ? 20 : 13, D = 9;
      const lineColor = size === 'large' ? 0xffaa00 : 0x00aaff;
      const stripMat  = new THREE.MeshBasicMaterial({ color: lineColor, ...PO });

      for (const [sw, sd, sx, sy, sz] of [
        [W, 0.12, x,       Y, z - D/2],
        [W, 0.12, x,       Y, z + D/2],
        [0.12, D, x - W/2, Y, z],
        [0.12, D, x + W/2, Y, z],
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

  // ── Find nearest matching truck (size-matched to container) ──────────────
  findNearby(worldPos, containerIs40ft = false, range = 14) {
    const needSize = containerIs40ft ? 'large' : 'small';
    let best = null, bestDist = range;

    for (const t of this.trucks) {
      if (t.userData.loaded || t.userData.phase !== 'idle') continue;
      if (t.userData.size !== needSize) continue;

      const fo     = t.userData.flatbedOffset;
      const idealX = t.position.x + fo;
      const idealZ = t.position.z;
      const dx     = worldPos.x - idealX;
      const dz     = worldPos.z - idealZ;
      const dist   = Math.sqrt(dx*dx + dz*dz);

      if (dist < bestDist) {
        bestDist = dist;
        const quality = dist < 1.5 ? 'perfect' : dist < 3.5 ? 'good' : dist < 6.0 ? 'near' : 'none';
        best = { truck: t, dist, quality };
      }
    }
    return best;
  }

  // ── Load a container onto a truck ────────────────────────────────────────
  loadContainer(truck, container, damage = 0) {
    const sz = containerSize(container.userData.is40ft);
    const fo = truck.userData.flatbedOffset;
    container.position.set(truck.position.x + fo, 1.4 + sz.h / 2, truck.position.z);
    container.rotation.set(0, truck.rotation.y, 0);

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

    truck.userData.loaded         = true;
    truck.userData.container      = container;
    truck.userData.phase          = 'waiting';
    truck.userData.departDelay    = 1.8;
    truck.userData.forwardRemain  = 22;   // units to drive straight before turning
    truck.userData.turnT          = 0;
  }

  // ── Trigger truck shake on container impact ───────────────────────────────
  shakeTruck(truck, intensity = 0.5) {
    truck.userData.shakeAmp = 0.06 + intensity * 0.22;
    truck.userData.shakeT   = 0.5 + intensity * 0.4;
  }

  // ── Per-frame update ──────────────────────────────────────────────────────
  update(dt) {
    for (const t of this.trucks) {
      const ud = t.userData;

      // Shake
      if (ud.shakeT > 0) {
        ud.shakeT -= dt;
        t.position.y = ud.shakeT > 0
          ? Math.sin(ud.shakeT * 38) * ud.shakeAmp * ud.shakeT
          : 0;
        if (ud.shakeT <= 0) t.position.y = 0;
      }

      if (!ud.loaded) continue;

      if (ud.phase === 'waiting') {
        ud.departDelay -= dt;
        if (ud.departDelay <= 0) ud.phase = 'pullingforward';
        this._syncContainer(t);
        continue;
      }

      // ── Drive straight forward (+X) to clear the bay before turning ────
      if (ud.phase === 'pullingforward') {
        t.position.x += DRIVE_SPD * dt;
        ud.forwardRemain -= DRIVE_SPD * dt;
        this._syncContainer(t);
        if (ud.forwardRemain <= 0) {
          // Anchor arc to the truck's current position
          ud.startX = t.position.x;
          ud.startZ = t.position.z;
          ud.turnT  = 0;
          ud.phase  = 'turning';
        }
        continue;
      }

      // ── 90° right-hand arc: rotation.y: 0 → -π/2 ──────────────────────
      // Cab faces +X at start → faces +Z at end (drives forward into background)
      if (ud.phase === 'turning') {
        ud.turnT = Math.min(ud.turnT + dt / TURN_DUR, 1);
        const phi = ud.turnT * (Math.PI / 2);

        t.position.x = ud.startX - TURN_R * Math.sin(phi);
        t.position.z = ud.startZ + TURN_R * (1 - Math.cos(phi));
        t.rotation.y = -phi;

        // Front wheels steer right (local -Z side) then straighten near end
        const steerAngle = ud.turnT < 0.85
          ? -(Math.PI / 3)               // full right steer
          : -(Math.PI / 3) * (1 - (ud.turnT - 0.85) / 0.15); // straighten last 15%
        ud.frontWheelGroup.rotation.y = steerAngle;

        this._syncContainer(t);
        if (ud.turnT >= 1) {
          ud.frontWheelGroup.rotation.y = 0;
          ud.phase = 'driving';
        }
        continue;
      }

      if (ud.phase === 'driving') {
        t.position.z += DRIVE_SPD * dt;
        this._syncContainer(t);
        if (t.position.z > 240) this._resetTruck(t);
      }
    }
  }

  _syncContainer(truck) {
    const c = truck.userData.container;
    if (!c) return;
    const sz = containerSize(c.userData.is40ft);
    const fo = truck.userData.flatbedOffset;
    const local = new THREE.Vector3(fo, 0, 0);
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
    ud.frontWheelGroup.rotation.y = 0;
    ud.phase       = 'idle';
    ud.loaded      = false;
    ud.departDelay = 0;
    ud.turnT       = 0;
    if (ud.container) {
      ud.container.visible = false;
      ud.container = null;
    }
  }
}
