import * as THREE from 'three';
import { buildScene, animateScene } from './scene.js';
import { buildShip, SHIP_DEFS } from './ship.js';
import { spawnContainersOnShip, buildYardGrid, yardSlotWorldPos, containerSize } from './container.js';
import { Crane } from './crane.js';
import { PhysicsWorld } from './physics.js';
import { Controls } from './controls.js';
import { UI, scorePickup, scorePlacement } from './ui.js';
import { SoundSystem } from './sounds.js';
import { TruckManager } from './truck.js';

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
const ships = SHIP_DEFS.map(def => buildShip(def, scene));

let allContainers = [];
ships.forEach(ship => {
  const cs = spawnContainersOnShip(ship, scene);
  allContainers.push(...cs);
});

const yardGrid   = buildYardGrid();
const crane      = new Crane(scene);
const physics    = new PhysicsWorld();
const controls   = new Controls(canvas);
const ui         = new UI();
const sounds     = new SoundSystem();
const trucks     = new TruckManager(scene);

ui.setTotal(allContainers.length);

// ── Game state ────────────────────────────────────────────────────────────────
let heldContainer  = null;
let spaceWasDown   = false;
let hWasDown       = false;
let gameStarted    = false;
const fallingContainers = new Map();

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
  ui.show();
  ui.buildManifest(allContainers, ships);
  sounds.init();
  sounds.resume();
  gameStarted = true;
});

// ── Help panel toggle ─────────────────────────────────────────────────────────
const helpPanel = document.getElementById('help-panel');
function toggleHelp() { helpPanel.classList.toggle('hidden'); }
document.getElementById('help-btn').addEventListener('click', toggleHelp);
document.getElementById('help-close').addEventListener('click', () => helpPanel.classList.add('hidden'));

// ── Helpers ───────────────────────────────────────────────────────────────────

// Trolley sits at world Y=30 in the crane group; spreader hangs below it.
// spreaderWorldY = 29.6 - hoistHeight  (trolley Y 30, minus hoistHeight, minus 0.4 offset)
const TROLLEY_WORLD_Y = 29.6;

// Returns the highest surface Y directly beneath the given world X,Z.
// Checks ground, ship decks, and the tops of all stationary containers.
function getFloorBelow(worldX, worldZ, skipContainerId = null) {
  let floor = 0; // quayside / open ground

  // Container tops
  for (const c of allContainers) {
    if (c.userData.attached) continue;              // skip held container
    if (fallingContainers.has(c)) continue;         // skip mid-air containers
    if (skipContainerId !== null && c.userData.containerId === skipContainerId) continue;

    const sz = containerSize(c.userData.is40ft);
    const dx = Math.abs(c.position.x - worldX);
    const dz = Math.abs(c.position.z - worldZ);

    // Horizontal footprint check with small tolerance
    if (dx < sz.d / 2 + 0.4 && dz < sz.w / 2 + 0.4) {
      floor = Math.max(floor, c.position.y + sz.h / 2);
    }
  }

  // Ship decks
  for (const ship of ships) {
    const sp = new THREE.Vector3();
    ship.mesh.getWorldPosition(sp);
    if (Math.abs(worldX - sp.x) < ship.def.length / 2 &&
        Math.abs(worldZ - sp.z) < ship.def.beam / 2) {
      floor = Math.max(floor, 0.4); // deck surface
    }
  }

  return floor;
}

function findNearestContainer(spreaderPos) {
  let best = null, bestDist = 4.0;
  for (const c of allContainers) {
    if (c.userData.inShipSlot || c.userData.attached || fallingContainers.has(c)) continue;
    const sz  = containerSize(c.userData.is40ft);
    const topY = c.position.y + sz.h / 2;
    const dx = Math.abs(c.position.x - spreaderPos.x);
    const dz = Math.abs(c.position.z - spreaderPos.z);
    const dy = Math.abs(topY - spreaderPos.y);
    const dist = Math.sqrt(dx*dx + dz*dz + dy*dy);
    if (dist < bestDist) { bestDist = dist; best = c; }
  }
  return best;
}

function findNearestYardCell(worldPos) {
  let best = null, bestDist = 12;
  for (const cell of yardGrid) {
    if (cell.stack.length >= 4) continue;
    const dx = cell.x - worldPos.x;
    const dz = cell.z - worldPos.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist < bestDist) { bestDist = dist; best = cell; }
  }
  return best;
}

function findNearestShipSlot(worldPos) {
  let best = null, bestDist = 8;
  for (const ship of ships) {
    const shipWorldPos = new THREE.Vector3();
    ship.mesh.getWorldPosition(shipWorldPos);
    for (const slot of ship.slots) {
      if (slot.occupied) continue;
      const wx = shipWorldPos.x + slot.localX;
      const wz = shipWorldPos.z + slot.localZ;
      const wy = shipWorldPos.y + slot.localY;
      const dx = wx - worldPos.x, dy = wy - worldPos.y, dz = wz - worldPos.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist < bestDist) { bestDist = dist; best = { slot, ship, wx, wy, wz }; }
    }
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
          const newIdx = cell.stack.indexOf(otherId);
          other.position.y = sz.h / 2 + newIdx * sz.h;
        }
      }
      break;
    }
  }
}

function attachContainer(c) {
  if (c.userData.inYard) {
    removeFromYard(c);
    c.userData.inYard = false;
  }
  c.userData.attached = true;
  physics.isLoaded = true;
  heldContainer = c;
  ui.updateSpreader(true);
  crane.setSpreaderLocked(true);
  sounds.playPickup();

  const pts = scorePickup(physics.getSwingScore());
  ui.addScore(pts, 'PICKUP');
}

function releaseContainer(spreaderPos) {
  if (!heldContainer) return;

  const c = heldContainer;
  c.userData.attached = false;
  physics.isLoaded = false;
  heldContainer = null;
  ui.updateSpreader(false);
  crane.setSpreaderLocked(false);
  c.rotation.set(0, 0, 0);

  const swingScore = physics.getSwingScore();

  // 1. Ship slot
  const slotHit = findNearestShipSlot(spreaderPos);
  if (slotHit) {
    const { slot, ship, wx, wy, wz } = slotHit;
    const sz = containerSize(c.userData.is40ft);
    c.position.set(wx, wy + sz.h / 2, wz);
    slot.occupied = true;
    slot.containerId = c.userData.containerId;
    c.userData.inShipSlot = true;
    c.userData.onShip = ship.def.id;
    sounds.playPlace();
    const pts = scorePlacement(swingScore, true);
    ui.addScore(pts, 'PLACED ✓');
    ui.containerPlaced();
    ui.markContainerDone(c.userData.containerId);
    physics.reset();
    return;
  }

  // 2. Truck
  const truck = trucks.findNearby(spreaderPos);
  if (truck) {
    trucks.loadContainer(truck, c);
    c.userData.onTruck = true;
    sounds.playTruckLoaded();
    const pts = Math.round(scorePlacement(swingScore, true) * 1.3);
    ui.addScore(pts, 'TRUCK BONUS!');
    ui.containerPlaced();
    physics.reset();
    return;
  }

  // 3. Yard cell
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

  // 4. Drop — gravity, penalty
  sounds.playDropPenalty();
  ui.addScore(-50, 'DROPPED!');
  fallingContainers.set(c, { vy: 0, targetY: null, snapX: null, snapZ: null });
  physics.reset();
}

// ── Gravity for released containers ──────────────────────────────────────────
function updateFalling(dt) {
  for (const [c, state] of fallingContainers) {
    state.vy -= 18 * dt;
    c.position.y += state.vy * dt;

    const sz     = containerSize(c.userData.is40ft);
    const floorY = state.targetY !== null
      ? state.targetY
      : groundLevelAt() + sz.h / 2;

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

  // Crane movement
  crane.update(dt, controls, physics);

  // ── Collision: stop spreader/container passing through surfaces ────────────
  {
    const sp = crane.getSpreaderWorldPos();
    let minSpreaderY;

    if (heldContainer) {
      // Container hangs from spreader — its bottom must stay above the floor
      const sz = containerSize(heldContainer.userData.is40ft);
      const floor = getFloorBelow(sp.x, sp.z, heldContainer.userData.containerId);
      minSpreaderY = floor + sz.h + 0.05;  // spreader must be one container-height above floor
    } else {
      // Bare spreader — its underside must not penetrate surfaces
      const floor = getFloorBelow(sp.x, sp.z);
      minSpreaderY = floor + 0.2;           // 0.2m clearance under spreader bar
    }

    // spreaderWorldY = TROLLEY_WORLD_Y - hoistHeight
    // To keep spreaderY >= minSpreaderY:  hoistHeight <= TROLLEY_WORLD_Y - minSpreaderY
    const maxHoist = TROLLEY_WORLD_Y - minSpreaderY;
    if (crane.hoistHeight > maxHoist) {
      crane.hoistHeight = maxHoist;
      crane.refreshSpreaderPos(physics);    // re-apply transforms immediately
    }
  }

  // Camera
  controls.consumeMouseDelta();
  const cabinPos = crane.getCameraPosition();
  camera.position.copy(cabinPos);
  const lookDir = new THREE.Vector3(
    Math.sin(controls.yaw)  * Math.cos(controls.pitch),
    Math.sin(controls.pitch),
    Math.cos(controls.yaw)  * Math.cos(controls.pitch)
  );
  camera.lookAt(cabinPos.clone().add(lookDir));

  // Physics
  const trolleyPos = crane.getTrolleyWorldPos();
  physics.update(dt, trolleyPos.x, trolleyPos.z, crane.hoistHeight);

  // Move held container
  if (heldContainer) {
    const sp = crane.getSpreaderWorldPos();
    const sz = containerSize(heldContainer.userData.is40ft);
    heldContainer.position.set(sp.x, sp.y - sz.h / 2, sp.z);
    heldContainer.rotation.x = physics.pendulum.angleX * 0.25;
    heldContainer.rotation.z = physics.pendulum.angleZ * 0.25;
  }

  // Gravity
  updateFalling(dt);

  // Trucks
  trucks.update(dt);

  // Ambient sound tick
  sounds.tick(dt);

  // Motor sounds
  const traveling  = controls.isDown('KeyA') || controls.isDown('KeyD');
  const trolleying = controls.isDown('KeyW') || controls.isDown('KeyS');
  const hoisting   = controls.isDown('KeyQ') || controls.isDown('KeyE');
  sounds.setMotors(traveling, trolleying, hoisting);

  // Spacebar
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

  // H key — help panel
  const hDown = controls.isDown('KeyH');
  if (hDown && !hWasDown) toggleHelp();
  hWasDown = hDown;

  // HUD
  ui.updateCrane(crane.railPos, crane.trolleyPos, crane.hoistHeight);
  ui.updateSwing(physics.getSwingScore());

  animateScene(scene, now * 0.001);
  renderer.render(scene, camera);
}

loop();
