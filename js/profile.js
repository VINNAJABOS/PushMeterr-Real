// Halaman Profil & pengaturan: akun, perangkat, satuan, tema, konsistensi, keluar.
import { initShell } from "./shell.js";
import { readStreak, describeStreak } from "./streak.js";
import { getUnit, setUnit } from "./units.js";
import { readLastSeen, formatLastSeen } from "./last-seen.js";

const $ = (id) => document.getElementById(id);
const deviceEl = $("device-status");
const deviceDot = $("device-dot");
const unitBtns = [...document.querySelectorAll("[data-unit]")];
const streakValueEl = $("streak-value");

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

initShell(async (user) => {
  deviceEl.textContent = "memuat";
  readLastSeen(user.uid).then((ts) => {
    deviceEl.textContent = ts ? `terakhir online ${formatLastSeen(ts)}` : "belum pernah tersambung";
  });

  try {
    const view = describeStreak(await readStreak(user.uid));
    streakValueEl.textContent = `${view.count} hari`;
  } catch (err) {
    console.error("Gagal membaca streak dari Firestore:", err);
    streakValueEl.textContent = "-";
  }
});
