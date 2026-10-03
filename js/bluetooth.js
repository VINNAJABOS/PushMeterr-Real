// Sambungan Bluetooth LE ke alat Pluto AI (ESP32) lewat Web Bluetooth.
// Protokol sama dengan meterrr/meterrr.ino:
//   DATA   (notify) 11 byte: float kiri(g), float kanan(g), uint8 flag (bit0 = sedang Record), uint16 detik Record
//   CMD    (write)  teks perintah
//   STATUS (notify) teks hasil perintah ("OK:..." / "ERR:...")
//   XFER   (notify) aliran pesan berbingkai [tipe u8][panjang u16][payload][checksum u8] untuk riwayat dan rekaman
const SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const DATA    = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const CMD     = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const STATUS  = "6e400004-b5a3-f393-e0a9-e50e24dcca9e";
const XFER    = "6e400005-b5a3-f393-e0a9-e50e24dcca9e";

const MSG_HISTORY_ITEM = 1;
const MSG_HISTORY_END = 2;
const MSG_RECORD_HEADER = 3;
const MSG_RECORD_SAMPLES = 4;
const MSG_RESULT = 5;
const HEADER_BYTES = 16;      // header lama (tanpa puncak kiri/kanan); firmware baru mengirim 20
const HEADER_BYTES_LR = 20;

export const bluetoothSupported =
  typeof navigator !== "undefined" && "bluetooth" in navigator;

/** Header sesi dari alat -> objek dengan kg (alat mengirim satuan 0,01 kg). */
function parseHeader(view, offset = 0) {
  return {
    id:    view.getUint32(offset, true),
    ts:    view.getUint32(offset + 4, true), // detik epoch, 0 kalau tidak diketahui
    dur:   view.getUint16(offset + 8, true),
    count: view.getUint16(offset + 10, true),
    peak:  view.getUint16(offset + 12, true) / 100,
    avg:   view.getUint16(offset + 14, true) / 100,
    // puncak per sisi; null kalau firmware lama (header 16 byte)
    peakL: view.byteLength >= offset + HEADER_BYTES_LR ? view.getUint16(offset + 16, true) / 100 : null,
    peakR: view.byteLength >= offset + HEADER_BYTES_LR ? view.getUint16(offset + 18, true) / 100 : null,
  };
}

/**
 * handlers:
 *  onReading(leftG, rightG, { recording, elapsed })  tiap notifikasi data (sekitar 0,5 detik)
 *  onResult(session)                                  sesi Record selesai: { id, ts, dur, count, peak, avg, peakL, peakR } (kg)
 *  onState("disconnected" | "connecting" | "connected")
 */
export function createBluetooth({ onReading, onResult, onState }) {
  let device   = null;
  let cmdChar  = null;
  let pending  = null; // { resolve, timer } menunggu balasan STATUS dari alat
  let waiter   = null; // { kind, items, header, resolve, reject, timer } menunggu data XFER
  let rxBuf    = new Uint8Array(0);
  let state    = "disconnected";

  const setState = (s) => {
    state = s;
    onState?.(s);
  };

  function handleData(event) {
    const v = event.target.value;
    if (v.byteLength < 8) return;
    const info = v.byteLength >= 11
      ? { recording: (v.getUint8(8) & 1) === 1, elapsed: v.getUint16(9, true) }
      : { recording: false, elapsed: 0 };
    onReading(v.getFloat32(0, true), v.getFloat32(4, true), info);
  }

  function handleStatus(event) {
    const text = new TextDecoder().decode(event.target.value);
    if (pending) {
      clearTimeout(pending.timer);
      const { resolve } = pending;
      pending = null;
      resolve(text);
    } else if (waiter && text.startsWith("ERR")) {
      failWaiter(new Error(text));
    }
  }

  // ---- XFER: sambung potongan 20 byte menjadi pesan utuh ----
  function handleXfer(event) {
    const chunk = new Uint8Array(event.target.value.buffer, event.target.value.byteOffset, event.target.value.byteLength);
    const merged = new Uint8Array(rxBuf.length + chunk.length);
    merged.set(rxBuf);
    merged.set(chunk, rxBuf.length);
    rxBuf = merged;

    while (rxBuf.length >= 3) {
      const len = rxBuf[1] | (rxBuf[2] << 8);
      if (rxBuf.length < 3 + len + 1) break; // belum lengkap
      const payload = rxBuf.slice(3, 3 + len);
      const sum = payload.reduce((a, b) => (a + b) & 0xff, 0);
      const type = rxBuf[0];
      const ok = sum === rxBuf[3 + len];
      rxBuf = rxBuf.slice(3 + len + 1);
      if (!ok) {
        rxBuf = new Uint8Array(0);
        failWaiter(new Error("data rusak"));
        return;
      }
      dispatchMessage(type, payload);
    }
  }

  function dispatchMessage(type, payload) {
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    if (type === MSG_RESULT) {
      if (payload.length >= HEADER_BYTES) onResult?.(parseHeader(view));
    } else if (type === MSG_HISTORY_ITEM && waiter?.kind === "history") {
      if (payload.length >= HEADER_BYTES) waiter.items.push(parseHeader(view));
    } else if (type === MSG_HISTORY_END && waiter?.kind === "history") {
      finishWaiter(waiter.items);
    } else if (type === MSG_RECORD_HEADER && waiter?.kind === "record") {
      if (payload.length >= HEADER_BYTES) waiter.header = parseHeader(view);
    } else if (type === MSG_RECORD_SAMPLES && waiter?.kind === "record" && waiter.header) {
      const samples = [];
      for (let i = 0; i + 1 < payload.length; i += 2) {
        samples.push({ t: i / 2, kg: view.getUint16(i, true) / 100 });
      }
      finishWaiter({ ...waiter.header, samples });
    }
  }

  function finishWaiter(value) {
    if (!waiter) return;
    clearTimeout(waiter.timer);
    const { resolve } = waiter;
    waiter = null;
    resolve(value);
  }

  function failWaiter(err) {
    if (!waiter) return;
    clearTimeout(waiter.timer);
    const { reject } = waiter;
    waiter = null;
    reject(err);
  }

  function handleDisconnected() {
    cmdChar = null;
    rxBuf = new Uint8Array(0);
    if (pending) {
      clearTimeout(pending.timer);
      pending.resolve("ERR:terputus");
      pending = null;
    }
    failWaiter(new Error("terputus"));
    setState("disconnected");
  }

  async function open() {
    setState("connecting");
    try {
      const server     = await device.gatt.connect();
      const service    = await server.getPrimaryService(SERVICE);
      const dataChar   = await service.getCharacteristic(DATA);
      const statusChar = await service.getCharacteristic(STATUS);
      cmdChar          = await service.getCharacteristic(CMD);

      dataChar.addEventListener("characteristicvaluechanged", handleData);
      statusChar.addEventListener("characteristicvaluechanged", handleStatus);
      await dataChar.startNotifications();
      await statusChar.startNotifications();
      try {
        // XFER ada sejak firmware Record; firmware lama tidak punya, jadi jangan gagalkan sambungan
        const xferChar = await service.getCharacteristic(XFER);
        xferChar.addEventListener("characteristicvaluechanged", handleXfer);
        await xferChar.startNotifications();
      } catch (err) {
        console.warn("Karakteristik XFER tidak ada (firmware lama?):", err);
      }
      setState("connected");
    } catch (err) {
      if (device?.gatt?.connected) device.gatt.disconnect();
      setState("disconnected");
      throw err;
    }
  }

  /**
   * Buka dialog pilih perangkat lalu sambungkan.
   * Filter namePrefix "Pluto" menangkap "Pluto AI", "Pluto_AI", dsb.
   */
  async function connect() {
    if (!bluetoothSupported) throw new Error("unsupported");
    if (!device) {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "Pluto" }],
        optionalServices: [SERVICE],
      });
      device.addEventListener("gattserverdisconnected", handleDisconnected);
    }
    await open();
  }

  /** Mode debug: tampilkan SEMUA perangkat BLE di sekitar (kalau nama ESP32 ternyata lain). */
  async function connectAny() {
    if (!bluetoothSupported) throw new Error("unsupported");
    if (device) {
      await open();
      return;
    }
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [SERVICE],
    });
    device.addEventListener("gattserverdisconnected", handleDisconnected);
    await open();
  }

  function disconnect() {
    if (device?.gatt?.connected) device.gatt.disconnect();
    device  = null;  // reset supaya bisa pilih perangkat baru lain kali
    cmdChar = null;
  }

  /** Kirim perintah teks, tunggu balasan STATUS ("OK:..." atau "ERR:..."). */
  function command(text, timeoutMs = 15000) {
    if (!cmdChar) return Promise.resolve("ERR:belum tersambung");
    if (pending)  return Promise.resolve("ERR:sibuk");
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending = null;
        resolve("ERR:timeout");
      }, timeoutMs);
      pending = { resolve, timer };
      cmdChar
        .writeValueWithResponse(new TextEncoder().encode(text))
        .catch(() => {
          clearTimeout(timer);
          pending = null;
          resolve("ERR:gagal kirim");
        });
    });
  }

  /** Perintah yang jawabannya berupa aliran data XFER (riwayat / rekaman). */
  function request(kind, text, timeoutMs = 20000) {
    if (!cmdChar) return Promise.reject(new Error("belum tersambung"));
    if (waiter)   return Promise.reject(new Error("sibuk"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => failWaiter(new Error("timeout")), timeoutMs);
      waiter = { kind, items: [], header: null, resolve, reject, timer };
      cmdChar.writeValueWithResponse(new TextEncoder().encode(text)).catch(() => failWaiter(new Error("gagal kirim")));
    });
  }

  return {
    connect,
    connectAny,
    disconnect,
    tare:          ()             => command("T"),
    calibrate:     (side, grams)  => command(`C${side === "left" ? 1 : 2}:${grams}`),
    startRecord:   (unixSeconds)  => command(`START_RECORD:${unixSeconds}`),
    stopRecord:    ()             => command("STOP_RECORD"),
    deleteRecord:  (id)           => command(`DELETE_RECORD:${id}`),
    clearHistory:  ()             => command("CLEAR_HISTORY"),
    /** -> [{ id, ts, dur, count, peak, avg, peakL, peakR }] (kg) */
    getHistory:    ()             => request("history", "GET_HISTORY"),
    /** -> { id, ts, dur, count, peak, avg, samples: [{ t, kg }] } */
    getRecord:     (id)           => request("record", `GET_RECORD:${id}`),
    get state()     { return state; },
    get connected() { return state === "connected"; },
  };
}
