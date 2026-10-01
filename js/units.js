// Satuan tampilan (kg / lb). Data sensor dan database tetap kg; hanya tampilan yang dikonversi.
const KEY = "pm-unit";
const LB_PER_KG = 2.2046226218;

export function getUnit() {
  try {
    return localStorage.getItem(KEY) === "lb" ? "lb" : "kg";
  } catch {
    return "kg";
  }
}

export function setUnit(unit) {
  const next = unit === "lb" ? "lb" : "kg";
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* penyimpanan diblokir: satuan berlaku untuk halaman ini saja */
  }
  document.dispatchEvent(new CustomEvent("unitchange", { detail: next }));
}

export function convert(kg) {
  return getUnit() === "lb" ? kg * LB_PER_KG : kg;
}

export function fmt(kg, digits = 2) {
  return convert(kg).toFixed(digits);
}
