// Scene 3D alat ukur tarikan PushMetter (model dibuat di Blender: blender/build_alat_ukur.py).
// Dipakai di index.html (hero) dan dashboard.html (kartu "Berat Saat Ini").
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const MODEL_URL = "asset/3d/alat-ukur.glb";
const POSTER_URL = "asset/3d/alat-ukur-poster.png";
const MAX_KG = 150; // beban di mana barbel naik maksimal
const PULL_TRAVEL = 0.04; // meter (skala model)
const SPRING_LENGTH = 0.225; // panjang pegas di model Blender

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function showPoster(container) {
  const img = document.createElement("img");
  img.src = POSTER_URL;
  img.alt = "Alat ukur loadcell PushMetter";
  img.className = "stage-poster";
  container.appendChild(img);
}

// LCD biru 16x2 pada kotak kontrol, digambar di canvas lalu dipakai sebagai tekstur.
function createDisplay() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 184;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false; // konvensi UV glTF
  texture.anisotropy = 8;

  function draw(weightText, online) {
    const { width: w, height: h } = canvas;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#2f63ff");
    bg.addColorStop(1, "#1a3fd1");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Grid piksel karakter LCD
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let x = 16; x < w - 16; x += 30) {
      ctx.fillRect(x, 26, 26, 58);
      ctx.fillRect(x, 102, 26, 58);
    }

    ctx.fillStyle = "#eef3ff";
    ctx.shadowColor = "rgba(220,235,255,0.9)";
    ctx.shadowBlur = 8;
    ctx.font = "700 50px Consolas, 'Courier New', monospace";
    ctx.textBaseline = "middle";
    ctx.fillText(`BERAT:${weightText.padStart(6, " ")}kg`, 18, 56);
    ctx.fillText(online ? "STATUS: LIVE" : "STATUS: OFFLINE", 18, 132);
    ctx.shadowBlur = 0;
    texture.needsUpdate = true;
  }

  return { texture, draw };
}

function createContactShadow(size) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 30, 128, 128, 128);
  g.addColorStop(0, "rgba(0,0,0,0.7)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x * 1.5, size.z * 1.35),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.004;
  return mesh;
}

/**
 * Pasang alat ukur 3D ke dalam `container`.
 * frame: "all" = seluruh pelat, "rig" = fokus ke barbel + loadcell + kotak LCD
 * @returns {{ setWeight(kg:number):void, setOnline(on:boolean):void }}
 */
export function mountScale(container, { frame = "all", initialWeight = 0, yaw: baseYaw = -0.62 } = {}) {
  const api = { setWeight() {}, setOnline() {} };
  if (!container) return api;
  if (!hasWebGL()) {
    showPoster(container);
    return api;
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.domElement.className = "stage-canvas";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
  const key = new THREE.DirectionalLight(0xfff4ea, 1.3);
  key.position.set(2, 4, 3);
  const rim = new THREE.PointLight(0xe8f1ec, 4, 6);
  rim.position.set(-1.6, 1.4, -1.4);
  const warm = new THREE.PointLight(0xf4f7f5, 4, 5);
  warm.position.set(1.4, 0.8, 1.6);
  scene.add(key, rim, warm, new THREE.AmbientLight(0xdfe4f2, 0.55));

  const rig = new THREE.Group(); // rotasi drag + parallax
  scene.add(rig);

  const display = createDisplay();
  let weight = initialWeight;
  let online = true;
  display.draw(weight.toFixed(2), online);

  let pullRig = null;
  let pullBaseY = 0;
  const springs = [];
  const loadPoints = [];
  let targetPull = 0;
  let pull = 0;
  let pullVel = 0;
  const pulses = [];
  const focus = new THREE.Vector3(0, 0.4, 0);
  // Bola pembatas terlalu longgar untuk pelat panjang; perkecil jarak kamera.
  const fitScale = frame === "rig" ? 0.95 : 0.72;
  let fitRadius = 1.5;

  new GLTFLoader().load(
    MODEL_URL,
    (gltf) => {
      const model = gltf.scene;
      model.traverse((o) => {
        if (o.isMesh && o.name === "Display") {
          o.material = new THREE.MeshBasicMaterial({ map: display.texture, toneMapped: false });
        }
      });
      pullRig = model.getObjectByName("PullRig");
      if (pullRig) pullBaseY = pullRig.position.y;
      ["Spring_L", "Spring_R"].forEach((n) => {
        const s = model.getObjectByName(n);
        if (s) springs.push(s);
      });
      ["Load_L", "Load_R"].forEach((n) => {
        const p = model.getObjectByName(n);
        if (p) loadPoints.push(p);
      });

      // Pusatkan model: tengah X/Z di 0, alas di y=0.
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -box.min.y, -center.z);
      rig.add(model);
      rig.add(createContactShadow(box.getSize(new THREE.Vector3())));

      // Framing kamera
      model.updateMatrixWorld(true);
      let frameBox = new THREE.Box3().setFromObject(model);
      if (frame === "rig") {
        frameBox = new THREE.Box3();
        ["PullRig", "Case", "Cell_L", "Cell_R"].forEach((n) => {
          const o = model.getObjectByName(n);
          if (o) frameBox.expandByObject(o);
        });
      }
      const sphere = frameBox.getBoundingSphere(new THREE.Sphere());
      focus.copy(sphere.center);
      fitRadius = sphere.radius;
      resize();
      container.classList.add("is-ready");
    },
    undefined,
    (err) => {
      console.error("Gagal memuat model 3D:", err);
      renderer.domElement.remove();
      showPoster(container);
    }
  );

  function spawnPulse() {
    if (reducedMotion || !loadPoints.length) return;
    rig.updateMatrixWorld(true);
    loadPoints.forEach((p) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.03, 0.036, 48),
        new THREE.MeshBasicMaterial({
          color: 0x4a78ff,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      const pos = rig.worldToLocal(p.getWorldPosition(new THREE.Vector3()));
      ring.position.set(pos.x, 0.014, pos.z);
      ring.rotation.x = -Math.PI / 2;
      rig.add(ring);
      pulses.push({ mesh: ring, age: 0 });
    });
  }

  // ---- Interaksi: drag untuk memutar, parallax mengikuti kursor ----
  let yaw = baseYaw;
  let yawVel = 0;
  let dragging = false;
  let lastX = 0;
  const pointer = { x: 0, y: 0 };
  const tilt = { x: 0, y: 0 };

  const el = renderer.domElement;
  el.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.clientX;
    el.setPointerCapture(e.pointerId);
    container.classList.add("is-dragging");
  });
  el.addEventListener("pointermove", (e) => {
    const rect = container.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    if (!dragging) return;
    yawVel = (e.clientX - lastX) * 0.006;
    lastX = e.clientX;
    yaw += yawVel;
  });
  const endDrag = () => {
    dragging = false;
    container.classList.remove("is-dragging");
  };
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);
  el.addEventListener("pointerleave", () => {
    pointer.x = pointer.y = 0;
  });

  const viewDir = new THREE.Vector3(0, 0.48, 1).normalize();
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const vFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hFov = Math.atan(Math.tan(vFov) * camera.aspect);
    const dist = (fitRadius / Math.sin(Math.min(vFov, hFov))) * fitScale;
    camera.position.copy(focus).addScaledVector(viewDir, dist);
    camera.lookAt(focus);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  let visible = true;
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  }).observe(container);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    if (!visible || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    if (!dragging) {
      yawVel *= 0.94;
      yaw += yawVel;
      yaw += (baseYaw - yaw) * 0.012; // kembali pelan ke sudut awal
    }
    tilt.x += (pointer.y * 0.08 - tilt.x) * 0.06;
    tilt.y += (pointer.x * 0.22 - tilt.y) * 0.06;
    const idle = reducedMotion ? 0 : Math.sin(t * 0.5) * 0.08;
    rig.rotation.set(tilt.x, yaw + tilt.y + idle, 0);
    rig.position.y = reducedMotion ? 0 : Math.sin(t * 1.1) * fitRadius * 0.012;

    // Pegas sederhana: barbel "memantul" saat berat berubah, pegas ikut meregang.
    const accel = (targetPull - pull) * 80 - pullVel * 10;
    pullVel += accel * dt;
    pull += pullVel * dt;
    if (pullRig) pullRig.position.y = pullBaseY + pull;
    const stretch = 1 + pull / SPRING_LENGTH;
    springs.forEach((s) => (s.scale.y = stretch));

    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.age += dt;
      const s = 1 + p.age * 5;
      p.mesh.scale.set(s, s, s);
      p.mesh.material.opacity = Math.max(0, 0.9 - p.age * 0.9);
      if (p.age > 1) {
        rig.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        pulses.splice(i, 1);
      }
    }

    renderer.render(scene, camera);
  });

  api.setWeight = (kg) => {
    if (typeof kg !== "number" || !Number.isFinite(kg)) return;
    const changed = kg.toFixed(2) !== weight.toFixed(2);
    weight = kg;
    if (changed) {
      display.draw(weight.toFixed(2), online);
      spawnPulse();
    }
    targetPull = Math.min(Math.max(kg, 0) / MAX_KG, 1) * PULL_TRAVEL;
  };
  api.setOnline = (on) => {
    if (on === online) return;
    online = on;
    display.draw(weight.toFixed(2), online);
  };
  return api;
}
