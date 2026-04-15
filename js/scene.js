import * as THREE from 'three';

export function buildScene(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 120, 400);

  // ── Lighting ──────────────────────────────────────────────
  const sun = new THREE.DirectionalLight(0xfff5e0, 2.2);
  sun.position.set(60, 120, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 400;
  sun.shadow.camera.left = -150;
  sun.shadow.camera.right = 150;
  sun.shadow.camera.top = 150;
  sun.shadow.camera.bottom = -150;
  sun.shadow.bias = -0.001;
  scene.add(sun);

  const ambient = new THREE.AmbientLight(0x88aabb, 0.7);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0x87ceeb, 0x334422, 0.5);
  scene.add(hemi);

  // ── Water ─────────────────────────────────────────────────
  const waterGeo = new THREE.PlaneGeometry(600, 300);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x1a6080,
    roughness: 0.3,
    metalness: 0.1,
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.5, -80);
  water.receiveShadow = true;
  scene.add(water);

  // Gentle wave animation data stored on mesh
  water.userData.isWater = true;

  // ── Quayside / Apron ──────────────────────────────────────
  const apronGeo = new THREE.BoxGeometry(280, 1, 40);
  const apronMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 });
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.position.set(0, -0.5, 18);
  apron.receiveShadow = true;
  scene.add(apron);

  // Quay wall (front face)
  const wallGeo = new THREE.BoxGeometry(280, 4, 1.5);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.95 });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.set(0, 1.5, -0.5);
  wall.castShadow = true;
  scene.add(wall);

  // ── Container Yard ────────────────────────────────────────
  const yardGeo = new THREE.BoxGeometry(280, 0.5, 80);
  const yardMat = new THREE.MeshStandardMaterial({ color: 0x6b6b60, roughness: 0.95 });
  const yard = new THREE.Mesh(yardGeo, yardMat);
  yard.position.set(0, -0.25, 60);
  yard.receiveShadow = true;
  scene.add(yard);

  // Yellow lane markings on yard
  addYardMarkings(scene);

  // ── Crane Rail ────────────────────────────────────────────
  const railMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.4 });
  for (const z of [2, 14]) {
    const railGeo = new THREE.BoxGeometry(280, 0.3, 0.4);
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(0, 0.15, z);
    rail.receiveShadow = true;
    scene.add(rail);
  }

  // ── Background buildings / cranes (decorative) ────────────
  addBackgroundElements(scene);

  return scene;
}

function addYardMarkings(scene) {
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xffdd00, roughness: 1 });
  for (let x = -120; x <= 120; x += 30) {
    const lineGeo = new THREE.BoxGeometry(0.3, 0.05, 80);
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.position.set(x, 0.02, 60);
    scene.add(line);
  }
}

function addBackgroundElements(scene) {
  // Distant warehouse buildings
  const bldMat = new THREE.MeshStandardMaterial({ color: 0x9999aa, roughness: 0.95 });
  const sizes = [
    [60, 14, 20, -70, 7, 100],
    [40, 10, 20, 50, 5, 110],
    [50, 18, 25, -20, 9, 115],
  ];
  for (const [w, h, d, x, y, z] of sizes) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, bldMat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Bollards along the quay edge
  const bollardGeo = new THREE.CylinderGeometry(0.3, 0.35, 1.2, 8);
  const bollardMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6 });
  for (let x = -130; x <= 130; x += 15) {
    const b = new THREE.Mesh(bollardGeo, bollardMat);
    b.position.set(x, 0.6, 1);
    b.castShadow = true;
    scene.add(b);
  }
}

export function animateScene(scene, t) {
  // subtle water colour shift
  scene.traverse(obj => {
    if (obj.userData.isWater) {
      const hue = 0.55 + Math.sin(t * 0.3) * 0.02;
      obj.material.color.setHSL(hue, 0.7, 0.28);
    }
  });
}
