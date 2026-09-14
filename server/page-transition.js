// Full-viewport "curtain" transition between page loads. There's no
// client-side router here — every navigation is a real page load — so one
// DOM element can't literally travel from the old page to the new one.
// This fakes that with two halves that always move the same direction
// (left to right), so together they read as one continuous sweep:
//
//   old page: curtain slides in from off-screen left -> covers the screen
//             -> real navigation fires
//   new page: starts already covered (that's its default CSS state, see
//             styles.css, so there's nothing to flash past) -> curtain
//             continues rightward, off past the right edge -> parks
//             off-screen left again, ready for the next click
//
// Skipped entirely under prefers-reduced-motion: the curtain is
// display:none via CSS, and this script never attaches its click
// listener, so links behave like plain, instant navigation.
(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const curtain = document.querySelector(".page-curtain");
  if (!curtain) return;

  let ready = false; // true once the on-load reveal has parked the curtain off-left
  let exiting = false; // true once a click has started the cover-and-navigate sequence

  // Must stay longer than the CSS transition duration (.page-curtain.is-animating
  // in styles.css) — this is only a safety net for when transitionend never
  // fires (a backgrounded tab, etc.), and firing it before the real animation
  // finishes would cut the sweep short. Keep the two in sync if you change
  // one — this leaves a 150ms cushion over the current 1s duration.
  const FALLBACK_MS = 1150;

  function forceReflow() {
    // Reading a layout property flushes pending style changes, so a class
    // added right after this is guaranteed to animate from the previous
    // state instead of being coalesced into the same style recalc.
    return curtain.offsetHeight;
  }

  function park() {
    // Jump to off-screen-left with transitions off, so the reset itself
    // is invisible — only the deliberate animated moves should be seen.
    curtain.classList.remove("is-animating");
    curtain.classList.remove("is-revealed");
    forceReflow();
    curtain.classList.add("is-parked");
    forceReflow();
    ready = true;
  }

  function revealOnLoad() {
    ready = false;
    curtain.classList.add("is-animating");
    forceReflow();
    curtain.classList.add("is-revealed"); // -> translateX(100%), sweeping off the right edge

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      park();
    };
    curtain.addEventListener("transitionend", function onEnd(e) {
      if (e.target !== curtain || e.propertyName !== "transform") return;
      curtain.removeEventListener("transitionend", onEnd);
      finish();
    });
    setTimeout(finish, FALLBACK_MS);
  }

  function coverAndGo(href) {
    exiting = true;
    curtain.classList.add("is-animating");
    forceReflow();
    curtain.classList.remove("is-parked"); // -> translateX(0), covering the viewport

    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      window.location.href = href;
    };
    curtain.addEventListener("transitionend", function onEnd(e) {
      if (e.target !== curtain || e.propertyName !== "transform") return;
      curtain.removeEventListener("transitionend", onEnd);
      go();
    });
    setTimeout(go, FALLBACK_MS);
  }

  // Two rAFs, not one: the first is called before the browser has
  // necessarily painted the current (covered) frame, the second is
  // guaranteed to run after that paint — so the reveal's starting point
  // is actually visible before it starts animating away. Backed by a
  // timeout fallback: if a frame never gets scheduled (a backgrounded
  // tab, a slow first paint), the curtain would otherwise sit there
  // covering the page forever with nothing to reveal it.
  let started = false;
  function start() {
    if (started) return;
    started = true;
    revealOnLoad();
  }
  requestAnimationFrame(() => requestAnimationFrame(start));
  setTimeout(start, 150);

  // A page restored from the back/forward cache keeps whatever DOM state
  // it was frozen with — without this it could reappear mid-animation, or
  // already parked with nothing having played. Re-run the same sequence
  // so returning to a page always looks the same as arriving at it fresh.
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    exiting = false;
    started = false;
    curtain.classList.remove("is-animating", "is-revealed", "is-parked");
    forceReflow();
    requestAnimationFrame(() => requestAnimationFrame(start));
    setTimeout(start, 150);
  });

  document.addEventListener("click", (e) => {
    if (!ready || exiting) return;
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const link = e.target.closest("a[href]");
    if (!link) return;
    if (link.target && link.target !== "_self") return;
    if (link.hasAttribute("download")) return;

    let url;
    try {
      url = new URL(link.href, window.location.href);
    } catch (err) {
      return;
    }
    if (url.origin !== window.location.origin) return;

    // A bare "#" (the placeholder social links) or a real same-page anchor
    // jump (href="#section") isn't a navigation — nothing to reload, so
    // let it behave natively rather than running a curtain sweep to
    // nowhere. A link that happens to point at the exact page you're
    // already on (e.g. clicking "Writing" while already on Writing) is
    // different: clicking it genuinely reloads the page (confirmed — it's
    // real browser behavior, not a no-op), so it should get the same
    // animated sweep as any other navigation instead of an abrupt,
    // unanimated native reload.
    const rawHref = link.getAttribute("href") || "";
    const isBarePlaceholder = rawHref === "#";
    const isSamePageAnchor = url.hash !== "" && url.pathname === window.location.pathname && url.search === window.location.search;
    if (isBarePlaceholder || isSamePageAnchor) return;

    e.preventDefault();
    coverAndGo(link.href);
  });
})();
