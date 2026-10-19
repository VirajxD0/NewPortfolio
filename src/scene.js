import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export function createScene(container) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x2a1530, 0.018);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 6, 18);
  camera.lookAt(0, 4, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 60;
  controls.enabled = false;

  // Sky gradient
  const skyGeo = new THREE.SphereGeometry(90, 32, 32);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      uniform float uTime;
      void main() {
        vec3 dir = normalize(vWorldPos);
        float h = dir.y;
        vec3 bottom = vec3(0.92, 0.62, 0.7);
        vec3 mid = vec3(0.62, 0.48, 0.74);
        vec3 top = vec3(0.28, 0.32, 0.62);
        vec3 col = mix(bottom, mid, smoothstep(-0.05, 0.35, h));
        col = mix(col, top, smoothstep(0.35, 0.9, h));
        // subtle sun disc
        vec3 sunDir = normalize(vec3(0.4, 0.55, 0.6));
        float sun = pow(max(dot(dir, sunDir), 0.0), 256.0);
        col += vec3(1.0, 0.85, 0.6) * sun * 0.6;
        // horizon haze
        col = mix(col, vec3(0.95, 0.75, 0.8), smoothstep(0.0, -0.15, h) * 0.4);
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.name = 'sky';
  scene.add(sky);

  // Lighting
  const ambient = new THREE.AmbientLight(0xddb8c8, 0.6);
  ambient.name = 'ambientLight';
  scene.add(ambient);

  const sunLight = new THREE.DirectionalLight(0xffeedd, 1.8);
  sunLight.position.set(10, 20, 8);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -25;
  sunLight.shadow.camera.right = 25;
  sunLight.shadow.camera.top = 25;
  sunLight.shadow.camera.bottom = -25;
  sunLight.shadow.bias = -0.001;
  sunLight.shadow.normalBias = 0.02;
  sunLight.name = 'sunLight';
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0xccaadd, 0.4);
  fillLight.position.set(-8, 10, -5);
  fillLight.name = 'fillLight';
  scene.add(fillLight);

  const backLight = new THREE.PointLight(0xffaacc, 0.8, 40);
  backLight.position.set(-5, 8, -10);
  backLight.name = 'backLight';
  scene.add(backLight);

  // Hemisphere light for realistic ambient fill (sky/ground)
  const hemiLight = new THREE.HemisphereLight(0xffd6e0, 0x2a4a2a, 0.5);
  hemiLight.position.set(0, 20, 0);
  hemiLight.name = 'hemiLight';
  scene.add(hemiLight);

  // Ground
  const groundGeo = new THREE.PlaneGeometry(80, 80, 60, 60);
  const positions = groundGeo.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getY(i);
    const y = Math.sin(x * 0.15) * Math.cos(z * 0.15) * 0.3 + (Math.random() - 0.5) * 0.1;
    positions.setZ(i, y);
  }
  groundGeo.computeVertexNormals();
  const texLoader = new THREE.TextureLoader();
  const repeat = 12;
  const base = import.meta.env.BASE_URL;
  const colorMap = texLoader.load(base + 'textures/grass_color.png');
  const normalMap = texLoader.load(base + 'textures/grass_normal.png');
  const roughnessMap = texLoader.load(base + 'textures/grass_roughness.png');
  [colorMap, normalMap, roughnessMap].forEach((t) => {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  });
  colorMap.colorSpace = THREE.SRGBColorSpace;

  const groundMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: colorMap,
    normalMap: normalMap,
    roughnessMap: roughnessMap,
    roughness: 0.85,
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);

  // ---- Instanced grass blades ----
  const bladeCount = 2500;
  const bladeGeo = new THREE.PlaneGeometry(0.08, 0.5, 1, 4);
  bladeGeo.translate(0, 0.25, 0);
  const bladeCanvas = document.createElement('canvas');
  bladeCanvas.width = 64;
  bladeCanvas.height = 128;
  const bctx = bladeCanvas.getContext('2d');
  const grad = bctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  bctx.fillStyle = grad;
  bctx.beginPath();
  bctx.moveTo(32, 0);
  bctx.lineTo(64, 128);
  bctx.lineTo(0, 128);
  bctx.closePath();
  bctx.fill();
  const bladeTex = new THREE.CanvasTexture(bladeCanvas);
  bladeTex.colorSpace = THREE.SRGBColorSpace;

  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0x5a8a4a,
    map: bladeTex,
    alphaMap: bladeTex,
    transparent: true,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.7,
    metalness: 0.0,
  });
  const grass = new THREE.InstancedMesh(bladeGeo, bladeMat, bladeCount);
  grass.name = 'grassBlades';
  grass.castShadow = true;
  grass.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const grassData = [];
  const area = 36;
  for (let i = 0; i < bladeCount; i++) {
    const x = (Math.random() - 0.5) * area * 2;
    const z = (Math.random() - 0.5) * area * 2;
    const y = Math.sin(x * 0.15) * Math.cos(z * 0.15) * 0.3;
    const rotY = Math.random() * Math.PI * 2;
    const scale = 0.7 + Math.random() * 0.9;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    grassData.push({ x, y, z, rotY, scale, phase: Math.random() * Math.PI * 2, speed: 0.8 + Math.random() * 1.2 });
    const c = new THREE.Color().setHSL(0.28 + Math.random() * 0.06, 0.55, 0.22 + Math.random() * 0.18);
    grass.setColorAt(i, c);
  }
  grass.instanceMatrix.needsUpdate = true;
  grass.instanceColor.needsUpdate = true;
  scene.add(grass);

  // store grassData globally for updateAnimations
  window.__grassData = grassData;

  // Moss patches
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x3a6a3a, roughness: 1.0 });
  for (let i = 0; i < 12; i++) {
    const mossGeo = new THREE.CircleGeometry(1 + Math.random() * 2, 16);
    const moss = new THREE.Mesh(mossGeo, mossMat);
    moss.rotation.x = -Math.PI / 2;
    moss.position.set((Math.random() - 0.5) * 30, 0.02, (Math.random() - 0.5) * 30);
    moss.name = `moss_${i}`;
    scene.add(moss);
  }

  function createTrunk(height, baseRadius, topRadius, segments) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.2, height * 0.25, 0.1),
      new THREE.Vector3(-0.1, height * 0.5, 0.2),
      new THREE.Vector3(0.15, height * 0.75, -0.1),
      new THREE.Vector3(0, height, 0)
    ]);
    return new THREE.TubeGeometry(curve, segments || 12, baseRadius, 8, false);
  }

  function createBlossomCluster(radius, density, color) {
    const group = new THREE.Group();
    const blossomMat = new THREE.MeshStandardMaterial({
      color: color || 0xffb7c5, roughness: 0.6,
      emissive: color || 0xffb7c5, emissiveIntensity: 0.18,
      transparent: true, opacity: 0.9,
    });
    for (let i = 0; i < density; i++) {
      const size = 0.15 + Math.random() * 0.25;
      const geo = new THREE.SphereGeometry(size, 6, 6);
      const mesh = new THREE.Mesh(geo, blossomMat);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const r = Math.random() * radius;
      mesh.position.set(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi) * 0.5, r * Math.sin(phi) * Math.sin(theta));
      group.add(mesh);
    }
    return group;
  }

  function createBranch(length, angle, direction, blossomColor) {
    const group = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(direction.x * length * 0.5, length * 0.3, direction.z * length * 0.5),
      new THREE.Vector3(direction.x * length, length * 0.15, direction.z * length),
    ]);
    const branchGeo = new THREE.TubeGeometry(curve, 8, 0.06, 6, false);
    const branchMat = new THREE.MeshStandardMaterial({ color: 0x4a3030, roughness: 0.9 });
    const branch = new THREE.Mesh(branchGeo, branchMat);
    branch.castShadow = true;
    group.add(branch);
    const blossoms = createBlossomCluster(0.8, 15, blossomColor);
    blossoms.position.set(direction.x * length, length * 0.15, direction.z * length);
    group.add(blossoms);
    return group;
  }

  // Main Sakura Tree
  const sakuraGroup = new THREE.Group();
  sakuraGroup.name = 'sakuraTree';
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2520, roughness: 0.85 });
  const trunkGeo = createTrunk(7, 0.35, 0.15, 16);
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.castShadow = true;
  trunk.name = 'mainTrunk';
  sakuraGroup.add(trunk);

  const branchAngles = [
    { length: 4, angle: 0.5, dir: { x: 1, z: 0.3 }, y: 5 },
    { length: 3.5, angle: 0.6, dir: { x: -0.8, z: 0.6 }, y: 5.5 },
    { length: 4.5, angle: 0.4, dir: { x: 0.3, z: -1 }, y: 4.5 },
    { length: 3, angle: 0.7, dir: { x: -0.5, z: -0.8 }, y: 6 },
    { length: 3.8, angle: 0.5, dir: { x: 0.9, z: -0.4 }, y: 5.2 },
    { length: 2.5, angle: 0.6, dir: { x: -1, z: -0.2 }, y: 5.8 },
    { length: 3.2, angle: 0.4, dir: { x: 0.5, z: 0.9 }, y: 4.8 },
    { length: 2.8, angle: 0.5, dir: { x: -0.3, z: 1 }, y: 6.2 },
  ];
  const blossomColors = [0xffb7c5, 0xffc4d1, 0xffa8b8, 0xffd0db, 0xffafc0];
  branchAngles.forEach((b, i) => {
    const branch = createBranch(b.length, b.angle, b.dir, blossomColors[i % blossomColors.length]);
    branch.position.y = b.y;
    branch.name = `branch_${i}`;
    sakuraGroup.add(branch);
  });
  for (let i = 0; i < 8; i++) {
    const cluster = createBlossomCluster(1.5, 25, blossomColors[i % blossomColors.length]);
    const angle = (i / 8) * Math.PI * 2;
    const r = 1.5 + Math.random() * 2;
    cluster.position.set(Math.cos(angle) * r, 6 + Math.random() * 2, Math.sin(angle) * r);
    cluster.name = `canopyCluster_${i}`;
    sakuraGroup.add(cluster);
  }
  scene.add(sakuraGroup);

  // Stone Lanterns
  function createLantern(x, z) {
    const group = new THREE.Group();
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x888880, roughness: 0.9 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.2, 8), stoneMat);
    base.position.y = 0.1; group.add(base);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 1.2, 8), stoneMat);
    pillar.position.y = 0.8; group.add(pillar);
    const lightBox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), stoneMat);
    lightBox.position.y = 1.65; group.add(lightBox);
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xffddaa, emissive: 0xffaa66, emissiveIntensity: 0.8, transparent: true, opacity: 0.6 });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), glowMat);
    glow.position.y = 1.65; group.add(glow);
    const pLight = new THREE.PointLight(0xffaa66, 0.5, 5);
    pLight.position.y = 1.65; group.add(pLight);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.35, 4), stoneMat);
    roof.position.y = 2.1; roof.rotation.y = Math.PI / 4; group.add(roof);
    group.position.set(x, 0, z);
    group.castShadow = true;
    return group;
  }
  const lantern1 = createLantern(5, 3); lantern1.name = 'lantern1'; scene.add(lantern1);
  const lantern2 = createLantern(-4, 5); lantern2.name = 'lantern2'; scene.add(lantern2);
  const lantern3 = createLantern(3, -6); lantern3.name = 'lantern3'; scene.add(lantern3);

  // Stepping stones path
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x777770, roughness: 0.95 });
  const stonePositions = [[2,0.05,8],[3,0.05,6.5],[2.5,0.05,5],[1.5,0.05,3.5],[0.5,0.05,2],[-0.5,0.05,0.5]];
  stonePositions.forEach((pos, i) => {
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.35 + Math.random()*0.15, 0.4 + Math.random()*0.15, 0.1, 7), stoneMat);
    stone.position.set(...pos);
    stone.rotation.y = Math.random() * Math.PI;
    stone.receiveShadow = true;
    stone.name = `steppingStone_${i}`;
    scene.add(stone);
  });

  // Rocks
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x555550, roughness: 0.95 });
  const rockPositions = [
    { p: [6,0.3,-3], s: [0.8,0.6,0.7] },
    { p: [6.5,0.2,-2.5], s: [0.5,0.4,0.5] },
    { p: [-6,0.4,2], s: [1,0.7,0.8] },
    { p: [-5.5,0.2,2.5], s: [0.4,0.3,0.5] },
    { p: [-2,0.25,-7], s: [0.6,0.5,0.7] },
  ];
  rockPositions.forEach((r, i) => {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 1), rockMat);
    rock.position.set(...r.p);
    rock.scale.set(...r.s);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    rock.name = `rock_${i}`;
    scene.add(rock);
  });

  // Bamboo clusters
  function createBamboo(x, z, count) {
    const group = new THREE.Group();
    const bambooMat = new THREE.MeshStandardMaterial({ color: 0x4a7a4a, roughness: 0.7 });
    for (let i = 0; i < count; i++) {
      const h = 3 + Math.random() * 4;
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, h, 6), bambooMat);
      stalk.position.set((Math.random()-0.5)*0.8, h/2, (Math.random()-0.5)*0.8);
      stalk.castShadow = true;
      group.add(stalk);
      for (let j = 1; j < 4; j++) {
        const leafSize = 0.2 + Math.random() * 0.2;
        const leaf = new THREE.Mesh(new THREE.PlaneGeometry(leafSize, leafSize*3),
          new THREE.MeshStandardMaterial({ color: 0x5a8a5a, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
        leaf.position.set(stalk.position.x + (Math.random()-0.5)*0.3, j*h/4 + Math.random(), stalk.position.z + (Math.random()-0.5)*0.3);
        leaf.rotation.set(Math.random()*0.5, Math.random()*Math.PI, Math.random()*0.5);
        group.add(leaf);
      }
    }
    group.position.set(x, 0, z);
    return group;
  }
  const bamboo1 = createBamboo(-10, -5, 8); bamboo1.name = 'bamboo1'; scene.add(bamboo1);
  const bamboo2 = createBamboo(10, -8, 6); bamboo2.name = 'bamboo2'; scene.add(bamboo2);
  const bamboo3 = createBamboo(-12, 5, 10); bamboo3.name = 'bamboo3'; scene.add(bamboo3);

  // Small secondary sakura trees
  function createSmallSakura(x, z, height, blossomDensity) {
    const group = new THREE.Group();
    const tGeo = createTrunk(height, 0.12, 0.05, 8);
    const tMesh = new THREE.Mesh(tGeo, trunkMat);
    tMesh.castShadow = true;
    group.add(tMesh);
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + Math.random();
      const r = 0.8 + Math.random() * 0.5;
      const cluster = createBlossomCluster(0.6, blossomDensity, blossomColors[Math.floor(Math.random()*blossomColors.length)]);
      cluster.position.set(Math.cos(angle)*r, height*0.7 + Math.random()*height*0.3, Math.sin(angle)*r);
      group.add(cluster);
    }
    group.position.set(x, 0, z);
    return group;
  }
  const smallTree1 = createSmallSakura(-8, 3, 3.5, 12); smallTree1.name = 'smallSakura1'; scene.add(smallTree1);
  const smallTree2 = createSmallSakura(8, 6, 4, 15); smallTree2.name = 'smallSakura2'; scene.add(smallTree2);
  const smallTree3 = createSmallSakura(-5, -8, 3, 10); smallTree3.name = 'smallSakura3'; scene.add(smallTree3);
  const smallTree4 = createSmallSakura(7, -4, 2.5, 8); smallTree4.name = 'smallSakura4'; scene.add(smallTree4);

  // Water pond
  const pondGeo = new THREE.CircleGeometry(3, 32);
  const pondMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.8 });
  const pond = new THREE.Mesh(pondGeo, pondMat);
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(6, 0.03, 4);
  pond.name = 'pond';
  scene.add(pond);
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.SphereGeometry(0.2 + Math.random()*0.15, 6, 6), stoneMat);
    stone.position.set(6 + Math.cos(angle)*3.1, 0.1, 4 + Math.sin(angle)*3.1);
    stone.scale.y = 0.5;
    stone.name = `pondStone_${i}`;
    scene.add(stone);
  }

  // Torii gate
  function createTorii(x, z, rotY) {
    const group = new THREE.Group();
    const toriiMat = new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.6 });
    const pillarL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 4, 8), toriiMat);
    pillarL.position.set(-1.2, 2, 0); pillarL.castShadow = true; group.add(pillarL);
    const pillarR = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 4, 8), toriiMat);
    pillarR.position.set(1.2, 2, 0); pillarR.castShadow = true; group.add(pillarR);
    const topBeam = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.15, 0.2), toriiMat);
    topBeam.position.y = 4; group.add(topBeam);
    const midBeam = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 0.15), toriiMat);
    midBeam.position.y = 3.5; group.add(midBeam);
    group.position.set(x, 0, z);
    group.rotation.y = rotY || 0;
    return group;
  }
  const torii = createTorii(-2, 10, 0.3); torii.name = 'torii'; scene.add(torii);

  // Sakura Petals Particle System
  const petalCount = 400;
  const petalGeo = new THREE.BufferGeometry();
  const petalPositions = new Float32Array(petalCount * 3);
  const petalVelocities = [];
  const petalRotations = new Float32Array(petalCount);
  const petalSizes = new Float32Array(petalCount);
  for (let i = 0; i < petalCount; i++) {
    petalPositions[i * 3] = (Math.random() - 0.5) * 40;
    petalPositions[i * 3 + 1] = Math.random() * 15;
    petalPositions[i * 3 + 2] = (Math.random() - 0.5) * 40;
    petalVelocities.push({
      x: (Math.random() - 0.5) * 0.02,
      y: -0.01 - Math.random() * 0.02,
      z: (Math.random() - 0.5) * 0.02,
      rotSpeed: (Math.random() - 0.5) * 0.05,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.5 + Math.random() * 1.5,
      wobbleAmp: 0.01 + Math.random() * 0.02,
    });
    petalRotations[i] = Math.random() * Math.PI * 2;
    petalSizes[i] = 0.08 + Math.random() * 0.12;
  }
  petalGeo.setAttribute('position', new THREE.BufferAttribute(petalPositions, 3));
  petalGeo.setAttribute('aRotation', new THREE.BufferAttribute(petalRotations, 1));
  petalGeo.setAttribute('size', new THREE.BufferAttribute(petalSizes, 1));
  const petalMat = new THREE.PointsMaterial({ color: 0xffc0cb, size: 0.15, transparent: true, opacity: 0.8, sizeAttenuation: true, depthWrite: false });
  const petals = new THREE.Points(petalGeo, petalMat);
  petals.name = 'petalParticles';
  scene.add(petals);

  const cameraViews = [
    { pos: new THREE.Vector3(0, 6, 18), lookAt: new THREE.Vector3(0, 4, 0) },
    { pos: new THREE.Vector3(2, 2.5, 4), lookAt: new THREE.Vector3(0, 2, 0) },
    { pos: new THREE.Vector3(0, 14, 1), lookAt: new THREE.Vector3(0, 6, 0) },
    { pos: new THREE.Vector3(-3, 1.2, 5), lookAt: new THREE.Vector3(0, 5, 0) },
    { pos: new THREE.Vector3(-12, 5, 14), lookAt: new THREE.Vector3(0, 3, -2) },
  ];

  // Post-processing for cinematic realism
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
  ssaoPass.kernelRadius = 8;
  ssaoPass.minDistance = 0.005;
  ssaoPass.maxDistance = 0.1;
  ssaoPass.output = SSAOPass.OUTPUT.Default;
  composer.addPass(ssaoPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.6,   // strength
    0.4,   // radius
    0.85   // threshold
  );
  composer.addPass(bloomPass);

  const smaaPass = new SMAAPass(window.innerWidth, window.innerHeight);
  composer.addPass(smaaPass);

  composer.addPass(new OutputPass());

  function updateAnimations(time) {
    skyMat.uniforms.uTime.value = time;
    const positions = petalGeo.attributes.position.array;
    for (let i = 0; i < petalCount; i++) {
      const v = petalVelocities[i];
      const wobble = Math.sin(time * v.wobbleSpeed + v.wobblePhase) * v.wobbleAmp;
      positions[i * 3] += v.x + wobble;
      positions[i * 3 + 1] += v.y;
      positions[i * 3 + 2] += v.z + wobble * 0.5;
      positions[i * 3] += Math.sin(time * 0.3 + i * 0.1) * 0.005;
      if (positions[i * 3 + 1] < -0.5) {
        positions[i * 3] = (Math.random() - 0.5) * 40;
        positions[i * 3 + 1] = 10 + Math.random() * 5;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
      }
      if (Math.abs(positions[i * 3]) > 25) positions[i * 3] *= -0.5;
      if (Math.abs(positions[i * 3 + 2]) > 25) positions[i * 3 + 2] *= -0.5;
    }
    petalGeo.attributes.position.needsUpdate = true;

    sakuraGroup.children.forEach((child, i) => {
      if (child.name && child.name.startsWith('branch_')) {
        child.rotation.z = Math.sin(time * 0.5 + i) * 0.02;
        child.rotation.x = Math.cos(time * 0.3 + i * 0.5) * 0.01;
      }
      if (child.name && child.name.startsWith('canopyCluster_')) {
        child.position.y += Math.sin(time * 0.8 + i * 0.7) * 0.001;
      }
    });

    pondMat.opacity = 0.75 + Math.sin(time * 1.5) * 0.05;

    const grassMesh = scene.getObjectByName('grassBlades');
    const grassData = window.__grassData;
    if (grassMesh && grassData) {
      const dummy = new THREE.Object3D();
      grassData.forEach((d, i) => {
        const sway = Math.sin(time * d.speed + d.phase) * 0.18;
        dummy.position.set(d.x, d.y, d.z);
        dummy.rotation.set(sway, d.rotY, 0);
        dummy.scale.set(d.scale, d.scale, d.scale);
        dummy.updateMatrix();
        grassMesh.setMatrixAt(i, dummy.matrix);
      });
      grassMesh.instanceMatrix.needsUpdate = true;
    }

    scene.children.forEach(child => {
      if (child.name && child.name.startsWith('lantern')) {
        const lights = [];
        child.traverse(c => { if (c.isPointLight) lights.push(c); });
        lights.forEach(l => { l.intensity = 0.4 + Math.sin(time * 3 + Math.random() * 0.1) * 0.15; });
      }
    });

    controls.update();
  }

  return { scene, camera, renderer, cameraViews, updateAnimations, controls, composer };
}
