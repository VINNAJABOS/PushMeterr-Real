// Tema terang (kertas) / gelap (karbon). Dimuat di <head> sebagai skrip klasik
// supaya tema terpasang sebelum halaman digambar (tanpa kedip).
(function () {
  var KEY = "pm-theme";
  var root = document.documentElement;

  function read() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function save(value) {
    try {
      localStorage.setItem(KEY, value);
    } catch (e) {
      /* mode privat / penyimpanan diblokir: tema tetap berlaku untuk sesi ini */
    }
  }

  function sync() {
    var dark = root.getAttribute("data-theme") === "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(dark));
      btn.setAttribute("title", dark ? "Ganti ke tema terang" : "Ganti ke tema gelap");
    });
    document.querySelectorAll("[data-theme-label]").forEach(function (el) {
      el.textContent = dark ? "Karbon gelap" : "Kertas terang";
    });
  }

  root.setAttribute("data-theme", read() === "dark" ? "dark" : "light");

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-theme-toggle]");
    if (!btn) return;
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    save(next);
    sync();
    document.dispatchEvent(new CustomEvent("themechange", { detail: next }));
  });

  document.addEventListener("DOMContentLoaded", sync);
})();
