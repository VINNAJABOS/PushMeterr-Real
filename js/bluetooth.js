// Sambungan Bluetooth LE ke alat Pluto AI (ESP32) lewat Web Bluetooth.
// Protokol sama dengan meterrr/meterrr.ino: DATA (notify, 8 byte), CMD (write), STATUS (notify).
const SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const DATA    = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const CMD     = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const STATUS  = "6e400004-b5a3-f393-e0a9-e50e24dcca9e";

export const bluetoothSupported =
  typeof navigator !== "undefined" && "bluetooth" in navigator;

/**
 * handlers:
 *  onReading(leftG, rightG)  tiap notifikasi data (sekitar 0,5 detik)
 *  onState("disconnected" | "connecting" | "connected")
 *  onError(message)          pesan error untuk ditampilkan ke user (opsional)
 */
export function createBluetooth({ onReading, onState, onError }) {
  let device   = null;
  let cmdChar  = null;
  let pending  = null; // { resolve, timer } menunggu balasan STATUS dari alat
  let state    = "disconnected";

  const setState = (s) => {
    state = s;
    onState?.(s);
  };

  function handleData(event) {
    const v = event.target.value;
    if (v.byteLength < 8) return;
    const leftG  = v.getFloat32(0, true);  // little-endian
    const rightG = v.getFloat32(4, true);
    onReading(leftG, rightG);
  }

  function handleStatus(event) {
    const text = new TextDecoder().decode(event.target.value);
    if (!pending) return;
    clearTimeout(pending.timer);
    const { resolve } = pending;
    pending = null;
    resolve(text);
  }

  function handleDisconnected() {
    cmdChar = null;
    if (pending) {
      clearTimeout(pending.timer);
      pending.resolve("ERR:terputus");
      pending = null;
    }
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
      setState("connected");
    } catch (err) {
      if (device?.gatt?.connected) device.gatt.disconnect();
      setState("disconnected");
      throw err;
    }
  }

  /**
   * Buka dialog pilih perangkat lalu sambungkan.
   * Strategi filter bertingkat:
   *   1. Coba namePrefix "Pluto" (lebih longgar, menangkap "Pluto AI", "Pluto_AI", dsb.)
   *   2. Jika user memanggil connectAny(), pakai acceptAllDevices (mode debug)
   */
  async function connect() {
    if (!bluetoothSupported) throw new Error("unsupported");
    if (!device) {
      device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: "Pluto" },
        ],
        optionalServices: [SERVICE],
      });
      device.addEventListener("gattserverdisconnected", handleDisconnected);
    }
    await open();
  }

  /**
   * Mode debug: tampilkan SEMUA perangkat BLE di sekitar.
   * Berguna jika nama ESP32 ternyata berbeda dari "Pluto AI".
   */
  async function connectAny() {
    if (!bluetoothSupported) throw new Error("unsupported");
    if (device) {
      // Sudah punya perangkat, langsung reconnect
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

  /**
   * Kirim perintah teks ke ESP32, tunggu balasan STATUS ("OK:..." atau "ERR:...").
   * Memakai writeValueWithResponse agar ESP32 sempat memproses sebelum notifikasi dikirim.
   */
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

  return {
    connect,
    connectAny,
    disconnect,
    tare:      ()              => command("T"),
    calibrate: (side, grams)  => command(`C${side === "left" ? 1 : 2}:${grams}`),
    get state()     { return state; },
    get connected() { return state === "connected"; },
  };
}
