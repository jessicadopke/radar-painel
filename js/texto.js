// Texto sem acento, minúsculo e aparado. Folha: não importa nada (usada por listas.js, lista.js e hoje.js).
export function normalizar(texto) {
  if (texto == null) return "";
  return String(texto).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
