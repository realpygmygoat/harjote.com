// Turns the flat CSS dot texture (see body::before in styles.css) into a
// canvas that draws the exact same grid, then lets a click send a ripple
// through it — nearby dots brighten, grow, and push outward along the
// wave as it passes, the way a drop disturbs a pattern of dots on water.
//
// This is a progressive enhancement, not a replacement: the CSS dots stay
// in the markup and only get hidden (via the has-dot-canvas class, see
// styles.css) once this script confirms canvas support and that motion is
// welcome. Anyone without JS, without canvas, or with
// prefers-reduced-motion just keeps the plain static dots.
(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  canvas.id = "dot-field";
  if (!canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  document.body.appendChild(canvas);
  document.documentElement.classList.add("has-dot-canvas");

  const SPACING = 28; // matches background-size in styles.css
  const RADIUS = 1.4;
  const BASE_OPACITY = 0.22;
  const WAVE_SPEED = 0.5; // px/ms
  const WAVE_BAND = 22; // px — how wide the traveling ring is
  const DECAY_MS = 1100; // how long a ripple's energy lasts
  const MAX_DISPLACE = 9; // px, at full strength
  const MAX_ALPHA_BOOST = 0.65;
  const MAX_RADIUS_BOOST = 1.6;

  let colors = readColors();
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let cssW = 0, cssH = 0;
  let ripples = [];
  let looping = false;

  function readColors() {
    const style = getComputedStyle(document.documentElement);
    return {
      brass: style.getPropertyValue("--brass").trim() || "#C89B3C",
      sage: style.getPropertyValue("--sage").trim() || "#6B8A7A",
    };
  }

  function resize() {
    // Reads the canvas's own actual rendered box (its CSS already fills the
    // viewport via position:fixed + inset:0 in styles.css, no explicit
    // width/height needed here) instead of window.innerWidth/innerHeight.
    // Under the site's CSS zoom, those differ — innerWidth stays at the
    // logical, un-zoomed size, while the canvas's rendered box (and real
    // pointer coordinates, which arrive in this same space) are 1.25x
    // bigger. Sizing the internal bitmap from the real rendered box keeps
    // it crisp instead of stretched, and keeps a click's coordinates
    // aligned with the grid without a separate compensation step.
    const rect = canvas.getBoundingClientRect();
    cssW = rect.width;
    cssH = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(0);
  }

  // Mirrors the CSS mask: radial-gradient(ellipse 70% 65% at 50% 45%,
  // transparent 35%, black 85%) — dots fade out near the center of the
  // page and fade back in toward the edges, same composition the banner
  // this pattern is drawn from uses (dots at the margins, clear behind
  // the reading column).
  function maskAlpha(x, y) {
    const cx = cssW * 0.5, cy = cssH * 0.45;
    const rx = cssW * 0.7, ry = cssH * 0.65;
    const d = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
    if (d <= 0.35) return 0;
    if (d >= 0.85) return 1;
    return (d - 0.35) / (0.85 - 0.35);
  }

  function draw(now) {
    ctx.clearRect(0, 0, cssW, cssH);

    // Two interleaved grids, offset by half a cell — identical to the two
    // background-position values in the CSS version.
    const layers = [
      { offX: 0, offY: 0, color: colors.brass },
      { offX: SPACING / 2, offY: SPACING / 2, color: colors.sage },
    ];

    for (const layer of layers) {
      for (let gx = layer.offX - SPACING; gx <= cssW + SPACING; gx += SPACING) {
        for (let gy = layer.offY - SPACING; gy <= cssH + SPACING; gy += SPACING) {
          const base = maskAlpha(gx, gy);
          if (base <= 0 && ripples.length === 0) continue;

          let dx = 0, dy = 0, boost = 0;
          for (const r of ripples) {
            const rdx = gx - r.x, rdy = gy - r.y;
            const dist = Math.sqrt(rdx * rdx + rdy * rdy) || 0.0001;
            const waveRadius = WAVE_SPEED * (now - r.start);
            const diff = dist - waveRadius;
            const pulse = Math.exp(-(diff * diff) / (2 * WAVE_BAND * WAVE_BAND));
            const envelope = Math.exp(-(now - r.start) / DECAY_MS);
            const influence = pulse * envelope;
            if (influence > boost) boost = influence; // strongest ripple wins rather than stacking unboundedly
            dx += (rdx / dist) * influence * MAX_DISPLACE;
            dy += (rdy / dist) * influence * MAX_DISPLACE;
          }

          const alpha = Math.min(1, base * BASE_OPACITY + boost * MAX_ALPHA_BOOST);
          if (alpha <= 0.003) continue;
          const radius = RADIUS + boost * MAX_RADIUS_BOOST;

          ctx.beginPath();
          ctx.arc(gx + dx, gy + dy, radius, 0, Math.PI * 2);
          ctx.fillStyle = layer.color;
          ctx.globalAlpha = alpha;
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    ripples = ripples.filter((r) => now - r.start < DECAY_MS * 2.2);
    draw(now);
    if (ripples.length > 0) {
      requestAnimationFrame(frame);
    } else {
      looping = false; // idle — no point burning frames on an unchanging pattern
    }
  }

  function ensureLoop() {
    if (looping) return;
    looping = true;
    requestAnimationFrame(frame);
  }

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  // The compass and admin panel have their own materials/colors that
  // can't read CSS variables either — same reason this listens for the
  // toggle's custom event instead of relying on a CSS transition.
  window.addEventListener("themechange", () => {
    colors = readColors();
    draw(performance.now());
  });

  window.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const now = performance.now();
    ripples.push({ x: e.clientX, y: e.clientY, start: now });
    draw(now); // paint the very first instant immediately, so the ripple starts without waiting on the next animation frame
    ensureLoop();
  });

  resize();
})();
