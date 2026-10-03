// Halaman Plato AI: chat ke Gemini dengan konteks data sensor dan streak asli.
import { askPlatoAI } from "./gemini-config.js";
import { initShell } from "./shell.js";
import { touchStreak } from "./streak.js";

const chatMessagesEl = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send");
const chatStatusEl = document.getElementById("chat-status");
const chatClearBtn = document.getElementById("chat-clear");
const chatChipsEl = document.getElementById("chat-chips");
const streakChipEl = document.getElementById("streak-chip");

const greetingHTML = chatMessagesEl.innerHTML;
let history = [];
let busy = false;

// Konteks data realtime (berat sensor + streak) yang dikirim ke AI supaya
// jawabannya nyambung dengan data asli, bukan mengarang. Semua dalam kg.
const liveContext = {};

initShell((user) => {
  // Membuka Plato AI dihitung sebagai aktivitas hari ini untuk streak.
  touchStreak(user.uid)
    .then(({ count, best }) => {
      liveContext.streakCount = count;
      liveContext.streakBest = best;
      if (streakChipEl) streakChipEl.textContent = `${count} hari beruntun`;
    })
    .catch((err) => {
      console.error(
        "Streak gagal disimpan/dibaca. Kemungkinan Firestore rules belum mengizinkan " +
          'dokumen "users/{uid}". Cek README.md bagian setup Firestore. Detail error:',
        err
      );
    });

});

function clockString() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function appendMessage(role, text) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role === "user" ? "msg-user" : "msg-ai"}`;

  const meta = document.createElement("span");
  meta.className = "msg-meta";
  meta.textContent = `${role === "user" ? "Anda" : "Plato"} · ${clockString()}`;
  wrap.appendChild(meta);

  const bubble = document.createElement("p");
  bubble.className = "msg-bubble";
  bubble.textContent = text;
  wrap.appendChild(bubble);

  chatMessagesEl.appendChild(wrap);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  return bubble;
}

function setBusy(on) {
  busy = on;
  chatInput.disabled = on;
  chatSendBtn.disabled = on;
  chatClearBtn.disabled = on;
  chatChipsEl.querySelectorAll(".chip").forEach((chip) => (chip.disabled = on));
}

async function sendMessage(text) {
  if (busy || !text) return;

  appendMessage("user", text);
  history.push({ role: "user", text });
  chatInput.value = "";
  setBusy(true);
  chatStatusEl.textContent = "Sedang mengetik...";

  const typingBubble = appendMessage("ai", "...");

  try {
    const reply = await askPlatoAI(history, liveContext);
    typingBubble.textContent = reply;
    history.push({ role: "model", text: reply });
    chatStatusEl.textContent = "Siap ngobrol";
  } catch (err) {
    console.error("Plato AI gagal merespon:", err);
    // Batalkan pesan user dari history supaya tidak ikut dikirim ulang di
    // permintaan berikutnya kalau AI gagal total menjawabnya.
    history.pop();
    typingBubble.textContent =
      "Aduh, semua jalur AI lagi penuh/limit nih. Coba lagi beberapa saat ya. (Detail error ada di console browser)";
    chatStatusEl.textContent = "Gagal merespon";
  } finally {
    setBusy(false);
    chatInput.focus();
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage(chatInput.value.trim());
});

chatChipsEl.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (chip) sendMessage(chip.dataset.prompt);
});

chatClearBtn.addEventListener("click", () => {
  if (busy) return;
  history = [];
  chatMessagesEl.innerHTML = greetingHTML;
  chatStatusEl.textContent = "Siap ngobrol";
  chatInput.focus();
});
