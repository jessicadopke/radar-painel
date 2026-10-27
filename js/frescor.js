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

// Chip do topo: { texto, velho }. Só o chip "velho" (> 26 h, ou relógio errado) ganha o amarelo.
// offline: sem internet agora (só muda o texto quando os preços já estão velhos).
export function textoChip(geradoEm, agora, offline = false) {
  const { estado, horas } = situacaoFrescor(geradoEm, agora);
  if (estado === "sem-dados") return { texto: "Ainda sem preços", velho: false };
  if (estado === "relogio") return { texto: "Hora do celular errada", velho: true };
  const m = /^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(geradoEm);
  const dia = `${m[2]}/${m[1]}`;
  if (estado === "velho") {
    if (offline) return { texto: `Sem internet · preços de ${dia}`, velho: true };
    const dias = Math.max(1, Math.floor(horas / 24));
    return { texto: `Preços de ${dias} ${dias === 1 ? "dia" : "dias"} atrás`, velho: true };
  }
  const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
  const ontemD = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1);
  const ontem = `${ontemD.getFullYear()}-${String(ontemD.getMonth() + 1).padStart(2, "0")}-${String(ontemD.getDate()).padStart(2, "0")}`;
  const dataIso = geradoEm.slice(0, 10);
  if (dataIso === hoje) return { texto: `Atualizado hoje, ${m[3]}`, velho: false };
  if (dataIso === ontem) return { texto: `Atualizado ontem, ${m[3]}`, velho: false };
  return { texto: `Atualizado em ${dia}`, velho: false };
}

// ---- DOM ---- deps: { agora: Date, offline: boolean }
export function atualizarChip(el, dados, deps) {
  const { texto, velho } = dados ? textoChip(dados.gerado_em, deps.agora, deps.offline) : { texto: "Ainda sem preços", velho: false };
  el.textContent = texto;
  el.classList.toggle("velho", velho);
}
