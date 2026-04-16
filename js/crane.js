import * as THREE from 'three';

// Crane travel limits (along rail / X axis)
const RAIL_MIN = -135;
const RAIL_MAX = 135;

// Trolley limits (along beam / Z axis — over ship vs over yard)
const TROLLEY_MIN = -22;   // over water / ship side
const TROLLEY_MAX = 40;    // into yard

// Hoist limits
const HOIST_MIN = 0.5;
const HOIST_MAX = 38;

// Movement speeds (metres per second)
const TRAVEL_SPEED = 8;
const TROLLEY_SPEED = 6;
const HOIST_SPEED_DOWN = 4;
const HOIST_SPEED_UP = 3;

export class Crane {
  constructor(scene) {
    this.scene = scene;

    // Logical state
    this.railPos   = 0;        // X position along quay
    this.trolleyPos = 5;       // Z position of trolley on beam
    this.hoistHeight = 35;     // metres above ground

    this._group = new THREE.Group();
    this._trolleyGroup = new THREE.Group();
    this._cableGroup = new THREE.Group();
    this._spreaderGroup = new THREE.Group();

    this._buildMesh();
    scene.add(this._group);
  }

  _buildMesh() {
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, metalness: 0.5, roughness: 0.4 });
    const darkMat  = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.5 });
    const grayMat  = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.4, roughness: 0.6 });

    // ── Main boom (runs along Z axis) ──
    const boomLen = TROLLEY_MAX - TROLLEY_MIN + 10;
    const boomGeo = new THREE.BoxGeometry(1.2, 1.2, boomLen);
    const boom = new THREE.Mesh(boomGeo, metalMat);
    boom.position.set(0, 30, (TROLLEY_MIN + TROLLEY_MAX) / 2);
    boom.castShadow = true;
    this._group.add(boom);

    // Boom end (sea-side) angled tip
    const tipGeo = new THREE.BoxGeometry(1.0, 1.0, 8);
    const tip = new THREE.Mesh(tipGeo, darkMat);
    tip.position.set(0, 30, TROLLEY_MIN - 8);
    tip.rotation.x = 0.3;
    this._group.add(tip);

    // ── Machinery house on top ──
    const machGeo = new THREE.BoxGeometry(5, 3, 6);
    const mach = new THREE.Mesh(machGeo, grayMat);
    mach.position.set(0, 32, TROLLEY_MAX - 8);
    mach.castShadow = true;
    this._group.add(mach);

    // ── Cabin ──
    const cabinGeo = new THREE.BoxGeometry(3, 2.5, 3);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.5, metalness: 0.3 });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 28, 2);
    cabin.castShadow = true;
    this._group.add(cabin);

    // Cabin glass
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x88ccff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55,
    });
    const glassGeo = new THREE.BoxGeometry(2.8, 1.8, 0.1);
    for (const [x, z, ry] of [[0, 1.56, 0], [1.51, 0, Math.PI/2], [-1.51, 0, Math.PI/2]]) {
      const g = new THREE.Mesh(glassGeo, glassMat);
      g.position.set(x, 28.2, z + 2);
      g.rotation.y = ry;
      this._group.add(g);
    }


    // ── Trolley ──────────────────────────────────────────────
    const trolleyGeo = new THREE.BoxGeometry(2.2, 0.8, 2.2);
    const trolley = new THREE.Mesh(trolleyGeo, darkMat);
    trolley.castShadow = true;
    this._trolleyGroup.add(trolley);

    // Trolley wheels
    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });
    for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.5, z);
      this._trolleyGroup.add(w);
    }

    this._trolleyGroup.position.set(0, 30, this.trolleyPos);
    this._group.add(this._trolleyGroup);

    // ── Cable ──
    this._cableMesh = this._makeCable();
    this._trolleyGroup.add(this._cableMesh);

    // ── Spreader bar ──
    this._buildSpreader();
    this._trolleyGroup.add(this._spreaderGroup);
  }

  _makeCable() {
    const geo = new THREE.CylinderGeometry(0.05, 0.05, 1, 4);
    const mat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    return mesh;
  }

  _buildSpreader() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xff6600, metalness: 0.4, roughness: 0.5 });

    // Main bar
    const barGeo = new THREE.BoxGeometry(6.5, 0.3, 2.6);
    const bar = new THREE.Mesh(barGeo, mat);
    this._spreaderGroup.add(bar);

    // End beams
    for (const ox of [-3.1, 3.1]) {
      const endGeo = new THREE.BoxGeometry(0.3, 0.5, 2.6);
      const end = new THREE.Mesh(endGeo, mat);
      end.position.x = ox;
      this._spreaderGroup.add(end);
    }

    // Twist-locks (corner pins)
    const lockGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.5, 6);
    const lockMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9 });
    for (const [x, z] of [[-3, -1.15], [3, -1.15], [-3, 1.15], [3, 1.15]]) {
      const lock = new THREE.Mesh(lockGeo, lockMat);
      lock.position.set(x, -0.35, z);
      this._spreaderGroup.add(lock);
    }

    // Status light (green = free, yellow = locked)
    const lightGeo = new THREE.SphereGeometry(0.18, 8, 8);
    this._statusLight = new THREE.Mesh(lightGeo,
      new THREE.MeshStandardMaterial({ color: 0x00ff44, emissive: 0x00ff44, emissiveIntensity: 1 })
    );
    this._statusLight.position.set(0, 0.4, 0);
    this._spreaderGroup.add(this._statusLight);

    this._buildLaserGuide();
  }

  _buildLaserGuide() {
    // 4 corner beams + 1 central beam projecting downward from spreader
    const corners = [[-3.0, -1.15], [3.0, -1.15], [-3.0, 1.15], [3.0, 1.15], [0, 0]];
    this._laserBeams = corners.map(([ox, oz]) => {
      const radius = (ox === 0 && oz === 0) ? 0.04 : 0.025;
      const geo = new THREE.CylinderGeometry(radius, radius, 1, 6);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.8 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.ox = ox;
      mesh.userData.oz = oz;
      mesh.position.set(ox, -0.5, oz);
      this._spreaderGroup.add(mesh);
      return mesh;
    });
  }

  updateLaser(spreaderWorldY, floorY, quality) {
    if (!this._laserBeams) return;
    const dist = Math.max(0.4, spreaderWorldY - floorY);
    const color = quality === 'perfect' ? 0x00ff44
                : quality === 'good'    ? 0xffff00
                : quality === 'near'   ? 0xff8800
                :                        0xff2200;
    const opacity = quality === 'none' ? 0.3 : 0.82;
    for (const mesh of this._laserBeams) {
      mesh.scale.y = dist;
      mesh.position.set(mesh.userData.ox, -dist / 2, mesh.userData.oz);
      mesh.material.color.setHex(color);
      mesh.material.opacity = opacity;
    }
  }



  setSpreaderLocked(locked) {
    this._spreaderLocked = locked;
    this._statusLight.material.color.set(locked ? 0xffcc00 : 0x00ff44);
    this._statusLight.material.emissive.set(locked ? 0xffcc00 : 0x00ff44);
  }

  // Re-apply spreader/cable transforms after an external hoistHeight change (e.g. collision clamp)
  refreshSpreaderPos(physicsWorld) {
    const cableLen = this.hoistHeight;
    this._cableMesh.scale.y = cableLen;
    this._cableMesh.position.y = -cableLen / 2;
    const offset = physicsWorld.getLoadOffset();
    this._spreaderGroup.position.set(offset.x, -cableLen - 0.4, offset.z);
    this._spreaderGroup.rotation.x = physicsWorld.pendulum.angleX * 0.3;
    this._spreaderGroup.rotation.z = physicsWorld.pendulum.angleZ * 0.3;
  }

  // ── Camera position (in crane cabin) ──────────────────────────────────────
  getCameraPosition() {
    const p = new THREE.Vector3();
    this._group.getWorldPosition(p);
    return new THREE.Vector3(p.x, 28.5, p.z + 2);
  }

  // ── Per-frame update ──────────────────────────────────────────────────────
  update(dt, controls, physicsWorld) {
    // Rail travel (A/D)
    if (controls.isDown('KeyA')) this.railPos -= TRAVEL_SPEED * dt;
    if (controls.isDown('KeyD')) this.railPos += TRAVEL_SPEED * dt;
    this.railPos = Math.max(RAIL_MIN, Math.min(RAIL_MAX, this.railPos));

    // Trolley (W/S)
    if (controls.isDown('KeyW')) this.trolleyPos -= TROLLEY_SPEED * dt;
    if (controls.isDown('KeyS')) this.trolleyPos += TROLLEY_SPEED * dt;
    this.trolleyPos = Math.max(TROLLEY_MIN, Math.min(TROLLEY_MAX, this.trolleyPos));

    // Hoist (Q down / E up)
    if (controls.isDown('KeyQ')) this.hoistHeight -= HOIST_SPEED_DOWN * dt;
    if (controls.isDown('KeyE')) this.hoistHeight += HOIST_SPEED_UP * dt;
    this.hoistHeight = Math.max(HOIST_MIN, Math.min(HOIST_MAX, this.hoistHeight));

    // Update Three.js transforms
    this._group.position.x = this.railPos;
    this._trolleyGroup.position.z = this.trolleyPos;

    // Cable length & spreader position
    const cableLen = this.hoistHeight;
    this._cableMesh.scale.y = cableLen;
    this._cableMesh.position.y = -cableLen / 2;

    // Apply pendulum swing to spreader
    const offset = physicsWorld.getLoadOffset();
    this._spreaderGroup.position.set(offset.x, -cableLen - 0.4, offset.z);

    // Tilt spreader visually with swing
    this._spreaderGroup.rotation.x = physicsWorld.pendulum.angleX * 0.3;
    this._spreaderGroup.rotation.z = physicsWorld.pendulum.angleZ * 0.3;

  }

  // World position of the spreader (for pickup/placement detection)
  getSpreaderWorldPos() {
    const p = new THREE.Vector3();
    this._spreaderGroup.getWorldPosition(p);
    return p;
  }

  getTrolleyWorldPos() {
    const p = new THREE.Vector3();
    this._trolleyGroup.getWorldPosition(p);
    return p;
  }
}
