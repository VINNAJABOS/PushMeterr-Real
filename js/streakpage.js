// Halaman Konsistensi: streak harian, maskot Satria, dan kalender streak berjalan.
import { initShell } from "./shell.js";
import { readStreak, describeStreak, dateString, MASCOT_MOUTH } from "./streak.js";

const $ = (id) => document.getElementById(id);
const countEl = $("streak-count");
const bestEl = $("streak-best");
const noteEl = $("streak-note");
const statusEl = $("streak-status");
const weekEl = $("streak-week");
const mouthEl = $("mascot-mouth");
const moodEls = document.querySelectorAll(".streak-moods [data-mood]");
const calBtn = $("calendar-btn");
const calEl = $("calendar");
const calGridEl = $("calendar-grid");
const calNoteEl = $("calendar-note");
const resumeLink = $("resume-link");

const DAY_INITIALS = ["M", "S", "S", "R", "K", "J", "S"]; // indeks Date.getDay(), 0 = Minggu
const WEEKDAYS_MON_FIRST = ["S", "S", "R", "K", "J", "S", "M"];

const NOTES = {
  none: "Belum ada streak. Buka Plato AI hari ini untuk memulainya.",
  done: "Hari ini sudah tercatat. Kembali lagi besok untuk melanjutkan.",
  pending: "Streak masih aman, tapi hari ini belum tercatat.",
  broken: "Streak sebelumnya terputus. Mulai lagi dengan membuka Plato AI hari ini.",
};

const STATUS_LABEL = {
  none: "Belum dimulai",
  done: "Hari ini selesai · Terkonfirmasi",
  pending: "Hari ini belum tercatat",
  broken: "Streak terputus",
};

/** Kumpulan tanggal (string) yang termasuk streak berjalan. */
function doneDates(view) {
  const set = new Set();
  if (view.status !== "done" && view.status !== "pending") return set;
  const d = new Date();
  if (view.status === "pending") d.setDate(d.getDate() - 1);
  for (let i = 0; i < view.count; i++) {
    set.add(dateString(d));
    d.setDate(d.getDate() - 1);
  }
  return set;
}

function renderWeek(view) {
  const done = doneDates(view);
  weekEl.replaceChildren();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = document.createElement("div");
    day.className = "streak-day";
    day.setAttribute("aria-label", `${dateString(d)}${done.has(dateString(d)) ? ", tercatat" : ""}`);
    if (i === 0) day.classList.add("is-today");
    if (done.has(dateString(d)) && i !== 0) day.classList.add("is-done");
    if (i === 0 && view.status === "done") day.classList.add("is-today-done");
    const label = document.createElement("span");
    label.textContent = DAY_INITIALS[d.getDay()];
    day.append(label, document.createElement("i"));
    weekEl.appendChild(day);
  }
}

/** Kalender 5 minggu (Senin pertama), berakhir di minggu yang memuat hari ini. */
function renderCalendar(view) {
  const done = doneDates(view);
  calGridEl.replaceChildren();
  WEEKDAYS_MON_FIRST.forEach((w) => {
    const head = document.createElement("span");
    head.className = "cal-head";
    head.textContent = w;
    calGridEl.appendChild(head);
  });

  const today = new Date();
  const sinceMonday = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - sinceMonday - 28);

  for (let i = 0; i < 35; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dateString(d);
    const cell = document.createElement("span");
    cell.className = "cal-cell";
    cell.textContent = String(d.getDate());
    if (done.has(key)) cell.classList.add("is-done");
    if (key === dateString(today)) cell.classList.add("is-today");
    if (d > today) cell.classList.add("is-future");
    calGridEl.appendChild(cell);
  }
  calNoteEl.textContent =
    "Kalender dihitung dari streak yang sedang berjalan. Hari sebelum streak dimulai tidak ditandai.";
}

function render(view) {
  countEl.textContent = String(view.count);
  bestEl.textContent = String(view.best);
  noteEl.textContent = NOTES[view.status];
  statusEl.textContent = STATUS_LABEL[view.status];
  mouthEl.setAttribute("d", MASCOT_MOUTH[view.mood]);
  moodEls.forEach((el) => el.classList.toggle("is-on", el.dataset.mood === view.mood));
  resumeLink.hidden = view.status === "done";
  renderWeek(view);
  renderCalendar(view);
}

calBtn.addEventListener("click", () => {
  const open = calEl.hidden;
  calEl.hidden = !open;
  calBtn.setAttribute("aria-expanded", String(open));
  calBtn.textContent = open ? "Sembunyikan kalender streak" : "Lihat kalender streak";
});

initShell(async (user) => {
  let view = describeStreak(null);
  try {
    view = describeStreak(await readStreak(user.uid));
  } catch (err) {
    console.error("Gagal membaca streak dari Firestore:", err);
    noteEl.textContent = "Streak tidak bisa dibaca. Coba muat ulang halaman.";
  }
  render(view);
});
