import * as THREE from 'three';

// Container slot size constants (metres)
export const SLOT = { w: 2.5, h: 2.6, d: 6.1 };   // 20ft slot
export const SLOT40 = { w: 2.5, h: 2.6, d: 12.2 }; // 40ft slot

// ── Ship definitions ────────────────────────────────────────────────────────
// Each ship: { id, name, length, beam, berthX, bays, stackHeight, mixedSizes }
//   bays: number of container bays along ship length
//   rows: athwartships rows per bay
//   stackHeight: max tiers to stack

export const SHIP_DEFS = [
  {
    id: 'feeder',
    name: 'MV Albatross (Feeder)',
    hullColor: 0xcc3322,
    deckColor: 0x555555,
    length: 80,
    beam: 18,
    berthX: -80,
    bays: 4,
    rows: 3,
    maxTier: 2,
    mixedSizes: false,   // all 20ft
    containerCount: 24,
    description: 'Small feeder vessel. Straightforward placement — 20ft containers only.',
  },
  {
    id: 'general',
    name: 'MV Pacific Star (General)',
    hullColor: 0x224488,
    deckColor: 0x444455,
    length: 130,
    beam: 22,
    berthX: 10,
    bays: 6,
    rows: 4,
    maxTier: 3,
    mixedSizes: true,    // mix of 20ft and 40ft
    containerCount: 60,
    description: 'Medium vessel. Mix of 20ft & 40ft slots — match sizes correctly.',
  },
  {
    id: 'large',
    name: 'MV Titan Express (Large)',
    hullColor: 0x226622,
    deckColor: 0x334433,
    length: 200,
    beam: 28,
    berthX: 120,
    bays: 10,
    rows: 6,
    maxTier: 4,
    mixedSizes: true,
    containerCount: 100,
    description: 'Large container vessel. Multi-bay planning, heavy stack order matters.',
  },
];

// ── Build ship mesh + slot grid ─────────────────────────────────────────────

export function buildShip(def, scene) {
  const group = new THREE.Group();
  group.userData.shipId = def.id;

  // Hull
  const hullGeo = new THREE.BoxGeometry(def.length, 8, def.beam);
  const hullMat = new THREE.MeshStandardMaterial({ color: def.hullColor, roughness: 0.8 });
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.y = -4;
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  // Deck
  const deckGeo = new THREE.BoxGeometry(def.length, 0.4, def.beam);
  const deckMat = new THREE.MeshStandardMaterial({ color: def.deckColor, roughness: 0.9 });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.y = 0.2;
  deck.receiveShadow = true;
  group.add(deck);

  // Bow taper (decorative box)
  const bowGeo = new THREE.BoxGeometry(6, 8, def.beam);
  const bow = new THREE.Mesh(bowGeo, hullMat);
  bow.position.set(def.length / 2 - 2, -4, 0);
  group.add(bow);

  // Superstructure (bridge)
  const superGeo = new THREE.BoxGeometry(12, 12, def.beam * 0.6);
  const superMat = new THREE.MeshStandardMaterial({ color: 0xddddcc, roughness: 0.7 });
  const superStr = new THREE.Mesh(superGeo, superMat);
  superStr.position.set(-def.length / 2 + 14, 6, 0);
  superStr.castShadow = true;
  group.add(superStr);

  // Bridge windows (decorative strips)
  const winMat = new THREE.MeshStandardMaterial({ color: 0x88bbdd, roughness: 0.1, metalness: 0.3 });
  const winGeo = new THREE.BoxGeometry(10, 1.2, def.beam * 0.62);
  for (let i = 0; i < 3; i++) {
    const win = new THREE.Mesh(winGeo, winMat);
    win.position.set(-def.length / 2 + 14, 4 + i * 2.5, 0);
    group.add(win);
  }

  // Cell guides (vertical guide posts at bay corners) — decorative
  const guideGeo = new THREE.BoxGeometry(0.15, 3, 0.15);
  const guideMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5 });
  const slots = generateSlotGrid(def);
  for (const slot of slots) {
    const guide = new THREE.Mesh(guideGeo, guideMat);
    guide.position.set(slot.localX - SLOT.d / 2, 1.5, slot.localZ - SLOT.w / 2);
    group.add(guide);
  }

  // Mooring lines (ropes — thin cylinders to bollards)
  addMooringLines(group, def);

  group.position.set(def.berthX, 0, -12);
  scene.add(group);

  return { mesh: group, def, slots };
}

function generateSlotGrid(def) {
  const slots = [];
  const slotDepth = def.mixedSizes
    ? (idx) => (idx % 3 === 0 ? SLOT40.d : SLOT.d)
    : () => SLOT.d;

  let localX = -def.length / 2 + 8;
  for (let bay = 0; bay < def.bays; bay++) {
    const depth = slotDepth(bay);
    for (let row = 0; row < def.rows; row++) {
      const localZ = -def.beam / 2 + 2 + row * (SLOT.w + 0.1);
      for (let tier = 0; tier < def.maxTier; tier++) {
        slots.push({
          bay, row, tier,
          localX: localX + depth / 2,
          localZ,
          localY: 0.4 + tier * SLOT.h,
          depth,
          width: SLOT.w,
          occupied: false,
          is40ft: depth > SLOT.d,
        });
      }
    }
    localX += depth + 0.3;
  }
  return slots;
}

function addMooringLines(group, def) {
  const lineMat = new THREE.MeshStandardMaterial({ color: 0x997755, roughness: 1 });
  const lineGeo = new THREE.CylinderGeometry(0.08, 0.08, 8, 4);
  const offsets = [-def.length / 2 + 5, def.length / 2 - 5];
  for (const ox of offsets) {
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.rotation.z = Math.PI / 4;
    line.position.set(ox, -2, -def.beam / 2 - 1);
    group.add(line);
  }
}

// Highlight a slot target (call when hovering over a slot)
export function highlightSlot(shipObj, slot, active) {
  // Remove old highlight
  const old = shipObj.mesh.getObjectByName('slot-highlight');
  if (old) shipObj.mesh.remove(old);

  if (!active || !slot) return;

  const geo = new THREE.BoxGeometry(slot.depth - 0.1, 0.1, slot.width - 0.1);
  const mat = new THREE.MeshBasicMaterial({
    color: slot.occupied ? 0xff3300 : 0x00ff88,
    transparent: true,
    opacity: 0.5,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'slot-highlight';
  mesh.position.set(slot.localX, slot.localY + 0.05, slot.localZ);
  shipObj.mesh.add(mesh);
}
