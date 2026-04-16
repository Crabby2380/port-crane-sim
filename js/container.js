import * as THREE from 'three';
import { SLOT } from './ship.js';

// Container colours pool
const COLORS = [
  0xcc2222, 0x2244cc, 0x22aa44, 0xddaa00,
  0xaa44aa, 0xdd6600, 0x226688, 0x885522,
];

let _idCounter = 0;

// ── Container size helpers ───────────────────────────────────────────────────
export function containerSize(is40ft) {
  return is40ft
    ? { w: SLOT.w - 0.15, h: SLOT.h - 0.2, d: 12.2 - 0.15 }
    : { w: SLOT.w - 0.15, h: SLOT.h - 0.2, d: 6.1 - 0.15 };
}

// ── Build a container mesh ───────────────────────────────────────────────────
export function createContainer(is40ft = false, colorIndex = null) {
  const id = _idCounter++;
  const sz = containerSize(is40ft);
  const color = COLORS[(colorIndex ?? id) % COLORS.length];

  const group = new THREE.Group();
  group.userData.containerId = id;
  group.userData.is40ft = is40ft;
  group.userData.attached = false;
  group.userData.placed = false;

  // Body
  const bodyGeo = new THREE.BoxGeometry(sz.d, sz.h, sz.w);
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.15 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Corrugation lines (thin stripes across width)
  const stripeMat = new THREE.MeshStandardMaterial({
    color: darken(color, 0.75),
    roughness: 1,
  });
  const stripeCount = is40ft ? 18 : 9;
  for (let i = 0; i < stripeCount; i++) {
    const stripeGeo = new THREE.BoxGeometry(0.12, sz.h + 0.02, sz.w + 0.02);
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.x = -sz.d / 2 + (sz.d / (stripeCount + 1)) * (i + 1);
    group.add(stripe);
  }

  // Corner castings (small bright cubes at corners)
  const castingMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.7, roughness: 0.3 });
  const castingGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz2 of [-1, 1]) {
        const c = new THREE.Mesh(castingGeo, castingMat);
        c.position.set(sx * sz.d / 2, sy * sz.h / 2, sz2 * sz.w / 2);
        group.add(c);
      }
    }
  }

  // Door end markings
  addDoorMarkings(group, sz, color);

  // Top spreader target area (invisible plane used for pickup detection)
  const targetGeo = new THREE.BoxGeometry(sz.d * 0.8, 0.05, sz.w * 0.8);
  const targetMat = new THREE.MeshBasicMaterial({ visible: false });
  const target = new THREE.Mesh(targetGeo, targetMat);
  target.position.y = sz.h / 2;
  target.name = 'spreader-target';
  group.add(target);

  return group;
}

function addDoorMarkings(group, sz, color) {
  const doorMat = new THREE.MeshStandardMaterial({
    color: darken(color, 0.6),
    roughness: 0.9,
  });
  // Two door panels on the +z face
  const panelGeo = new THREE.BoxGeometry(sz.d * 0.48, sz.h * 0.9, 0.05);
  for (const ox of [-0.26, 0.26]) {
    const panel = new THREE.Mesh(panelGeo, doorMat);
    panel.position.set(ox * sz.d, 0, sz.w / 2 + 0.02);
    group.add(panel);
  }

  // Container ID text — use a simple canvas texture
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px monospace';
  ctx.fillText(`CONT-${String(group.userData.containerId).padStart(4, '0')}`, 10, 44);
  const tex = new THREE.CanvasTexture(canvas);
  const labelGeo = new THREE.PlaneGeometry(sz.d * 0.7, 0.5);
  const labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  const label = new THREE.Mesh(labelGeo, labelMat);
  label.position.set(0, sz.h * 0.3, sz.w / 2 + 0.06);
  group.add(label);
}

function darken(hex, factor) {
  const r = ((hex >> 16) & 0xff) * factor | 0;
  const g = ((hex >> 8) & 0xff) * factor | 0;
  const b = (hex & 0xff) * factor | 0;
  return (r << 16) | (g << 8) | b;
}

// ── Spawn containers on a ship ───────────────────────────────────────────────
export function spawnContainersOnShip(shipObj, scene) {
  const { def, slots, mesh } = shipObj;
  const containers = [];
  let spawned = 0;

  // Sort tier-first so ground level fills before stacking
  const sorted = [...slots].sort((a, b) => a.tier - b.tier || a.bay - b.bay || a.row - b.row);

  const worldPos = new THREE.Vector3();
  mesh.getWorldPosition(worldPos);

  for (const slot of sorted) {
    if (spawned >= def.containerCount) break;

    // Only stack if the tier below is occupied (realistic stacking constraint)
    if (slot.tier > 0) {
      const below = slots.find(s => s.bay === slot.bay && s.row === slot.row && s.tier === slot.tier - 1);
      if (!below?.occupied) continue;
    }

    const use40ft = def.mixedSizes && slot.is40ft;
    const c = createContainer(use40ft, spawned);
    const wy = worldPos.y + slot.localY + containerSize(use40ft).h / 2;

    c.position.set(worldPos.x + slot.localX, wy, worldPos.z + slot.localZ);

    // Mark origin for ship-bobbing sync and departure cleanup
    c.userData.originShip  = def.id;
    c.userData.originalY   = wy;
    c.userData.currentSlot = slot;
    c.userData.onShip      = def.id;

    slot.occupied    = true;
    slot.containerId = c.userData.containerId;

    scene.add(c);
    containers.push(c);
    spawned++;
  }

  return containers;
}

// ── Yard stack positions ─────────────────────────────────────────────────────
// Simple 8-column x 4-row yard grid, each stack up to 4 high
const YARD_COLS = 8;
const YARD_ROWS = 4;
const YARD_START = { x: -100, z: 42 };
const YARD_SPACING = { x: 14, z: 8 };

export function buildYardGrid() {
  const grid = [];
  for (let col = 0; col < YARD_COLS; col++) {
    for (let row = 0; row < YARD_ROWS; row++) {
      grid.push({
        col, row,
        x: YARD_START.x + col * YARD_SPACING.x,
        z: YARD_START.z + row * YARD_SPACING.z,
        stack: [],   // containers stacked here
      });
    }
  }
  return grid;
}

export function yardSlotWorldPos(cell, stackHeight) {
  const sz = containerSize(false);
  return new THREE.Vector3(
    cell.x,
    sz.h / 2 + stackHeight * sz.h,
    cell.z
  );
}
