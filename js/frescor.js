// Aviso de dados desatualizados. Lógica pura (sem DOM); nenhuma função lança exceção.
// gerado_em é hora local de Palmas, sem fuso (specs/10). O celular da Jéssica está em Palmas,
// então comparamos com o relógio de parede do aparelho (sem converter fuso).
import { minutosIso, formatarGeradoEm } from "./dados.js";

export const HORAS_PARADA = 26;
const TOLERANCIA_FUTURO_H = 2; // gerado_em adiantado além disso = relógio do aparelho atrasado
const ANO_MINIMO = 2025; // relógio antes disso (aparelho zerado) não serve de comparação

function minutosAgora(agora) {
  if (!(agora instanceof Date) || Number.isNaN(agora.getTime())) return null;
  return Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate(), agora.getHours(), agora.getMinutes()) / 60000;
}

// { estado: "sem-dados" | "recente" | "velho" | "relogio", horas }
export function situacaoFrescor(geradoEm, agora) {
  const g = minutosIso(geradoEm);
  if (g == null) return { estado: "sem-dados", horas: null };
  const a = minutosAgora(agora);
  if (a == null || agora.getFullYear() < ANO_MINIMO) return { estado: "relogio", horas: null };
  const horas = (a - g) / 60;
  if (horas < -TOLERANCIA_FUTURO_H) return { estado: "relogio", horas: null };
  const h = Math.max(0, horas);
  return { estado: h > HORAS_PARADA ? "velho" : "recente", horas: h };
}

function duracao(horas) {
  if (horas < 48) return `${Math.floor(horas)} horas`;
  return `${Math.floor(horas / 24)} dias`;
}

// Texto do aviso, ou "" quando não há o que avisar. offline: sem internet agora.
export function textoAviso(geradoEm, agora, offline = false) {
  const { estado, horas } = situacaoFrescor(geradoEm, agora);
  if (estado === "relogio") return "A data ou a hora do celular parece errada. Acerte nos ajustes do aparelho para o aviso de preços velhos funcionar.";
  if (estado !== "velho") return "";
  const quando = formatarGeradoEm(geradoEm);
  const base = `Preços desatualizados: a última coleta foi há ${duracao(horas)} (${quando}). O computador da coleta pode estar desligado.`;
  return offline ? `${base} Sem internet: mostrando a última cópia.` : base;
}

// ---- DOM ---- deps: { agora: Date, offline: boolean }
export function atualizarAviso(el, dados, deps) {
  const texto = dados ? textoAviso(dados.gerado_em, deps.agora, deps.offline) : "";
  el.textContent = texto;
  el.hidden = !texto;
}
