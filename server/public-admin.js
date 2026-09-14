(function () {
  // Live Markdown preview, used on the post/entry/about editor pages.
  var input = document.getElementById("md-input");
  var preview = document.getElementById("md-preview");
  if (input && preview) {
    var timer = null;
    function renderPreview() {
      fetch("/admin/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: input.value }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) { preview.innerHTML = data.html; })
        .catch(function () { /* ignore preview errors */ });
    }
    input.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(renderPreview, 300);
    });
    renderPreview();
  }

  // Confirm before delete, used on the dashboard.
  document.querySelectorAll("form.confirm-delete").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      var msg = form.getAttribute("data-confirm") || "Are you sure?";
      if (!window.confirm(msg)) e.preventDefault();
    });
  });

  // 2FA setup QR code. Rendered entirely client-side from the otpauth://
  // URI already in the page (see server/views/admin.js) — the TOTP secret
  // never gets sent anywhere to generate this, unlike a third-party
  // "paste your data, get a QR code" API, which would leak the very
  // secret this page exists to protect. Falls back to the manual-entry
  // key (already on the page, in the <details>) if the library didn't
  // load or the data is malformed.
  var qrContainer = document.getElementById("totp-qr");
  if (qrContainer && window.qrcode) {
    var uri = qrContainer.getAttribute("data-otpauth");
    try {
      var qr = window.qrcode(0, "M"); // 0 = auto-size to fit the data
      qr.addData(uri);
      qr.make();
      qrContainer.innerHTML = qr.createImgTag(6, 8, "Scan with your authenticator app");
    } catch (e) {
      qrContainer.textContent = "Couldn't render the QR code — use manual entry below.";
    }
  }
})();
