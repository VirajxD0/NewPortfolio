import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export function createScene(container) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x4a2040, 0.012);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 6, 18);
  camera.lookAt(0, 4, 0);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 60;
  controls.enabled = false;

  // Seeded RNG
  let _seed = 42;
  function rnd() {
    _seed = (_seed * 1664525 + 1013904223) >>> 0;
    return _seed / 4294967296;
  }

  // Geometry cache
  const _geoCache = {};
  function cachedGeo(key, fn) {
    if (!_geoCache[key]) _geoCache[key] = fn();
    return _geoCache[key];
  }

  // ===================================================
  // 4) BEAUTIFUL SUNSET SKY
  // ===================================================
  const skyGeo = new THREE.SphereGeometry(90, 32, 32);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
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

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.1;
          a *= 0.48;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldPos);
        float h = dir.y;

        // Rich sunset gradient
        vec3 horizonFire  = vec3(1.0, 0.28, 0.05);
        vec3 warmOrange   = vec3(1.0, 0.52, 0.12);
        vec3 goldenYellow = vec3(1.0, 0.75, 0.28);
        vec3 softPink     = vec3(0.95, 0.52, 0.52);
        vec3 lavender     = vec3(0.62, 0.38, 0.60);
        vec3 deepPurple   = vec3(0.18, 0.08, 0.28);
        vec3 nightBlue    = vec3(0.05, 0.03, 0.14);

        vec3 col = horizonFire;
        col = mix(col, warmOrange,   smoothstep(-0.10, 0.04, h));
        col = mix(col, goldenYellow, smoothstep(0.01, 0.16, h));
        col = mix(col, softPink,     smoothstep(0.10, 0.32, h));
        col = mix(col, lavender,     smoothstep(0.28, 0.52, h));
        col = mix(col, deepPurple,   smoothstep(0.48, 0.72, h));
        col = mix(col, nightBlue,    smoothstep(0.68, 0.92, h));

        // Sun with glow layers
        vec3 sunDir = normalize(vec3(0.3, 0.12, 0.8));
        float sunDot = max(dot(dir, sunDir), 0.0);
        col += vec3(1.0, 1.0, 0.95) * pow(sunDot, 800.0) * 2.0;
        col += vec3(1.0, 0.80, 0.30) * pow(sunDot, 40.0) * 0.6;
        col += vec3(1.0, 0.50, 0.20) * pow(sunDot, 8.0) * 0.20;
        col += vec3(0.9, 0.30, 0.15) * pow(sunDot, 3.0) * 0.08;

        // Horizon haze
        col = mix(col, vec3(1.0, 0.62, 0.32), exp(-abs(h) * 8.0) * 0.55);

        // Wispy clouds
        if (h > -0.05 && h < 0.60) {
          vec2 cloudUV = dir.xz / (h + 0.3) * 3.5;
          float cloud = fbm(cloudUV + uTime * 0.012);
          cloud = smoothstep(0.38, 0.72, cloud);
          float cloudMask = smoothstep(-0.05, 0.08, h) * smoothstep(0.60, 0.22, h);
          vec3 cloudLit = mix(vec3(1.0, 0.55, 0.2), vec3(0.95, 0.35, 0.3), h * 2.5);
          vec3 cloudDark = mix(vec3(0.6, 0.25, 0.35), vec3(0.3, 0.15, 0.3), h * 2.5);
          vec3 cloudColor = mix(cloudDark, cloudLit, pow(sunDot, 8.0));
          col = mix(col, cloudColor, cloud * cloudMask * 0.60);
        }

        // Stars high up
        if (h > 0.55) {
          float stars = step(0.997, hash(floor(dir.xz * 300.0)));
          float twinkle = 0.5 + 0.5 * sin(uTime * 3.0 + hash(floor(dir.xz * 300.0)) * 20.0);
          col += vec3(0.8, 0.85, 1.0) * stars * twinkle * smoothstep(0.55, 0.82, h) * 0.35;
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // ===================================================
  // LIGHTING
  // ===================================================
  scene.add(new THREE.AmbientLight(0xdda0b0, 0.5));

  const sunLight = new THREE.DirectionalLight(0xffaa55, 1.8);
  sunLight.position.set(8, 15, 20);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -22;
  sunLight.shadow.camera.right = 22;
  sunLight.shadow.camera.top = 22;
  sunLight.shadow.camera.bottom = -22;
  sunLight.shadow.bias = -0.001;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0xccaadd, 0.3);
  fillLight.position.set(-8, 10, -5);
  scene.add(fillLight);

  const backLight = new THREE.PointLight(0xffaacc, 0.6, 40);
  backLight.position.set(-5, 8, -10);
  scene.add(backLight);

  scene.add(new THREE.HemisphereLight(0xffd6e0, 0x2a4a2a, 0.45));

  const rimLight = new THREE.DirectionalLight(0xff8844, 0.4);
  rimLight.position.set(3, 5, 20);
  scene.add(rimLight);

  // ===================================================
  // GROUND
  // ===================================================
  const groundGeo = new THREE.PlaneGeometry(80, 80, 50, 50);
  const gPositions = groundGeo.attributes.position;
  for (let i = 0; i < gPositions.count; i++) {
    const x = gPositions.getX(i);
    const z = gPositions.getY(i);
    const dist = Math.hypot(x - 7, z - 2);
    let y = Math.sin(x * 0.15) * Math.cos(z * 0.15) * 0.3 + (Math.random() - 0.5) * 0.08;
    if (dist < 4.5) y = -0.25;
    gPositions.setZ(i, y);
  }
  groundGeo.computeVertexNormals();

  const texLoader = new THREE.TextureLoader();
  const basePath = import.meta.env.BASE_URL;
  const colorMap = texLoader.load(basePath + 'textures/grass_color.png');
  const normalMapTex = texLoader.load(basePath + 'textures/grass_normal.png');
  const roughnessMap = texLoader.load(basePath + 'textures/grass_roughness.png');
  [colorMap, normalMapTex, roughnessMap].forEach(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(12, 12);
  });
  colorMap.colorSpace = THREE.SRGBColorSpace;

  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
    map: colorMap, normalMap: normalMapTex, roughnessMap, roughness: 0.85
  }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ===================================================
  // INSTANCED GRASS
  // ===================================================
  const grassCount = 14000;
  const grassGeoB = new THREE.PlaneGeometry(0.08, 1.0, 1, 5);
  grassGeoB.translate(0, 0.5, 0);
  const grassPosAttr = grassGeoB.attributes.position;
  for (let i = 0; i < grassPosAttr.count; i++) {
    const y = grassPosAttr.getY(i);
    grassPosAttr.setX(i, grassPosAttr.getX(i) * (1 - Math.pow(Math.max(0, y), 2)));
  }
  grassPosAttr.needsUpdate = true;
  grassGeoB.computeVertexNormals();

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
      uniform float time, windStrength, windSpeed;
      uniform vec2 windDirection;
      varying float vHeight, vVariation;
      void main() {
        vHeight = clamp(position.y, 0.0, 1.0);
        vVariation = amplitude;
        vec4 bp = instanceMatrix * vec4(position, 1.0);
        vec3 origin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float bend = vHeight * vHeight;
        float wp = dot(origin.xz, normalize(windDirection));
        float wave = sin(wp * 0.65 - time * windSpeed + phase);
        float gust = sin(wp * 0.28 - time * windSpeed * 0.55 + phase * 0.4);
        float sway = (wave * 0.7 + gust * 0.3) * windStrength * amplitude * bend;
        bp.x += windDirection.x * sway;
        bp.z += windDirection.y * sway;
        gl_Position = projectionMatrix * modelViewMatrix * bp;
      }
    `,
    fragmentShader: `
      varying float vHeight, vVariation;
      void main() {
        vec3 col = mix(vec3(0.04, 0.08, 0.02), vec3(0.18, 0.28, 0.08), smoothstep(0.0, 1.0, vHeight));
        col *= mix(0.78, 1.12, vVariation);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });

  const grassField = new THREE.InstancedMesh(grassGeoB, grassMaterial, grassCount);
  const pondCenter2D = new THREE.Vector2(7, 2);
  const grassPhases = new Float32Array(grassCount);
  const grassAmplitudes = new Float32Array(grassCount);
  const tempObj = new THREE.Object3D();
  for (let i = 0; i < grassCount; i++) {
    let gx, gz;
    do {
      gx = (Math.random() - 0.5) * 56;
      gz = (Math.random() - 0.5) * 56;
    } while (new THREE.Vector2(gx, gz).distanceTo(pondCenter2D) < 4.5);
    tempObj.position.set(gx, Math.sin(gx * 0.15) * Math.cos(gz * 0.15) * 0.3 + 0.02, gz);
    tempObj.rotation.set(0, Math.random() * Math.PI * 2, 0);
    const s = 0.8 + Math.random() * 0.4;
    tempObj.scale.set(s, s, s);
    tempObj.updateMatrix();
    grassField.setMatrixAt(i, tempObj.matrix);
    grassPhases[i] = Math.random() * Math.PI * 2;
    grassAmplitudes[i] = 0.5 + Math.random() * 0.5;
  }
  grassGeoB.setAttribute('phase', new THREE.InstancedBufferAttribute(grassPhases, 1));
  grassGeoB.setAttribute('amplitude', new THREE.InstancedBufferAttribute(grassAmplitudes, 1));
  grassField.instanceMatrix.needsUpdate = true;
  grassField.frustumCulled = false;
  scene.add(grassField);

  // ===================================================
  // SHARED MATERIALS
  // ===================================================
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2520, roughness: 0.85 });
  const branchMat = new THREE.MeshStandardMaterial({ color: 0x4a3030, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x5a8a4a, side: THREE.DoubleSide, roughness: 0.8 });
  const leafGeoS = cachedGeo('leaf', () => new THREE.PlaneGeometry(0.08, 0.12));
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x777770, roughness: 0.95 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x555550, roughness: 0.95 });

  // ===================================================
  // TAPERED BRANCH BUILDER
  // ===================================================
  function createTaperedBranch(points, baseR, tipR) {
    tipR = tipR || 0.015;
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])));
    const segs = 14, sides = 6;
    const frames = curve.computeFrenetFrames(segs, false);
    const verts = [];
    const idx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const center = curve.getPointAt(t);
      const r = tipR + (baseR - tipR) * Math.pow(1 - t, 1.25);
      for (let j = 0; j < sides; j++) {
        const a = (j / sides) * Math.PI * 2;
        const n = frames.normals[i].clone().multiplyScalar(Math.cos(a))
          .addScaledVector(frames.binormals[i], Math.sin(a));
        const v = center.clone().addScaledVector(n, r);
        verts.push(v.x, v.y, v.z);
      }
    }
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < sides; j++) {
        const a = i * sides + j;
        const b = i * sides + (j + 1) % sides;
        const c = (i + 1) * sides + j;
        const d = (i + 1) * sides + (j + 1) % sides;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geometry.setIndex(idx);
    geometry.computeVertexNormals();
    return { geometry, curve };
  }

  // ===================================================
  // 1) DENSE SAKURA TREE WITH INSTANCED BLOSSOMS
  // ===================================================

  // Build merged flower geometry (5 petals + center in one geo)
  function buildMergedFlowerGeo() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(-0.12, 0.10, -0.19, 0.32, -0.10, 0.43);
    shape.bezierCurveTo(-0.04, 0.51, 0.04, 0.51, 0.10, 0.43);
    shape.bezierCurveTo(0.19, 0.32, 0.12, 0.10, 0, 0);
    const petalGeo = new THREE.ShapeGeometry(shape, 4);

    // Collect all geometry data
    const allPositions = [];
    const allIndices = [];
    let vertexOffset = 0;

    for (let i = 0; i < 5; i++) {
      const p = petalGeo.clone();
      p.applyMatrix4(new THREE.Matrix4().makeRotationZ((i / 5) * Math.PI * 2));
      const pos = p.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        allPositions.push(pos.getX(v), pos.getY(v), pos.getZ(v));
      }
      if (p.index) {
        for (let idx = 0; idx < p.index.count; idx++) {
          allIndices.push(p.index.array[idx] + vertexOffset);
        }
      }
      vertexOffset += pos.count;
      p.dispose();
    }

    // Center sphere
    const center = new THREE.SphereGeometry(0.04, 5, 4);
    center.translate(0, 0, 0.02);
    const cPos = center.attributes.position;
    for (let v = 0; v < cPos.count; v++) {
      allPositions.push(cPos.getX(v), cPos.getY(v), cPos.getZ(v));
    }
    if (center.index) {
      for (let idx = 0; idx < center.index.count; idx++) {
        allIndices.push(center.index.array[idx] + vertexOffset);
      }
    }
    center.dispose();
    petalGeo.dispose();

    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
    result.setIndex(allIndices);
    result.computeVertexNormals();
    return result;
  }

  const flowerGeo = buildMergedFlowerGeo();
  const flowerMats = [
    new THREE.MeshStandardMaterial({ color: 0xffc5d2, roughness: 0.75, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0xffb0c0, roughness: 0.75, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0xffdce6, roughness: 0.75, side: THREE.DoubleSide }),
  ];

  // Collect flower placements during tree building
  const flowerPlacements = [];

  function collectFlowerCluster(worldPos, radius, count) {
    for (let i = 0; i < count; i++) {
      const theta = rnd() * Math.PI * 2;
      const phi = Math.acos(2 * rnd() - 1);
      const r = radius * Math.cbrt(rnd());
      const pos = new THREE.Vector3(
        worldPos.x + r * Math.sin(phi) * Math.cos(theta),
        worldPos.y + r * Math.cos(phi),
        worldPos.z + r * Math.sin(phi) * Math.sin(theta)
      );
      const rot = new THREE.Euler(rnd() * 0.6, rnd() * Math.PI * 2, rnd() * 0.6);
      const scale = 0.18 + rnd() * 0.2;
      flowerPlacements.push({ pos, rot, scale });
    }
  }

  function buildBranchTree(parent, depth, length, attachPt, dir, radius, tipR, worldMatrix) {
    if (depth < 0 || length < 0.4) return;

    const pts = [
      [0, 0, 0],
      [dir.x * length * 0.45 + (rnd() - 0.5) * 0.3, length * 0.35, dir.z * length * 0.45 + (rnd() - 0.5) * 0.3],
      [dir.x * length + (rnd() - 0.5) * 0.2, length * 0.68, dir.z * length + (rnd() - 0.5) * 0.2],
    ];
    const { geometry: bGeo, curve } = createTaperedBranch(pts, radius, tipR);
    const mesh = new THREE.Mesh(bGeo, branchMat);
    mesh.castShadow = true;
    const group = new THREE.Group();
    group.add(mesh);
    group.position.copy(attachPt);
    parent.add(group);

    const childWorld = worldMatrix.clone().multiply(
      new THREE.Matrix4().makeTranslation(attachPt.x, attachPt.y, attachPt.z)
    );

    // Dense flowers based on depth
    const isTerminal = depth === 0;
    if (isTerminal) {
      for (let ci = 0; ci < 6; ci++) {
        const t = 0.1 + ci * 0.14 + rnd() * 0.06;
        const pt = curve.getPointAt(Math.min(t, 0.95));
        const wp = pt.clone().applyMatrix4(childWorld);
        collectFlowerCluster(wp, 0.5, 4 + Math.floor(rnd() * 3));
      }
    } else if (depth === 1) {
      for (let ci = 0; ci < 4; ci++) {
        const t = 0.15 + ci * 0.2 + rnd() * 0.06;
        const pt = curve.getPointAt(Math.min(t, 0.92));
        const wp = pt.clone().applyMatrix4(childWorld);
        collectFlowerCluster(wp, 0.45, 3 + Math.floor(rnd() * 2));
      }
    } else {
      for (let ci = 0; ci < 2; ci++) {
        const t = 0.4 + ci * 0.25 + rnd() * 0.1;
        const pt = curve.getPointAt(Math.min(t, 0.9));
        const wp = pt.clone().applyMatrix4(childWorld);
        collectFlowerCluster(wp, 0.4, 2 + Math.floor(rnd() * 2));
      }
    }

    // Leaves
    const leafN = isTerminal ? 3 : depth === 1 ? 2 : 1;
    for (let i = 0; i < leafN; i++) {
      const t = 0.2 + rnd() * 0.7;
      const pt = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const leaf = new THREE.Mesh(leafGeoS, leafMat);
      leaf.position.copy(pt);
      leaf.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.normalize());
      leaf.rotateZ((rnd() - 0.5) * 1.2);
      const ls = 0.6 + rnd() * 0.5;
      leaf.scale.set(ls, ls, ls);
      group.add(leaf);
    }

    // Children
    if (depth > 0) {
      const cc = depth === 2 ? 4 : 3;
      for (let i = 0; i < cc; i++) {
        const t = 0.4 + rnd() * 0.4;
        const ap = curve.getPointAt(t);
        const tan = curve.getTangentAt(t);
        const angle = (rnd() - 0.5) * 1.2;
        const cd = {
          x: tan.x * Math.cos(angle) - tan.z * Math.sin(angle),
          z: tan.x * Math.sin(angle) + tan.z * Math.cos(angle),
        };
        const l = Math.hypot(cd.x, cd.z) || 1;
        cd.x /= l;
        cd.z /= l;
        buildBranchTree(group, depth - 1, length * (0.48 + rnd() * 0.22), ap, cd, radius * 0.55, tipR * 0.6, childWorld);
      }
    }
  }

  // Build main trunk
  const sakuraGroup = new THREE.Group();
  sakuraGroup.name = 'sakuraTree';

  const trunkPts = [
    [0, 0, 0], [0.15, 1.8, 0.1], [-0.1, 3.5, 0.15],
    [0.2, 5.2, -0.1], [0.08, 7.0, 0.05]
  ];
  const { geometry: trunkGeo, curve: trunkCurve } = createTaperedBranch(trunkPts, 0.4, 0.03);
  const trunkMesh = new THREE.Mesh(trunkGeo, trunkMat);
  trunkMesh.castShadow = true;
  sakuraGroup.add(trunkMesh);

  // Primary branches
  const trunkWorld = new THREE.Matrix4();
  const primaryBranchCount = 7;
  for (let i = 0; i < primaryBranchCount; i++) {
    const t = 0.28 + (i / (primaryBranchCount - 1)) * 0.58 + (rnd() - 0.5) * 0.08;
    const ap = trunkCurve.getPointAt(Math.min(t, 0.95));
    const tan = trunkCurve.getTangentAt(Math.min(t, 0.95));
    const dir = { x: tan.x + (rnd() - 0.5) * 0.6, z: tan.z + (rnd() - 0.5) * 0.6 };
    const l = Math.hypot(dir.x, dir.z) || 1;
    dir.x /= l;
    dir.z /= l;
    buildBranchTree(trunkMesh, 2, 2.8 + rnd() * 1.5, ap, dir, 0.13, 0.02, trunkWorld);
  }

  // Create instanced flower meshes from collected placements
  const totalFlowers = flowerPlacements.length;
  const flowersPerMat = Math.ceil(totalFlowers / flowerMats.length);
  const flowerInstances = flowerMats.map(mat => {
    const im = new THREE.InstancedMesh(flowerGeo, mat, flowersPerMat);
    im.frustumCulled = false;
    im.castShadow = false;
    return im;
  });

  const flowerDummy = new THREE.Object3D();
  const matCounters = new Array(flowerMats.length).fill(0);
  for (let i = 0; i < totalFlowers; i++) {
    const f = flowerPlacements[i];
    const matIdx = i % flowerMats.length;
    const idx = matCounters[matIdx];
    if (idx < flowersPerMat) {
      flowerDummy.position.copy(f.pos);
      flowerDummy.rotation.copy(f.rot);
      flowerDummy.scale.setScalar(f.scale);
      flowerDummy.updateMatrix();
      flowerInstances[matIdx].setMatrixAt(idx, flowerDummy.matrix);
      matCounters[matIdx]++;
    }
  }
  flowerInstances.forEach((im, i) => {
    im.count = matCounters[i];
    im.instanceMatrix.needsUpdate = true;
    sakuraGroup.add(im);
  });

  scene.add(sakuraGroup);

  // ===================================================
  // SMALL SAKURA TREES
  // ===================================================
  function createSmallSakura(x, z, height) {
    const group = new THREE.Group();
    let ls = Math.abs(Math.floor(x * 92821 + z * 68917 + height * 7919)) % 2147483647;
    function lr() {
      ls = (ls * 16807) % 2147483647;
      return (ls - 1) / 2147483646;
    }

    const { geometry: stGeo } = createTaperedBranch([
      [0, 0, 0], [0.1, height * 0.35, 0.05],
      [-0.05, height * 0.65, 0.08], [0.05, height, 0]
    ], 0.1 * (height / 4), 0.015);
    const stMesh = new THREE.Mesh(stGeo, trunkMat);
    stMesh.castShadow = true;
    group.add(stMesh);

    const bCount = 3 + Math.floor(lr() * 2);
    const savedSeed = _seed;
    for (let i = 0; i < bCount; i++) {
      const angle = (i / bCount) * Math.PI * 2 + lr() * 0.5;
      const dir = { x: Math.cos(angle), z: Math.sin(angle) };
      const ap = new THREE.Vector3(lr() * 0.05, height * (0.4 + lr() * 0.3), lr() * 0.05);
      _seed = ls;
      buildBranchTree(group, 1, height * 0.3 + lr() * height * 0.12, ap, dir, 0.04, 0.008,
        new THREE.Matrix4().makeTranslation(x, 0, z));
      ls = _seed;
    }
    _seed = savedSeed;

    group.position.set(x, 0, z);
    return group;
  }

  const smallFlowersBefore = flowerPlacements.length;
  scene.add(createSmallSakura(-8, 3, 4.5));
  scene.add(createSmallSakura(8, 6, 2.8));
  scene.add(createSmallSakura(-5, -8, 3.2));

  // Instance any additional flowers from small trees
  if (flowerPlacements.length > smallFlowersBefore) {
    const newCount = flowerPlacements.length - smallFlowersBefore;
    const extraMesh = new THREE.InstancedMesh(flowerGeo, flowerMats[0], newCount);
    extraMesh.frustumCulled = false;
    for (let i = 0; i < newCount; i++) {
      const f = flowerPlacements[smallFlowersBefore + i];
      flowerDummy.position.copy(f.pos);
      flowerDummy.rotation.copy(f.rot);
      flowerDummy.scale.setScalar(f.scale);
      flowerDummy.updateMatrix();
      extraMesh.setMatrixAt(i, flowerDummy.matrix);
    }
    extraMesh.instanceMatrix.needsUpdate = true;
    scene.add(extraMesh);
  }

  // ===================================================
  // 2) REALISTIC POND
  // ===================================================
  const pondPos = new THREE.Vector3(7, 0.4, 2);
  const pondR = 3.2;

  // Dark, shallow pond basin
  const pondBedGeo = new THREE.CircleGeometry(3.35, 96);
  const pondBedMat = new THREE.MeshStandardMaterial({ color: 0x182e29, roughness: 0.92, metalness: 0 });
  const pondBed = new THREE.Mesh(pondBedGeo, pondBedMat);
  pondBed.rotation.x = -Math.PI / 2;
  pondBed.position.set(pondPos.x, 0.2, pondPos.z);
  pondBed.receiveShadow = true;
  scene.add(pondBed);

  // Underwater pebbles
  const pebbleGeo = cachedGeo('pebble', () => new THREE.SphereGeometry(0.1, 5, 4));
  const pebbleMat = new THREE.MeshStandardMaterial({ color: 0x3a4a3a, roughness: 0.9 });
  for (let i = 0; i < 25; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * (pondR - 0.5);
    const peb = new THREE.Mesh(pebbleGeo, pebbleMat);
    peb.position.set(pondPos.x + Math.cos(a) * r, 0.2, pondPos.z + Math.sin(a) * r);
    peb.scale.set(0.5 + Math.random(), 0.2 + Math.random() * 0.2, 0.5 + Math.random());
    scene.add(peb);
  }

  // Water surface shader
  const waterUniforms = {
    uTime: { value: 0 },
    uCameraPos: { value: camera.position.clone() },
    uSunDir: { value: new THREE.Vector3(0.3, 0.15, 0.8).normalize() },
  };

  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying vec3 vLocalPos;

      vec3 mod289v3(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
      vec2 mod289v2(vec2 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
      vec3 permute(vec3 x){ return mod289v3(((x * 34.0) + 1.0) * x); }

      float snoise(vec2 v){
        const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                           -0.577350269189626, 0.024390243902439);
        vec2 i = floor(v + dot(v, C.yy));
        vec2 x0 = v - i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289v2(i);
        vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
        vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
        m = m * m;
        m = m * m;
        vec3 x3 = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x3) - 0.5;
        vec3 ox = floor(x3 + 0.5);
        vec3 a0 = x3 - ox;
        m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
        vec3 g;
        g.x = a0.x * x0.x + h.x * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }

      void main(){
        vUv = uv;
        vLocalPos = position;
        vec3 pos = position;
        float w1 = snoise(pos.xy * 2.0 + uTime * 0.25) * 0.03;
        float w2 = snoise(pos.xy * 4.5 - uTime * 0.4) * 0.015;
        float w3 = snoise(pos.xy * 9.0 + uTime * 0.7) * 0.006;
        float dist = length(pos.xy);
        float ripple = sin(dist * 6.0 - uTime * 2.5) * 0.004 * (1.0 - smoothstep(0.0, 3.0, dist));
        pos.z += w1 + w2 + w3 + ripple;

        vec4 wp = modelMatrix * vec4(pos, 1.0);
        vWorldPos = wp.xyz;

        float e = 0.03;
        float hL = snoise((pos.xy + vec2(-e, 0.0)) * 2.0 + uTime * 0.25) * 0.03
                  + snoise((pos.xy + vec2(-e, 0.0)) * 4.5 - uTime * 0.4) * 0.015;
        float hR = snoise((pos.xy + vec2(e, 0.0)) * 2.0 + uTime * 0.25) * 0.03
                  + snoise((pos.xy + vec2(e, 0.0)) * 4.5 - uTime * 0.4) * 0.015;
        float hD = snoise((pos.xy + vec2(0.0, -e)) * 2.0 + uTime * 0.25) * 0.03
                  + snoise((pos.xy + vec2(0.0, -e)) * 4.5 - uTime * 0.4) * 0.015;
        float hU = snoise((pos.xy + vec2(0.0, e)) * 2.0 + uTime * 0.25) * 0.03
                  + snoise((pos.xy + vec2(0.0, e)) * 4.5 - uTime * 0.4) * 0.015;

        vec3 pn = normalize(vec3((hL - hR) / (2.0 * e), (hD - hU) / (2.0 * e), 1.0));
        vNormal = normalize((modelMatrix * vec4(pn, 0.0)).xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uCameraPos;
      uniform vec3 uSunDir;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying vec3 vLocalPos;

      void main(){
        vec3 V = normalize(uCameraPos - vWorldPos);
        vec3 N = normalize(vNormal);

        // Fresnel
        float fresnel = pow(1.0 - max(dot(V, N), 0.0), 5.0);
        fresnel = mix(0.04, 1.0, fresnel);

        // Reflection
        vec3 R = reflect(-V, N);
        vec3 reflCol = mix(
          vec3(1.0, 0.55, 0.2),
          vec3(0.25, 0.18, 0.40),
          smoothstep(-0.1, 0.6, R.y)
        );

        // Sun specular
        vec3 H = normalize(V + uSunDir);
        float spec = pow(max(dot(N, H), 0.0), 256.0);
        float specBroad = pow(max(dot(N, H), 0.0), 32.0);

        // Shoreline
        float radial = length(vLocalPos.xy);
        float angle = atan(vLocalPos.y, vLocalPos.x);
        float shoreline =
            3.02
            + 0.12 * sin(angle * 3.0 + 0.4)
            + 0.07 * sin(angle * 7.0 - 1.1)
            + 0.035 * sin(angle * 13.0);
        if (radial > shoreline) discard;

        float distFromCenter = clamp(radial / 3.2, 0.0, 1.0);
        vec3 deepCol = vec3(0.025, 0.105, 0.095);
        vec3 shallowCol = vec3(0.12, 0.24, 0.19);
        vec3 waterCol = mix(deepCol, shallowCol, smoothstep(0.15, 0.95, distFromCenter));

        // Caustics
        float c1 = sin(vWorldPos.x * 10.0 + uTime * 1.5) * sin(vWorldPos.z * 10.0 - uTime * 1.1);
        float c2 = sin(vWorldPos.x * 7.0 - uTime * 0.8) * sin(vWorldPos.z * 8.0 + uTime * 1.3);
        waterCol += vec3(0.08, 0.12, 0.10) * max(c1 * 0.5 + c2 * 0.5, 0.0) * 0.12;

        // Combine
        vec3 col = mix(waterCol, reflCol, fresnel * 0.75);
        col += vec3(1.0, 0.95, 0.85) * spec * 2.5;
        col += vec3(1.0, 0.7, 0.4) * specBroad * 0.15;

        float alpha = mix(0.55, 0.82, 1.0 - distFromCenter);
        alpha = mix(alpha, 0.92, fresnel * 0.4);

        // Edge foam
        float edge = smoothstep(0.92, 1.0, distFromCenter);
        col = mix(col, vec3(0.85, 0.90, 0.88), edge * 0.3);
        alpha = mix(alpha, 0.4, edge);

        gl_FragColor = vec4(col, alpha);
      }
    `
  });

  // Dense grid allows the shader to animate water smoothly.
  const waterGeometry = new THREE.PlaneGeometry(6.8, 6.8, 96, 96);
  const pondMesh = new THREE.Mesh(waterGeometry, waterMat);
  pondMesh.rotation.x = -Math.PI / 2;
  pondMesh.position.copy(pondPos);
  pondMesh.renderOrder = 2;
  scene.add(pondMesh);

  // Pond border stones
  const pondStoneGeo = cachedGeo('pondStone', () => new THREE.DodecahedronGeometry(0.22, 1));
  const shoreMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x777568, roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ color: 0x5d6255, roughness: 0.97 }),
    new THREE.MeshStandardMaterial({ color: 0x918675, roughness: 0.94 }),
    new THREE.MeshStandardMaterial({ color: 0x4e574b, roughness: 1.0 })
  ];
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 3.12 + Math.random() * 0.55;
    const size = 0.55 + Math.random() * 1.3;
    const stone = new THREE.Mesh(pondStoneGeo, shoreMaterials[Math.floor(Math.random() * shoreMaterials.length)]);
    stone.position.set(pondPos.x + Math.cos(a) * r, 0.35 + Math.random() * 0.08, pondPos.z + Math.sin(a) * r);
    stone.scale.set(size * (0.75 + Math.random() * 0.5), 0.25 + Math.random() * 0.35, size * (0.7 + Math.random() * 0.6));
    stone.rotation.set(Math.random() * 0.2, Math.random() * Math.PI, Math.random() * 0.2);
    stone.castShadow = true;
    stone.receiveShadow = true;
    scene.add(stone);
  }

  // Lily pads
  const lilyShape = new THREE.Shape();
  lilyShape.absarc(0, 0, 0.22, 0.12, Math.PI * 2 - 0.12, false);
  lilyShape.lineTo(0, 0);
  const lilyGeo = new THREE.ShapeGeometry(lilyShape, 6);
  const lilyMat2 = new THREE.MeshStandardMaterial({ color: 0x2a6a2a, roughness: 0.7, side: THREE.DoubleSide });
  const lilyFlowerMat = new THREE.MeshStandardMaterial({ color: 0xffddee, roughness: 0.6, side: THREE.DoubleSide });

  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.5 + Math.random() * 2.0;
    const lily = new THREE.Mesh(lilyGeo, lilyMat2);
    lily.rotation.x = -Math.PI / 2;
    lily.rotation.z = Math.random() * Math.PI * 2;
    lily.position.set(pondPos.x + Math.cos(a) * r, 0.025, pondPos.z + Math.sin(a) * r);
    const sc = 0.7 + Math.random() * 0.6;
    lily.scale.set(sc, sc, sc);
    scene.add(lily);

    // Lotus flower
    if (Math.random() > 0.4) {
      const lotusShape = new THREE.Shape();
      lotusShape.moveTo(0, 0);
      lotusShape.bezierCurveTo(-0.04, 0.04, -0.06, 0.12, -0.02, 0.18);
      lotusShape.bezierCurveTo(0, 0.2, 0, 0.2, 0.02, 0.18);
      lotusShape.bezierCurveTo(0.06, 0.12, 0.04, 0.04, 0, 0);
      const lotusGeo = new THREE.ShapeGeometry(lotusShape, 4);
      const lotus = new THREE.Group();
      for (let p = 0; p < 6; p++) {
        const petal = new THREE.Mesh(lotusGeo, lilyFlowerMat);
        petal.rotation.z = (p / 6) * Math.PI * 2;
        petal.rotation.x = 0.3;
        lotus.add(petal);
      }
      lotus.position.set(pondPos.x + Math.cos(a) * r, 0.06, pondPos.z + Math.sin(a) * r);
      lotus.scale.setScalar(0.5 + Math.random() * 0.3);
      scene.add(lotus);
    }
  }

  // Koi fish
  const koiGeo = cachedGeo('koi', () => {
    const g = new THREE.SphereGeometry(0.12, 8, 6);
    g.scale(1, 0.4, 2.5);
    return g;
  });
  const koiColors = [0xff6633, 0xffffff, 0xff3300, 0xffcc00];
  const koiData = [];
  for (let i = 0; i < 4; i++) {
    const koi = new THREE.Mesh(koiGeo, new THREE.MeshStandardMaterial({
      color: koiColors[i], roughness: 0.3, metalness: 0.1
    }));
    const angle = (i / 4) * Math.PI * 2;
    const r = 1.0 + Math.random() * 1.2;
    koi.position.set(pondPos.x + Math.cos(angle) * r, -0.04, pondPos.z + Math.sin(angle) * r);
    scene.add(koi);
    koiData.push({ mesh: koi, angle, r, speed: 0.3 + Math.random() * 0.4, offset: Math.random() * Math.PI * 2 });
  }

  // ===================================================
  // 3) JAPANESE ARCHED BRIDGE
  // ===================================================
  function createJapaneseBridge(bx, bz, rotY, span, rise) {
    const bridgeGroup = new THREE.Group();
    const bridgeMat2 = new THREE.MeshStandardMaterial({ color: 0x8b2020, roughness: 0.55 });
    const railMat2 = new THREE.MeshStandardMaterial({ color: 0x6b1515, roughness: 0.6 });

    const deckCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-span / 2, 0, 0),
      new THREE.Vector3(-span / 4, rise * 0.7, 0),
      new THREE.Vector3(0, rise, 0),
      new THREE.Vector3(span / 4, rise * 0.7, 0),
      new THREE.Vector3(span / 2, 0, 0),
    ]);

    // Deck planks
    const plankGeo = cachedGeo('plank', () => new THREE.BoxGeometry(0.15, 0.04, 1.4));
    const plankCount = 20;
    for (let i = 0; i <= plankCount; i++) {
      const t = i / plankCount;
      const pt = deckCurve.getPointAt(t);
      const tan = deckCurve.getTangentAt(t);
      const plank = new THREE.Mesh(plankGeo, bridgeMat2);
      plank.position.copy(pt);
      plank.position.y -= 0.02;
      plank.lookAt(pt.clone().add(tan));
      plank.rotateY(Math.PI / 2);
      plank.castShadow = true;
      plank.receiveShadow = true;
      bridgeGroup.add(plank);
    }

    // Support beams
    const beamGeo = cachedGeo('beam', () => new THREE.CylinderGeometry(0.04, 0.05, 1, 6));
    for (let i = 0; i < 5; i++) {
      const t = 0.15 + (i / 4) * 0.7;
      const pt = deckCurve.getPointAt(t);
      const beam = new THREE.Mesh(beamGeo, railMat2);
      beam.position.set(pt.x, pt.y / 2 - 0.1, 0);
      beam.scale.y = Math.max(pt.y + 0.2, 0.3);
      beam.castShadow = true;
      bridgeGroup.add(beam);
    }

    // Curved railings
    const railPoints = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const pt = deckCurve.getPointAt(t);
      railPoints.push(new THREE.Vector3(pt.x, pt.y + 0.35, 0));
    }
    const railCurve = new THREE.CatmullRomCurve3(railPoints);
    const railTubeGeo = new THREE.TubeGeometry(railCurve, 24, 0.03, 6, false);

    const deckWidth = 1.4;
    const railL = new THREE.Mesh(railTubeGeo, railMat2);
    railL.position.z = deckWidth / 2 - 0.05;
    railL.castShadow = true;
    bridgeGroup.add(railL);

    const railR = new THREE.Mesh(railTubeGeo, railMat2);
    railR.position.z = -(deckWidth / 2 - 0.05);
    railR.castShadow = true;
    bridgeGroup.add(railR);

    // Vertical posts
    const postGeo = cachedGeo('railPost', () => new THREE.CylinderGeometry(0.02, 0.025, 0.35, 5));
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const pt = deckCurve.getPointAt(t);
      for (const side of [1, -1]) {
        const post = new THREE.Mesh(postGeo, railMat2);
        post.position.set(pt.x, pt.y + 0.16, side * (deckWidth / 2 - 0.05));
        post.castShadow = true;
        bridgeGroup.add(post);
      }
    }

    // End caps
    for (const xEnd of [-span / 2, span / 2]) {
      for (const side of [1, -1]) {
        const capPost = new THREE.Mesh(
          cachedGeo('capPost', () => new THREE.CylinderGeometry(0.04, 0.05, 0.8, 6)),
          railMat2
        );
        capPost.position.set(xEnd, 0.4, side * (deckWidth / 2 - 0.05));
        bridgeGroup.add(capPost);

        const capOrb = new THREE.Mesh(
          cachedGeo('capOrb', () => new THREE.SphereGeometry(0.06, 6, 6)),
          bridgeMat2
        );
        capOrb.position.set(xEnd, 0.82, side * (deckWidth / 2 - 0.05));
        bridgeGroup.add(capOrb);
      }
    }

    bridgeGroup.position.set(bx, 0, bz);
    bridgeGroup.rotation.y = rotY || 0;
    return bridgeGroup;
  }

  const bridge = createJapaneseBridge(6, 7.5, Math.PI * 0.15, 4, 0.8);
  scene.add(bridge);

  // ===================================================
  // LANTERNS (fixed - no Object.assign on Mesh)
  // ===================================================
  const lanternLights = [];

  function createLantern(lx, lz) {
    const lanternGroup = new THREE.Group();
    const lanternStoneMat = new THREE.MeshStandardMaterial({ color: 0x888880, roughness: 0.9 });

    const base = new THREE.Mesh(
      cachedGeo('lBase', () => new THREE.CylinderGeometry(0.35, 0.4, 0.2, 8)),
      lanternStoneMat
    );
    base.position.y = 0.1;
    lanternGroup.add(base);

    const pillar = new THREE.Mesh(
      cachedGeo('lPillar', () => new THREE.CylinderGeometry(0.12, 0.15, 1.2, 8)),
      lanternStoneMat
    );
    pillar.position.y = 0.8;
    lanternGroup.add(pillar);

    const lightBox = new THREE.Mesh(
      cachedGeo('lBox', () => new THREE.BoxGeometry(0.5, 0.5, 0.5)),
      lanternStoneMat
    );
    lightBox.position.y = 1.65;
    lanternGroup.add(lightBox);

    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xffddaa, emissive: 0xffaa66,
      emissiveIntensity: 1.0, transparent: true, opacity: 0.6
    });
    const glow = new THREE.Mesh(
      cachedGeo('lGlow', () => new THREE.SphereGeometry(0.15, 8, 6)),
      glowMat
    );
    glow.position.y = 1.65;
    lanternGroup.add(glow);

    const pointLight = new THREE.PointLight(0xffaa66, 0.5, 6);
    pointLight.position.y = 1.65;
    lanternGroup.add(pointLight);
    lanternLights.push(pointLight);

    const roof = new THREE.Mesh(
      cachedGeo('lRoof', () => new THREE.ConeGeometry(0.45, 0.35, 4)),
      lanternStoneMat
    );
    roof.position.y = 2.1;
    roof.rotation.y = Math.PI / 4;
    lanternGroup.add(roof);

    lanternGroup.position.set(lx, 0, lz);
    lanternGroup.castShadow = true;
    return lanternGroup;
  }

  scene.add(createLantern(5, 1));
  scene.add(createLantern(-4, 5));
  scene.add(createLantern(3, -6));
  scene.add(createLantern(8.5, 6));

  // ===================================================
  // TORII GATE
  // ===================================================
  function createTorii(tx, tz, rotY) {
    const toriiGroup = new THREE.Group();
    const toriiMat = new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.6 });
    const pillarGeo = cachedGeo('tPillar', () => new THREE.CylinderGeometry(0.12, 0.15, 4, 8));

    const pillarL = new THREE.Mesh(pillarGeo, toriiMat);
    pillarL.position.set(-1.2, 2, 0);
    pillarL.castShadow = true;
    toriiGroup.add(pillarL);

    const pillarR = new THREE.Mesh(pillarGeo, toriiMat);
    pillarR.position.set(1.2, 2, 0);
    pillarR.castShadow = true;
    toriiGroup.add(pillarR);

    const topBeam = new THREE.Mesh(
      cachedGeo('tTop', () => new THREE.BoxGeometry(3.5, 0.18, 0.22)),
      toriiMat
    );
    topBeam.position.y = 4.05;
    toriiGroup.add(topBeam);

    const midBeam = new THREE.Mesh(
      cachedGeo('tMid', () => new THREE.BoxGeometry(2.8, 0.1, 0.15)),
      toriiMat
    );
    midBeam.position.y = 3.5;
    toriiGroup.add(midBeam);

    // Curved roof beam
    const roofCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.0, 4.15, 0),
      new THREE.Vector3(-1.0, 4.35, 0),
      new THREE.Vector3(0, 4.45, 0),
      new THREE.Vector3(1.0, 4.35, 0),
      new THREE.Vector3(2.0, 4.15, 0),
    ]);
    const roofTubeGeo = new THREE.TubeGeometry(roofCurve, 16, 0.08, 6, false);
    toriiGroup.add(new THREE.Mesh(roofTubeGeo, toriiMat));

    toriiGroup.position.set(tx, 0, tz);
    toriiGroup.rotation.y = rotY || 0;
    return toriiGroup;
  }
  scene.add(createTorii(-2, 10, 0.3));

  // ===================================================
  // STEPPING STONES & ROCKS
  // ===================================================
  const steppingStoneGeo = cachedGeo('stepStone', () => new THREE.CylinderGeometry(0.38, 0.42, 0.1, 7));
  const stonePositions = [[2, 0.05, 8], [3, 0.05, 6.5], [2.5, 0.05, 5], [1.5, 0.05, 3.5], [0.5, 0.05, 2], [-0.5, 0.05, 0.5]];
  stonePositions.forEach(pos => {
    const stone = new THREE.Mesh(steppingStoneGeo, stoneMat);
    stone.position.set(pos[0], pos[1], pos[2]);
    stone.rotation.y = Math.random() * Math.PI;
    stone.receiveShadow = true;
    scene.add(stone);
  });

  const rockGeo = cachedGeo('rock', () => new THREE.DodecahedronGeometry(0.5, 1));
  const rockData = [
    { p: [6, 0.3, -3], s: [0.8, 0.6, 0.7] },
    { p: [-6, 0.4, 2], s: [1, 0.7, 0.8] },
    { p: [-5.5, 0.2, 2.5], s: [0.4, 0.3, 0.5] },
    { p: [-2, 0.25, -7], s: [0.6, 0.5, 0.7] },
  ];
  rockData.forEach(rd => {
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set(rd.p[0], rd.p[1], rd.p[2]);
    rock.scale.set(rd.s[0], rd.s[1], rd.s[2]);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    scene.add(rock);
  });

  // ===================================================
  // BAMBOO
  // ===================================================
  function createBamboo(bx, bz, count) {
    const bambooGroup = new THREE.Group();
    const bambooMats = [
      new THREE.MeshStandardMaterial({ color: 0x476b3b, roughness: 0.48 }),
      new THREE.MeshStandardMaterial({ color: 0x557a43, roughness: 0.52 }),
    ];
    const bambooLeafMats = [
      new THREE.MeshStandardMaterial({ color: 0x426b32, side: THREE.DoubleSide, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: 0x638b46, side: THREE.DoubleSide, roughness: 0.85 }),
    ];
    const internodeGeo = cachedGeo('internode', () => new THREE.CylinderGeometry(0.82, 1.0, 1, 7, 1));
    const bambooLeafShape = new THREE.Shape();
    bambooLeafShape.moveTo(0, 0);
    bambooLeafShape.quadraticCurveTo(0.025, 0.18, 0.01, 0.42);
    bambooLeafShape.quadraticCurveTo(0.0, 0.50, -0.01, 0.42);
    bambooLeafShape.quadraticCurveTo(-0.025, 0.18, 0, 0);
    const bambooLeafGeo = cachedGeo('bLeaf', () => new THREE.ShapeGeometry(bambooLeafShape, 3));

    for (let i = 0; i < count; i++) {
      const h = 4.5 + Math.random() * 3;
      const stalkGroup = new THREE.Group();
      stalkGroup.position.set((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8);
      stalkGroup.rotation.z = (Math.random() - 0.5) * 0.06;
      bambooGroup.add(stalkGroup);

      const mat = bambooMats[Math.floor(Math.random() * bambooMats.length)];
      const ic = 5 + Math.floor(Math.random() * 2);
      const sl = h / ic;
      const br = 0.065 + Math.random() * 0.01;

      for (let n = 0; n < ic; n++) {
        const t = n / ic;
        const r = br * (1 - t * 0.24);
        const seg = new THREE.Mesh(internodeGeo, mat);
        seg.position.y = n * sl + sl * 0.5;
        seg.scale.set(r, sl * 0.88, r);
        seg.castShadow = true;
        stalkGroup.add(seg);

        if (n >= Math.floor(ic * 0.6) && Math.random() < 0.65) {
          const lc = 2 + Math.floor(Math.random() * 2);
          for (let j = 0; j < lc; j++) {
            const la = (j / lc) * Math.PI * 1.2 + (Math.random() - 0.5) * 0.6;
            const lf = new THREE.Mesh(bambooLeafGeo, bambooLeafMats[Math.floor(Math.random() * bambooLeafMats.length)]);
            lf.position.set(Math.cos(la) * 0.05, (n + 1) * sl, Math.sin(la) * 0.05);
            lf.rotation.set((Math.random() - 0.5) * 0.5, la, -0.5 - Math.random() * 0.8);
            const ls = 0.65 + Math.random() * 0.5;
            lf.scale.set(ls, 0.45 + Math.random() * 0.5, 1);
            stalkGroup.add(lf);
          }
        }
      }
    }
    bambooGroup.position.set(bx, 0, bz);
    return bambooGroup;
  }

  scene.add(createBamboo(-10, -5, 6));
  scene.add(createBamboo(10, -8, 5));
  scene.add(createBamboo(-12, 5, 7));

  // ===================================================
  // MOSS PATCHES
  // ===================================================
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x3a6a3a, roughness: 1.0 });
  for (let i = 0; i < 8; i++) {
    const moss = new THREE.Mesh(new THREE.CircleGeometry(1 + Math.random() * 1.5, 10), mossMat);
    moss.rotation.x = -Math.PI / 2;
    moss.position.set((Math.random() - 0.5) * 22, 0.02, (Math.random() - 0.5) * 22);
    scene.add(moss);
  }

  // ===================================================
  // 5) SMOOTH FALLING PETALS (physics-based)
  // ===================================================
  function createPetalSystem(count) {
    count = count || 300;
    const petalGroup = new THREE.Group();
    petalGroup.name = 'petalParticles';

    const petalColors = [0xffc0d0, 0xffd6df, 0xf5a9bf, 0xffb3c6];

    // Cupped petal shape
    const petalShape = new THREE.Shape();
    petalShape.moveTo(0, 0);
    petalShape.bezierCurveTo(-0.06, 0.04, -0.08, 0.13, -0.04, 0.20);
    petalShape.bezierCurveTo(-0.01, 0.24, 0.01, 0.24, 0.04, 0.20);
    petalShape.bezierCurveTo(0.08, 0.13, 0.06, 0.04, 0, 0);
    const petalGeometry = new THREE.ShapeGeometry(petalShape, 5);

    // Cup the petal
    const petalPosArr = petalGeometry.attributes.position;
    for (let i = 0; i < petalPosArr.count; i++) {
      const px = petalPosArr.getX(i);
      const py = petalPosArr.getY(i);
      petalPosArr.setZ(i, 0.03 * (1 - Math.min(1, Math.abs(px) / 0.08)) * Math.sin(Math.PI * Math.min(1, py / 0.24)));
    }
    petalPosArr.needsUpdate = true;
    petalGeometry.computeVertexNormals();

    const petalMat = new THREE.MeshStandardMaterial({
      color: 0xffc5d5, side: THREE.DoubleSide, roughness: 0.82,
      transparent: true, opacity: 0.88, depthWrite: false
    });

    const petalMesh = new THREE.InstancedMesh(petalGeometry, petalMat, count);
    petalMesh.frustumCulled = false;
    petalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Per-instance color
    const colorArr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const c = new THREE.Color(petalColors[Math.floor(Math.random() * petalColors.length)]);
      colorArr[i * 3] = c.r;
      colorArr[i * 3 + 1] = c.g;
      colorArr[i * 3 + 2] = c.b;
    }
    petalMesh.instanceColor = new THREE.InstancedBufferAttribute(colorArr, 3);
    petalMesh.instanceColor.needsUpdate = true;
    petalGroup.add(petalMesh);

    // Physics data for smooth motion
    const petalData = [];
    for (let i = 0; i < count; i++) {
      petalData.push({
        x: (Math.random() - 0.5) * 45,
        y: Math.random() * 16,
        z: (Math.random() - 0.5) * 45,
        vx: 0, vy: 0, vz: 0,
        rx: Math.random() * Math.PI * 2,
        ry: Math.random() * Math.PI * 2,
        rz: Math.random() * Math.PI * 2,
        vrx: (Math.random() - 0.5) * 0.6,
        vry: (Math.random() - 0.5) * 0.4,
        vrz: (Math.random() - 0.5) * 0.5,
        scale: 0.5 + Math.random() * 0.9,
        mass: 0.8 + Math.random() * 0.4,
        drag: 0.92 + Math.random() * 0.06,
        swayPhase: Math.random() * Math.PI * 2,
        swayFreq: 0.4 + Math.random() * 0.8,
        swayAmpX: 0.3 + Math.random() * 0.5,
        swayAmpZ: 0.15 + Math.random() * 0.3,
        flutterPhase: Math.random() * Math.PI * 2,
        flutterFreq: 1.5 + Math.random() * 2.0,
      });
    }

    const petalDummy = new THREE.Object3D();
    const gravity = -0.35;
    const windBaseX = 0.6;
    const windBaseZ = 0.15;

    function updatePetals(delta, elapsed) {
      const dt = Math.min(delta, 0.04);
      if (dt <= 0) return;

      for (let i = 0; i < count; i++) {
        const p = petalData[i];

        // Smooth gusting wind
        const gustX = Math.sin(elapsed * 0.3 + p.swayPhase * 0.5) * 0.4;
        const gustZ = Math.cos(elapsed * 0.25 + p.swayPhase * 0.7) * 0.2;

        // Smooth sinusoidal sway
        const swayX = Math.sin(elapsed * p.swayFreq + p.swayPhase) * p.swayAmpX;
        const swayZ = Math.cos(elapsed * p.swayFreq * 0.7 + p.swayPhase + 1.0) * p.swayAmpZ;

        // Flutter (catch air effect)
        const flutter = Math.sin(elapsed * p.flutterFreq + p.flutterPhase) * 0.15;

        // Acceleration
        p.vx += ((windBaseX + gustX) * 0.3 + swayX * 0.5) * dt;
        p.vy += (gravity / p.mass + flutter) * dt;
        p.vz += ((windBaseZ + gustZ) * 0.3 + swayZ * 0.5) * dt;

        // Air drag
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.vz *= p.drag;

        // Clamp fall speed
        p.vy = Math.max(p.vy, -1.8);

        // Update position
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;

        // Smooth rotation tied to movement
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
        const rotInfluence = 0.3 + speed * 0.5;
        p.rx += p.vrx * rotInfluence * dt;
        p.ry += p.vry * rotInfluence * dt;
        p.rz += (p.vrz + Math.sin(elapsed * p.flutterFreq + p.flutterPhase) * 0.15) * rotInfluence * dt;

        // Respawn
        if (p.y < -0.5) {
          p.x = (Math.random() - 0.5) * 45;
          p.y = 13 + Math.random() * 5;
          p.z = (Math.random() - 0.5) * 45;
          p.vx = 0;
          p.vy = 0;
          p.vz = 0;
        }

        petalDummy.position.set(p.x, p.y, p.z);
        petalDummy.rotation.set(p.rx, p.ry, p.rz);
        petalDummy.scale.set(p.scale * 0.85, p.scale, p.scale);
        petalDummy.updateMatrix();
        petalMesh.setMatrixAt(i, petalDummy.matrix);
      }
      petalMesh.instanceMatrix.needsUpdate = true;
    }

    petalGroup.userData.update = updatePetals;
    petalGroup.userData.dispose = () => {
      petalGeometry.dispose();
      petalMat.dispose();
    };
    scene.add(petalGroup);
    updatePetals(0, 0);
    return petalGroup;
  }

  const petalSystem = createPetalSystem(350);
  const clock = new THREE.Clock();

  // ===================================================
  // CAMERA VIEWS
  // ===================================================
  const cameraViews = [
    { pos: new THREE.Vector3(0, 6, 18), lookAt: new THREE.Vector3(0, 4, 0) },
    { pos: new THREE.Vector3(2, 2.5, 4), lookAt: new THREE.Vector3(0, 2, 0) },
    { pos: new THREE.Vector3(0, 14, 1), lookAt: new THREE.Vector3(0, 6, 0) },
    { pos: new THREE.Vector3(-3, 1.2, 5), lookAt: new THREE.Vector3(0, 5, 0) },
    { pos: new THREE.Vector3(-12, 5, 14), lookAt: new THREE.Vector3(0, 3, -2) },
    { pos: new THREE.Vector3(8, 3, 8), lookAt: new THREE.Vector3(6, 0.5, 4) },
    { pos: new THREE.Vector3(4, 2, 10), lookAt: new THREE.Vector3(6, 0.8, 7.5) },
  ];

  // ===================================================
  // POST-PROCESSING
  // ===================================================
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.45, 0.5, 0.88
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  // ===================================================
  // ANIMATION LOOP
  // ===================================================
  function updateAnimations(time) {
    skyMat.uniforms.uTime.value = time;
    waterUniforms.uTime.value = time;
    waterUniforms.uCameraPos.value.copy(camera.position);
    grassMaterial.uniforms.time.value = time;

    const delta = clock.getDelta();
    const elapsed = clock.elapsedTime;
    petalSystem.userData.update(delta, elapsed);

    // Tree sway
    sakuraGroup.traverse(obj => {
      if (obj.isGroup && obj !== sakuraGroup) {
        const id = obj.id % 100;
        obj.rotation.z = Math.sin(time * 0.45 + id * 0.3) * 0.006;
        obj.rotation.x = Math.cos(time * 0.3 + id * 0.5) * 0.003;
      }
    });

    // Koi fish
    for (const k of koiData) {
      k.angle += k.speed * 0.016;
      const wobbleR = k.r + Math.sin(time * 0.5 + k.offset) * 0.3;
      k.mesh.position.x = pondPos.x + Math.cos(k.angle + k.offset) * wobbleR;
      k.mesh.position.z = pondPos.z + Math.sin(k.angle + k.offset) * wobbleR;
      k.mesh.position.y = -0.05 + Math.sin(time * 0.8 + k.offset) * 0.015;
      k.mesh.rotation.y = -(k.angle + k.offset) + Math.PI / 2;
    }

    // Lantern flicker
    for (const l of lanternLights) {
      l.intensity = 0.45 + Math.sin(time * 2.5 + l.id * 0.7) * 0.12;
    }

    controls.update();
  }

  // Resize
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  });

  return { scene, camera, renderer, cameraViews, updateAnimations, controls, composer };
}