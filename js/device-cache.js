// Salinan lokal sesi yang tersimpan di alat (ESP32), supaya halaman Riwayat bisa tampil
// tanpa Bluetooth. Sumber kebenarannya tetap alat: daftar ditimpa tiap sinkron.
const LIST_KEY = "pm-dev-list";
const REC_KEY = (id) => `pm-dev-rec-${id}`;

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* penyimpanan penuh atau tidak tersedia: abaikan, data tetap ada di alat */
  }
}

/** Ringkasan sesi: [{ id, ts, dur, count, peak, avg }] urut id menurun. */
export function loadList() {
  const list = read(LIST_KEY);
  return Array.isArray(list) ? list : [];
}

/** Ganti seluruh daftar (hasil sinkron) dan buang rekaman cache yang sudah tidak ada di alat. */
export function replaceList(items) {
  const sorted = items.slice().sort((a, b) => b.id - a.id);
  const keep = new Set(sorted.map((s) => s.id));
  for (const old of loadList()) if (!keep.has(old.id)) removeRecord(old.id);
  write(LIST_KEY, sorted);
  return sorted;
}

/** Tambah/ganti satu sesi (mis. hasil Record yang baru selesai). */
export function upsertSession(item) {
  const list = loadList().filter((s) => s.id !== item.id);
  list.push(item);
  return replaceList(list);
}

export const loadRecord = (id) => read(REC_KEY(id));
export const saveRecord = (id, samples) => write(REC_KEY(id), samples);

export function removeRecord(id) {
  try {
    localStorage.removeItem(REC_KEY(id));
  } catch {
    /* abaikan */
  }
}

export function removeSession(id) {
  removeRecord(id);
  write(LIST_KEY, loadList().filter((s) => s.id !== id));
}

export function clearAll() {
  for (const s of loadList()) removeRecord(s.id);
  write(LIST_KEY, []);
}
