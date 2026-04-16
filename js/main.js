import * as THREE from 'three';
import { buildScene, animateScene } from './scene.js';
import { buildShip, updateShip, SHIP_DEFS } from './ship.js';
import { spawnContainersOnShip, buildYardGrid, yardSlotWorldPos, containerSize } from './container.js';
import { Crane } from './crane.js';
import { PhysicsWorld } from './physics.js';
import { Controls } from './controls.js';
import { UI, scorePickup, scorePlacement } from './ui.js';
import { SoundSystem } from './sounds.js';
import { TruckManager } from './truck.js';
import { WeatherSystem } from './weather.js';

// ── Renderer ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ── Camera ────────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);

// ── Scene bootstrap ───────────────────────────────────────────────────────────
const scene = buildScene(renderer);

// Build all three ship meshes; position idle ships far off-screen
const ships = SHIP_DEFS.map(def => buildShip(def, scene));
ships[1].mesh.position.set(999, 0, -12);
ships[2].mesh.position.set(999, 0, -12);

// Active ship tracking
let activeShipIdx = 0;
let activeShip    = ships[0];

// All live containers (grows as new ships arrive)
let allContainers = [];
let totalContainersEver = 0;  // cumulative for manifest

// Spawn containers on the first ship
function spawnForShip(ship) {
  const cs = spawnContainersOnShip(ship, scene);
  allContainers.push(...cs);
  totalContainersEver += cs.length;
  ui.setTotal(totalContainersEver);
  ui.buildManifest(cs, [ship]);
  updateShipStateUI('AT BERTH');
}

const yardGrid = buildYardGrid();
const crane    = new Crane(scene);
const physics  = new PhysicsWorld();
const controls = new Controls(canvas);
const ui       = new UI();
const sounds   = new SoundSystem();
const trucks   = new TruckManager(scene);
let weather    = null; // created after sounds.init()

// ── Game state ────────────────────────────────────────────────────────────────
let heldContainer  = null;
let spaceWasDown   = false;
let hWasDown       = false;
let gameStarted    = false;
const fallingContainers = new Map();

// Damage tracking
let currentDamage     = 0;
let containerOnTruck  = false;
let lastSpreaderY     = null;

// Ship departure state
let shipDepartPending = false;
let shipStateTimer    = 5;  // grace period before first empty-check

// ── HUD helpers ───────────────────────────────────────────────────────────────
function updateShipStateUI(txt) {
  const el = document.getElementById('ship-state');
  if (el) el.textContent = txt;
}

// ── Loading screen ────────────────────────────────────────────────────────────
function fakeLoad() {
  const fill = document.querySelector('.loading-fill');
  let pct = 0;
  const id = setInterval(() => {
    pct += Math.random() * 18;
    fill.style.width = Math.min(pct, 100) + '%';
    if (pct >= 100) {
      clearInterval(id);
      setTimeout(() => {
        document.getElementById('loading-screen').style.display = 'none';
      }, 300);
    }
  }, 120);
}
fakeLoad();

document.getElementById('start-btn').addEventListener('click', () => {
  document.getElementById('start-overlay').style.display = 'none';
  sounds.init();
  sounds.resume();
  weather = new WeatherSystem(scene, sounds);
  spawnForShip(activeShip);
  ui.show();
  gameStarted = true;
});

// ── Help panel ────────────────────────────────────────────────────────────────
const helpPanel = document.getElementById('help-panel');
function toggleHelp() { helpPanel.classList.toggle('hidden'); }
document.getElementById('help-btn').addEventListener('click', toggleHelp);
document.getElementById('help-close').addEventListener('click', () => helpPanel.classList.add('hidden'));

// ── Constants ─────────────────────────────────────────────────────────────────
const TROLLEY_WORLD_Y   = 29.6;
const TRUCK_FLATBED_TOP = 1.375;

// ── Floor detection ───────────────────────────────────────────────────────────
function getFloorBelow(worldX, worldZ, skipContainerId = null) {
  let floor = 0;

  for (const c of allContainers) {
    if (c.userData.attached) continue;
    if (fallingContainers.has(c)) continue;
    if (skipContainerId !== null && c.userData.containerId === skipContainerId) continue;
    const sz = containerSize(c.userData.is40ft);
    const dx = Math.abs(c.position.x - worldX);
    const dz = Math.abs(c.position.z - worldZ);
    if (dx < sz.d / 2 + 0.4 && dz < sz.w / 2 + 0.4) {
      floor = Math.max(floor, c.position.y + sz.h / 2);
    }
  }

  // Ship deck — account for bobbing Y
  const sp = new THREE.Vector3();
  activeShip.mesh.getWorldPosition(sp);
  if (Math.abs(worldX - sp.x) < activeShip.def.length / 2 &&
      Math.abs(worldZ - sp.z) < activeShip.def.beam / 2) {
    floor = Math.max(floor, sp.y + 0.4);
  }

  // Truck flatbeds
  for (const t of trucks.trucks) {
    if (t.userData.loaded || t.userData.phase !== 'idle') continue;
    const fo = t.userData.flatbedOffset;
    const dx = Math.abs(worldX - (t.position.x + fo));
    const dz = Math.abs(worldZ - t.position.z);
    const halfW = t.userData.size === 'large' ? 7.5 : 4.5;
    if (dx < halfW && dz < 1.8) {
      floor = Math.max(floor, TRUCK_FLATBED_TOP);
    }
  }

  return floor;
}

function getActiveTruckBelow(worldX, worldZ, is40ft) {
  const needSize = is40ft ? 'large' : 'small';
  for (const t of trucks.trucks) {
    if (t.userData.loaded || t.userData.phase !== 'idle') continue;
    if (t.userData.size !== needSize) continue;
    const fo   = t.userData.flatbedOffset;
    const dx   = Math.abs(worldX - (t.position.x + fo));
    const dz   = Math.abs(worldZ - t.position.z);
    const halfW = is40ft ? 7.5 : 4.5;
    if (dx < halfW && dz < 1.8) return t;
  }
  return null;
}

function findNearestContainer(spreaderPos) {
  let best = null, bestDist = 4.0;
  for (const c of allContainers) {
    if (c.userData.inShipSlot || c.userData.attached || fallingContainers.has(c)) continue;
    const sz   = containerSize(c.userData.is40ft);
    const topY = c.position.y + sz.h / 2;
    const dx   = Math.abs(c.position.x - spreaderPos.x);
    const dz   = Math.abs(c.position.z - spreaderPos.z);
    const dy   = Math.abs(topY - spreaderPos.y);
    const dist = Math.sqrt(dx*dx + dz*dz + dy*dy);
    if (dist < bestDist) { bestDist = dist; best = c; }
  }
  return best;
}

function findNearestYardCell(worldPos) {
  let best = null, bestDist = 12;
  for (const cell of yardGrid) {
    if (cell.stack.length >= 4) continue;
    const dx   = cell.x - worldPos.x;
    const dz   = cell.z - worldPos.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist < bestDist) { bestDist = dist; best = cell; }
  }
  return best;
}

function findNearestShipSlot(worldPos) {
  let best = null, bestDist = 8;
  const shipWorldPos = new THREE.Vector3();
  activeShip.mesh.getWorldPosition(shipWorldPos);
  for (const slot of activeShip.slots) {
    if (slot.occupied) continue;
    const wx = shipWorldPos.x + slot.localX;
    const wz = shipWorldPos.z + slot.localZ;
    const wy = shipWorldPos.y + slot.localY;
    const dx = wx - worldPos.x, dy = wy - worldPos.y, dz = wz - worldPos.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (dist < bestDist) { bestDist = dist; best = { slot, wx, wy, wz }; }
  }
  return best;
}

function removeFromYard(c) {
  for (const cell of yardGrid) {
    const idx = cell.stack.indexOf(c.userData.containerId);
    if (idx !== -1) {
      cell.stack.splice(idx, 1);
      for (const otherId of cell.stack.slice(idx)) {
        const other = allContainers.find(o => o.userData.containerId === otherId);
        if (other) {
          const sz = containerSize(other.userData.is40ft);
          const ni = cell.stack.indexOf(otherId);
          other.position.y = sz.h / 2 + ni * sz.h;
        }
      }
      break;
    }
  }
}

// ── Ship unload detection ─────────────────────────────────────────────────────
function isShipEmpty() {
  // Ship is empty when no containers remain physically on the ship deck
  return !allContainers.some(c =>
    c.userData.onShip === activeShip.def.id && c.userData.onShipDeck === true
  );
}

function startShipDeparture() {
  if (activeShip.phase !== 'berth') return;
  activeShip.phase = 'departing';
  activeShip.phaseT = 0;
  sounds.playShipDeparture();
  updateShipStateUI('DEPARTING…');
  ui.addScore(500, 'SHIP CLEARED!');
}

function arriveNextShip() {
  activeShipIdx = (activeShipIdx + 1) % SHIP_DEFS.length;
  activeShip = ships[activeShipIdx];

  // Reset slots
  for (const slot of activeShip.slots) { slot.occupied = false; slot.containerId = null; }

  // Position new ship arriving from sea side (-X)
  activeShip.mesh.position.set(activeShip.berthX - 180, 0, -12);
  activeShip.mesh.rotation.z = 0;
  activeShip.phase  = 'arriving';
  activeShip.phaseT = 0;
  updateShipStateUI('INCOMING…');
}

// ── Container attach/release ──────────────────────────────────────────────────
function attachContainer(c) {
  if (c.userData.inYard) {
    removeFromYard(c);
    c.userData.inYard = false;
  }
  // Picking up from ship deck — mark as no longer on deck
  c.userData.onShipDeck = false;
  c.userData.attached   = true;
  physics.isLoaded    = true;
  heldContainer       = c;
  ui.updateSpreader(true);
  crane.setSpreaderLocked(true);
  sounds.playPickup();

  currentDamage    = 0;
  containerOnTruck = false;
  lastSpreaderY    = null;
  ui.updateDamage(0);
  ui.showDamageBar();

  const pts = scorePickup(physics.getSwingScore());
  ui.addScore(pts, 'PICKUP');
}

function releaseContainer(spreaderPos) {
  if (!heldContainer) return;

  const c = heldContainer;
  c.userData.attached = false;
  physics.isLoaded    = false;
  heldContainer       = null;
  containerOnTruck    = false;
  lastSpreaderY       = null;
  ui.updateSpreader(false);
  crane.setSpreaderLocked(false);
  c.rotation.set(0, 0, 0);
  ui.hideDamageBar();

  const swingScore = physics.getSwingScore();

  // 1. Ship slot
  const slotHit = findNearestShipSlot(spreaderPos);
  if (slotHit) {
    const { slot, wx, wy, wz } = slotHit;
    const sz = containerSize(c.userData.is40ft);
    c.position.set(wx, wy + sz.h / 2, wz);
    slot.occupied    = true;
    slot.containerId = c.userData.containerId;
    c.userData.inShipSlot = true;
    c.userData.onShip     = activeShip.def.id;
    sounds.playPlace();
    const pts = scorePlacement(swingScore, true);
    ui.addScore(pts, 'PLACED ✓');
    ui.containerPlaced();
    ui.markContainerDone(c.userData.containerId);
    physics.reset();
    return;
  }

  // 2. Truck — size-matched, accumulated damage
  const truckHit = trucks.findNearby(spreaderPos, c.userData.is40ft);
  if (truckHit) {
    const { truck, quality } = truckHit;
    if (currentDamage >= 0.9) {
      sounds.playDropPenalty();
      ui.addScore(-80, 'SLID OFF!');
      fallingContainers.set(c, { vy: -2, targetY: null, snapX: null, snapZ: null });
      physics.reset();
      return;
    }
    trucks.loadContainer(truck, c, currentDamage);
    c.userData.onTruck = true;
    sounds.playTruckLoaded();
    const baseScore = Math.round(350 * (1 - currentDamage) * (0.5 + swingScore * 0.5));
    const label = currentDamage < 0.1 ? 'PERFECT LOAD!' : currentDamage < 0.35 ? 'GOOD LOAD!' : 'TRUCK LOADED';
    ui.addScore(baseScore, label);
    ui.containerPlaced();
    physics.reset();
    return;
  }

  // 3. Yard
  const cell = findNearestYardCell(spreaderPos);
  if (cell) {
    const stackIdx  = cell.stack.length;
    const targetPos = yardSlotWorldPos(cell, stackIdx);
    cell.stack.push(c.userData.containerId);
    c.userData.inYard = true;
    fallingContainers.set(c, { vy: 0, targetY: targetPos.y, snapX: targetPos.x, snapZ: targetPos.z });
    c.position.x = targetPos.x;
    c.position.z = targetPos.z;
    const pts = scorePlacement(swingScore, false);
    ui.addScore(pts, 'YARD');
    physics.reset();
    return;
  }

  // 4. Free drop — penalty
  sounds.playDropPenalty();
  ui.addScore(-50, 'DROPPED!');
  fallingContainers.set(c, { vy: 0, targetY: null, snapX: null, snapZ: null });
  physics.reset();
}

// ── Game over ─────────────────────────────────────────────────────────────────
function triggerGameOver() {
  gameStarted = false;
  if (heldContainer) {
    heldContainer.userData.attached = false;
    physics.isLoaded = false;
    heldContainer = null;
  }
  ui.hideDamageBar();
  ui.showGameOver(ui.getScore());
}

// ── Falling container gravity ─────────────────────────────────────────────────
function updateFalling(dt) {
  for (const [c, state] of fallingContainers) {
    state.vy -= 18 * dt;
    c.position.y += state.vy * dt;

    const sz     = containerSize(c.userData.is40ft);
    const floorY = state.targetY !== null
      ? state.targetY
      : getFloorBelow(c.position.x, c.position.z, c.userData.containerId) + sz.h / 2;

    if (c.position.y <= floorY) {
      c.position.y = floorY;
      if (state.snapX !== null) {
        c.position.x = state.snapX;
        c.position.z = state.snapZ;
      }
      sounds.playPlace();
      fallingContainers.delete(c);
    }
  }
}

// ── Game Loop ─────────────────────────────────────────────────────────────────
let lastTime = performance.now();

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt  = Math.min((now - lastTime) / 1000, 0.05);
  lastTime  = now;

  if (!gameStarted) { renderer.render(scene, camera); return; }

  sounds.resume();

  // ── Weather ──────────────────────────────────────────────────────────────
  if (weather) weather.update(dt);

  // ── Ship bobbing + departure/arrival ─────────────────────────────────────
  const shipStatus = updateShip(activeShip, dt);

  // Sync containers still physically on the ship deck to its bobbing Y
  for (const c of allContainers) {
    if (c.userData.onShipDeck === true &&
        c.userData.onShip === activeShip.def.id &&
        !c.userData.attached &&
        !fallingContainers.has(c)) {
      c.position.y = c.userData.originalY + activeShip.bobY;
    }
  }

  if (shipStatus === 'departed') {
    arriveNextShip();
  }

  if (shipStatus === 'arrived') {
    spawnForShip(activeShip);
    updateShipStateUI('AT BERTH');
    shipStateTimer    = 5;   // fresh grace period before departure check
    shipDepartPending = false;
  }

  // Check if active ship is empty and should depart
  shipStateTimer -= dt;
  if (activeShip.phase === 'berth' && shipStateTimer <= 0 && !shipDepartPending) {
    shipStateTimer = 2; // check every 2 seconds
    if (isShipEmpty() && allContainers.some(c => c.userData.onShip === activeShip.def.id)) {
      shipDepartPending = true;
      setTimeout(() => {
        startShipDeparture();
        shipDepartPending = false;
      }, 2000); // 2s pause before sailing away
    }
  }

  // ── Crane movement ────────────────────────────────────────────────────────
  crane.update(dt, controls, physics);

  // ── Wind nudges pendulum ──────────────────────────────────────────────────
  if (weather) {
    physics.applyImpulse(weather.wind.x * 0.0006 * dt, weather.wind.z * 0.0006 * dt);
  }

  // ── Collision: spreader can't pass through surfaces ───────────────────────
  {
    const sp = crane.getSpreaderWorldPos();
    let minSpreaderY;
    if (heldContainer) {
      const sz  = containerSize(heldContainer.userData.is40ft);
      const floor = getFloorBelow(sp.x, sp.z, heldContainer.userData.containerId);
      minSpreaderY = floor + sz.h + 0.05;
    } else {
      const floor = getFloorBelow(sp.x, sp.z);
      minSpreaderY = floor + 0.2;
    }
    const maxHoist = TROLLEY_WORLD_Y - minSpreaderY;
    if (crane.hoistHeight > maxHoist) {
      crane.hoistHeight = maxHoist;
      crane.refreshSpreaderPos(physics);
    }
  }

  // ── Container–truck impact detection ─────────────────────────────────────
  if (heldContainer) {
    const sp  = crane.getSpreaderWorldPos();
    const sz  = containerSize(heldContainer.userData.is40ft);
    const containerBottomY = sp.y - sz.h;
    const truckBelow = getActiveTruckBelow(sp.x, sp.z, heldContainer.userData.is40ft);
    const nowOnTruck = truckBelow !== null && containerBottomY <= TRUCK_FLATBED_TOP + 0.08;

    if (nowOnTruck && !containerOnTruck) {
      const descentSpeed = lastSpreaderY !== null
        ? Math.max(0, (lastSpreaderY - sp.y) / dt)
        : 0;
      const speedFactor  = Math.min(descentSpeed / 4.0, 1.0);
      const fo     = truckBelow.userData.flatbedOffset;
      const idealX = truckBelow.position.x + fo;
      const idealZ = truckBelow.position.z;
      const offsetDist   = Math.sqrt((sp.x - idealX) ** 2 + (sp.z - idealZ) ** 2);
      const offsetFactor = Math.min(offsetDist / 5.0, 1.0);
      const impactDamage = (speedFactor * 0.65 + offsetFactor * 0.35) * 0.45;

      if (impactDamage > 0.02) {
        currentDamage = Math.min(1.0, currentDamage + impactDamage);
        ui.updateDamage(currentDamage);
        sounds.playCrash(speedFactor);
        trucks.shakeTruck(truckBelow, speedFactor);
        if (currentDamage >= 1.0) triggerGameOver();
      }
    }
    containerOnTruck = nowOnTruck;
    lastSpreaderY    = sp.y;
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  controls.consumeMouseDelta();
  const cabinPos = crane.getCameraPosition();
  camera.position.copy(cabinPos);
  const lookDir = new THREE.Vector3(
    Math.sin(controls.yaw)  * Math.cos(controls.pitch),
    Math.sin(controls.pitch),
    Math.cos(controls.yaw)  * Math.cos(controls.pitch)
  );
  camera.lookAt(cabinPos.clone().add(lookDir));

  // ── Physics ───────────────────────────────────────────────────────────────
  const trolleyPos = crane.getTrolleyWorldPos();
  physics.update(dt, trolleyPos.x, trolleyPos.z, crane.hoistHeight);

  // ── Move held container ───────────────────────────────────────────────────
  if (heldContainer) {
    const sp = crane.getSpreaderWorldPos();
    const sz = containerSize(heldContainer.userData.is40ft);
    heldContainer.position.set(sp.x, sp.y - sz.h / 2, sp.z);
    heldContainer.rotation.x = physics.pendulum.angleX * 0.25;
    heldContainer.rotation.z = physics.pendulum.angleZ * 0.25;
  }

  // ── Gravity ───────────────────────────────────────────────────────────────
  updateFalling(dt);

  // ── Trucks ────────────────────────────────────────────────────────────────
  trucks.update(dt);

  // ── Laser guide ───────────────────────────────────────────────────────────
  {
    const sp = crane.getSpreaderWorldPos();
    const skipId = heldContainer ? heldContainer.userData.containerId : null;
    const floorY = getFloorBelow(sp.x, sp.z, skipId);
    const is40ft = heldContainer?.userData.is40ft ?? false;

    // Quality: check truck proximity first, then container proximity
    let quality = 'none';
    const truckHit = trucks.findNearby(sp, is40ft);
    if (truckHit) {
      quality = truckHit.quality;
    } else if (!heldContainer) {
      // No container held — colour laser by how close we are to picking one up
      const nearest = findNearestContainer(sp);
      if (nearest) {
        const sz  = containerSize(nearest.userData.is40ft);
        const top = nearest.position.y + sz.h / 2;
        const d   = Math.sqrt((nearest.position.x - sp.x)**2 + (top - sp.y)**2 + (nearest.position.z - sp.z)**2);
        quality = d < 1.5 ? 'perfect' : d < 2.5 ? 'good' : d < 4.0 ? 'near' : 'none';
      }
    }
    crane.updateLaser(sp.y, floorY, quality);
  }

  // ── Sound motors ──────────────────────────────────────────────────────────
  sounds.tick(dt);
  const traveling  = controls.isDown('KeyA') || controls.isDown('KeyD');
  const trolleying = controls.isDown('KeyW') || controls.isDown('KeyS');
  const hoisting   = controls.isDown('KeyQ') || controls.isDown('KeyE');
  sounds.setMotors(traveling, trolleying, hoisting);

  // ── Spacebar: attach / release ────────────────────────────────────────────
  const spaceDown = controls.isDown('Space');
  if (spaceDown && !spaceWasDown) {
    if (!heldContainer) {
      const sp = crane.getSpreaderWorldPos();
      const nearest = findNearestContainer(sp);
      if (nearest) attachContainer(nearest);
    } else {
      releaseContainer(crane.getSpreaderWorldPos());
    }
  }
  spaceWasDown = spaceDown;

  // ── H key — help panel ────────────────────────────────────────────────────
  const hDown = controls.isDown('KeyH');
  if (hDown && !hWasDown) toggleHelp();
  hWasDown = hDown;

  // ── HUD update ────────────────────────────────────────────────────────────
  ui.updateCrane(crane.railPos, crane.trolleyPos, crane.hoistHeight);
  ui.updateSwing(physics.getSwingScore());

  animateScene(scene, now * 0.001);
  renderer.render(scene, camera);
}

loop();
