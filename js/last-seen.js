// Kapan alat terakhir online. Alat tersambung lewat Bluetooth ke browser, jadi "online"
// berarti browser terakhir menerima data darinya. Disimpan di Firestore users/{uid}.deviceLastSeen
// supaya sama di HP dan laptop; localStorage jadi cadangan kalau Firestore gagal dibaca.
import { firestore } from "./firebase-config.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const LOCAL_KEY = "pm-last-seen";
const SAVE_EVERY_MS = 30000; // data masuk tiap 0,5 detik, jangan tulis Firestore sesering itu
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

let lastSavedAt = 0;

function readLocal() {
  try {
    return Number(localStorage.getItem(LOCAL_KEY)) || null;
  } catch {
    return null;
  }
}

/** Waktu (ms) alat terakhir terlihat online, atau null kalau belum pernah. */
export async function readLastSeen(uid) {
  const local = readLocal() || 0;
  try {
    const snap = await getDoc(doc(firestore, "users", uid));
    const remote = Date.parse(snap.exists() ? snap.data().deviceLastSeen : "") || 0;
    return Math.max(local, remote) || null;
  } catch (err) {
    console.error("Gagal membaca waktu terakhir online:", err);
    return local || null;
  }
}

/** Catat "alat online sekarang". Penulisan ke Firestore dibatasi, kecuali force. */
export function markSeen(uid, force = false) {
  const now = Date.now();
  try {
    localStorage.setItem(LOCAL_KEY, String(now));
  } catch {
    /* localStorage tidak tersedia */
  }
  if (!uid || (!force && now - lastSavedAt < SAVE_EVERY_MS)) return;
  lastSavedAt = now;
  setDoc(doc(firestore, "users", uid), { deviceLastSeen: new Date(now).toISOString() }, { merge: true }).catch(
    (err) => console.error("Gagal menyimpan waktu terakhir online:", err)
  );
}

/** "hari ini 14.05", "kemarin 21.10", "3 Okt 09.30" (tambah tahun kalau beda tahun). */
export function formatLastSeen(ts) {
  if (!ts) return "belum pernah";
  const d = new Date(ts);
  const now = new Date();
  const time = `${String(d.getHours()).padStart(2, "0")}.${String(d.getMinutes()).padStart(2, "0")}`;
  const dayStart = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((dayStart(now) - dayStart(d)) / 86400000);
  if (diffDays === 0) return `hari ini ${time}`;
  if (diffDays === 1) return `kemarin ${time}`;
  const year = d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year} ${time}`;
}
