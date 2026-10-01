// Halaman Live: angka sesaat, sesi rekaman, tare (nol tampilan), status perangkat.
import { initShell } from "./shell.js";
import { watchLive, watchHistory } from "./live-data.js";
import { saveSession, formatDuration } from "./sessions.js";
import { fmt, getUnit } from "./units.js";
import { mountScale } from "./scene3d.js";

const $ = (id) => document.getElementById(id);
const readingPanel = $("reading-panel");
const weightValueEl = $("weight-value");
const unitEls = document.querySelectorAll("[data-unit-label]");
const statusDot = $("status-dot");
const statusText = $("status-text");
const lastUpdateEl = $("last-update");
const waitingNote = readingPanel.querySelector(".waiting-note");
const recLabel = $("rec-label");
const peakBar = $("peak-bar");
const peakLeft = $("peak-left");
const peakMid = $("peak-mid");
const peakRight = $("peak-right");
const peakValueEl = $("peak-value");
const avgValueEl = $("avg-value");
const durationEl = $("duration-value");
const sessionBtn = $("session-btn");
const sessionLabel = $("session-label");
const sessionNote = $("session-note");
const tareBtn = $("tare-btn");

const scale3d = mountScale($("dash-stage"), { frame: "rig" });

let uid = null;
let rawKg = null; // pembacaan terakhir apa adanya dari sensor
let tareOffset = 0; // nol tampilan, hanya di browser ini
let lastReceivedAt = null;
let historyMax = null; // puncak dari 50 pembacaan terakhir, acuan saat belum ada sesi
let session = null; // { start, sum, n, peak } selama merekam
let durationTimer = null;

const shownKg = () => (rawKg === null ? null : rawKg - tareOffset);

function setOnline(isOnline) {
  statusDot.classList.toggle("online", isOnline);
  statusDot.classList.toggle("offline", !isOnline);
  statusText.textContent = isOnline ? "online" : "offline";
  // Angka lama tetap terlihat tapi diredupkan, supaya tidak dikira masih live.
  readingPanel.classList.toggle("is-stale", !isOnline && lastReceivedAt !== null);
  scale3d.setOnline(isOnline);
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 5) return "baru saja";
  if (s < 60) return `${s} detik lalu`;
  return `${Math.floor(s / 60)} menit lalu`;
}

function renderPeakBar(kg) {
  const ref = session ? session.peak : historyMax;
  const label = session ? "puncak sesi" : "puncak riwayat";
  const unit = getUnit();
  peakLeft.textContent = fmt(0);
  if (kg === null || !ref || ref <= 0) {
    peakMid.textContent = "belum ada acuan";
    peakRight.textContent = `${fmt(0)} ${unit}`;
    peakBar.style.width = "0%";
    return;
  }
  const pct = Math.max(0, Math.min(100, Math.round((kg / ref) * 100)));
  peakMid.textContent = `${pct}% dari ${label}`;
  peakRight.textContent = `${fmt(ref)} ${unit}`;
  peakBar.style.width = `${pct}%`;
}

function renderSessionRows() {
  if (!session) {
    peakValueEl.textContent = "-";
    avgValueEl.textContent = "-";
    durationEl.textContent = "00:00";
    return;
  }
  peakValueEl.textContent = fmt(session.peak);
  avgValueEl.textContent = session.n ? fmt(session.sum / session.n) : "-";
  durationEl.textContent = formatDuration((Date.now() - session.start) / 1000);
}

function render() {
  unitEls.forEach((el) => (el.textContent = getUnit()));
  const kg = shownKg();
  if (kg !== null) weightValueEl.textContent = fmt(kg);
  renderPeakBar(kg);
  renderSessionRows();
  tareBtn.textContent = tareOffset !== 0 ? "[ Nol aktif: setel ulang ]" : "[ Tare / nol-kan tampilan ]";
}

function tickLastUpdate() {
  if (!lastReceivedAt) return;
  const elapsed = Date.now() - lastReceivedAt;
  lastUpdateEl.textContent = formatElapsed(elapsed);
  setOnline(elapsed < 5000);
}

function onReading(kg) {
  rawKg = kg;
  lastReceivedAt = Date.now();
  readingPanel.classList.remove("is-waiting");
  const shown = shownKg();
  scale3d.setWeight(Math.max(shown, 0));
  if (session) {
    session.sum += shown;
    session.n += 1;
    session.peak = Math.max(session.peak, shown);
  }
  setOnline(true);
  tickLastUpdate();
  render();
}

function showReadError() {
  readingPanel.classList.add("is-waiting");
  statusDot.classList.add("offline");
  statusText.textContent = "gagal membaca";
  waitingNote.textContent =
    "Tidak bisa membaca pembacaan terkini. Coba muat ulang halaman; kalau masih gagal, cek aturan Realtime Database.";
}

function startSession() {
  session = { start: Date.now(), sum: 0, n: 0, peak: 0 };
  if (shownKg() !== null) {
    session.sum = shownKg();
    session.n = 1;
    session.peak = Math.max(shownKg(), 0);
  }
  sessionBtn.classList.add("is-recording");
  sessionBtn.setAttribute("aria-pressed", "true");
  sessionLabel.textContent = "Akhiri sesi";
  recLabel.hidden = false;
  sessionNote.textContent = "";
  durationTimer = setInterval(renderSessionRows, 1000);
  render();
}

async function stopSession() {
  const done = session;
  session = null;
  clearInterval(durationTimer);
  sessionBtn.classList.remove("is-recording");
  sessionBtn.setAttribute("aria-pressed", "false");
  sessionLabel.textContent = "Mulai sesi";
  recLabel.hidden = true;
  render();

  if (!done || done.n < 2) {
    sessionNote.textContent = "Sesi terlalu singkat, tidak disimpan.";
    return;
  }
  const record = {
    start: new Date(done.start).toISOString(),
    dur: Math.round((Date.now() - done.start) / 1000),
    peak: done.peak,
    avg: done.sum / done.n,
    n: done.n,
  };
  sessionBtn.disabled = true;
  sessionNote.textContent = "Menyimpan sesi...";
  try {
    await saveSession(uid, record);
    sessionNote.replaceChildren(
      document.createTextNode(`Sesi tersimpan: puncak ${fmt(record.peak)} ${getUnit()}. `),
      Object.assign(document.createElement("a"), { href: "history.html", textContent: "Lihat riwayat" })
    );
  } catch (err) {
    console.error("Gagal menyimpan sesi ke Firestore:", err);
    sessionNote.textContent = "Sesi gagal disimpan. Cek koneksi lalu coba rekam lagi.";
  } finally {
    sessionBtn.disabled = false;
  }
}

sessionBtn.addEventListener("click", () => {
  if (session) stopSession();
  else startSession();
});

tareBtn.addEventListener("click", () => {
  if (tareOffset !== 0) {
    tareOffset = 0;
  } else if (rawKg !== null) {
    tareOffset = rawKg;
  } else {
    sessionNote.textContent = "Belum ada pembacaan untuk dinolkan.";
    return;
  }
  // Nol baru berarti puncak dan rata-rata sesi yang sedang jalan tidak sebanding lagi.
  if (session) session = { start: session.start, sum: 0, n: 0, peak: 0 };
  render();
});

window.addEventListener("beforeunload", (e) => {
  if (session) {
    e.preventDefault();
    e.returnValue = "";
  }
});

document.addEventListener("unitchange", render);

initShell((user) => {
  uid = user.uid;
  watchLive(onReading, showReadError);
  watchHistory((entries) => {
    historyMax = entries.length ? Math.max(...entries) : null;
    render();
  });
  setInterval(tickLastUpdate, 1000);
});
render();
