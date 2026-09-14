// A small original 3D scene for the homepage hero: a pocket compass built
// entirely from primitive geometry (no external model file). It tilts
// toward the pointer and its needle turns to face the cursor. Fully
// opt-out: skipped with no motion for prefers-reduced-motion, and
// gracefully absent if WebGL isn't available. Runs on every page
// (harmless — it exits immediately if the #compass-scene container isn't
// on the page) but the heavy three.js import itself is only requested by
// pages that actually include it.
//
// Theme-aware: the site's CSS variables can't reach into a WebGL scene,
// so this keeps its own two hand-picked palettes (dark/light) and listens
// for the "themechange" event the toggle button dispatches (see
// public-site.js) to rebuild its materials and face texture to match.
import * as THREE from "/assets/three.module.min.js";

const CONTAINER_ID = "compass-scene";

const PALETTES = {
  dark: {
    face: { bg: "#1B2129", tickMajor: "#E7E2D4", tickMinor: "#9BA3AC", star: "#E7E2D4", letter: "#E7E2D4", inter: "#9BA3AC", hubLight: "#9BA3AC", hubDark: "#7c848c" },
    needle: { north: 0x6b8a7a, south: 0xE7E2D4, tip: 0xc0392b }, // --sage north, --text south
    case: { light: 0x9BA3AC, dark: 0x7c848c }, // steel — same case in both themes
    lights: { ambient: 0xE7E2D4, key: 0xf1f2f4, rim: 0x6b8a7a, accent1: 0xC89B3C, accent2: 0x6b8a7a }, // --text, neutral, --sage, --brass, --sage
  },
  light: {
    face: { bg: "#EDE6D6", tickMajor: "#203348", tickMinor: "#55677A", star: "#203348", letter: "#203348", inter: "#55677A", hubLight: "#9BA3AC", hubDark: "#7c848c" },
    needle: { north: 0x225D61, south: 0x203348, tip: 0xc0392b }, // --brass(teal-deep) north, --text(navy) south
    case: { light: 0x9BA3AC, dark: 0x7c848c },
    lights: { ambient: 0xffffff, key: 0xf1f2f4, rim: 0x85babb, accent1: 0x225D61, accent2: 0x85babb }, // white, neutral, --sage(teal-light), --brass(teal-deep), --sage(teal-light)
  },
};

function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function drawFaceTexture(palette) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const c = 256;
  const deg2rad = (d) => (d * Math.PI) / 180;
  const f = palette.face;

  // The dial background — a touch off from the page's own surface color so
  // the face still reads as its own surface before the steel case frames it.
  ctx.fillStyle = f.bg;
  ctx.beginPath();
  ctx.arc(c, c, 240, 0, Math.PI * 2);
  ctx.fill();

  // Full 0–340° bearing scale (a hiking-compass convention, not the
  // quadrant numbering marine compasses use) — a tick every 5°, a labeled
  // one every 20°, skipping the label at the four cardinals since the
  // letter already marks those.
  for (let deg = 0; deg < 360; deg += 5) {
    const rad = deg2rad(deg);
    const isMajor = deg % 20 === 0;
    const outer = 233, inner = isMajor ? 203 : 218;
    ctx.strokeStyle = isMajor ? f.tickMajor : f.tickMinor;
    ctx.lineWidth = isMajor ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(c + outer * Math.sin(rad), c - outer * Math.cos(rad));
    ctx.lineTo(c + inner * Math.sin(rad), c - inner * Math.cos(rad));
    ctx.stroke();

    if (isMajor && deg % 90 !== 0) {
      ctx.fillStyle = f.tickMajor;
      ctx.font = "600 20px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(deg), c + 185 * Math.sin(rad), c - 185 * Math.cos(rad));
    }
  }

  // Fine 16-line sunburst — long spokes at the 8 named points, short ones
  // between them.
  ctx.strokeStyle = f.star;
  for (let i = 0; i < 16; i++) {
    const angle = deg2rad(i * 22.5);
    const long = i % 2 === 0;
    const len = long ? 148 : 89;
    ctx.lineWidth = long ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(c + 22 * Math.sin(angle), c - 22 * Math.cos(angle));
    ctx.lineTo(c + len * Math.sin(angle), c - len * Math.cos(angle));
    ctx.stroke();
  }

  // All eight named points — cardinals a size up from intercardinals.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = f.letter;
  ctx.font = "700 32px 'IBM Plex Mono', monospace";
  ctx.fillText("N", c, c - 170);
  ctx.fillText("S", c, c + 170);
  ctx.fillText("E", c + 170, c);
  ctx.fillText("W", c - 170, c);
  ctx.font = "600 21px 'IBM Plex Mono', monospace";
  ctx.fillStyle = f.inter;
  const inter = [["NE", 45], ["SE", 135], ["SW", 225], ["NW", 315]];
  for (const [label, deg] of inter) {
    const rad = deg2rad(deg);
    ctx.fillText(label, c + 122 * Math.sin(rad), c - 122 * Math.cos(rad));
  }

  const hub = ctx.createRadialGradient(c, c, 0, c, c, 20);
  hub.addColorStop(0, f.hubLight);
  hub.addColorStop(1, f.hubDark);
  ctx.fillStyle = hub;
  ctx.beginPath();
  ctx.arc(c, c, 20, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildNeedle(palette) {
  const NEEDLE_LENGTH = 1.15;
  const NEEDLE_HALF_WIDTH = 0.13;
  const RED_TIP_FRACTION = 1 / 3; // how much of the north blade, measured from the point, is red

  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(-NEEDLE_HALF_WIDTH, 0);
  shape.lineTo(0, NEEDLE_LENGTH);
  shape.lineTo(NEEDLE_HALF_WIDTH, 0);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);

  const north = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: palette.needle.north, roughness: 0.5 }));
  const south = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: palette.needle.south, roughness: 0.5 }));
  south.rotation.z = Math.PI;
  group.add(north, south);

  // A red marker over the last third of the north blade, the way a real
  // compass needle is often painted near the point rather than the whole
  // blade. The width at redStartY is derived from the blade's own taper
  // (half-width shrinks linearly from NEEDLE_HALF_WIDTH at the base to 0 at
  // the tip) so the red piece's edges land exactly on the blade's edges
  // beneath it, with no overhang or gap.
  const redStartY = NEEDLE_LENGTH * (1 - RED_TIP_FRACTION);
  const redHalfWidthAtStart = NEEDLE_HALF_WIDTH * RED_TIP_FRACTION;
  const tipShape = new THREE.Shape();
  tipShape.moveTo(-redHalfWidthAtStart, redStartY);
  tipShape.lineTo(0, NEEDLE_LENGTH);
  tipShape.lineTo(redHalfWidthAtStart, redStartY);
  tipShape.closePath();
  const tip = new THREE.Mesh(
    new THREE.ShapeGeometry(tipShape),
    new THREE.MeshStandardMaterial({ color: palette.needle.tip, roughness: 0.45 })
  );
  tip.position.z = 0.01; // sits a hair in front of the blade beneath it, avoids z-fighting
  group.add(tip);

  return group;
}

function buildCompass(palette) {
  const steel = new THREE.MeshStandardMaterial({ color: palette.case.light, metalness: 0.85, roughness: 0.28 });
  const steelDark = new THREE.MeshStandardMaterial({ color: palette.case.dark, metalness: 0.8, roughness: 0.32 });

  const compass = new THREE.Group();

  const caseGeo = new THREE.CylinderGeometry(1.6, 1.6, 0.32, 64);
  caseGeo.rotateX(Math.PI / 2);
  compass.add(new THREE.Mesh(caseGeo, steel));

  const bezel = new THREE.Mesh(new THREE.TorusGeometry(1.58, 0.05, 16, 64), steelDark);
  bezel.position.z = 0.16;
  compass.add(bezel);

  const face = new THREE.Mesh(
    new THREE.CircleGeometry(1.42, 64),
    new THREE.MeshStandardMaterial({ map: drawFaceTexture(palette), roughness: 0.6, metalness: 0.05 })
  );
  // The case is a solid cylinder — its front cap (at z = case height / 2 =
  // 0.16) is an opaque disc, so everything meant to be visible has to sit
  // IN FRONT of that cap, not behind it, or the cap just hides it.
  face.position.z = 0.18;
  compass.add(face);

  const needle = buildNeedle(palette);
  needle.position.z = 0.2;
  compass.add(needle);

  const pivotGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.06, 24);
  pivotGeo.rotateX(Math.PI / 2);
  const pivot = new THREE.Mesh(pivotGeo, steelDark);
  pivot.position.z = 0.22;
  compass.add(pivot);

  // The glass cover: a faint tinted pane plus a bright thin ring right at
  // its edge — the ring is what actually sells "there's a physical disc of
  // glass here," since a flat transparent circle alone barely reads over
  // the needle and face sitting just behind it.
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(1.44, 64),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff, transparent: true, opacity: 0.16,
      roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08,
    })
  );
  glass.position.z = 0.25;
  compass.add(glass);

  const glassEdge = new THREE.Mesh(
    new THREE.TorusGeometry(1.44, 0.012, 8, 64),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.5 })
  );
  glassEdge.position.z = 0.26;
  compass.add(glassEdge);

  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 12, 32), steelDark);
  loop.position.set(0, 1.75, 0);
  compass.add(loop);

  return { compass, needle };
}

// Frees the GPU resources (geometry/material/texture) a compass group was
// holding before it's discarded, so switching themes repeatedly doesn't
// leak memory.
function disposeCompass(group) {
  group.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
}

function initCompass() {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  // The compass shows at every screen size, including mobile, so this
  // should always have real dimensions — this is just a defensive bail-out
  // in case some other CSS ever hides the container, so a genuinely
  // invisible element never pays for a WebGL context and render loop it
  // can't show.
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    return; // no WebGL — leave the hero text to stand on its own
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const getSize = () => {
    const rect = container.getBoundingClientRect();
    return { w: rect.width || 260, h: rect.height || 260 };
  };
  const { w, h } = getSize();
  renderer.setSize(w, h);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, w / h, 0.1, 100);
  // Pulled back further than you'd expect for the object's size on purpose:
  // when the compass tilts, its top loop swings toward the camera, and
  // perspective makes anything closer to the lens loom larger — so the
  // loop was clipping against the canvas edge right as it tilted furthest.
  // More distance (plus the tighter tilt clamp below) keeps that swing
  // safely inside the frame.
  camera.position.set(0, 0, 8.5);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambientLight);
  const key = new THREE.DirectionalLight(0xf1f2f4, 1.1);
  key.position.set(3, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6b8a7a, 0.6); // rim light — recolored per theme, ties to the site palette
  rim.position.set(-4, -2, -3);
  scene.add(rim);

  // Two colored point lights, positioned on opposite sides so the steel
  // case and glass edge each pick up a glint from one accent color on one
  // side and the other accent color on the other. Recolored per theme
  // along with everything else.
  const accent1Light = new THREE.PointLight(0xC89B3C, 6, 12);
  accent1Light.position.set(2.6, 2.2, 3.2);
  scene.add(accent1Light);
  const accent2Light = new THREE.PointLight(0x6b8a7a, 6, 12);
  accent2Light.position.set(-2.8, -1.6, 2.8);
  scene.add(accent2Light);

  function applyLightPalette(palette) {
    ambientLight.color.set(palette.lights.ambient);
    key.color.set(palette.lights.key);
    rim.color.set(palette.lights.rim);
    accent1Light.color.set(palette.lights.accent1);
    accent2Light.color.set(palette.lights.accent2);
  }
  applyLightPalette(PALETTES[currentTheme()]);

  let { compass, needle } = buildCompass(PALETTES[currentTheme()]);
  scene.add(compass);

  // Rebuilds the compass mesh + face texture for a new theme. Materials
  // and geometry are cheap to recreate and this only happens on an
  // infrequent user action (toggling the theme), so a full rebuild is
  // simpler and safer than trying to mutate every material/texture in
  // place — the old group is disposed first so nothing leaks.
  function applyPalette(themeName) {
    const palette = PALETTES[themeName] || PALETTES.dark;
    applyLightPalette(palette);
    scene.remove(compass);
    disposeCompass(compass);
    const rebuilt = buildCompass(palette);
    compass = rebuilt.compass;
    needle = rebuilt.needle;
    scene.add(compass);
    render();
  }
  window.addEventListener("themechange", (e) => applyPalette(e.detail && e.detail.theme));

  // ---------- interaction ----------
  // The needle always points at the cursor, anywhere on the page (kept from
  // before). The housing itself no longer follows the cursor — instead it
  // sways gently on its own, and can be grabbed and spun by dragging.
  let targetNeedle = 0, needleAngle = 0, needleVelocity = 0;
  let manualRotX = 0, manualRotY = 0; // drag-driven offset, eases back to 0 on release
  let isDragging = false, dragLastX = 0, dragLastY = 0;

  // Shortest signed distance from `current` to `target`, in radians — so
  // the needle always swings the short way around rather than spinning the
  // long way whenever the cursor crosses behind it (past ±180°).
  function angleDiff(target, current) {
    let d = (target - current) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  window.addEventListener("pointermove", (e) => {
    const rect = container.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    targetNeedle = Math.atan2(-dx, -dy);
  });

  // Click-and-drag to spin the housing by hand. Pointer capture keeps the
  // drag going even if the cursor slips outside the canvas mid-drag.
  container.style.cursor = "grab";
  container.style.touchAction = "none"; // this element handles its own drag; don't let the browser pan/scroll it
  container.addEventListener("pointerdown", (e) => {
    isDragging = true;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
    container.setPointerCapture(e.pointerId);
    container.style.cursor = "grabbing";
  });
  container.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragLastX;
    const dy = e.clientY - dragLastY;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
    manualRotY += dx * 0.012;
    // Positive dy is the pointer moving down; adding it here (rather than
    // subtracting) makes the compass follow the pointer's vertical
    // direction instead of moving opposite it.
    manualRotX = Math.max(-0.45, Math.min(0.45, manualRotX + dy * 0.012));
  });
  function endDrag(e) {
    if (!isDragging) return;
    isDragging = false;
    container.releasePointerCapture(e.pointerId);
    container.style.cursor = "grab";
  }
  container.addEventListener("pointerup", endDrag);
  container.addEventListener("pointercancel", endDrag);

  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      const { w, h } = getSize();
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }).observe(container);
  }

  let inView = true;
  if (window.IntersectionObserver) {
    new IntersectionObserver((entries) => { inView = entries[0].isIntersecting; }).observe(container);
  }

  // Tracked by hand (one getDelta() call per frame) rather than mixed with
  // Clock.getElapsedTime(), which would double up — it also calls
  // getDelta() internally and the two would desync each other's timers.
  const clock = new THREE.Clock();
  let elapsed = 0;

  // Needle spring: an underdamped oscillator, so it overshoots the target
  // bearing and wobbles a couple of times before settling, the way a real
  // magnetic needle does, rather than gliding straight there.
  const NEEDLE_STIFFNESS = 80;
  const NEEDLE_DAMPING = 6;

  // Idle housing sway — slow, small, left-to-right, always running
  // underneath whatever the drag offset is doing.
  const SWAY_SPEED = 0.25;
  const SWAY_AMPLITUDE = 0.28;

  function render() {
    renderer.render(scene, camera);
  }

  function animate() {
    requestAnimationFrame(animate);
    if (document.hidden || !inView) return;

    const dt = Math.min(clock.getDelta(), 0.1); // clamp so a backgrounded tab can't produce a huge jump
    elapsed += dt;

    compass.position.y = Math.sin(elapsed * 0.6) * 0.06;

    // While dragging, manualRotX/Y are being set directly by the pointer
    // handlers above; once released, ease them back to 0 so the housing
    // settles back into its idle sway instead of staying wherever it was
    // dropped.
    if (!isDragging) {
      manualRotX += (0 - manualRotX) * 0.08;
      manualRotY += (0 - manualRotY) * 0.08;
    }
    compass.rotation.x = manualRotX;
    compass.rotation.y = manualRotY + Math.sin(elapsed * SWAY_SPEED) * SWAY_AMPLITUDE;

    const accel = angleDiff(targetNeedle, needleAngle) * NEEDLE_STIFFNESS - needleVelocity * NEEDLE_DAMPING;
    needleVelocity += accel * dt;
    needleAngle += needleVelocity * dt;
    needle.rotation.z = needleAngle;

    render();
  }

  if (reduceMotion) {
    render(); // one still frame, no animation loop, no pointer-driven motion
  } else {
    animate();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCompass);
} else {
  initCompass();
}
