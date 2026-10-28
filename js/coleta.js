// Situação da coleta (bloco da tela Mais): lógica pura, sem DOM. Nenhuma função lança exceção.
// Usa só o que o dados.json formato 1 traz em "coleta" (sem mensagem de erro, sem logs, sem caminhos).
import { minutosIso as minutos } from "./dados.js";
import { HORAS_PARADA, situacaoFrescor } from "./frescor.js";

export { HORAS_PARADA };
const NOMES = { assai: "Assaí", atacadao: "Atacadão", instagram: "Instagram" };

export function nomeFonte(fonte) {
  if (typeof fonte !== "string" || !fonte) return "Outra fonte";
  return Object.hasOwn(NOMES, fonte) ? NOMES[fonte] : fonte;
}

// "desligada" | "nunca" | "erro" | "parada" (ok, mas sem coletar há mais de 26 h) | "ok"
export function situacaoFonte(fonte, geradoEm) {
  const f = fonte && typeof fonte === "object" ? fonte : {};
  if (f.ativo === false) return "desligada";
  if (f.status === "erro") return "erro";
  if (f.status !== "ok") return "nunca";
  const fim = minutos(f.terminada_em);
  const ref = minutos(geradoEm);
  if (fim != null && ref != null && ref - fim > HORAS_PARADA * 60) return "parada";
  return "ok";
}

// Fontes na ordem do arquivo, com situação; ligadas com problema vêm primeiro.
export function fontesParaTela(dados) {
  const lista = dados && dados.coleta && Array.isArray(dados.coleta.fontes) ? dados.coleta.fontes : [];
  const geradoEm = dados ? dados.gerado_em : null;
  const peso = { erro: 0, parada: 0, nunca: 1, ok: 2, desligada: 3 };
  return lista.filter((f) => f && typeof f === "object").map((f, i) => {
    const situacao = situacaoFonte(f, geradoEm);
    return { fonte: f.fonte, nome: nomeFonte(f.fonte), situacao, terminadaEm: f.terminada_em ?? null, i };
  }).sort((a, b) => peso[a.situacao] - peso[b.situacao] || a.i - b.i);
}

// "Assaí · coletou hoje, 12:00". `f` é um item de fontesParaTela; `agora` é a hora do aparelho.
export function linhaFonte(f, agora) {
  const { nome, situacao, terminadaEm } = f;
  const dois = (n) => String(n).padStart(2, "0");
  const dia = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
  const m = /^(\d{4}-(\d{2})-(\d{2}))T(\d{2}:\d{2})/.exec(String(terminadaEm ?? ""));
  let texto;
  if (situacao === "desligada") texto = "desligada";
  else if (situacao === "nunca") texto = "ainda sem coleta";
  else if (situacao === "erro") texto = "falhou na última coleta";
  else if (situacao === "parada") texto = "sem coletar há mais de 26 horas";
  else if (!m) texto = "coletou";
  else if (!(agora instanceof Date) || Number.isNaN(agora.getTime())) texto = `coletou em ${m[3]}/${m[2]}`;
  else if (m[1] === dia(agora)) texto = `coletou hoje, ${m[4]}`;
  else if (m[1] === dia(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1))) texto = `coletou ontem, ${m[4]}`;
  else texto = `coletou em ${m[3]}/${m[2]}`;
  return `${nome} · ${texto}`;
}

// Algo parado? Fonte ligada com erro ou parada, ou dados com mais de 26 h (computador pode estar desligado).
export function coletaPrecisaAtencao(dados, agora) {
  if (!dados || typeof dados !== "object") return false;
  if (fontesParaTela(dados).some((f) => f.situacao === "erro" || f.situacao === "parada")) return true;
  return situacaoFrescor(dados.gerado_em, agora).estado === "velho";
}
