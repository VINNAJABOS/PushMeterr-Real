// Streak harian, disimpan di Firestore users/{uid}.streak = { count, best, lastActiveDate }.
// Satu hari dihitung saat pengguna membuka Plato AI (touchStreak). Halaman Konsistensi
// hanya membaca dan menjelaskan keadaannya (describeStreak).
import { firestore } from "./firebase-config.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export function dateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA + "T00:00:00");
  const b = new Date(dateStrB + "T00:00:00");
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export async function readStreak(uid) {
  const snap = await getDoc(doc(firestore, "users", uid));
  return snap.exists() ? snap.data().streak || null : null;
}

/**
 * Keadaan streak per hari ini, tanpa menulis apa pun.
 * status: "none" (belum pernah), "done" (hari ini sudah), "pending" (kemarin aktif, hari ini belum),
 * "broken" (terlewat lebih dari sehari).
 */
export function describeStreak(streak, today = dateString()) {
  if (!streak) return { count: 0, best: 0, status: "none", mood: "flat" };
  const best = streak.best || streak.count || 0;
  const gap = daysBetween(streak.lastActiveDate, today);
  if (gap === 0) {
    const count = streak.count || 1;
    return { count, best: Math.max(best, count), status: "done", mood: count >= 3 ? "happy" : "flat" };
  }
  if (gap === 1) return { count: streak.count || 0, best, status: "pending", mood: "flat" };
  return { count: 0, best, status: "broken", mood: "sad" };
}

/** Catat hari ini dan kembalikan { count, best, mood } terbaru. */
export async function touchStreak(uid) {
  const userDocRef = doc(firestore, "users", uid);
  const snap = await getDoc(userDocRef);
  const today = dateString();
  const prev = snap.exists() ? snap.data().streak : null;

  let count = 1;
  let best = 1;
  let mood = "flat";

  if (!prev) {
    count = 1;
    best = 1;
    mood = "flat";
  } else if (prev.lastActiveDate === today) {
    count = prev.count || 1;
    best = Math.max(prev.best || 1, count);
    mood = count >= 3 ? "happy" : "flat";
  } else {
    const gap = daysBetween(prev.lastActiveDate, today);
    if (gap === 1) {
      count = (prev.count || 0) + 1;
      mood = count >= 3 ? "happy" : "flat";
    } else {
      count = 1;
      mood = "sad";
    }
    best = Math.max(prev.best || 1, count);
  }

  await setDoc(userDocRef, { streak: { count, best, lastActiveDate: today } }, { merge: true });
  return { count, best, mood };
}

// Bentuk mulut maskot Satria untuk tiap suasana (viewBox 160).
export const MASCOT_MOUTH = {
  sad: "M 66 104 Q 80 92 94 104",
  flat: "M 66 98 L 94 98",
  happy: "M 64 94 Q 80 112 96 94",
};
