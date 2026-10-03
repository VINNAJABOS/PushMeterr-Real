// Halaman Live: angka sesaat, Record (direkam dan disimpan di alat), tare, status perangkat.
import { initShell } from "./shell.js";
import { saveSession, formatDuration } from "./sessions.js";
import { fmt, getUnit } from "./units.js";
import { mountScale } from "./scene3d.js";
import { createBluetooth, bluetoothSupported } from "./bluetooth.js";
import { drawForceChart } from "./chart.js";
import { upsertSession } from "./device-cache.js";
import { markSeen, readLastSeen, formatLastSeen } from "./last-seen.js";

const $ = (id) => document.getElementById(id);
const readingPanel  = $("reading-panel");
const weightValueEl = $("weight-value");
const unitEls       = document.querySelectorAll("[data-unit-label]");
const statusDot     = $("status-dot");
const statusText    = $("status-text");
const lastUpdateEl  = $("last-update");
const lastOnlineEl  = $("last-online");
const recLabel      = $("rec-label");
const peakBar       = $("peak-bar");
const peakLeft      = $("peak-left");
const peakMid       = $("peak-mid");
const peakRight     = $("peak-right");
const peakValueEl   = $("peak-value");
const avgValueEl    = $("avg-value");
const durationEl    = $("duration-value");
const sessionBtn    = $("session-btn");
const sessionLabel  = $("session-label");
const sessionNote   = $("session-note");
const tareBtn       = $("tare-btn");
const recChartWrap  = $("rec-chart-wrap");
const recChartEl    = $("rec-chart");
const btBtn         = $("bt-btn");
const btBtnLabel    = $("bt-btn-label");
const btPanel       = $("bt-panel");
const btLive        = $("bt-live");
const btCal         = $("bt-cal");
const btNote        = $("bt-note");
const btGrams       = $("bt-grams");
const sideEls = {
  left:  { now: $("side-left"),  peak: $("side-left-peak") },
  right: { now: $("side-right"), peak: $("side-right-peak") },
  total: { now: $("side-total"), peak: $("side-total-peak") },
};
const peakResetBtn  = $("peak-reset");
const btActionBtns  = [$("bt-cal-left"), $("bt-cal-right"), $("bt-tare")];

const scale3d = mountScale($("dash-stage"), { frame: "rig" });

let uid             = null;
let rawKg           = null;  // pembacaan terakhir apa adanya dari sensor
let tareOffset      = 0;     // nol tampilan, hanya di browser ini
let lastReceivedAt  = null;
let session         = null;  // { start, sum, n, peak, points } selama alat merekam
let durationTimer   = null;
let btActive        = false; // true selama Bluetooth tersambung
let sideKg          = null;  // { left, right, total } kg terakhir dari alat (tanpa nol tampilan)
let sidePeaks       = { left: 0, right: 0, total: 0 }; // puncak tekanan sejak sesi dimulai / direset
let lastSeenTs      = null;  // kapan alat terakhir online (ms), dibaca dari akun

const shownKg = () => (rawKg === null ? null : rawKg - tareOffset);

function setOnline(isOnline) {
  statusDot.classList.toggle("online", isOnline);
  statusDot.classList.toggle("offline", !isOnline);
  statusText.textContent = isOnline ? "online" : "offline";
  readingPanel.classList.toggle("is-stale", !isOnline && lastReceivedAt !== null);
  scale3d.setOnline(isOnline);
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 5)  return "baru saja";
  if (s < 60) return `${s} detik lalu`;
  return `${Math.floor(s / 60)} menit lalu`;
}

function renderPeakBar(kg) {
  const ref   = session ? session.peak : null;
  const unit  = getUnit();
  peakLeft.textContent = fmt(0);
  if (kg === null || !ref || ref <= 0) {
    peakMid.textContent   = "belum ada acuan";
    peakRight.textContent = `${fmt(0)} ${unit}`;
    peakBar.style.width   = "0%";
    return;
  }
  const pct = Math.max(0, Math.min(100, Math.round((kg / ref) * 100)));
  peakMid.textContent   = `${pct}% dari puncak sesi`;
  peakRight.textContent = `${fmt(ref)} ${unit}`;
  peakBar.style.width   = `${pct}%`;
}

function renderSessionRows() {
  if (!session) {
    peakValueEl.textContent = "-";
    avgValueEl.textContent  = "-";
    durationEl.textContent  = "00:00";
    return;
  }
  peakValueEl.textContent = fmt(session.peak);
  avgValueEl.textContent  = session.n ? fmt(session.sum / session.n) : "-";
  durationEl.textContent  = formatDuration((Date.now() - session.start) / 1000);
}

function renderSides() {
  for (const key of ["left", "right", "total"]) {
    sideEls[key].now.textContent  = sideKg ? fmt(sideKg[key]) : "--.--";
    sideEls[key].peak.textContent = sideKg ? fmt(sidePeaks[key]) : "--.--";
  }
}

function resetPeaks() {
  sidePeaks = { left: 0, right: 0, total: 0 };
  if (sideKg) for (const key of ["left", "right", "total"]) sidePeaks[key] = sideKg[key];
  renderSides();
}

function render() {
  unitEls.forEach((el) => (el.textContent = getUnit()));
  renderSides();
  const kg = shownKg();
  if (kg !== null) weightValueEl.textContent = fmt(kg);
  renderPeakBar(kg);
  renderSessionRows();
  tareBtn.textContent =
    tareOffset !== 0 ? "[ Nol aktif: setel ulang ]" : "[ Tare / nol-kan tampilan ]";
}

function renderLastOnline() {
  const online = lastReceivedAt !== null && Date.now() - lastReceivedAt < 5000;
  lastOnlineEl.textContent = online ? "sekarang" : formatLastSeen(lastSeenTs);
}

function tickLastUpdate() {
  renderLastOnline();
  if (!lastReceivedAt) return;
  const elapsed = Date.now() - lastReceivedAt;
  lastUpdateEl.textContent = formatElapsed(elapsed);
  setOnline(elapsed < 5000);
}

function onReading(kg) {
  rawKg          = kg;
  lastReceivedAt = Date.now();
  lastSeenTs     = lastReceivedAt;
  markSeen(uid);
  readingPanel.classList.remove("is-waiting");
  const shown = shownKg();
  scale3d.setWeight(Math.max(shown, 0));
  if (session) {
    session.sum  += shown;
    session.n    += 1;
    session.peak  = Math.max(session.peak, shown);
    session.points.push({ t: (Date.now() - session.start) / 1000, kg: Math.max(shown, 0) });
    drawForceChart(recChartEl, session.points);
  }
  setOnline(true);
  tickLastUpdate();
  render();
}

// Sesi = Record di alat. Status "merekam" mengikuti flag dari alat (bukan tombol), supaya tetap
// benar kalau Record dimulai dari tombol Serial atau halaman ini dibuka saat alat sudah merekam.
function beginSessionUI(elapsedSec = 0) {
  session = { start: Date.now() - elapsedSec * 1000, sum: 0, n: 0, peak: 0, points: [] };
  resetPeaks(); // puncak per sisi dihitung dari awal sesi
  sessionBtn.classList.add("is-recording");
  sessionBtn.setAttribute("aria-pressed", "true");
  sessionLabel.textContent = "Akhiri sesi";
  recLabel.hidden          = false;
  sessionNote.textContent  = "";
  recChartWrap.hidden      = false;
  recChartEl.replaceChildren();
  durationTimer = setInterval(renderSessionRows, 1000);
  render();
}

function endSessionUI() {
  session = null;
  clearInterval(durationTimer);
  sessionBtn.classList.remove("is-recording");
  sessionBtn.setAttribute("aria-pressed", "false");
  sessionLabel.textContent = "Mulai sesi";
  recLabel.hidden          = true;
  render(); // grafik terakhir tetap tampil sampai sesi berikutnya
}

// Hasil akhir dihitung alat (Peak/Average/Duration) lalu disimpan di flash-nya.
async function onSessionResult(item) {
  upsertSession(item); // salinan untuk halaman Riwayat
  const name = "#" + String(item.id).padStart(3, "0");
  sessionNote.replaceChildren(
    document.createTextNode(`Sesi ${name} tersimpan di alat: puncak ${fmt(item.peak)} ${getUnit()}, ${formatDuration(item.dur)}. `),
    Object.assign(document.createElement("a"), { href: "history.html", textContent: "Lihat riwayat" })
  );
  // Ringkasan juga disimpan ke akun supaya tren di Riwayat tampil di HP maupun laptop.
  const startMs = item.ts ? item.ts * 1000 : Date.now() - item.dur * 1000;
  try {
    await saveSession(uid, {
      start: new Date(startMs).toISOString(),
      dur:   item.dur,
      peak:  item.peak,
      avg:   item.avg,
      n:     item.count,
    });
  } catch (err) {
    console.error("Gagal menyimpan ringkasan sesi ke Firestore:", err);
  }
}

function describeRecordError(res) {
  if (res === "ERR:STOP:singkat") return "Sesi terlalu singkat, tidak disimpan.";
  if (res === "ERR:START:sibuk")  return "Alat sudah sedang merekam.";
  if (res === "ERR:STOP:diam")    return "Alat tidak sedang merekam.";
  if (res === "ERR:timeout")      return "Alat tidak membalas. Coba lagi.";
  if (res === "ERR:terputus")     return "Sambungan Bluetooth terputus.";
  return "Perintah gagal: " + res;
}

peakResetBtn.addEventListener("click", resetPeaks);

sessionBtn.addEventListener("click", async () => {
  if (!bt.connected) {
    sessionNote.textContent = "Sambungkan alat dulu lewat tombol Bluetooth di kanan atas.";
    return;
  }
  sessionBtn.disabled = true;
  try {
    const res = session ? await bt.stopRecord() : await bt.startRecord(Math.floor(Date.now() / 1000));
    if (res.startsWith("ERR")) sessionNote.textContent = describeRecordError(res);
  } finally {
    sessionBtn.disabled = false;
  }
});

// ---- Bluetooth: bacaan realtime dari alat + tare/kalibrasi satu ketukan ----
const GRAMS_KEY = "pm-cal-grams";
try {
  const saved = localStorage.getItem(GRAMS_KEY);
  if (saved) btGrams.value = saved;
} catch { /* localStorage mungkin tidak tersedia (iframe, dll) */ }

const bt = createBluetooth({
  onReading(leftG, rightG, info) {
    if (info.recording && !session) beginSessionUI(info.elapsed);
    else if (!info.recording && session) endSessionUI();
    // Update readout Bluetooth kiri/kanan/total
    sideKg = { left: leftG / 1000, right: rightG / 1000, total: (leftG + rightG) / 1000 };
    for (const key of ["left", "right", "total"]) sidePeaks[key] = Math.max(sidePeaks[key], sideKg[key]);
    // Gunakan total sebagai sumber utama (lebih cepat dari Firebase)
    onReading((leftG + rightG) / 1000);
  },
  onResult: onSessionResult,
  onState(s) {
    const connected = s === "connected";
    const wasConnected = btActive;
    btActive = connected;
    if (wasConnected && !connected) markSeen(uid, true); // catat waktu putus sebagai terakhir online
    if (!connected && session) endSessionUI(); // alat tetap merekam sendiri; status disinkronkan lagi saat tersambung

    btBtn.classList.toggle("is-connected", connected);
    btBtn.setAttribute("aria-pressed", String(connected));
    btBtn.disabled = s === "connecting";
    btBtnLabel.textContent =
      connected        ? "Terhubung"     :
      s === "connecting" ? "Menyambung..." : "Bluetooth";

    // Tampilkan panel BT jika tersambung ATAU ada pesan
    btLive.hidden    = !connected;
    btCal.hidden     = !connected;
    btPanel.hidden   = !connected && !btNote?.textContent;

    if (connected) btNote.textContent = "";
  },
});

function btMessage(text) {
  if (!btNote) return;
  btNote.textContent = text;
  btPanel.hidden     = !bt.connected && !text;
}

function describeBtResult(res, label) {
  if (res.startsWith("OK:T"))   return "Alat dinolkan.";
  if (res.startsWith("OK:C"))   return `${label} terkalibrasi (faktor ${res.split(":")[2]}).`;
  if (res === "ERR:timeout")    return "Alat tidak membalas. Coba lagi.";
  if (res === "ERR:terputus")   return "Sambungan Bluetooth terputus.";
  if (res.startsWith("ERR:C"))  return `${label} gagal dikalibrasi. Pastikan beban terpasang dan angka acuan benar.`;
  return "Perintah gagal: " + res;
}

async function runBtAction(fn, label, busyText) {
  btActionBtns.forEach((b) => { if (b) b.disabled = true; });
  btMessage(busyText);
  try {
    btMessage(describeBtResult(await fn(), label));
  } finally {
    btActionBtns.forEach((b) => { if (b) b.disabled = false; });
  }
}

btBtn.addEventListener("click", async () => {
  if (!bluetoothSupported) {
    btMessage(
      "Browser ini tidak mendukung Web Bluetooth. Pakai Chrome atau Edge di Android/komputer (Safari/iPhone belum bisa)."
    );
    btPanel.hidden = false; // tampilkan pesan walau panel tersembunyi
    return;
  }
  if (bt.connected) {
    bt.disconnect();
    btMessage("");
    return;
  }
  btMessage("");
  try {
    await bt.connect();
  } catch (err) {
    if (err?.name === "NotFoundError") return; // dialog ditutup tanpa memilih
    console.error("Bluetooth gagal tersambung:", err);
    btMessage(`Gagal tersambung ke alat (${err?.name || "Error"}: ${err?.message || "tidak diketahui"}). Pastikan ESP32 menyala dan dekat, lalu coba lagi.`);
    btPanel.hidden = false;
  }
});

function calibrateSide(side, label) {
  const grams = Number(btGrams.value);
  if (!(grams > 0)) {
    btMessage("Isi beban acuan dalam gram (lebih dari 0).");
    return;
  }
  try { localStorage.setItem(GRAMS_KEY, String(grams)); } catch { /* oke */ }
  runBtAction(
    () => bt.calibrate(side, grams),
    label,
    `Mengkalibrasi ${label.toLowerCase()}...`
  );
}

$("bt-cal-left").addEventListener("click",  () => calibrateSide("left",  "Kiri"));
$("bt-cal-right").addEventListener("click", () => calibrateSide("right", "Kanan"));
$("bt-tare").addEventListener("click",       () => runBtAction(() => bt.tare(), "Alat", "Menolkan alat..."));

tareBtn.addEventListener("click", () => {
  if (tareOffset !== 0) {
    tareOffset = 0;
  } else if (rawKg !== null) {
    tareOffset = rawKg;
  } else {
    sessionNote.textContent = "Belum ada pembacaan untuk dinolkan.";
    return;
  }
  // Nol baru → puncak dan rata-rata sesi tidak sebanding lagi
  if (session) session = { ...session, sum: 0, n: 0, peak: 0 };
  render();
});

document.addEventListener("unitchange", render);

initShell((user) => {
  uid = user.uid;
  readLastSeen(uid).then((ts) => {
    if (ts && ts > (lastSeenTs || 0)) lastSeenTs = ts;
    renderLastOnline();
  });
  setInterval(tickLastUpdate, 1000);
  renderLastOnline();
});
render();
