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
  scene.fog = new THREE.FogExp2(0x3a1f3a, 0.016);

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
        vec3 sunsetOrange = vec3(0.992, 0.369, 0.325);
        vec3 bottom = sunsetOrange;
        vec3 lowerMid = vec3(0.95, 0.45, 0.55);
        vec3 upperMid = sunsetOrange;
        vec3 top = vec3(0.25, 0.18, 0.40);
        vec3 col = mix(bottom, lowerMid, smoothstep(-0.05, 0.30, h));
        col = mix(col, upperMid, smoothstep(0.30, 0.60, h));
        col = mix(col, top, smoothstep(0.60, 0.95, h));
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
  const ambient = new THREE.AmbientLight(0xdda0b0, 0.5);
  ambient.name = 'ambientLight';
  scene.add(ambient);

  const sunLight = new THREE.DirectionalLight(0xffaa66, 1.6);
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

  // ---- Realistic shader grass ----
  const instanceCount = 20000;
  const grassGeometry = new THREE.PlaneGeometry(0.08, 1.0, 1, 8);
  grassGeometry.translate(0, 0.5, 0);
  // taper blades to a pointy tip
  const posAttr = grassGeometry.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const t = Math.max(0, Math.min(1, y / 1.0));
    const taper = 1.0 - t * t;
    posAttr.setX(i, posAttr.getX(i) * taper);
  }
  posAttr.needsUpdate = true;
  grassGeometry.computeVertexNormals();

  const grassMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      windStrength: { value: 0.22 },
      windDirection: { value: new THREE.Vector2(1.0, 0.35).normalize() },
      windSpeed: { value: 1.0 },
    },
    vertexShader: `
      attribute float phase;
      attribute float amplitude;

      uniform float time;
      uniform float windStrength;
      uniform float windSpeed;
      uniform vec2 windDirection;

      varying float vHeight;
      varying float vVariation;

      void main() {
        vHeight = clamp(position.y / 1.0, 0.0, 1.0);
        vVariation = amplitude;

        vec4 bladePosition = instanceMatrix * vec4(position, 1.0);
        vec3 origin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;

        float bend = vHeight * vHeight;
        float wavePosition = dot(origin.xz, normalize(windDirection));

        float wave = sin(
          wavePosition * 0.65 - time * windSpeed + phase
        );

        float gust = sin(
          wavePosition * 0.28 - time * windSpeed * 0.55 + phase * 0.4
        );

        float sway = (wave * 0.7 + gust * 0.3)
                   * windStrength * amplitude * bend;

        bladePosition.x += windDirection.x * sway;
        bladePosition.z += windDirection.y * sway;

        gl_Position = projectionMatrix * modelViewMatrix * bladePosition;
      }
    `,
    fragmentShader: `
      varying float vHeight;
      varying float vVariation;

      void main() {
        vec3 rootColor = vec3(0.04, 0.08, 0.02);
        vec3 tipColor  = vec3(0.18, 0.28, 0.08);

        vec3 grassColor = mix(rootColor, tipColor, smoothstep(0.0, 1.0, vHeight));
        grassColor *= mix(0.78, 1.12, vVariation);

        gl_FragColor = vec4(grassColor, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });

  const grassField = new THREE.InstancedMesh(grassGeometry, grassMaterial, instanceCount);
  grassField.name = 'grassField';
  const phases = new Float32Array(instanceCount);
  const amplitudes = new Float32Array(instanceCount);
  const dummy = new THREE.Object3D();
  const area = 30;
  for (let i = 0; i < instanceCount; i++) {
    const x = (Math.random() - 0.5) * area * 2;
    const z = (Math.random() - 0.5) * area * 2;
    const y = Math.sin(x * 0.15) * Math.cos(z * 0.15) * 0.3;
    const scale = 0.8 + Math.random() * 0.4;
    const rotation = Math.random() * Math.PI * 2;
    dummy.position.set(x, y + 0.02, z);
    dummy.rotation.set(0, rotation, 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    grassField.setMatrixAt(i, dummy.matrix);
    phases[i] = Math.random() * Math.PI * 2;
    amplitudes[i] = 0.5 + Math.random() * 0.5;
  }
  grassGeometry.setAttribute('phase', new THREE.InstancedBufferAttribute(phases, 1));
  grassGeometry.setAttribute('amplitude', new THREE.InstancedBufferAttribute(amplitudes, 1));
  grassField.instanceMatrix.needsUpdate = true;
  scene.add(grassField);

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

  function createTaperedBranch(points, baseRadius, tipRadius = 0.015) {
    const curve = new THREE.CatmullRomCurve3(
      points.map(p => new THREE.Vector3(...p))
    );
    const segments = 24;
    const sides = 8;
    const frames = curve.computeFrenetFrames(segments, false);
    const vertices = [];
    const indices = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const center = curve.getPointAt(t);
      const radius = tipRadius + (baseRadius - tipRadius) * Math.pow(1 - t, 1.25);
      for (let j = 0; j < sides; j++) {
        const angle = (j / sides) * Math.PI * 2;
        const normal = frames.normals[i].clone()
          .multiplyScalar(Math.cos(angle))
          .addScaledVector(frames.binormals[i], Math.sin(angle));
        const vertex = center.clone().addScaledVector(normal, radius);
        vertices.push(vertex.x, vertex.y, vertex.z);
      }
    }
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < sides; j++) {
        const a = i * sides + j;
        const b = i * sides + (j + 1) % sides;
        const c = (i + 1) * sides + j;
        const d = (i + 1) * sides + (j + 1) % sides;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function createTrunk(height, baseRadius, topRadius) {
    return createTaperedBranch([
      [0, 0, 0],
      [0.2, height * 0.25, 0.1],
      [-0.15, height * 0.5, 0.2],
      [0.3, height * 0.75, -0.1],
      [0.1, height, 0]
    ], baseRadius, topRadius);
  }

  // Seeded RNG for deterministic tree
  let _seed = 42;
  function rnd() { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; }

  const petalMaterials = [
    new THREE.MeshStandardMaterial({ color: 0xffc5d2, roughness: 0.8, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0xffaabd, roughness: 0.8, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0xffdce4, roughness: 0.8, side: THREE.DoubleSide }),
  ];
  const centerMaterial = new THREE.MeshStandardMaterial({ color: 0xc96b83, roughness: 0.8 });
  const stamenMaterial = new THREE.MeshStandardMaterial({ color: 0xe8bd59, roughness: 0.65 });

  function createSakuraFlower(petalMaterial, centerMaterial, stamenMaterial) {
    const flower = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(-0.12, 0.10, -0.19, 0.32, -0.10, 0.43);
    shape.bezierCurveTo(-0.04, 0.51, 0.04, 0.51, 0.10, 0.43);
    shape.bezierCurveTo(0.19, 0.32, 0.12, 0.10, 0, 0);
    const petalGeometry = new THREE.ShapeGeometry(shape, 8);
    for (let i = 0; i < 5; i++) {
      const petal = new THREE.Mesh(petalGeometry, petalMaterial);
      petal.rotation.z = (i / 5) * Math.PI * 2;
      petal.rotation.x = (rnd() - 0.5) * 0.18;
      petal.rotation.y = (rnd() - 0.5) * 0.18;
      petal.position.z = i * 0.002;
      flower.add(petal);
    }
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), centerMaterial);
    center.position.z = 0.025;
    flower.add(center);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const length = 0.09 + rnd() * 0.05;
      const stamen = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, length, 4), stamenMaterial);
      stamen.position.set(Math.cos(angle) * 0.035, Math.sin(angle) * 0.035, 0.045 + length * 0.25);
      stamen.rotation.z = -angle + Math.PI / 2;
      flower.add(stamen);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 5, 4), stamenMaterial);
      tip.position.set(Math.cos(angle) * (0.035 + length * 0.45), Math.sin(angle) * (0.035 + length * 0.45), 0.045 + length * 0.5);
      flower.add(tip);
    }
    return flower;
  }

  function createFlowerCluster(radius, flowerCount) {
    const cluster = new THREE.Group();
    for (let i = 0; i < flowerCount; i++) {
      const flower = createSakuraFlower(
        petalMaterials[Math.floor(rnd() * petalMaterials.length)],
        centerMaterial,
        stamenMaterial
      );
      const theta = rnd() * Math.PI * 2;
      const phi = Math.acos(2 * rnd() - 1);
      const r = radius * Math.cbrt(rnd());
      flower.position.set(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
      flower.rotation.set(rnd() * 0.5, rnd() * Math.PI * 2, rnd() * 0.5);
      const scale = 0.2 + rnd() * 0.2;
      flower.scale.setScalar(scale);
      cluster.add(flower);
    }
    return cluster;
  }

  // Proper branch hierarchy with seeded RNG
  const leafGeo = new THREE.PlaneGeometry(0.08, 0.12, 1, 1);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x5a8a4a, side: THREE.DoubleSide, roughness: 0.8 });
  const branchMat = new THREE.MeshStandardMaterial({ color: 0x4a3030, roughness: 0.9 });

  // Shared instanced flower geometries/materials
  const _petalShape = new THREE.Shape();
  _petalShape.moveTo(0, 0);
  _petalShape.bezierCurveTo(-0.12, 0.10, -0.19, 0.32, -0.10, 0.43);
  _petalShape.bezierCurveTo(-0.04, 0.51, 0.04, 0.51, 0.10, 0.43);
  _petalShape.bezierCurveTo(0.19, 0.32, 0.12, 0.10, 0, 0);
  const petalGeoShared = new THREE.ShapeGeometry(_petalShape, 6);
  const centerGeoShared = new THREE.SphereGeometry(0.045, 6, 4);
  const stamenGeoShared = new THREE.CylinderGeometry(0.004, 0.006, 0.12, 4);
  const tipGeoShared = new THREE.SphereGeometry(0.012, 4, 3);
  const petalMatShared = new THREE.MeshStandardMaterial({ color: 0xffb7c5, roughness: 0.8, side: THREE.DoubleSide });
  const centerMatShared = new THREE.MeshStandardMaterial({ color: 0xc96b83, roughness: 0.8 });
  const stamenMatShared = new THREE.MeshStandardMaterial({ color: 0xe8bd59, roughness: 0.65 });

  function createBranch(length, baseRadius, tipRadius, pts) {
    const geo = createTaperedBranch(pts, baseRadius, tipRadius);
    const mesh = new THREE.Mesh(geo, branchMat);
    mesh.castShadow = true;
    return mesh;
  }

  function attachInstancedFlowers(branchGroup, curve, flowerCount) {
    if (flowerCount <= 0) return;
    const petalCount = flowerCount * 5;
    const centerCount = flowerCount;
    const stamenCount = flowerCount * 8;
    const tipCount = flowerCount * 8;

    const petalMesh = new THREE.InstancedMesh(petalGeoShared, petalMatShared, petalCount);
    const centerMesh = new THREE.InstancedMesh(centerGeoShared, centerMatShared, centerCount);
    const stamenMesh = new THREE.InstancedMesh(stamenGeoShared, stamenMatShared, stamenCount);
    const tipMesh = new THREE.InstancedMesh(tipGeoShared, stamenMatShared, tipCount);

    const dummy = new THREE.Object3D();
    const petalShades = [0xffc5d2, 0xffaabd, 0xffdce4];
    let pi = 0, ci = 0, si = 0, ti = 0;
    for (let f = 0; f < flowerCount; f++) {
      const t = 0.2 + (f / flowerCount) * 0.7 + rnd() * 0.08;
      const pt = curve.getPointAt(Math.min(t, 0.95));
      const scale = 0.2 + rnd() * 0.15;
      const flowerRot = new THREE.Euler(rnd() * 0.5, rnd() * Math.PI * 2, rnd() * 0.5);
      const shade = new THREE.Color(petalShades[Math.floor(rnd() * petalShades.length)]);

      // center
      dummy.position.copy(pt);
      dummy.position.z += 0.025 * scale;
      dummy.rotation.copy(flowerRot);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      centerMesh.setMatrixAt(ci, dummy.matrix);
      centerMesh.setColorAt(ci, new THREE.Color(0xc96b83));
      ci++;

      // petals
      for (let p = 0; p < 5; p++) {
        dummy.position.copy(pt);
        dummy.rotation.copy(flowerRot);
        dummy.rotation.z += (p / 5) * Math.PI * 2;
        dummy.rotation.x += (rnd() - 0.5) * 0.18;
        dummy.rotation.y += (rnd() - 0.5) * 0.18;
        dummy.position.z += p * 0.002 * scale;
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        petalMesh.setMatrixAt(pi, dummy.matrix);
        petalMesh.setColorAt(pi, shade);
        pi++;
      }

      // stamens + tips
      for (let s = 0; s < 8; s++) {
        const angle = (s / 8) * Math.PI * 2;
        const length = (0.09 + rnd() * 0.05) * scale;
        dummy.position.set(
          pt.x + Math.cos(angle) * 0.035 * scale,
          pt.y + Math.sin(angle) * 0.035 * scale,
          pt.z + (0.045 + length * 0.25) * scale
        );
        dummy.rotation.set(0, 0, -angle + Math.PI / 2);
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        stamenMesh.setMatrixAt(si, dummy.matrix);
        si++;

        dummy.position.set(
          pt.x + Math.cos(angle) * (0.035 + length * 0.45) * scale,
          pt.y + Math.sin(angle) * (0.035 + length * 0.45) * scale,
          pt.z + (0.045 + length * 0.5) * scale
        );
        dummy.scale.setScalar(0.012 * scale);
        dummy.updateMatrix();
        tipMesh.setMatrixAt(ti, dummy.matrix);
        ti++;
      }
    }

    petalMesh.instanceMatrix.needsUpdate = true;
    centerMesh.instanceMatrix.needsUpdate = true;
    stamenMesh.instanceMatrix.needsUpdate = true;
    tipMesh.instanceMatrix.needsUpdate = true;
    if (petalMesh.instanceColor) petalMesh.instanceColor.needsUpdate = true;
    if (centerMesh.instanceColor) centerMesh.instanceColor.needsUpdate = true;

    branchGroup.add(petalMesh, centerMesh, stamenMesh, tipMesh);
  }

  function attachFlowersAndLeaves(branchGroup, curve, count, leafN) {
    // instanced flowers
    attachInstancedFlowers(branchGroup, curve, count);

    // leaves
    for (let i = 0; i < leafN; i++) {
      const t = 0.2 + rnd() * 0.75;
      const pt = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.copy(pt);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.clone().normalize());
      leaf.quaternion.copy(q);
      leaf.rotateZ((rnd() - 0.5) * 1.2);
      const s = 0.6 + rnd() * 0.5;
      leaf.scale.set(s, s, s);
      branchGroup.add(leaf);
    }
  }

  function createBranchTree(parent, depth, length, attachPoint, dir, radius, tipRadius) {
    if (depth < 0 || length < 0.5) return null;

    const pts = [
      [0, 0, 0],
      [dir.x * length * 0.5, length * 0.35, dir.z * length * 0.5],
      [dir.x * length, length * 0.65, dir.z * length],
    ];
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));

    const branch = createBranch(length, radius, tipRadius, pts);
    const group = new THREE.Group();
    group.add(branch);
    group.position.copy(attachPoint);
    parent.add(group);

    // flowers densely along branch (5-petal clusters)
    const isTerminal = depth === 0;
    if (isTerminal) {
      for (let ci = 0; ci < 5; ci++) {
        const t = 0.15 + ci * 0.15 + rnd() * 0.08;
        const pt = curve.getPointAt(Math.min(t, 0.92));
        const cl = createFlowerCluster(0.5, 4);
        cl.position.copy(pt);
        group.add(cl);
      }
    } else if (depth === 1) {
      for (let ci = 0; ci < 3; ci++) {
        const t = 0.2 + ci * 0.25 + rnd() * 0.08;
        const cl = createFlowerCluster(0.45, 3);
        cl.position.copy(curve.getPointAt(Math.min(t, 0.92)));
        group.add(cl);
      }
    } else {
      if (rnd() > 0.4) {
        const cl = createFlowerCluster(0.5, 3);
        cl.position.copy(curve.getPointAt(0.7));
        group.add(cl);
      }
    }

    // leaves along branches
    const leafN = isTerminal ? 6 : depth === 1 ? 4 : 1;
    for (let i = 0; i < leafN; i++) {
      const t = 0.2 + rnd() * 0.75;
      const pt = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.copy(pt);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.clone().normalize());
      leaf.quaternion.copy(q);
      leaf.rotateZ((rnd() - 0.5) * 1.2);
      const s = 0.6 + rnd() * 0.5;
      leaf.scale.set(s, s, s);
      group.add(leaf);
    }

    // child branches
    if (depth > 0) {
      const childCount = depth === 2 ? 4 : 3;
      for (let i = 0; i < childCount; i++) {
        const t = 0.5 + rnd() * 0.35;
        const ap = curve.getPointAt(t);
        const tan = curve.getTangentAt(t);
        const angle = (rnd() - 0.5) * 1.0;
        const childDir = {
          x: tan.x * Math.cos(angle) - tan.z * Math.sin(angle),
          z: tan.x * Math.sin(angle) + tan.z * Math.cos(angle),
        };
        const len = Math.hypot(childDir.x, childDir.z) || 1;
        childDir.x /= len;
        childDir.z /= len;
        const childLen = length * (0.5 + rnd() * 0.2);
        const childR = radius * 0.55;
        const childTip = tipRadius * 0.6;
        createBranchTree(group, depth - 1, childLen, ap, childDir, childR, childTip);
      }
    }
    return group;
  }

  // Trunk
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2520, roughness: 0.85 });
  const trunkPoints = [
    [0, 0, 0],
    [0.2, 1.5, 0.1],
    [-0.15, 3.2, 0.2],
    [0.3, 5.0, -0.1],
    [0.1, 7.0, 0],
  ];
  const trunkGeo = createTaperedBranch(trunkPoints, 0.38, 0.025);
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.castShadow = true;
  trunk.name = 'mainTrunk';
  const trunkCurve = new THREE.CatmullRomCurve3(trunkPoints.map(p => new THREE.Vector3(...p)));

  const sakuraGroup = new THREE.Group();
  sakuraGroup.name = 'sakuraTree';
  sakuraGroup.add(trunk);

  // Primary branches attached to trunk
  const primaryCount = 8;
  for (let i = 0; i < primaryCount; i++) {
    const t = 0.3 + (i / (primaryCount - 1)) * 0.55 + (rnd() - 0.5) * 0.1;
    const ap = trunkCurve.getPointAt(t);
    const tan = trunkCurve.getTangentAt(t);
    const dir = { x: tan.x + (rnd() - 0.5) * 0.5, z: tan.z + (rnd() - 0.5) * 0.5 };
    const len = Math.hypot(dir.x, dir.z) || 1;
    dir.x /= len;
    dir.z /= len;
    const branchLen = 2.8 + rnd() * 1.2;
    createBranchTree(trunk, 2, branchLen, ap, dir, 0.12, 0.02);
  }

  // Small sakura trees
  function createSmallSakura(x, z, height) {
    const group = new THREE.Group();
    const tGeo = createTrunk(height, 0.12, 0.02);
    const tMesh = new THREE.Mesh(tGeo, trunkMat);
    tMesh.castShadow = true;
    group.add(tMesh);
    // a couple of branches
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + rnd() * 0.5;
      const dir = { x: Math.cos(angle), z: Math.sin(angle) };
      const ap = new THREE.Vector3(0, height * 0.5, 0);
      createBranchTree(group, 1, 1.5 + rnd() * 1.0, ap, dir, 0.06, 0.012);
    }
    group.position.set(x, 0, z);
    return group;
  }

  // small trees created later after sakuraGroup
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

  // Shared materials: avoid creating a new material per stalk.
  const stalkMaterials = [
    new THREE.MeshStandardMaterial({
      color: 0x476b3b,
      roughness: 0.48,
      metalness: 0.02
    }),
    new THREE.MeshStandardMaterial({
      color: 0x557a43,
      roughness: 0.52,
      metalness: 0.01
    }),
    new THREE.MeshStandardMaterial({
      color: 0x3c6035,
      roughness: 0.58
    })
  ];

  const nodeMat = new THREE.MeshStandardMaterial({
    color: 0x354f2d,
    roughness: 0.65
  });

  const leafMaterials = [
    new THREE.MeshStandardMaterial({
      color: 0x426b32,
      side: THREE.DoubleSide,
      roughness: 0.8
    }),
    new THREE.MeshStandardMaterial({
      color: 0x638b46,
      side: THREE.DoubleSide,
      roughness: 0.85
    }),
    new THREE.MeshStandardMaterial({
      color: 0x35582d,
      side: THREE.DoubleSide,
      roughness: 0.9
    })
  ];

  // Shared tapered internode geometry, scaled for different lengths.
  const internodeGeo = new THREE.CylinderGeometry(
    0.82, 1.0, 1, 10, 1, false
  );

  // Narrow pointed leaf shape.
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.quadraticCurveTo(0.025, 0.18, 0.01, 0.42);
  leafShape.quadraticCurveTo(0.0, 0.50, -0.01, 0.42);
  leafShape.quadraticCurveTo(-0.025, 0.18, 0, 0);

  const leafGeo = new THREE.ShapeGeometry(leafShape, 5);
  leafGeo.translate(0, 0, 0);

  // Use one shared curved leaf vein for subtle shape.
  const veinMat = new THREE.MeshStandardMaterial({
    color: 0x77965a,
    roughness: 0.9
  });

  for (let i = 0; i < count; i++) {
    const stalkHeight = 4.5 + Math.random() * 3.5;
    const stalkLean = (Math.random() - 0.5) * 0.10;
    const stalkX = (Math.random() - 0.5) * 0.85;
    const stalkZ = (Math.random() - 0.5) * 0.85;
    const stalkMat =
      stalkMaterials[Math.floor(Math.random() * stalkMaterials.length)];

    const stalkGroup = new THREE.Group();
    stalkGroup.position.set(stalkX, 0, stalkZ);
    stalkGroup.rotation.z = stalkLean;
    stalkGroup.rotation.x = (Math.random() - 0.5) * 0.035;
    group.add(stalkGroup);

    // Each bamboo stalk consists of internodes separated by raised nodes.
    const internodeCount = 6 + Math.floor(Math.random() * 3);
    const segmentLength = stalkHeight / internodeCount;
    const baseRadius = 0.065 + Math.random() * 0.012;

    for (let n = 0; n < internodeCount; n++) {
      const t = n / internodeCount;
      const radius = baseRadius * (1 - t * 0.24);

      const segment = new THREE.Mesh(internodeGeo, stalkMat);
      segment.position.y = n * segmentLength + segmentLength * 0.5;
      segment.scale.set(
        radius,
        segmentLength * 0.88,
        radius
      );
      segment.castShadow = true;
      segment.receiveShadow = true;
      stalkGroup.add(segment);

      // Slightly raised bamboo node.
      const nodeRadius = radius * 1.06;
      const node = new THREE.Mesh(
        new THREE.TorusGeometry(nodeRadius, 0.008, 5, 12),
        nodeMat
      );

      node.rotation.x = Math.PI / 2;
      node.position.y = (n + 1) * segmentLength;
      stalkGroup.add(node);

      // Tiny collar immediately below the node.
      const collar = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 0.99, 0.004, 4, 10),
        stalkMat
      );

      collar.rotation.x = Math.PI / 2;
      collar.position.y = (n + 1) * segmentLength - 0.025;
      stalkGroup.add(collar);

      // A small spray of leaves grows near selected upper nodes.
      if (n >= Math.floor(internodeCount * 0.55) &&
          Math.random() < 0.75) {

        const leafSpray = new THREE.Group();
        leafSpray.position.set(0, (n + 1) * segmentLength - 0.04, 0);

        const leafCount = 3 + Math.floor(Math.random() * 3);

        for (let j = 0; j < leafCount; j++) {
          const angle =
            (j / leafCount) * Math.PI * 1.2 +
            (Math.random() - 0.5) * 0.6;

          const length = 0.45 + Math.random() * 0.55;
          const widthScale = 0.65 + Math.random() * 0.65;

          const leaf = new THREE.Mesh(
            leafGeo,
            leafMaterials[
              Math.floor(Math.random() * leafMaterials.length)
            ]
          );

          leaf.position.set(
            Math.cos(angle) * 0.05,
            0,
            Math.sin(angle) * 0.05
          );

          leaf.rotation.set(
            (Math.random() - 0.5) * 0.5,
            angle,
            -0.5 - Math.random() * 0.8
          );

          leaf.scale.set(widthScale, length, 1);
          leafSpray.add(leaf);
        }

        stalkGroup.add(leafSpray);
      }
    }
  }

  group.position.set(x, 0, z);
  return group;
}


  const bamboo1 = createBamboo(-10, -5, 8); bamboo1.name = 'bamboo1'; scene.add(bamboo1);
  const bamboo2 = createBamboo(10, -8, 6); bamboo2.name = 'bamboo2'; scene.add(bamboo2);
  const bamboo3 = createBamboo(-12, 5, 10); bamboo3.name = 'bamboo3'; scene.add(bamboo3);

  // Small secondary sakura trees
  
function createSmallSakura(x, z, height, blossomDensity = 16) {
  const group = new THREE.Group();

  // Deterministic randomness makes each tree's shape stable.
  let seed = Math.abs(
    Math.floor(x * 92821 + z * 68917 + height * 7919)
  ) % 2147483647;

  function rnd() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  const branchMat = trunkMat;

  // Main tapered trunk.
  const trunkGeometry = createTrunk(
    height,
    0.12 * (height / 4),
    0.018
  );

  const trunk = new THREE.Mesh(trunkGeometry, trunkMat);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  // Keep flower clusters attached to the actual branch hierarchy.
  const branchGroup = new THREE.Group();
  group.add(branchGroup);

  function addBranch(start, direction, length, radius, depth) {
    if (depth < 0 || length < height * 0.10) return;

    const dir = direction.clone().normalize();
    const startPoint = start.clone();

    // Curved branch with a little natural variation.
    const sideways = new THREE.Vector3(
      (rnd() - 0.5) * 0.35,
      (rnd() - 0.5) * 0.12,
      (rnd() - 0.5) * 0.35
    );

    const endPoint = startPoint.clone()
      .addScaledVector(dir, length)
      .add(sideways.clone().multiplyScalar(length * 0.4));

    const midPoint = startPoint.clone()
      .lerp(endPoint, 0.52)
      .add(sideways.clone().multiplyScalar(length * 0.22));

    const points = [startPoint, midPoint, endPoint];

    const curve = new THREE.CatmullRomCurve3(points);

    // Build a tapered tube along the same curve.
    const geometry = createTaperedBranch(
      points.map(p => [p.x, p.y, p.z]),
      radius,
      Math.max(0.006, radius * 0.15)
    );

    const mesh = new THREE.Mesh(geometry, branchMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    branchGroup.add(mesh);

    // Place blossoms along the finer branches and near their tips.
    if (depth <= 1) {
      const clusterCount = depth === 0
        ? 1 + Math.floor(rnd() * 2)
        : (rnd() < 0.65 ? 1 : 0);

      for (let i = 0; i < clusterCount; i++) {
        const t = depth === 0
          ? 0.65 + rnd() * 0.30
          : 0.75 + rnd() * 0.20;

        const p = curve.getPoint(t);
        const blossom = createFlowerCluster(
          height * (0.10 + rnd() * 0.045),
          3 + Math.floor(rnd() * 3)
        );

        blossom.position.copy(p);

        // Vary blossom placement around the branch.
        blossom.position.x += (rnd() - 0.5) * length * 0.12;
        blossom.position.z += (rnd() - 0.5) * length * 0.12;
        blossom.rotation.set(
          (rnd() - 0.5) * 0.8,
          rnd() * Math.PI * 2,
          (rnd() - 0.5) * 0.8
        );

        branchGroup.add(blossom);
      }
    }

    // More branches near the trunk, fewer toward the tips.
    if (depth > 0) {
      const childCount = depth === 2
        ? 2 + Math.floor(rnd() * 2)
        : 2;

      for (let i = 0; i < childCount; i++) {
        const t = 0.35 + rnd() * 0.48;
        const attachment = curve.getPoint(t);
        const tangent = curve.getTangent(t).normalize();

        // Spread branches outward and slightly upward.
        const angle = (rnd() - 0.5) * 1.7;
        const horizontal = new THREE.Vector3(
          tangent.x + (rnd() - 0.5) * 0.6,
          0,
          tangent.z + (rnd() - 0.5) * 0.6
        );

        if (horizontal.lengthSq() < 0.01) {
          horizontal.set(
            Math.cos(angle),
            0,
            Math.sin(angle)
          );
        }

        horizontal.normalize();
        horizontal.applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          angle
        );

        const childDirection = new THREE.Vector3(
          horizontal.x,
          0.25 + rnd() * 0.45,
          horizontal.z
        ).normalize();

        addBranch(
          attachment,
          childDirection,
          length * (0.48 + rnd() * 0.20),
          radius * 0.58,
          depth - 1
        );
      }
    }
  }

  // Several primary branches distributed around the trunk.
  const primaryCount = 4 + Math.floor(rnd() * 3);

  for (let i = 0; i < primaryCount; i++) {
    const angle = (i / primaryCount) * Math.PI * 2
      + (rnd() - 0.5) * 0.6;

    const branchStart = new THREE.Vector3(
      (rnd() - 0.5) * height * 0.08,
      height * (0.42 + rnd() * 0.30),
      (rnd() - 0.5) * height * 0.08
    );

    const direction = new THREE.Vector3(
      Math.cos(angle),
      0.25 + rnd() * 0.35,
      Math.sin(angle)
    ).normalize();

    addBranch(
      branchStart,
      direction,
      height * (0.32 + rnd() * 0.12),
      height * 0.018,
      2
    );
  }

  // Vary the overall silhouette slightly.
  group.scale.set(
    0.85 + rnd() * 0.30,
    0.92 + rnd() * 0.16,
    0.85 + rnd() * 0.30
  );

  group.position.set(x, 0, z);
  group.userData.blossomDensity = blossomDensity;

  return group;
}

  
const smallTree1 = createSmallSakura(-8, 3, 4.5, 18);
smallTree1.name = "smallSakura1";
scene.add(smallTree1);

const smallTree2 = createSmallSakura(8, 6, 2.8, 12);
smallTree2.name = "smallSakura2";
scene.add(smallTree2);

const smallTree3 = createSmallSakura(-5, -8, 3.2, 15);
smallTree3.name = "smallSakura3";
scene.add(smallTree3);

const smallTree4 = createSmallSakura(7, -4, 2.0, 8);
smallTree4.name = "smallSakura4";
scene.add(smallTree4);


  // Water pond
  const pondGeo = new THREE.CircleGeometry(3, 64);
  const pondMat = new THREE.MeshPhysicalMaterial({ color: 0x3a8ab0, roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.45, transmission: 0.6, ior: 1.33, clearcoat: 1.0, clearcoatRoughness: 0.05, reflectivity: 0.9 });
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

  // Sakura Petal System (instanced, cupped petals)
  function createSakuraPetalSystem(scene, count = 400) {
    const petalGroup = new THREE.Group();
    petalGroup.name = "petalParticles";

    const colors = [0xffc0d0, 0xffd6df, 0xf5a9bf];
    const materials = colors.map(color =>
      new THREE.MeshStandardMaterial({
        color,
        side: THREE.DoubleSide,
        roughness: 0.85,
        metalness: 0,
        transparent: true,
        opacity: 0.92,
        depthWrite: false
      })
    );

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(-0.055, 0.035, -0.075, 0.12, -0.035, 0.19);
    shape.bezierCurveTo(-0.015, 0.225, 0.015, 0.225, 0.035, 0.19);
    shape.bezierCurveTo(0.075, 0.12, 0.055, 0.035, 0, 0);

    const petalGeometry = new THREE.ShapeGeometry(shape, 8);
    const positions = petalGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const px = positions.getX(i);
      const py = positions.getY(i);
      positions.setZ(i, 0.035 * (1 - Math.min(1, Math.abs(px) / 0.075)) * Math.sin(Math.PI * Math.min(1, py / 0.225)));
    }
    positions.needsUpdate = true;
    petalGeometry.computeVertexNormals();

    const batches = materials.map(material => {
      const mesh = new THREE.InstancedMesh(petalGeometry, material, count);
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      petalGroup.add(mesh);
      return mesh;
    });

    const dummy = new THREE.Object3D();
    const petals = [];
    for (let i = 0; i < count; i++) {
      const materialIndex = Math.floor(Math.random() * materials.length);
      const mesh = batches[materialIndex];
      petals.push({
        mesh, materialIndex,
        x: (Math.random() - 0.5) * 40,
        y: Math.random() * 15,
        z: (Math.random() - 0.5) * 40,
        scale: 0.45 + Math.random() * 1.1,
        rx: Math.random() * Math.PI * 2,
        ry: Math.random() * Math.PI * 2,
        rz: Math.random() * Math.PI * 2,
        vrx: (Math.random() - 0.5) * 1.4,
        vry: (Math.random() - 0.5) * 1.0,
        vrz: (Math.random() - 0.5) * 1.2,
        fallSpeed: 0.8 + Math.random() * 1.2,
        drift: 0.15 + Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.6 + Math.random() * 1.5
      });
    }

    function resetPetal(petal, randomHeight = false) {
      petal.x = (Math.random() - 0.5) * 40;
      petal.y = randomHeight ? Math.random() * 15 : 12 + Math.random() * 4;
      petal.z = (Math.random() - 0.5) * 40;
    }

    function update(delta, elapsedTime, windX = 1, windZ = 0.25) {
      const dt = Math.min(delta, 0.05);
      for (const petal of petals) {
        petal.y -= petal.fallSpeed * dt;
        const sway = Math.sin(elapsedTime * petal.wobbleSpeed + petal.phase);
        petal.x += (windX * petal.drift + sway * 0.25) * dt;
        petal.z += (windZ * petal.drift + Math.cos(elapsedTime * petal.wobbleSpeed + petal.phase) * 0.12) * dt;
        petal.rx += petal.vrx * dt;
        petal.ry += petal.vry * dt;
        petal.rz += (petal.vrz + sway * 0.3) * dt;
        if (petal.y < 0) resetPetal(petal);
        dummy.position.set(petal.x, petal.y, petal.z);
        dummy.rotation.set(petal.rx, petal.ry, petal.rz);
        dummy.scale.set(petal.scale * 0.8, petal.scale, petal.scale);
        dummy.updateMatrix();
        petal.mesh.setMatrixAt(petal._batchIndex, dummy.matrix);
      }
      for (const batch of batches) batch.instanceMatrix.needsUpdate = true;
    }

    const batchCounts = new Array(batches.length).fill(0);
    for (const petal of petals) petal._batchIndex = batchCounts[petal.materialIndex]++;
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const visibleCount = batchCounts[b];
      batch.count = visibleCount;
    }

    petalGroup.userData.update = update;
    petalGroup.userData.dispose = () => {
      petalGeometry.dispose();
      materials.forEach(m => m.dispose());
    };
    scene.add(petalGroup);
    update(0, 0);
    return petalGroup;
  }

  const petals = createSakuraPetalSystem(scene, 200);
  const clock = new THREE.Clock();

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

  // SSAO disabled for performance; keep bloom only
  // const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
  // ssaoPass.kernelRadius = 4;
  // ssaoPass.minDistance = 0.005;
  // ssaoPass.maxDistance = 0.1;
  // ssaoPass.output = SSAOPass.OUTPUT.Default;
  // composer.addPass(ssaoPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.6,   // strength
    0.4,   // radius
    0.85   // threshold
  );
  composer.addPass(bloomPass);

  // SMAA disabled for performance; rely on antialiasing

  composer.addPass(new OutputPass());

  function updateAnimations(time) {
    skyMat.uniforms.uTime.value = time;

    const delta = clock.getDelta();
    const elapsedTime = clock.elapsedTime;
    petals.userData.update(delta, elapsedTime, 1.0, 0.25);

    // Wind: traverse hierarchy, sway increases toward tips
    sakuraGroup.traverse((obj) => {
      if (obj.name && obj.name.startsWith('branch_d')) {
        const depth = parseInt(obj.name.replace('branch_d', '')) || 0;
        const amp = depth === 2 ? 0.005 : depth === 1 ? 0.015 : 0.03;
        obj.rotation.z = Math.sin(time * 0.6 + depth) * amp;
        obj.rotation.x = Math.cos(time * 0.4 + depth * 0.7) * amp * 0.5;
      }
      if (obj.name && obj.name.startsWith('flowerCluster_')) {
        obj.rotation.z = Math.sin(time * 0.8) * 0.02;
        obj.rotation.x = Math.cos(time * 0.6) * 0.015;
      }
    });

    pondMat.opacity = 0.75 + Math.sin(time * 1.5) * 0.05;

    grassMaterial.uniforms.time.value = time;

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
