// Halaman Riwayat: sesi yang tersimpan di alat (dibaca lewat Bluetooth, detail grafik per sesi),
// tren puncak per hari/sesi, dan log sesi dari akun.
import { initShell } from "./shell.js";
import { loadSessions, formatDuration } from "./sessions.js";
import { fmt, getUnit } from "./units.js";
import { createBluetooth, bluetoothSupported } from "./bluetooth.js";
import { drawForceChart } from "./chart.js";
import { loadList, replaceList, upsertSession, loadRecord, saveRecord, removeSession, clearAll } from "./device-cache.js";

const $ = (id) => document.getElementById(id);
const tabs = [...document.querySelectorAll("[data-range]")];
const totalEl = $("total-sessions");
const trendTitleEl = $("trend-title");
const trendNoteEl = $("trend-note");
const trendEl = $("trend-chart");
const logEl = $("session-log");
const logEmptyEl = $("log-empty");
const devListEl = $("dev-list");
const devNoteEl = $("dev-note");
const devSyncBtn = $("dev-sync");
const devSyncLabel = $("dev-sync-label");
const devClearBtn = $("dev-clear");
const devDetailEl = $("dev-detail");
const devDetailTitleEl = $("dev-detail-title");
const devChartEl = $("dev-chart");
const devChartNoteEl = $("dev-chart-note");
const devPeakEl = $("dev-peak");
const devAvgEl = $("dev-avg");
const devDurEl = $("dev-dur");

const SVG_NS = "http://www.w3.org/2000/svg";
const DAY_ABBR = ["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"];
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const RANGE_TITLE = {
  today: "TREN PUNCAK HARI INI",
  week: "TREN PUNCAK MINGGUAN",
  month: "TREN PUNCAK BULANAN",
};

let sessions = [];
let range = "week";
let devSessions = loadList(); // salinan lokal; sumber kebenaran tetap alat
let openId = null;

function svg(tag, attrs = {}, text) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const pad2 = (n) => String(n).padStart(2, "0");
const clock = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

function sameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function dayLabel(d) {
  const now = new Date();
  if (sameDay(d, now)) return `Hari ini, ${clock(d)}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return `Kemarin, ${clock(d)}`;
  return `${d.getDate()} ${MONTH_ABBR[d.getMonth()]}, ${clock(d)}`;
}

function inRange(list) {
  const now = new Date();
  const from = startOfDay(now);
  if (range === "week") from.setDate(from.getDate() - 6);
  if (range === "month") from.setDate(from.getDate() - 29);
  return list.filter((s) => new Date(s.start) >= from);
}

/** Titik grafik: { label, value (kg), at } per hari (minggu/bulan) atau per sesi (hari ini). */
function buildPoints(list) {
  if (range === "today") {
    return list
      .slice()
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .map((s) => ({ label: clock(new Date(s.start)), value: s.peak }));
  }
  const days = range === "week" ? 7 : 30;
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = startOfDay(new Date());
    d.setDate(d.getDate() - i);
    const peaks = list.filter((s) => sameDay(new Date(s.start), d)).map((s) => s.peak);
    const label =
      range === "week" ? DAY_ABBR[d.getDay()] : i % 5 === 0 || i === 0 ? String(d.getDate()) : "";
    out.push({ label, value: peaks.length ? Math.max(...peaks) : null });
  }
  return out;
}

function renderTrend(points) {
  trendEl.replaceChildren();
  const filled = points.filter((p) => p.value !== null);
  if (!filled.length) {
    trendEl.appendChild(
      Object.assign(document.createElement("p"), {
        className: "empty-note",
        textContent: "Belum ada sesi pada rentang ini. Rekam sesi dari halaman Live.",
      })
    );
    trendNoteEl.textContent = "";
    return;
  }

  // Lebar asli kontainer, supaya huruf dan titik tidak ikut membesar saat SVG diskalakan.
  const W = Math.max(280, Math.round(trendEl.clientWidth || 310));
  const H = 150;
  const top = 30;
  const bottom = 124;
  const max = Math.max(...filled.map((p) => p.value)) * 1.12 || 1;
  const xs = (i) => (points.length === 1 ? W / 2 : 20 + (i * (W - 40)) / (points.length - 1));
  const ys = (v) => bottom - (v / max) * (bottom - top);

  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "trend-svg", role: "img" });
  root.appendChild(svg("title", {}, `Puncak per ${range === "today" ? "sesi" : "hari"}`));
  root.appendChild(svg("line", { x1: 0, y1: bottom, x2: W, y2: bottom, class: "trend-axis" }));
  root.appendChild(svg("line", { x1: 0, y1: (bottom + top) / 2, x2: W, y2: (bottom + top) / 2, class: "trend-grid" }));

  const coords = points.map((p, i) => (p.value === null ? null : [xs(i), ys(p.value)]));
  const path = coords
    .filter(Boolean)
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  root.appendChild(svg("path", { d: path, class: "trend-line" }));

  const lastIdx = coords.map((c, i) => (c ? i : -1)).filter((i) => i >= 0).pop();
  coords.forEach((c, i) => {
    if (!c || i === lastIdx) return;
    root.appendChild(svg("circle", { cx: c[0], cy: c[1], r: 2.5, class: "trend-dot" }));
  });
  const [lx, ly] = coords[lastIdx];
  root.appendChild(svg("circle", { cx: lx, cy: ly, r: 8, class: "trend-ring" }));
  root.appendChild(svg("circle", { cx: lx, cy: ly, r: 4.5, class: "trend-live" }));
  root.appendChild(
    svg(
      "text",
      { x: Math.min(lx, W), y: Math.max(ly - 12, 10), "text-anchor": "end", class: "trend-value" },
      `${fmt(points[lastIdx].value)} ${getUnit()}`
    )
  );
  points.forEach((p, i) => {
    if (!p.label) return;
    root.appendChild(
      svg("text", { x: xs(i), y: 144, class: i === points.length - 1 ? "trend-tick is-last" : "trend-tick" }, p.label)
    );
  });
  trendEl.appendChild(root);

  const best = Math.max(...filled.map((p) => p.value));
  trendNoteEl.textContent = `Tertinggi: ${fmt(best)} ${getUnit()}`;
}

function renderLog(list) {
  logEl.replaceChildren();
  logEmptyEl.hidden = list.length > 0;
  const sorted = list.slice().sort((a, b) => new Date(b.start) - new Date(a.start)).slice(0, 20);
  const best = list.length ? Math.max(...list.map((s) => s.peak)) : null;
  for (const s of sorted) {
    const row = document.createElement("li");
    row.className = "log-row";

    const left = document.createElement("div");
    const when = document.createElement("div");
    when.className = "log-when";
    when.textContent = dayLabel(new Date(s.start));
    const meta = document.createElement("div");
    meta.className = "log-meta";
    meta.textContent = `rata-rata ${fmt(s.avg)} ${getUnit()} · ${formatDuration(s.dur)}`;
    left.append(when, meta);

    const right = document.createElement("div");
    right.className = "log-peak";
    const val = document.createElement("span");
    val.className = s.peak === best ? "log-value is-best" : "log-value";
    val.textContent = `${fmt(s.peak)} ${getUnit()}`;
    const tag = document.createElement("span");
    tag.className = "log-tag";
    tag.textContent = "PUNCAK";
    right.append(val, tag);

    row.append(left, right);
    logEl.appendChild(row);
  }
}

function render() {
  document.querySelectorAll("[data-unit-label]").forEach((el) => (el.textContent = getUnit()));
  tabs.forEach((t) => {
    const on = t.dataset.range === range;
    t.classList.toggle("is-active", on);
    t.setAttribute("aria-selected", String(on));
  });
  trendTitleEl.textContent = RANGE_TITLE[range];
  totalEl.textContent = `${sessions.length} sesi tercatat`;
  const list = inRange(sessions);
  renderTrend(buildPoints(list));
  renderLog(list);
  renderDevice();
}

// ---- Sesi tersimpan di alat ----
const sessionName = (id) => "#" + String(id).padStart(3, "0");
const sessionDate = (ts) => (ts ? dayLabel(new Date(ts * 1000)) : "waktu tidak diketahui");

function renderDevice() {
  devListEl.replaceChildren();
  const best = devSessions.length ? Math.max(...devSessions.map((s) => s.peak)) : null;
  for (const s of devSessions) {
    const row = document.createElement("li");
    row.className = "log-row dev-row" + (s.id === openId ? " is-open" : "");
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Buka sesi ${sessionName(s.id)}`);

    const left = document.createElement("div");
    const when = document.createElement("div");
    when.className = "log-when";
    when.textContent = `${sessionName(s.id)} · ${sessionDate(s.ts)}`;
    const meta = document.createElement("div");
    meta.className = "log-meta";
    meta.textContent = `rata-rata ${fmt(s.avg)} ${getUnit()} · ${formatDuration(s.dur)}`;
    left.append(when, meta);

    const right = document.createElement("div");
    right.className = "log-peak";
    const val = document.createElement("span");
    val.className = s.peak === best ? "log-value is-best" : "log-value";
    val.textContent = `${fmt(s.peak)} ${getUnit()}`;
    const tag = document.createElement("span");
    tag.className = "log-tag";
    tag.textContent = "PUNCAK";
    right.append(val, tag);

    row.append(left, right);
    const open = () => openDetail(s.id);
    row.addEventListener("click", open);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
    devListEl.appendChild(row);
  }

  if (!devSessions.length) {
    devNoteEl.hidden = false;
    devNoteEl.textContent = bluetoothSupported
      ? 'Belum ada sesi dari alat. Tekan "Sambungkan alat" untuk membaca riwayat, atau rekam sesi di halaman Live.'
      : "Browser ini tidak mendukung Web Bluetooth. Pakai Chrome atau Edge di Android/komputer.";
  } else if (devNoteEl.dataset.busy !== "1") {
    devNoteEl.hidden = true;
  }
  devClearBtn.hidden = !(bt.connected && devSessions.length);
  renderDetail();
}

function setDevNote(text, busy = false) {
  devNoteEl.dataset.busy = busy ? "1" : "";
  devNoteEl.textContent = text;
  devNoteEl.hidden = !text;
}

function renderDetail() {
  const s = devSessions.find((x) => x.id === openId);
  devDetailEl.hidden = !s;
  if (!s) return;
  devDetailTitleEl.textContent = `Sesi ${sessionName(s.id)} · ${sessionDate(s.ts)}`;
  devPeakEl.textContent = fmt(s.peak);
  devAvgEl.textContent = fmt(s.avg);
  devDurEl.textContent = formatDuration(s.dur);
  const samples = loadRecord(s.id);
  devChartNoteEl.hidden = !!samples;
  if (samples) {
    drawForceChart(devChartEl, samples);
  } else {
    devChartEl.replaceChildren();
    devChartNoteEl.textContent = bt.connected
      ? "Memuat grafik dari alat..."
      : "Sambungkan alat untuk memuat grafik sesi ini.";
  }
}

async function openDetail(id) {
  openId = id;
  renderDevice();
  if (loadRecord(id) || !bt.connected) return;
  try {
    const rec = await bt.getRecord(id);
    saveRecord(id, rec.samples);
  } catch (err) {
    console.error("Gagal membaca rekaman dari alat:", err);
    devChartNoteEl.hidden = false;
    devChartNoteEl.textContent = "Grafik gagal dimuat dari alat. Coba buka lagi.";
    return;
  }
  if (openId === id) renderDetail();
}

async function syncFromDevice() {
  setDevNote("Membaca riwayat dari alat...", true);
  try {
    devSessions = replaceList(await bt.getHistory());
    if (openId !== null && !devSessions.some((s) => s.id === openId)) openId = null;
    setDevNote("");
  } catch (err) {
    console.error("Gagal membaca riwayat dari alat:", err);
    setDevNote("Riwayat gagal dibaca dari alat. Coba sinkronkan lagi.");
  }
  renderDevice();
}

const bt = createBluetooth({
  onReading() {}, // halaman ini tidak menampilkan angka realtime
  onResult(item) {
    devSessions = upsertSession(item); // sesi baru selesai selagi halaman ini terbuka
    renderDevice();
  },
  onState(state) {
    devSyncBtn.disabled = state === "connecting";
    devSyncBtn.classList.toggle("is-connected", state === "connected");
    devSyncLabel.textContent =
      state === "connected" ? "Sinkronkan" : state === "connecting" ? "Menyambung..." : "Sambungkan alat";
    devClearBtn.hidden = !(state === "connected" && devSessions.length);
    if (!devDetailEl.hidden) renderDetail();
  },
});

devSyncBtn.addEventListener("click", async () => {
  if (!bluetoothSupported) {
    renderDevice();
    return;
  }
  try {
    if (!bt.connected) await bt.connect();
    await syncFromDevice();
  } catch (err) {
    if (err?.name === "NotFoundError") return; // dialog ditutup tanpa memilih
    console.error("Bluetooth gagal tersambung:", err);
    setDevNote(`Gagal tersambung ke alat (${err?.name || "Error"}: ${err?.message || "tidak diketahui"}). Pastikan ESP32 menyala dan dekat, lalu coba lagi.`);
  }
});

$("dev-close").addEventListener("click", () => {
  openId = null;
  renderDevice();
});

$("dev-delete").addEventListener("click", async () => {
  if (openId === null) return;
  if (!bt.connected) {
    setDevNote("Sambungkan alat dulu untuk menghapus sesi.");
    return;
  }
  const res = await bt.deleteRecord(openId);
  if (!res.startsWith("OK")) {
    setDevNote("Sesi gagal dihapus dari alat.");
    return;
  }
  removeSession(openId);
  devSessions = loadList();
  openId = null;
  setDevNote("");
  renderDevice();
});

devClearBtn.addEventListener("click", async () => {
  if (!bt.connected || !window.confirm("Hapus semua sesi yang tersimpan di alat? Ini tidak bisa dibatalkan.")) return;
  const res = await bt.clearHistory();
  if (!res.startsWith("OK")) {
    setDevNote("Riwayat gagal dihapus dari alat.");
    return;
  }
  clearAll();
  devSessions = [];
  openId = null;
  setDevNote("");
  renderDevice();
});

tabs.forEach((t) =>
  t.addEventListener("click", () => {
    range = t.dataset.range;
    render();
  })
);

document.addEventListener("unitchange", render);

let resizeFrame = 0;
window.addEventListener("resize", () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(render);
});

initShell(async (user) => {
  try {
    sessions = await loadSessions(user.uid);
  } catch (err) {
    console.error("Gagal membaca sesi dari Firestore:", err);
    logEmptyEl.hidden = false;
    logEmptyEl.textContent = "Riwayat sesi tidak bisa dibaca. Coba muat ulang halaman.";
  }
  render();
});
