import * as THREE from 'three';
import { buildScene, animateScene } from './scene.js';
import { buildShip, SHIP_DEFS } from './ship.js';
import { spawnContainersOnShip, buildYardGrid, yardSlotWorldPos, containerSize } from './container.js';
import { Crane } from './crane.js';
import { PhysicsWorld } from './physics.js';
import { Controls } from './controls.js';
import { UI, scorePickup, scorePlacement } from './ui.js';

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

// Ships
const ships = SHIP_DEFS.map(def => buildShip(def, scene));

// All containers (spawned on ships)
let allContainers = [];
ships.forEach(ship => {
  const cs = spawnContainersOnShip(ship, scene);
  allContainers.push(...cs);
});

// Yard grid
const yardGrid = buildYardGrid();

// Crane
const crane = new Crane(scene);

// Physics
const physics = new PhysicsWorld();

// Controls
const controls = new Controls(canvas);

// UI
const ui = new UI();
ui.setTotal(allContainers.length);

// ── Game state ────────────────────────────────────────────────────────────────
let heldContainer = null;         // THREE.Group currently attached to spreader
let spaceWasDown  = false;        // edge detection for spacebar
let gameStarted   = false;

// Raycaster for proximity detection
const raycaster = new THREE.Raycaster();

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
  gameStarted = true;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Find the nearest container below/near the spreader (within ~3m)
function findNearestContainer(spreaderPos) {
  let best = null;
  let bestDist = 3.5;
  for (const c of allContainers) {
    if (c.userData.placed || c.userData.attached) continue;
    const topY = c.position.y + containerSize(c.userData.is40ft).h / 2;
    const dx = Math.abs(c.position.x - spreaderPos.x);
    const dz = Math.abs(c.position.z - spreaderPos.z);
    const dy = Math.abs(topY - spreaderPos.y);
    const dist = Math.sqrt(dx * dx + dz * dz + dy * dy);
    if (dist < bestDist) { bestDist = dist; best = c; }
  }
  return best;
}

// Find nearest open yard cell for deposit
function findNearestYardCell(worldPos) {
  let best = null;
  let bestDist = 12;
  for (const cell of yardGrid) {
    if (cell.stack.length >= 4) continue;
    const dx = cell.x - worldPos.x;
    const dz = cell.z - worldPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < bestDist) { bestDist = dist; best = cell; }
  }
  return best;
}

// Find nearest open ship slot near world pos
function findNearestShipSlot(worldPos) {
  let best = null;
  let bestDist = 8;
  for (const ship of ships) {
    const shipWorldPos = new THREE.Vector3();
    ship.mesh.getWorldPosition(shipWorldPos);
    for (const slot of ship.slots) {
      if (slot.occupied) continue;
      const wx = shipWorldPos.x + slot.localX;
      const wz = shipWorldPos.z + slot.localZ;
      const wy = shipWorldPos.y + slot.localY;
      const dx = wx - worldPos.x;
      const dy = wy - worldPos.y;
      const dz = wz - worldPos.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist < bestDist) { bestDist = dist; best = { slot, ship, wx, wy, wz }; }
    }
  }
  return best;
}

// Attach container to spreader
function attachContainer(c) {
  c.userData.attached = true;
  physics.isLoaded = true;
  heldContainer = c;
  ui.updateSpreader(true);
  crane.setSpreaderLocked(true);

  const swingScore = physics.getSwingScore();
  const pts = scorePickup(swingScore);
  ui.addScore(pts, 'PICKUP');
}

// Release container — place on ship slot, yard cell, or drop in place
function releaseContainer(spreaderPos) {
  if (!heldContainer) return;

  const c = heldContainer;
  c.userData.attached = false;
  physics.isLoaded = false;
  heldContainer = null;
  ui.updateSpreader(false);
  crane.setSpreaderLocked(false);

  const swingScore = physics.getSwingScore();

  // Try ship slot first
  const slotHit = findNearestShipSlot(spreaderPos);
  if (slotHit) {
    const { slot, ship, wx, wy, wz } = slotHit;
    const sz = containerSize(c.userData.is40ft);
    c.position.set(wx, wy + sz.h / 2, wz);
    c.rotation.set(0, 0, 0);
    slot.occupied = true;
    slot.containerId = c.userData.containerId;
    c.userData.placed = true;
    c.userData.onShip = ship.def.id;

    const pts = scorePlacement(swingScore, true);
    ui.addScore(pts, 'PLACED ✓');
    ui.containerPlaced();
    ui.markContainerDone(c.userData.containerId);
    physics.reset();
    return;
  }

  // Try yard cell
  const cell = findNearestYardCell(spreaderPos);
  if (cell) {
    const targetPos = yardSlotWorldPos(cell, cell.stack.length);
    const sz = containerSize(c.userData.is40ft);
    c.position.set(targetPos.x, targetPos.y, targetPos.z);
    c.rotation.set(0, 0, 0);
    cell.stack.push(c.userData.containerId);
    c.userData.placed = true;
    c.userData.inYard = true;

    const pts = scorePlacement(swingScore, false);
    ui.addScore(pts, 'YARD');
    ui.containerPlaced();
    physics.reset();
    return;
  }

  // Drop in place — penalty
  c.userData.placed = true;
  ui.addScore(-50, 'DROPPED!');
  physics.reset();
}

// ── Game Loop ─────────────────────────────────────────────────────────────────
let lastTime = performance.now();

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (!gameStarted) {
    renderer.render(scene, camera);
    return;
  }

  // Controls → crane
  crane.update(dt, controls, physics);

  // Camera follows crane cabin
  controls.consumeMouseDelta();
  const cabinPos = crane.getCameraPosition();
  camera.position.copy(cabinPos);

  // Camera look direction from yaw/pitch
  const lookDir = new THREE.Vector3(
    Math.sin(controls.yaw) * Math.cos(controls.pitch),
    Math.sin(controls.pitch),
    Math.cos(controls.yaw) * Math.cos(controls.pitch)
  );
  camera.lookAt(cabinPos.clone().add(lookDir));

  // Physics update
  const trolleyPos = crane.getTrolleyWorldPos();
  physics.update(dt, trolleyPos.x, trolleyPos.z, crane.hoistHeight);

  // Move held container with spreader
  if (heldContainer) {
    const sp = crane.getSpreaderWorldPos();
    const sz = containerSize(heldContainer.userData.is40ft);
    heldContainer.position.set(sp.x, sp.y - sz.h / 2, sp.z);
    heldContainer.rotation.x = physics.pendulum.angleX * 0.25;
    heldContainer.rotation.z = physics.pendulum.angleZ * 0.25;
  }

  // Spacebar edge detection — attach or release
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

  // HUD updates
  ui.updateCrane(crane.railPos, crane.trolleyPos, crane.hoistHeight);
  ui.updateSwing(physics.getSwingScore());

  // Animate scene (water, etc.)
  animateScene(scene, now * 0.001);

  renderer.render(scene, camera);
}

loop();
