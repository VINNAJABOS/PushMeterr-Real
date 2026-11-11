# Pushmeter

> Sistem pengukur kekuatan tekanan berbasis **Load Cell + HX711 + ESP32 DevKit V1** dengan dashboard web melalui **Bluetooth Low Energy (BLE)** tanpa membutuhkan Wi-Fi untuk komunikasi sensor.

---

## 1. Deskripsi Project

**Pushmeter** adalah perangkat yang digunakan untuk mengukur seberapa kuat seseorang memberikan tekanan pada sebuah bar/pegangan.

Nilai dari **Load Cell** dibaca menggunakan **HX711**, kemudian diproses oleh **ESP32 DevKit V1**. Data pengukuran dikirim ke dashboard web menggunakan **Bluetooth Low Energy (BLE)** sehingga ESP32 dapat terhubung langsung ke perangkat seperti laptop atau smartphone tanpa router Wi-Fi.

Pushmeter memiliki dua fitur pencatatan utama:

- **History / Riwayat** — menyimpan ringkasan setiap sesi pengukuran.
- **Record** — merekam perjalanan tekanan selama satu sesi, yaitu nilai gaya/berat dalam satuan kilogram terhadap waktu.

---

## 2. Tujuan Project

Project ini dirancang untuk:

1. Mengukur kekuatan tekanan seseorang secara realtime.
2. Menampilkan nilai tekanan pada dashboard web.
3. Menampilkan grafik perubahan tekanan selama proses Record.
4. Menyimpan riwayat pengukuran di ESP32.
5. Memungkinkan data lama dibaca kembali melalui BLE.
6. Mengurangi ketergantungan terhadap Wi-Fi atau koneksi internet.

---

## 3. Konsep Sistem

```text
                     PUSHMETER
                         │
                         ▼
                    Load Cell
                         │
                         ▼
                       HX711
                         │
                         ▼
                  ESP32 DevKit V1
                         │
              ┌──────────┴──────────┐
              │                     │
          Processing             Storage
              │                     │
              │              History / Record
              │                     │
              └──────────┬──────────┘
                         │
                        BLE
                         │
                         ▼
                 Web Pushmeter
                         │
              ┌──────────┴──────────┐
              │                     │
           Dashboard            Data History
              │                     │
              └──────────┬──────────┘
                         │
                      Graph Record
```

---

## 4. Hardware

### Komponen Utama

| Komponen | Fungsi |
|---|---|
| ESP32 DevKit V1 | Mikrokontroler utama dan komunikasi BLE |
| Load Cell | Sensor untuk mendeteksi tekanan |
| HX711 | Amplifier dan ADC untuk membaca Load Cell |
| Push Bar | Media tempat pengguna memberikan tekanan |
| Catu Daya | Sumber daya sistem |
| Kabel & konektor | Penghubung antar komponen |

### Catatan

Load Cell dan HX711 harus dikalibrasi terlebih dahulu agar nilai yang ditampilkan dalam **kg** sesuai dengan beban aktual.

---

## 5. Software

### Firmware ESP32

Firmware bertanggung jawab terhadap:

- Membaca HX711.
- Mengonversi hasil pembacaan menjadi nilai kg.
- Melakukan filtering/stabilisasi data.
- Menghitung nilai realtime.
- Merekam data per detik saat mode Record aktif.
- Menghitung Peak, Average, dan Duration.
- Menyimpan data ke flash.
- Menyediakan BLE Service dan Characteristic.
- Mengirim data realtime ke web.
- Mengirim History dan Record yang tersimpan ketika diminta web.

### Web Dashboard

Web bertanggung jawab terhadap:

- Menghubungkan perangkat melalui Bluetooth BLE.
- Menampilkan nilai tekanan realtime.
- Menampilkan status koneksi ESP32.
- Mengontrol Record.
- Menampilkan grafik tekanan terhadap waktu.
- Menampilkan History.
- Membuka detail Record dari sesi sebelumnya.
- Meminta data yang tersimpan di ESP32.

---

# 6. Fitur

## 6.1 Dashboard

Dashboard menampilkan nilai tekanan secara realtime.

Contoh:

```text
CURRENT FORCE

42.7 KG

████████████████░░░░░░

PEAK
51.3 KG

STATUS
CONNECTED
```

---

## 6.2 History / Riwayat

History merupakan daftar hasil dari sesi pengukuran yang telah selesai.

Contoh:

| Session | Peak | Average | Duration |
|---|---:|---:|---:|
| #001 | 42.8 kg | 37.2 kg | 3.2 s |
| #002 | 51.4 kg | 44.8 kg | 4.1 s |
| #003 | 48.7 kg | 41.5 kg | 2.8 s |
| #004 | 63.2 kg | 55.7 kg | 5.0 s |

History menyimpan **ringkasan sesi**, bukan seluruh sampel realtime.

Informasi utama:

- Session ID
- Peak Force
- Average Force
- Duration
- Timestamp (jika fitur timestamp diterapkan)

---

## 6.3 Record

Record digunakan untuk merekam satu sesi pengukuran secara detail.

Contoh data:

```text
0 s  →  0.0 kg
1 s  → 12.4 kg
2 s  → 21.7 kg
3 s  → 35.2 kg
4 s  → 43.8 kg
5 s  → 51.3 kg
6 s  → 48.6 kg
7 s  → 44.2 kg
8 s  → 39.7 kg
9 s  → 32.1 kg
10 s → 26.7 kg
```

Data Record kemudian ditampilkan menjadi grafik:

```text
Force (kg)
 60 │
 50 │              ●
 40 │          ●      ●
 30 │       ●           ●
 20 │    ●                 ●
 10 │ ●                       ●
  0 └──────────────────────────── Time
     0  1  2  3  4  5  6  7  8  9  10
```

### Prinsip sampling

ESP32 sebaiknya membaca Load Cell pada frekuensi yang lebih tinggi untuk mendapatkan pengukuran stabil.

Kemudian nilai yang sudah diproses dapat direkam sebagai **1 nilai per detik** untuk kebutuhan grafik Record.

Contoh:

```text
HX711 → pembacaan cepat
           ↓
        filtering
           ↓
     nilai stabil
           ↓
     setiap 1 detik
           ↓
       Record data
```

---

# 7. Perbedaan History dan Record

```text
HISTORY
│
├── Session #001
│   ├── Peak
│   ├── Average
│   └── Duration
│
├── Session #002
│   ├── Peak
│   ├── Average
│   └── Duration
│
└── Session #003
    ├── Peak
    ├── Average
    └── Duration
```

Sedangkan:

```text
RECORD - Session #003
│
├── 0 s  → 0.0 kg
├── 1 s  → 12.4 kg
├── 2 s  → 21.7 kg
├── 3 s  → 35.2 kg
├── 4 s  → 43.8 kg
└── ...
```

**History = ringkasan sesi.**

**Record = detail perubahan tekanan terhadap waktu.**

---

# 8. BLE Architecture

Pushmeter menggunakan BLE sebagai jalur komunikasi antara ESP32 dan web.

```text
ESP32 DevKit V1
      │
      │ BLE
      ▼
   Browser
      │
      ▼
Web Pushmeter
```

Tidak diperlukan:

```text
Router Wi-Fi
Internet
Cloud Server
```

untuk komunikasi dasar antara ESP32 dan dashboard.

### Rancangan BLE Service

Contoh rancangan awal:

```text
Pushmeter Service
│
├── FORCE
│   └── Realtime force value
│
├── RESULT
│   └── Last completed session
│
├── HISTORY
│   └── Stored history data
│
├── RECORD
│   └── Stored record data
│
└── COMMAND
    ├── START_RECORD
    ├── STOP_RECORD
    ├── GET_HISTORY
    ├── GET_RECORD
    └── CLEAR_HISTORY
```

> UUID final belum ditetapkan dan akan ditentukan pada tahap implementasi firmware + web.

---

# 9. Alur Pengukuran

## Normal Measurement

```text
User menekan Push Bar
        ↓
Load Cell mendeteksi tekanan
        ↓
HX711 membaca perubahan
        ↓
ESP32 memproses nilai
        ↓
ESP32 mengirim nilai realtime melalui BLE
        ↓
Web menampilkan nilai kg
```

---

## Record Session

```text
User menekan START RECORD
        ↓
ESP32 mulai membuat session
        ↓
Load Cell dibaca terus-menerus
        ↓
Data diproses dan distabilkan
        ↓
Nilai Record dicatat setiap 1 detik
        ↓
Data dikirim realtime melalui BLE
        ↓
Web menggambar grafik
        ↓
User menekan STOP
        ↓
ESP32 menghitung hasil akhir
        ↓
Peak / Average / Duration
        ↓
Data disimpan
        ↓
Session masuk ke History
```

---

# 10. Penyimpanan Data

Data yang sudah selesai direkam harus disimpan pada penyimpanan non-volatile ESP32 agar tidak hilang ketika perangkat dimatikan.

Contoh struktur konseptual:

```text
Pushmeter Storage
│
├── history
│   ├── session_001
│   ├── session_002
│   ├── session_003
│   └── ...
│
└── records
    ├── session_001
    ├── session_002
    ├── session_003
    └── ...
```

Format data dapat menggunakan JSON atau format biner yang lebih efisien.

Contoh Record:

```json
{
  "session": 24,
  "duration": 15,
  "peak": 51.3,
  "average": 29.7,
  "samples": [
    { "t": 0, "kg": 0.0 },
    { "t": 1, "kg": 12.4 },
    { "t": 2, "kg": 21.7 },
    { "t": 3, "kg": 35.2 }
  ]
}
```

---

# 11. Contoh Struktur Data

## History

```json
{
  "session": 24,
  "peak": 51.3,
  "average": 29.7,
  "duration": 15
}
```

## Record

```json
{
  "session": 24,
  "samples": [
    { "t": 0, "kg": 0.0 },
    { "t": 1, "kg": 12.4 },
    { "t": 2, "kg": 21.7 },
    { "t": 3, "kg": 35.2 },
    { "t": 4, "kg": 43.8 },
    { "t": 5, "kg": 51.3 }
  ]
}
```

> Struktur di atas adalah rancangan awal. Format final dapat diubah untuk menghemat bandwidth BLE dan kapasitas flash.

---

# 12. Rancangan Tampilan Web

```text
┌────────────────────────────────────────────┐
│                  PUSHMETER                 │
├──────────────┬─────────────────────────────┤
│ DASHBOARD    │ Current Force               │
│ RECORD       │                             │
│ HISTORY      │          42.7 KG            │
│ SETTINGS     │                             │
│              │ Peak: 51.3 KG               │
│              │ Status: CONNECTED           │
└──────────────┴─────────────────────────────┘
```

### Halaman Record

```text
┌────────────────────────────────────────────┐
│                  RECORD                    │
│                                            │
│              42.7 KG                      │
│                                            │
│          ┌─────────────────┐               │
│     KG   │      ╭──╮       │               │
│          │   ╭──╯  ╰──╮    │               │
│          │ ╭─╯        ╰─╮  │               │
│          └─────────────────┘               │
│              TIME (SEC)                    │
│                                            │
│             [ STOP RECORD ]                │
└────────────────────────────────────────────┘
```

### Halaman History

```text
┌────────────────────────────────────────────┐
│                  HISTORY                   │
├────────┬──────────┬──────────┬─────────────┤
│ ID     │ PEAK     │ AVERAGE  │ DURATION    │
├────────┼──────────┼──────────┼─────────────┤
│ #004   │ 63.2 KG  │ 55.7 KG  │ 5.0 s       │
│ #003   │ 48.7 KG  │ 41.5 KG  │ 2.8 s       │
│ #002   │ 51.4 KG  │ 44.8 KG  │ 4.1 s       │
│ #001   │ 42.8 KG  │ 37.2 KG  │ 3.2 s       │
└────────┴──────────┴──────────┴─────────────┘
```

Klik salah satu session untuk melihat detail Record dan grafiknya.

---

# 13. Rencana Struktur Project

Struktur repository yang disarankan:

```text
Pushmeter/
│
├── firmware/
│   ├── src/
│   │   ├── main.cpp
│   │   ├── loadcell.cpp
│   │   ├── loadcell.h
│   │   ├── ble.cpp
│   │   ├── ble.h
│   │   ├── storage.cpp
│   │   ├── storage.h
│   │   └── record.cpp
│   │
│   └── README.md
│
├── web/
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── app.js
│   │   ├── ble.js
│   │   ├── chart.js
│   │   ├── history.js
│   │   └── record.js
│   └── README.md
│
├── docs/
│   ├── architecture.md
│   ├── ble-protocol.md
│   └── calibration.md
│
└── README.md
```

---

# 14. Tahap Pengembangan

## Phase 1 — Load Cell

- [ ] Wiring Load Cell ke HX711.
- [ ] Hubungkan HX711 ke ESP32 DevKit V1.
- [ ] Membaca raw value.
- [ ] Melakukan kalibrasi kg.
- [ ] Menentukan filtering/stabilization.

## Phase 2 — BLE

- [ ] Membuat BLE Service.
- [ ] Membuat Characteristic realtime force.
- [ ] Mengirim data force menggunakan notification.
- [ ] Menguji koneksi ESP32 → browser.

## Phase 3 — Web Dashboard

- [ ] Membuat dashboard.
- [ ] Menampilkan force realtime.
- [ ] Menampilkan status Bluetooth.
- [ ] Membuat tombol Connect / Disconnect.

## Phase 4 — Record

- [ ] Start Record.
- [ ] Sampling dan filtering.
- [ ] Penyimpanan nilai per detik.
- [ ] Stop Record.
- [ ] Perhitungan Peak.
- [ ] Perhitungan Average.
- [ ] Perhitungan Duration.
- [ ] Grafik force vs time.

## Phase 5 — History

- [ ] Menyimpan session.
- [ ] Membuat Session ID.
- [ ] Membaca daftar History.
- [ ] Membuka detail session.
- [ ] Menampilkan kembali Record.
- [ ] Menghapus History.

## Phase 6 — Finalisasi

- [ ] Optimasi penyimpanan flash.
- [ ] Optimasi paket BLE.
- [ ] Pengujian koneksi.
- [ ] Pengujian kalibrasi.
- [ ] Pengujian beban.
- [ ] Pengujian durabilitas perangkat.
- [ ] Finalisasi UI/UX.

---

# 15. Prinsip Penting

### ESP32 sebagai sumber data utama

ESP32 bertindak sebagai pusat pengukuran dan penyimpanan.

```text
Load Cell
   ↓
 HX711
   ↓
ESP32
   ├── Processing
   ├── BLE
   └── Storage
```

Web berfungsi sebagai **dashboard dan interface**, bukan sebagai satu-satunya tempat penyimpanan data.

### Data Record dan History dipisahkan

```text
History = ringkasan
Record  = detail
```

Pemisahan ini membuat sistem lebih mudah dikembangkan dan lebih hemat penyimpanan.

---

# 16. Target Akhir

Target akhir Pushmeter:

```text
              PUSHMETER
                  │
             ┌────┴────┐
             │         │
          HARDWARE    WEB
             │         │
         Load Cell   Dashboard
         HX711       Record
         ESP32       History
             │         │
             └── BLE ──┘
```

Pengguna cukup membuka web, menghubungkan perangkat melalui Bluetooth, kemudian dapat melihat tekanan secara realtime, melakukan Record, melihat grafik, dan membuka History yang tersimpan pada ESP32.

---

## Status Project

**Project:** Pushmeter  
**Platform:** ESP32 DevKit V1  
**Sensor:** Load Cell + HX711  
**Communication:** Bluetooth Low Energy (BLE)  
**Interface:** Web Dashboard  
**Wi-Fi:** Tidak digunakan untuk komunikasi ESP32 ↔ Web  
**Data Storage:** Flash ESP32  
**Fitur utama:** Realtime Force, Record, History, Graph

---

## License

Project ini dibuat untuk kebutuhan pengembangan dan dokumentasi **Pushmeter Project**.
