// Public-site niceties: eased ("slow") scrolling and a two-part custom
// cursor (a tight dot + a trailing ring). Both are opt-out — skipped
// entirely for anyone with prefers-reduced-motion, and the cursor is also
// skipped on touch/coarse-pointer devices, where there's no mouse cursor
// to replace and smoothing already changes nothing.
(function () {
  // A little Easter egg for anyone who opens devtools — borrowed from the
  // joke on Harjote's own LinkedIn banner.
  console.log("%cselect * from RELIABLE;", "font:600 14px 'IBM Plex Mono',monospace; color:#C89B3C;");
  console.log("%c-- 0 rows returned. Still looking.", "font:12px 'IBM Plex Mono',monospace; color:#9BA3AC;");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasFinePointer = window.matchMedia("(pointer: fine)").matches;

  // ---------- theme toggle ----------
  // Placed before the reduceMotion/coarse-pointer early-return below —
  // this is a real control, not a decorative motion feature, so it has to
  // work for every visitor regardless of those preferences.
  const themeToggle = document.querySelector(".theme-toggle");
  if (themeToggle) {
    const getTheme = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");
    const updateToggle = () => {
      const next = getTheme() === "light" ? "dark" : "light";
      themeToggle.textContent = next === "light" ? "☀ light" : "☾ dark";
      themeToggle.setAttribute("aria-label", `Switch to ${next} theme`);
    };
    updateToggle();
    themeToggle.addEventListener("click", () => {
      const next = getTheme() === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem("theme", next);
      } catch (e) {
        // Persistence is a nicety, not a requirement — the toggle still
        // works for the rest of this visit even if storage is blocked.
      }
      updateToggle();
      // The compass is a WebGL scene with its own hardcoded materials —
      // CSS variable changes can't reach it, so it listens for this event
      // to rebuild itself in the new theme's palette (see compass-scene.js).
      window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: next } }));
    });
  }

  // ---------- eased scrolling ----------
  if (!reduceMotion && window.Lenis) {
    const lenis = new window.Lenis({
      duration: 1.3,
      easing: (t) => 1 - Math.pow(1 - t, 3), // ease-out cubic: quick start, slow settle
    });
    requestAnimationFrame(function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    });
  }

  // ---------- scroll reveal ----------
  // Skipped entirely under prefers-reduced-motion — no .reveal class ever
  // gets added, so content just renders normally with nothing to animate
  // or get stuck mid-transition. Not gated on pointer type: this should
  // still run on touch devices, unlike the cursor/drag stuff below.
  if (!reduceMotion) {
    const revealTargets = document.querySelectorAll(".row, .entry, .section-head, .about-teaser");
    const groupCounts = new Map(); // per-parent stagger index, so each list's cascade restarts instead of accumulating across the whole page
    const supportsIO = "IntersectionObserver" in window;
    const io = supportsIO
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                io.unobserve(entry.target);
              }
            });
          },
          { rootMargin: "0px 0px -10% 0px", threshold: 0.1 }
        )
      : null;

    revealTargets.forEach((el) => {
      const index = groupCounts.get(el.parentElement) || 0;
      groupCounts.set(el.parentElement, index + 1);
      el.style.transitionDelay = `${Math.min(index, 6) * 60}ms`;

      el.classList.add("reveal");
      const rect = el.getBoundingClientRect();
      const alreadyVisible = rect.top < window.innerHeight && rect.bottom > 0;
      if (alreadyVisible || !supportsIO) {
        // Already on screen at load (or no IntersectionObserver support) —
        // show it as-is. Both classes land in this same synchronous pass,
        // before the first paint, so there's no earlier frame showing the
        // hidden state for the transition to animate away from — it just
        // renders visible immediately, the same as if .reveal were never
        // there at all.
        el.classList.add("is-visible");
      } else {
        io.observe(el);
      }
    });
  }

  // ---------- magnetic buttons ----------
  // A CTA button that gently follows the cursor while hovered, then springs
  // back to rest the instant the cursor leaves its bounds. Same fine-pointer
  // + motion gate as the custom cursor below — this is a hover effect, and
  // there's no such thing as "hover" on a touch device.
  if (!reduceMotion && hasFinePointer) {
    document.querySelectorAll(".magnetic-btn").forEach((btn) => {
      const STRENGTH = 0.35; // how much of the cursor's offset the button actually follows
      const MAX_OFFSET = 14; // px — keeps the pull noticeable without letting the button wander far from its border

      btn.addEventListener("mouseenter", () => {
        btn.classList.remove("is-returning"); // back to the quick tracking transition for this pass
      });
      btn.addEventListener("mousemove", (e) => {
        const r = btn.getBoundingClientRect();
        const relX = e.clientX - (r.left + r.width / 2);
        const relY = e.clientY - (r.top + r.height / 2);
        const x = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, relX * STRENGTH));
        const y = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, relY * STRENGTH));
        btn.style.transform = `translate(${x}px, ${y}px)`;
      });
      btn.addEventListener("mouseleave", () => {
        btn.classList.add("is-returning"); // swap to the bouncy release transition (see styles.css)
        btn.style.transform = "translate(0, 0)";
      });
    });
  }

  // ---------- custom cursor ----------
  if (reduceMotion || !hasFinePointer) return;

  const dot = document.createElement("div");
  dot.className = "cursor-dot";
  const ring = document.createElement("div");
  ring.className = "cursor-ring";
  document.body.append(dot, ring);
  document.documentElement.classList.add("has-custom-cursor");

  let mouseX = 0, mouseY = 0;
  let ringX = 0, ringY = 0;
  let primed = false; // avoid a jump-in from (0,0) before the first real move

  window.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (!primed) {
      ringX = mouseX;
      ringY = mouseY;
      primed = true;
      dot.style.opacity = "1";
      ring.style.opacity = "1";
    }
    dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
  });

  document.addEventListener("mouseleave", () => {
    dot.style.opacity = "0";
    ring.style.opacity = "0";
  });
  document.addEventListener("mouseenter", () => {
    if (primed) {
      dot.style.opacity = "1";
      ring.style.opacity = "1";
    }
  });

  const HOVER_TARGETS = "a, button, .row, .entry";
  document.addEventListener("mouseover", (e) => {
    if (e.target.closest(HOVER_TARGETS)) ring.classList.add("is-active");
  });
  document.addEventListener("mouseout", (e) => {
    if (e.target.closest(HOVER_TARGETS)) ring.classList.remove("is-active");
  });

  // The compass is draggable and shows its own native grab/grabbing
  // cursor for that (see compass-scene.js) — step the fake cursor aside
  // there so the two don't overlap.
  const CURSOR_EXCLUDE = "#compass-scene";
  document.addEventListener("mouseover", (e) => {
    if (e.target.closest(CURSOR_EXCLUDE)) {
      dot.style.opacity = "0";
      ring.style.opacity = "0";
    }
  });
  document.addEventListener("mouseout", (e) => {
    if (e.target.closest(CURSOR_EXCLUDE) && primed) {
      dot.style.opacity = "1";
      ring.style.opacity = "1";
    }
  });

  (function tick() {
    // Ring eases toward the pointer each frame, so it trails the dot.
    ringX += (mouseX - ringX) * 0.1;
    ringY += (mouseY - ringY) * 0.1;
    ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;
    requestAnimationFrame(tick);
  })();
})();
