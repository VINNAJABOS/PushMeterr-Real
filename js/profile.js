// Halaman Profil & pengaturan: akun, perangkat, satuan, tema, konsistensi, keluar.
import { initShell } from "./shell.js";
import { watchLive } from "./live-data.js";
import { readStreak, describeStreak } from "./streak.js";
import { getUnit, setUnit } from "./units.js";

const $ = (id) => document.getElementById(id);
const deviceEl = $("device-status");
const deviceDot = $("device-dot");
const unitBtns = [...document.querySelectorAll("[data-unit]")];
const streakValueEl = $("streak-value");

let lastReceivedAt = null;

function renderUnit() {
  const unit = getUnit();
  unitBtns.forEach((b) => {
    const on = b.dataset.unit === unit;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", String(on));
  });
}

unitBtns.forEach((b) => b.addEventListener("click", () => setUnit(b.dataset.unit)));
document.addEventListener("unitchange", renderUnit);
renderUnit();

function renderDevice() {
  const online = lastReceivedAt !== null && Date.now() - lastReceivedAt < 5000;
  deviceEl.textContent = online ? "terhubung" : lastReceivedAt === null ? "menunggu data" : "tidak ada data baru";
  deviceEl.parentElement.classList.toggle("is-live", online);
  deviceDot.classList.toggle("online", online);
}

initShell(async (user) => {
  watchLive(
    () => {
      lastReceivedAt = Date.now();
      renderDevice();
    },
    () => {
      deviceEl.textContent = "gagal membaca";
    }
  );
  setInterval(renderDevice, 1000);
  renderDevice();

  try {
    const view = describeStreak(await readStreak(user.uid));
    streakValueEl.textContent = `${view.count} hari`;
  } catch (err) {
    console.error("Gagal membaca streak dari Firestore:", err);
    streakValueEl.textContent = "-";
  }
});
