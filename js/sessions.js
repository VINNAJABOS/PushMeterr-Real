// Sesi tarikan yang direkam pengguna dari halaman Live. Disimpan sebagai array di
// Firestore users/{uid}.sessions (dokumen yang sama dengan streak, jadi memakai aturan
// Firestore yang sudah ada). Tiap sesi: { start: ISO, dur: detik, peak: kg, avg: kg, n: jumlah pembacaan }.
import { firestore } from "./firebase-config.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const MAX_SESSIONS = 100;

export async function loadSessions(uid) {
  const snap = await getDoc(doc(firestore, "users", uid));
  const list = snap.exists() ? snap.data().sessions : null;
  return Array.isArray(list) ? list : [];
}

export async function saveSession(uid, session) {
  const next = [...(await loadSessions(uid)), session].slice(-MAX_SESSIONS);
  await setDoc(doc(firestore, "users", uid), { sessions: next }, { merge: true });
  return next;
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
