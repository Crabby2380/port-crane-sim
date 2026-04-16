import * as THREE from 'three';

export const SLOT  = { w: 2.5, h: 2.6, d: 6.1  };
export const SLOT40= { w: 2.5, h: 2.6, d: 12.2 };

// Ship rest waterline — group origin sits this far above world y=0
// With hull height=9 centred at local y=-4.5, hull spans local -9..0.
// At restY=2.5 the hull shows ~3m above water (water ≈ y=-0.5) → looks floating.
const SHIP_REST_Y = 2.5;

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
  },
];

// ── Wedge geometry helper ─────────────────────────────────────────────────────
function wedgeGeometry(frontW, backW, height, depth) {
  const geo = new THREE.BufferGeometry();
  const fw = frontW / 2, bw = backW / 2, hh = height / 2;
  const verts = new Float32Array([
    -fw, -hh,  0,   fw, -hh,  0,   fw,  hh,  0,  -fw,  hh,  0,
    -bw, -hh, -depth, bw, -hh, -depth, bw,  hh, -depth, -bw,  hh, -depth,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex([0,1,2, 0,2,3, 4,6,5, 4,7,6, 3,2,6, 3,6,7, 0,5,1, 0,4,5, 0,3,7, 0,7,4, 1,5,6, 1,6,2]);
  geo.computeVertexNormals();
  return geo;
}

// ── Build ship mesh + slot grid ───────────────────────────────────────────────
export function buildShip(def, scene) {
  const group = new THREE.Group();
  group.userData.shipId = def.id;

  const hullMat   = new THREE.MeshStandardMaterial({ color: def.hullColor,  roughness: 0.8 });
  const deckMat   = new THREE.MeshStandardMaterial({ color: def.deckColor,  roughness: 0.9 });
  const superMat  = new THREE.MeshStandardMaterial({ color: 0xddddd0, roughness: 0.7 });
  const glassMat  = new THREE.MeshStandardMaterial({ color: 0x88bbdd, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.6 });
  const darkMat   = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
  const railMat   = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.6, roughness: 0.4 });
  const funnelMat = new THREE.MeshStandardMaterial({ color: def.funnelColor, roughness: 0.7 });

  const L = def.length, B = def.beam;

  // ── Main hull body (spans local y=-9..0) ─────────────────────────────────
  const hull = new THREE.Mesh(new THREE.BoxGeometry(L * 0.8, 9, B), hullMat);
  hull.position.set(0, -4.5, 0);
  hull.castShadow = true; hull.receiveShadow = true;
  group.add(hull);

  // ── Bow (tapered wedge at +X end) ─────────────────────────────────────────
  // wedgeGeometry tapers along -Z; rotation.y=π/2 redirects that along -X,
  // so the wide base (backW=B) sits at x=L*0.4 joining the hull box,
  // and the narrow tip (frontW≈0) points outward at x=L*0.4+bowLen.
  const bowLen = L * 0.15;
  const bow = new THREE.Mesh(wedgeGeometry(B * 0.06, B, 9, bowLen), hullMat);
  bow.rotation.y = Math.PI / 2;
  bow.position.set(L * 0.4 + bowLen, -4.5, 0);
  bow.castShadow = true;
  group.add(bow);

  // ── Stern (slightly tapered at −X end) ───────────────────────────────────
  // rotation.y=-π/2 redirects the wide base to x=-L*0.4 (hull join),
  // narrow face points outward at x=-L*0.4-sternLen.
  const sternLen = L * 0.06;
  const stern = new THREE.Mesh(wedgeGeometry(B * 0.65, B, 9, sternLen), hullMat);
  stern.rotation.y = -Math.PI / 2;
  stern.position.set(-L * 0.4 - sternLen, -4.5, 0);
  stern.castShadow = true;
  group.add(stern);

  // ── Waterline boot topping (white stripe just above waterline) ────────────
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(L * 0.8, 0.5, B + 0.02),
    new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 }));
  stripe.position.set(0, -0.25, 0);
  group.add(stripe);

  // ── Main deck (local y = 0.2, top of hull) ────────────────────────────────
  const deck = new THREE.Mesh(new THREE.BoxGeometry(L * 0.84, 0.4, B), deckMat);
  deck.position.set(0, 0.2, 0);
  deck.receiveShadow = true;
  group.add(deck);

  // ── Superstructure at STERN (−X end) — bridge away from cargo bays ────────
  // Superstructure X-centre = −L/2 + sternOffset
  const sternOffset = Math.max(8, L * 0.14);
  const superX = -(L / 2) + sternOffset;
  const superW = Math.max(7, L * 0.16);  // fore-aft width of A-deck

  // A-deck
  const aDeck = new THREE.Mesh(new THREE.BoxGeometry(superW, 3.5, B * 0.88), superMat);
  aDeck.position.set(superX, 1.9, 0);
  aDeck.castShadow = true;
  group.add(aDeck);

  // B-deck (narrower)
  const bDeck = new THREE.Mesh(new THREE.BoxGeometry(superW * 0.85, 3.0, B * 0.72), superMat);
  bDeck.position.set(superX, 5.1, 0);
  bDeck.castShadow = true;
  group.add(bDeck);

  // Bridge deck
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(superW * 0.7, 2.8, B * 0.9), superMat);
  bridge.position.set(superX, 8.1, 0);
  bridge.castShadow = true;
  group.add(bridge);

  // Bridge windows (port + starboard sides)
  const winGeo = new THREE.BoxGeometry(superW * 0.68, 1.4, 0.1);
  for (const oz of [B * 0.46, -B * 0.46]) {
    const win = new THREE.Mesh(winGeo, glassMat);
    win.position.set(superX, 8.3, oz);
    group.add(win);
  }
  // Forward bridge window
  const fWin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, B * 0.82), glassMat);
  fWin.position.set(superX + superW * 0.36, 8.3, 0);
  group.add(fWin);

  // Radar mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 4.5, 6), darkMat);
  mast.position.set(superX, 12.5, 0);
  group.add(mast);

  // ── Funnel (sits on top of A/B-deck, at stern) ────────────────────────────
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 3.5, 14), funnelMat);
  funnel.position.set(superX - superW * 0.3, 11.5, 0);
  funnel.castShadow = true;
  group.add(funnel);
  const funnelCap = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, 0.5, 14), darkMat);
  funnelCap.position.set(superX - superW * 0.3, 13.5, 0);
  group.add(funnelCap);

  // ── Cargo area hatch covers ───────────────────────────────────────────────
  // Cargo bays start at the forward (bow) side, well clear of superstructure.
  const slots     = generateSlotGrid(def);
  const hatchMat  = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.95 });
  const coamMat   = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 1 });
  // Get unique bay positions from slots
  const bayXset = [...new Set(slots.map(s => s.localX))];
  for (const bx of bayXset) {
    const slotD = slots.find(s => s.localX === bx).depth;
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(slotD - 0.5, 0.18, B * 0.7), hatchMat);
    hatch.position.set(bx, 0.49, 0);
    group.add(hatch);
    const coam = new THREE.Mesh(new THREE.BoxGeometry(slotD - 0.1, 0.25, B * 0.72), coamMat);
    coam.position.set(bx, 0.32, 0);
    group.add(coam);
  }

  // ── Deck railings ─────────────────────────────────────────────────────────
  const railPostGeo = new THREE.BoxGeometry(0.08, 1.1, 0.08);
  for (const z of [-(B / 2 + 0.1), B / 2 + 0.1]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(L * 0.86, 0.06, 0.06), railMat);
    bar.position.set(0, 1.15, z);
    group.add(bar);
    for (let x = -L / 2 + 4; x < L / 2 - 4; x += 5) {
      const post = new THREE.Mesh(railPostGeo, railMat);
      post.position.set(x, 0.6, z);
      group.add(post);
    }
  }

  // ── Cell guide posts (at each tier-0 slot corner) ─────────────────────────
  const guideMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.5 });
  for (const slot of slots.filter(s => s.tier === 0)) {
    for (const [ox, oz] of [[-slot.depth/2, -SLOT.w/2], [slot.depth/2, SLOT.w/2]]) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 0.12), guideMat);
      g.position.set(slot.localX + ox, 1.5, slot.localZ + oz);
      group.add(g);
    }
  }

  // ── Anchor ────────────────────────────────────────────────────────────────
  const anchorMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7 });
  const anchorBody = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.2, 6), anchorMat);
  anchorBody.position.set(L * 0.4, -1, -B / 2 + 1);
  group.add(anchorBody);

  // ── Mooring lines ─────────────────────────────────────────────────────────
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xaa8855, roughness: 1 });
  for (const ox of [-L * 0.38, L * 0.38]) {
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 9, 4), lineMat);
    line.rotation.z = Math.PI / 4;
    line.position.set(ox, -1.5, -B / 2 - 1);
    group.add(line);
  }

  // ── Ship name on hull ─────────────────────────────────────────────────────
  const nameCanvas = document.createElement('canvas');
  nameCanvas.width = 512; nameCanvas.height = 80;
  const nc = nameCanvas.getContext('2d');
  nc.fillStyle = '#ffffff';
  nc.font = 'bold 36px serif';
  nc.fillText(def.name, 10, 56);
  const nameLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 2.8),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(nameCanvas), transparent: true })
  );
  nameLabel.position.set(0, -1.5, B / 2 + 0.05);
  group.add(nameLabel);

  // Place ship at berth, raised so it floats correctly
  group.position.set(def.berthX, SHIP_REST_Y, -12);
  scene.add(group);

  return {
    mesh:      group,
    def,
    slots,
    phase:     'berth',
    phaseT:    0,
    berthX:    def.berthX,
    restY:     SHIP_REST_Y,
    bobPhase:  Math.random() * Math.PI * 2,
    bobY:      0,
  };
}

// ── Per-frame ship animation ──────────────────────────────────────────────────
export function updateShip(ship, dt) {
  const t = performance.now() * 0.001;

  // Bob always runs — keeps restY in the position Y
  ship.bobY = Math.sin(t * 0.45 + ship.bobPhase) * 0.18
            + Math.sin(t * 0.18 + ship.bobPhase + 1.1) * 0.05;

  if (ship.phase === 'departing') {
    ship.phaseT += dt;
    ship.mesh.position.x += 22 * dt;
    ship.mesh.position.y  = ship.restY + ship.bobY;
    ship.mesh.rotation.z  = Math.sin(ship.phaseT * 0.8) * 0.012;
    if (ship.phaseT > 7) return 'departed';
    return 'departing';
  }

  if (ship.phase === 'arriving') {
    ship.phaseT += dt;
    const dist = ship.berthX - ship.mesh.position.x;
    ship.mesh.position.y = ship.restY + ship.bobY;
    ship.mesh.rotation.z = Math.sin(ship.phaseT * 0.5) * 0.008;
    if (Math.abs(dist) < 0.5) {
      ship.mesh.position.x = ship.berthX;
      ship.mesh.rotation.z = 0;
      ship.phase  = 'berth';
      ship.phaseT = 0;
      return 'arrived';
    }
    const speed = Math.max(4, Math.min(22, Math.abs(dist) * 1.5));
    ship.mesh.position.x += Math.sign(dist) * speed * dt;
    return 'arriving';
  }

  // Normal berth — gentle bob and subtle roll
  ship.mesh.position.y = ship.restY + ship.bobY;
  ship.mesh.rotation.z = Math.sin(t * 0.22 + ship.bobPhase) * 0.008;
  return 'berth';
}

// ── Generate cargo slot grid ──────────────────────────────────────────────────
function generateSlotGrid(def) {
  const slots = [];
  const L = def.length;

  // Cargo area starts at bow end (positive X), well clear of the stern superstructure.
  // Superstructure occupies roughly the aft 35% of the ship.
  // Start slots from approx 60% of L towards the bow from centre.
  // localX is in ship-local space (centred at 0).
  let localX = -(L / 2) + L * 0.38;  // start cargo 38% from stern

  for (let bay = 0; bay < def.bays; bay++) {
    const is40  = def.mixedSizes && bay % 3 === 0;
    const depth = is40 ? SLOT40.d : SLOT.d;

    for (let row = 0; row < def.rows; row++) {
      const localZ = -(def.beam / 2) + 2 + row * (SLOT.w + 0.15);

      for (let tier = 0; tier < def.maxTier; tier++) {
        slots.push({
          bay, row, tier,
          localX: localX + depth / 2,
          localZ,
          localY: 0.45 + tier * SLOT.h,   // 0.45 = just above deck surface (deck mesh top ≈ 0.4)
          depth,
          width:  SLOT.w,
          occupied: false,
          containerId: null,
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
