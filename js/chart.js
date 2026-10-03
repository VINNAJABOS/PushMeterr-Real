// Grafik gaya terhadap waktu (kg vs detik) untuk Record: dipakai halaman Live (saat merekam)
// dan Riwayat (detail sesi tersimpan di alat).
import { fmt } from "./units.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(tag, attrs = {}, text) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
}

/** Pembulatan ke atas ke angka "bulat" supaya garis kisi berlabel rapi. */
function niceMax(v) {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => f <= x);
  return step * exp;
}

/**
 * samples: [{ t: detik, kg }] urut waktu. Menggambar ulang isi container.
 * Sumbu Y mengikuti satuan pilihan pengguna (kg/lb) lewat fmt().
 */
export function drawForceChart(container, samples, { height = 170 } = {}) {
  container.replaceChildren();
  if (!samples.length) return;

  const W = Math.max(260, Math.round(container.clientWidth || 320));
  const H = height;
  const left = 38;
  const right = 8;
  const top = 10;
  const bottom = H - 22;
  const maxKg = niceMax(Math.max(...samples.map((s) => s.kg)) * 1.1);
  const maxT = Math.max(samples[samples.length - 1].t, 1);
  const xs = (t) => left + (t / maxT) * (W - left - right);
  const ys = (kg) => bottom - (kg / maxKg) * (bottom - top);

  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "trend-svg", role: "img" });
  root.appendChild(svg("title", {}, "Tekanan terhadap waktu"));

  for (const frac of [0, 0.5, 1]) {
    const y = ys(maxKg * frac);
    root.appendChild(svg("line", { x1: left, y1: y, x2: W - right, y2: y, class: frac === 0 ? "trend-axis" : "trend-grid" }));
    root.appendChild(svg("text", { x: left - 6, y: y + 3, class: "chart-ylabel" }, fmt(maxKg * frac)));
  }

  const ticks = maxT <= 4 ? [0, maxT] : [0, Math.round(maxT / 2), maxT];
  for (const t of [...new Set(ticks)]) {
    root.appendChild(svg("text", { x: xs(t), y: H - 6, class: "trend-tick" }, `${t} s`));
  }

  const pts = samples.map((s) => [xs(s.t), ys(s.kg)]);
  root.appendChild(
    svg("path", {
      d: pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" "),
      class: "trend-line",
    })
  );

  const peak = samples.reduce((a, b) => (b.kg > a.kg ? b : a));
  root.appendChild(svg("circle", { cx: xs(peak.t), cy: ys(peak.kg), r: 3.5, class: "trend-live" }));
  container.appendChild(root);
}
