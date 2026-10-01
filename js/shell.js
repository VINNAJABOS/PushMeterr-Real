// Kerangka bersama halaman yang butuh login: penjaga akses, avatar, nama, tombol keluar.
import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { syncUserProfile, renderAvatar } from "./user-profile.js";

/** onUser(user) dipanggil sekali setelah pengguna terverifikasi; tanpa login -> login.html. */
export function initShell(onUser) {
  const nameEl = document.getElementById("user-name");
  const emailEl = document.getElementById("user-email");
  const avatarEl = document.getElementById("user-avatar");
  const logoutBtn = document.getElementById("logout-btn");
  let started = false;

  logoutBtn?.addEventListener("click", () => {
    signOut(auth).then(() => {
      window.location.href = "login.html";
    });
  });

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    if (nameEl) nameEl.textContent = user.displayName || "Pengguna";
    if (emailEl) emailEl.textContent = user.email || "";
    if (avatarEl) renderAvatar(avatarEl, user);
    syncUserProfile(user).catch((err) => console.error("Gagal sinkron profil user ke Firestore:", err));
    if (!started) {
      started = true;
      onUser?.(user);
    }
  });
}
