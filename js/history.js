// Halaman Riwayat: tren puncak per hari/sesi, daftar sesi, dan 50 pembacaan sensor terakhir.
import { initShell } from "./shell.js";
import { watchHistory } from "./live-data.js";
import { loadSessions, formatDuration } from "./sessions.js";
import { fmt, getUnit } from "./units.js";

const $ = (id) => document.getElementById(id);
const tabs = [...document.querySelectorAll("[data-range]")];
const totalEl = $("total-sessions");
const trendTitleEl = $("trend-title");
const trendNoteEl = $("trend-note");
const trendEl = $("trend-chart");
const logEl = $("session-log");
const logEmptyEl = $("log-empty");
const rawChartEl = $("raw-chart");
const rawEmptyEl = $("raw-empty");
const minEl = $("min-value");
const avgEl = $("avg-value");
const maxEl = $("max-value");

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
let rawEntries = [];

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
  renderRaw();
}

function renderRaw() {
  rawChartEl.replaceChildren();
  rawEmptyEl.hidden = rawEntries.length > 0;
  if (!rawEntries.length) {
    minEl.textContent = avgEl.textContent = maxEl.textContent = "-";
    return;
  }
  const min = Math.min(...rawEntries);
  const max = Math.max(...rawEntries);
  const avg = rawEntries.reduce((a, b) => a + b, 0) / rawEntries.length;
  minEl.textContent = fmt(min);
  avgEl.textContent = fmt(avg);
  maxEl.textContent = fmt(max);

  const W = Math.max(200, Math.round(rawChartEl.clientWidth || 310));
  const H = 80;
  const span = max - min || 1;
  const pts = rawEntries.map((v, i) => [
    rawEntries.length === 1 ? W / 2 : (i * W) / (rawEntries.length - 1),
    H - 6 - ((v - min) / span) * (H - 16),
  ]);
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "trend-svg", role: "img" });
  root.appendChild(svg("title", {}, "50 pembacaan sensor terakhir"));
  root.appendChild(
    svg("path", {
      d: pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" "),
      class: "trend-line",
    })
  );
  const [lx, ly] = pts[pts.length - 1];
  root.appendChild(svg("circle", { cx: Math.min(lx, W - 4), cy: ly, r: 3.5, class: "trend-live" }));
  rawChartEl.appendChild(root);
}

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
  watchHistory(
    (entries) => {
      rawEntries = entries;
      renderRaw();
    },
    () => {
      rawEmptyEl.hidden = false;
      rawEmptyEl.textContent = "Pembacaan sensor tidak bisa dibaca. Coba muat ulang halaman.";
    }
  );
  try {
    sessions = await loadSessions(user.uid);
  } catch (err) {
    console.error("Gagal membaca sesi dari Firestore:", err);
    logEmptyEl.hidden = false;
    logEmptyEl.textContent = "Riwayat sesi tidak bisa dibaca. Coba muat ulang halaman.";
  }
  render();
});
