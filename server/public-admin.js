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
})();
