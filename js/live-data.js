// Pembacaan sensor dari Realtime Database. ESP32 (meterrr.ino) menyimpan GRAM,
// di sini langsung dikonversi ke kg supaya seluruh web memakai satu satuan dasar.
import { db } from "./firebase-config.js";
import {
  ref,
  onValue,
  query,
  limitToLast,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

const GRAMS_PER_KG = 1000;

/** Pembacaan terkini: onData(kg) dipanggil tiap ESP32 menulis (sekitar 0,5 detik). */
export function watchLive(onData, onError) {
  return onValue(
    ref(db, "loadcell/live"),
    (snapshot) => {
      const data = snapshot.val();
      if (data && typeof data.weight === "number") onData(data.weight / GRAMS_PER_KG);
    },
    (err) => {
      console.error("Gagal baca loadcell/live (cek Realtime Database rules):", err);
      onError?.(err);
    }
  );
}

/** N pembacaan terakhir (kg), urut lama ke baru. */
export function watchHistory(onData, onError, limit = 50) {
  return onValue(
    query(ref(db, "loadcell/history"), limitToLast(limit)),
    (snapshot) => {
      const entries = [];
      snapshot.forEach((child) => {
        const val = child.val();
        if (typeof val === "number") entries.push(val / GRAMS_PER_KG);
      });
      onData(entries);
    },
    (err) => {
      console.error("Gagal baca loadcell/history (cek Realtime Database rules):", err);
      onError?.(err);
    }
  );
}
