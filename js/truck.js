import * as THREE from 'three';
import { containerSize } from './container.js';

const TRUCK_COLORS = [0xcc3300, 0x1144aa, 0x228833, 0xcc8800, 0x663388];

// Truck bay positions — within crane trolley reach (trolley max Z ~40)
const BAYS = [
  { x: -100, z: 36 },
  { x:  -65, z: 36 },
  { x:  -30, z: 36 },
  { x:    5, z: 36 },
  { x:   40, z: 36 },
  { x:   75, z: 36 },
];

export class TruckManager {
  constructor(scene) {
    this.scene  = scene;
    this.trucks = [];
    BAYS.forEach((bay, i) => this.trucks.push(this._build(bay, i)));
    this._buildBayMarkings();
  }

  // ── Build one truck ───────────────────────────────────────────────────────
  _build(bay, idx) {
    const group  = new THREE.Group();
    const color  = TRUCK_COLORS[idx % TRUCK_COLORS.length];
    const cabMat = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.2 });
    const bodyMat= new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const chromeMat= new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8, roughness: 0.2 });

    // Cab body
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.4, 2.5), cabMat);
    cab.position.set(-3.8, 1.7, 0);
    cab.castShadow = true;
    group.add(cab);

    // Cab roof (slightly narrower)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 2.3), cabMat);
    roof.position.set(-3.4, 3.15, 0);
    roof.castShadow = true;
    group.add(roof);

    // Windscreen (dark glass)
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.1, transparent: true, opacity: 0.7 });
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 2.1), glassMat);
    screen.position.set(-2.15, 1.9, 0);
    group.add(screen);

    // Exhaust stack
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.8, 8), chromeMat);
    stack.position.set(-5.1, 2.9, -0.9);
    group.add(stack);

    // Chassis / frame
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(11, 0.3, 0.4), bodyMat);
    chassis.position.set(0, 0.6, 1.0);
    group.add(chassis);
    const chassis2 = chassis.clone();
    chassis2.position.z = -1.0;
    group.add(chassis2);

    // Trailer flatbed
    const bed = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.25, 2.7), bodyMat);
    bed.position.set(1.5, 1.25, 0);
    bed.castShadow = true; bed.receiveShadow = true;
    group.add(bed);
    group.userData.bed = bed; // container sits here

    // Flatbed side rails
    for (const z of [-1.3, 1.3]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.25, 0.1), chromeMat);
      rail.position.set(1.5, 1.5, z);
      group.add(rail);
    }

    // Wheels (3 axles, 2 sides)
    const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.45, 12);
    const hubGeo   = new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8);
    const hubMat   = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6 });
    for (const ax of [-4.5, -1.5, 4.0]) {
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

    // Head lights
    const lightGeo = new THREE.BoxGeometry(0.15, 0.35, 0.5);
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffee, emissiveIntensity: 0.5 });
    for (const z of [-0.8, 0.8]) {
      const hl = new THREE.Mesh(lightGeo, lightMat);
      hl.position.set(-5.45, 1.4, z);
      group.add(hl);
    }

    // Truck number plate (canvas texture)
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
    plate.position.set(-5.46, 1.0, 0);
    group.add(plate);

    group.position.set(bay.x, 0, bay.z);
    group.rotation.y = Math.PI; // facing to leave rightward
    group.userData = {
      bay,
      loaded: false,
      container: null,
      departing: false,
      departDelay: 0,
      initialX: bay.x,
    };

    this.scene.add(group);
    return group;
  }

  // ── Truck bay ground markings ─────────────────────────────────────────────
  _buildBayMarkings() {
    // Use thin BoxGeometry strips instead of LineLoop — no flickering at distance.
    // Raise to Y=0.15 + polygonOffset to prevent z-fighting with yard surface.
    const Y   = 0.15;
    const PO  = { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 };
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xffdd00, ...PO });

    for (let i = 0; i < BAYS.length; i++) {
      const { x, z } = BAYS[i];
      const W = 11, D = 9; // bay footprint

      // Four border strips (top/bottom/left/right edges of bay rectangle)
      const strips = [
        [W, 0.12, x,     Y, z - D/2],  // front edge
        [W, 0.12, x,     Y, z + D/2],  // back edge
        [0.12, D, x - W/2, Y, z],       // left edge
        [0.12, D, x + W/2, Y, z],       // right edge
      ];
      for (const [sw, sd, sx, sy, sz] of strips) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.05, sd), stripMat);
        mesh.position.set(sx, sy, sz);
        this.scene.add(mesh);
      }

      // Bay label on ground
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

  // Find nearest available truck within range
  findNearby(worldPos, range = 14) {
    let best = null, bestDist = range;
    for (const t of this.trucks) {
      if (t.userData.loaded || t.userData.departing) continue;
      const dx = t.position.x - worldPos.x;
      const dz = t.position.z - worldPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < bestDist) { bestDist = dist; best = t; }
    }
    return best;
  }

  loadContainer(truck, container) {
    const sz = containerSize(container.userData.is40ft);
    // Sit container on trailer bed (account for truck rotation)
    container.position.set(truck.position.x, 1.4 + sz.h / 2, truck.position.z);
    container.rotation.set(0, truck.rotation.y, 0);
    truck.userData.loaded    = true;
    truck.userData.container = container;
    truck.userData.departDelay = 1.8;
  }

  update(dt) {
    for (const t of this.trucks) {
      if (!t.userData.loaded) continue;

      if (t.userData.departDelay > 0) {
        t.userData.departDelay -= dt;
        if (t.userData.departDelay <= 0) t.userData.departing = true;
        continue;
      }

      if (t.userData.departing) {
        // Drive off to the right (negative X since truck faces that way)
        t.position.x -= 14 * dt;
        if (t.userData.container) {
          const sz = containerSize(t.userData.container.userData.is40ft);
          t.userData.container.position.set(t.position.x, 1.4 + sz.h / 2, t.position.z);
        }

        if (t.position.x < -220) {
          // Reset
          t.position.x = t.userData.initialX;
          t.userData.departing  = false;
          t.userData.loaded     = false;
          t.userData.departDelay= 0;
          if (t.userData.container) {
            t.userData.container.visible = false;
            t.userData.container = null;
          }
        }
      }
    }
  }
}
