import * as THREE from 'three';

export const SLOT  = { w: 2.5, h: 2.6, d: 6.1  };
export const SLOT40= { w: 2.5, h: 2.6, d: 12.2 };

// All ships berth at the same central position — they come in sequence.
export const SHIP_DEFS = [
  {
    id: 'feeder',
    name: 'MV Albatross',
    hullColor: 0xcc3322,
    deckColor: 0x555555,
    funnelColor: 0xdd2200,
    length: 55,
    beam: 12,
    berthX: 0,
    bays: 3, rows: 2, maxTier: 2,
    mixedSizes: false,
    containerCount: 12,
    description: 'Small feeder vessel. 20ft containers only.',
  },
  {
    id: 'general',
    name: 'MV Pacific Star',
    hullColor: 0x224488,
    deckColor: 0x444455,
    funnelColor: 0x1133aa,
    length: 70,
    beam: 15,
    berthX: 0,
    bays: 4, rows: 2, maxTier: 2,
    mixedSizes: true,
    containerCount: 16,
    description: 'Medium vessel. Mix of 20ft & 40ft containers.',
  },
  {
    id: 'large',
    name: 'MV Titan Express',
    hullColor: 0x226622,
    deckColor: 0x334433,
    funnelColor: 0x115511,
    length: 85,
    beam: 18,
    berthX: 0,
    bays: 5, rows: 2, maxTier: 2,
    mixedSizes: true,
    containerCount: 20,
    description: 'Large vessel. Mix of 20ft & 40ft containers.',
  },
];

// ── Wedge geometry helper (tapered bow) ──────────────────────────────────────
function wedgeGeometry(frontW, backW, height, depth) {
  const geo = new THREE.BufferGeometry();
  const fw = frontW / 2, bw = backW / 2, hh = height / 2;
  // prettier-ignore
  const verts = new Float32Array([
    // front (narrow)
    -fw, -hh,  0,   // 0
     fw, -hh,  0,   // 1
     fw,  hh,  0,   // 2
    -fw,  hh,  0,   // 3
    // back (wide)
    -bw, -hh, -depth,  // 4
     bw, -hh, -depth,  // 5
     bw,  hh, -depth,  // 6
    -bw,  hh, -depth,  // 7
  ]);
  const idx = [
    0,1,2, 0,2,3,       // front
    4,6,5, 4,7,6,       // back
    3,2,6, 3,6,7,       // top
    0,5,1, 0,4,5,       // bottom
    0,3,7, 0,7,4,       // left
    1,5,6, 1,6,2,       // right
  ];
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ── Build ship mesh + slot grid ───────────────────────────────────────────────
export function buildShip(def, scene) {
  const group = new THREE.Group();
  group.userData.shipId = def.id;

  const hullMat  = new THREE.MeshStandardMaterial({ color: def.hullColor,  roughness: 0.8 });
  const deckMat  = new THREE.MeshStandardMaterial({ color: def.deckColor,  roughness: 0.9 });
  const superMat = new THREE.MeshStandardMaterial({ color: 0xddddd0, roughness: 0.7 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x88bbdd, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.6 });
  const darkMat  = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
  const railMat  = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.6, roughness: 0.4 });
  const funnelMat= new THREE.MeshStandardMaterial({ color: def.funnelColor, roughness: 0.7 });

  const L = def.length, B = def.beam;

  // ── Main hull body ──────────────────────────────────────────────────────
  const hullGeo = new THREE.BoxGeometry(L * 0.78, 9, B);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.set(-L * 0.11, -4.5, 0);
  hull.castShadow = true; hull.receiveShadow = true;
  group.add(hull);

  // ── Bow (tapered wedge — starboard side) ───────────────────────────────
  const bowLen = L * 0.18;
  const bowGeo = wedgeGeometry(B * 0.08, B, 9, bowLen);
  const bow = new THREE.Mesh(bowGeo, hullMat);
  bow.position.set(L / 2, -4.5, 0);
  bow.castShadow = true;
  group.add(bow);

  // ── Stern (slightly tapered) ────────────────────────────────────────────
  const sternLen = L * 0.06;
  const sternGeo = wedgeGeometry(B * 0.7, B, 9, sternLen);
  const stern = new THREE.Mesh(sternGeo, hullMat);
  // Stern faces aft (positive X direction from hull back)
  stern.rotation.y = Math.PI;
  stern.position.set(-L / 2, -4.5, 0);
  stern.castShadow = true;
  group.add(stern);

  // ── Waterline stripe (white) ────────────────────────────────────────────
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 });
  const stripeGeo = new THREE.BoxGeometry(L * 0.78, 0.6, B + 0.02);
  const stripe = new THREE.Mesh(stripeGeo, stripeMat);
  stripe.position.set(-L * 0.11, -0.3, 0);
  group.add(stripe);

  // ── Deck ────────────────────────────────────────────────────────────────
  const deckGeo = new THREE.BoxGeometry(L * 0.84, 0.4, B);
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.set(-L * 0.08, 0.2, 0);
  deck.receiveShadow = true;
  group.add(deck);

  // ── Hatch covers (one per bay) ──────────────────────────────────────────
  const hatchMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.95 });
  const hatchW = B * 0.7, hatchH = 0.18;
  let hatchX = -L / 2 + 10;
  for (let bay = 0; bay < def.bays; bay++) {
    const slotD = (def.mixedSizes && bay % 3 === 0) ? SLOT40.d : SLOT.d;
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(slotD - 0.4, hatchH, hatchW), hatchMat);
    hatch.position.set(hatchX + slotD / 2, 0.49, 0);
    group.add(hatch);

    // Hatch coaming (raised lip)
    const coaming = new THREE.Mesh(
      new THREE.BoxGeometry(slotD - 0.1, 0.25, hatchW + 0.3),
      new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 1 })
    );
    coaming.position.set(hatchX + slotD / 2, 0.32, 0);
    group.add(coaming);

    hatchX += slotD + 0.3;
  }

  // ── Deck railings ───────────────────────────────────────────────────────
  const railPostGeo = new THREE.BoxGeometry(0.08, 1.1, 0.08);
  const railBarGeo  = new THREE.BoxGeometry(L * 0.86, 0.06, 0.06);
  // Port & starboard rails
  for (const z of [-B / 2 - 0.1, B / 2 + 0.1]) {
    const bar = new THREE.Mesh(railBarGeo, railMat);
    bar.position.set(-L * 0.07, 1.15, z);
    group.add(bar);
    // Posts every 5m
    for (let x = -L / 2 + 5; x < L / 2 - 5; x += 5) {
      const post = new THREE.Mesh(railPostGeo, railMat);
      post.position.set(x, 0.6, z);
      group.add(post);
    }
  }

  // ── Superstructure (bridge) ─────────────────────────────────────────────
  const superX = -L / 2 + 16;
  // A-deck
  const aDeck = new THREE.Mesh(new THREE.BoxGeometry(14, 3.5, B * 0.9), superMat);
  aDeck.position.set(superX, 1.9, 0);
  aDeck.castShadow = true;
  group.add(aDeck);
  // B-deck (narrower)
  const bDeck = new THREE.Mesh(new THREE.BoxGeometry(12, 3, B * 0.75), superMat);
  bDeck.position.set(superX, 5.1, 0);
  bDeck.castShadow = true;
  group.add(bDeck);
  // Bridge deck (narrower still, full beam for bridge wings)
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(10, 2.8, B * 0.95), superMat);
  bridge.position.set(superX, 8.2, 0);
  bridge.castShadow = true;
  group.add(bridge);
  // Wheelhouse top
  const wheelhouse = new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, B * 0.5), superMat);
  wheelhouse.position.set(superX, 10.0, 0);
  group.add(wheelhouse);

  // Bridge windows — strip of dark glass
  const winGeo = new THREE.BoxGeometry(7.8, 1.4, 0.1);
  for (const [oz, ry] of [[B * 0.48, 0], [-B * 0.48, 0]]) {
    const win = new THREE.Mesh(winGeo, glassMat);
    win.position.set(superX, 8.4, oz);
    win.rotation.y = ry;
    group.add(win);
  }
  // Front bridge window
  const fWinGeo = new THREE.BoxGeometry(0.1, 1.4, B * 0.85);
  const fWin = new THREE.Mesh(fWinGeo, glassMat);
  fWin.position.set(superX + 5, 8.4, 0);
  group.add(fWin);

  // Radar mast
  const mastGeo = new THREE.CylinderGeometry(0.1, 0.15, 5, 6);
  const mast = new THREE.Mesh(mastGeo, darkMat);
  mast.position.set(superX, 13.5, 0);
  group.add(mast);
  const crossGeo = new THREE.BoxGeometry(0.06, 0.06, 4);
  const cross = new THREE.Mesh(crossGeo, darkMat);
  cross.position.set(superX, 16.5, 0);
  group.add(cross);

  // ── Funnel ──────────────────────────────────────────────────────────────
  const funnelGeo = new THREE.CylinderGeometry(1.4, 1.8, 4, 16);
  const funnel = new THREE.Mesh(funnelGeo, funnelMat);
  funnel.position.set(superX - 2, 12.5, 0);
  funnel.castShadow = true;
  group.add(funnel);
  // Funnel top cap (black)
  const capGeo = new THREE.CylinderGeometry(1.38, 1.38, 0.6, 16);
  const cap = new THREE.Mesh(capGeo, darkMat);
  cap.position.set(superX - 2, 15, 0);
  group.add(cap);

  // ── Anchor (port side bow) ──────────────────────────────────────────────
  const anchorMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7 });
  const anchorBody = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.2, 6), anchorMat);
  anchorBody.position.set(L / 2 - 6, -1, -B / 2 + 1);
  group.add(anchorBody);
  const anchorArm = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 0.2), anchorMat);
  anchorArm.position.set(L / 2 - 6, -1.8, -B / 2 + 1);
  group.add(anchorArm);

  // ── Mooring lines ────────────────────────────────────────────────────────
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xaa8855, roughness: 1 });
  for (const ox of [-L / 2 + 6, L / 2 - 8]) {
    const lineGeo = new THREE.CylinderGeometry(0.07, 0.07, 9, 4);
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.rotation.z = Math.PI / 4;
    line.position.set(ox, -1.5, -B / 2 - 1);
    group.add(line);
  }

  // ── Ship name on hull ────────────────────────────────────────────────────
  const nameCanvas = document.createElement('canvas');
  nameCanvas.width = 512; nameCanvas.height = 80;
  const nc = nameCanvas.getContext('2d');
  nc.fillStyle = '#ffffff';
  nc.font = 'bold 36px serif';
  nc.fillText(def.name.split(' ').slice(0, 2).join(' '), 10, 56);
  const nameTex = new THREE.CanvasTexture(nameCanvas);
  const nameLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 2.8),
    new THREE.MeshBasicMaterial({ map: nameTex, transparent: true })
  );
  nameLabel.position.set(0, -1.5, B / 2 + 0.05);
  group.add(nameLabel);

  // ── Cell guide posts ─────────────────────────────────────────────────────
  const guideGeo = new THREE.BoxGeometry(0.12, 2.5, 0.12);
  const guideMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.5 });
  const slots = generateSlotGrid(def);
  for (const slot of slots.filter(s => s.tier === 0)) {
    for (const [ox, oz] of [[-slot.depth/2, -SLOT.w/2], [-slot.depth/2, SLOT.w/2]]) {
      const g = new THREE.Mesh(guideGeo, guideMat);
      g.position.set(slot.localX + ox, 1.5, slot.localZ + oz);
      group.add(g);
    }
  }

  group.position.set(def.berthX, 0, -12);
  scene.add(group);

  return {
    mesh:      group,
    def,
    slots,
    phase:     'berth',   // 'berth' | 'departing' | 'arriving'
    phaseT:    0,
    berthX:    def.berthX,
    bobPhase:  Math.random() * Math.PI * 2,
    bobY:      0,
  };
}

// ── Per-frame ship animation (bobbing + departure/arrival movement) ───────────
// Returns: 'berth' | 'departed' | 'arrived'
export function updateShip(ship, dt) {
  const t = performance.now() * 0.001;

  if (ship.phase === 'departing') {
    ship.phaseT += dt;
    ship.mesh.position.x += 22 * dt;
    // Slight list as she accelerates away
    ship.mesh.rotation.z = Math.sin(ship.phaseT * 0.8) * 0.012;
    if (ship.phaseT > 7) return 'departed';
    return 'departing';
  }

  if (ship.phase === 'arriving') {
    ship.phaseT += dt;
    const target = ship.berthX;
    const dist   = target - ship.mesh.position.x;
    if (Math.abs(dist) < 0.5) {
      ship.mesh.position.x = target;
      ship.mesh.rotation.z = 0;
      ship.phase  = 'berth';
      ship.phaseT = 0;
      return 'arrived';
    }
    // Decelerate as it approaches berth
    const speed = Math.max(4, Math.min(22, Math.abs(dist) * 1.5));
    ship.mesh.position.x += Math.sign(dist) * speed * dt;
    // Gentle roll on approach
    ship.mesh.rotation.z = Math.sin(ship.phaseT * 0.5) * 0.008;
    return 'arriving';
  }

  // ── Normal berth: gentle bob ──────────────────────────────────────────────
  ship.bobY = Math.sin(t * 0.45 + ship.bobPhase) * 0.2
            + Math.sin(t * 0.18 + ship.bobPhase + 1.1) * 0.06;
  ship.mesh.position.y = ship.bobY;
  // Subtle roll
  ship.mesh.rotation.z = Math.sin(t * 0.22 + ship.bobPhase) * 0.008;
  return 'berth';
}

function generateSlotGrid(def) {
  const slots = [];
  let localX = -def.length / 2 + 8;
  for (let bay = 0; bay < def.bays; bay++) {
    const is40 = def.mixedSizes && bay % 3 === 0;
    const depth = is40 ? SLOT40.d : SLOT.d;
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
          is40ft: is40,
        });
      }
    }
    localX += depth + 0.3;
  }
  return slots;
}

export function highlightSlot(shipObj, slot, active) {
  const old = shipObj.mesh.getObjectByName('slot-highlight');
  if (old) shipObj.mesh.remove(old);
  if (!active || !slot) return;
  const geo = new THREE.BoxGeometry(slot.depth - 0.1, 0.1, slot.width - 0.1);
  const mat = new THREE.MeshBasicMaterial({ color: slot.occupied ? 0xff3300 : 0x00ff88, transparent: true, opacity: 0.5 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'slot-highlight';
  mesh.position.set(slot.localX, slot.localY + 0.05, slot.localZ);
  shipObj.mesh.add(mesh);
}
