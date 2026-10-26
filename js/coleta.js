// Tela Coleta: lógica pura (sem DOM) + montagem da tela. Nenhuma função lança exceção.
// Usa só o que o dados.json formato 1 traz em "coleta" (sem mensagem de erro, sem logs, sem caminhos).
import { formatarGeradoEm, minutosIso as minutos } from "./dados.js";
import { HORAS_PARADA } from "./frescor.js";

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

const ROTULOS = {
  ok: "Coletou normalmente",
  erro: "Falhou na última coleta",
  parada: "Sem coletar há mais de 26 horas",
  nunca: "Ainda não coletou",
  desligada: "Desligada",
};
export const textoSituacao = (s) => ROTULOS[s] ?? ROTULOS.nunca;

export function textoImagens(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return n === 1 ? "1 imagem nova" : `${n} imagens novas`;
}

// Fontes na ordem do arquivo, com situação; ligadas com problema vêm primeiro.
export function fontesParaTela(dados) {
  const lista = dados && dados.coleta && Array.isArray(dados.coleta.fontes) ? dados.coleta.fontes : [];
  const geradoEm = dados ? dados.gerado_em : null;
  const peso = { erro: 0, parada: 0, nunca: 1, ok: 2, desligada: 3 };
  return lista.filter((f) => f && typeof f === "object").map((f, i) => {
    const situacao = situacaoFonte(f, geradoEm);
    return { fonte: f.fonte, nome: nomeFonte(f.fonte), situacao, texto: textoSituacao(situacao),
      terminadaEm: f.terminada_em ?? null, imagens: textoImagens(f.novas_imagens), i };
  }).sort((a, b) => peso[a.situacao] - peso[b.situacao] || a.i - b.i);
}

// Ofertas vigentes no arquivo, por mercado (ordem alfabética).
export function ofertasPorMercado(dados) {
  const produtos = dados && Array.isArray(dados.produtos) ? dados.produtos : [];
  const cont = new Map();
  let total = 0;
  for (const p of produtos) {
    if (!p || !Array.isArray(p.ofertas)) continue;
    for (const o of p.ofertas) {
      if (!o || typeof o !== "object") continue;
      const m = String(o.mercado ?? "") || "Outro";
      cont.set(m, (cont.get(m) ?? 0) + 1);
      total += 1;
    }
  }
  const mercados = [...cont].map(([mercado, n]) => ({ mercado, n })).sort((a, b) => a.mercado.localeCompare(b.mercado, "pt-BR"));
  return { total, mercados };
}

export function textoQuando(iso) {
  const t = formatarGeradoEm(iso);
  return t ? `Última coleta: ${t}` : "Ainda sem coleta registrada";
}

// ---- DOM ----
// deps: { document }
export function renderColeta(raiz, ctx, deps) {
  const doc = deps.document;
  const el = (tag, props = {}, ...filhos) => {
    const e = doc.createElement(tag);
    Object.assign(e, props);
    e.append(...filhos);
    return e;
  };
  raiz.append(el("h2", { textContent: "Coleta" }));
  const aviso = (texto, link) => {
    const c = el("div", { className: "cartao" }, el("p", { textContent: texto }));
    if (link) c.append(el("div", { className: "acoes" }, link));
    raiz.append(c);
  };
  if (ctx.estadoDados === "atualize") return aviso("Atualize o app para ver a coleta.", el("a", { className: "botao", href: "#sobre", textContent: "Ir para Sobre" }));
  if (ctx.estadoDados !== "ok" || !ctx.dados) return aviso("Ainda sem dados. Abra o app com internet uma vez.");

  const dados = ctx.dados;
  raiz.append(el("p", { className: "muted", textContent: textoQuando(dados.coleta && dados.coleta.ultima_execucao_em) }));
  const fontes = fontesParaTela(dados);
  if (!fontes.length) aviso("Nenhuma fonte registrada ainda.");
  for (const f of fontes) {
    const secao = el("section", { className: `cartao fonte fonte-${f.situacao}` });
    const idTitulo = `fonte-${f.fonte}`;
    secao.setAttribute("aria-labelledby", idTitulo);
    const cab = el("div", { className: "cab-oferta" }, el("h3", { id: idTitulo, textContent: f.nome }),
      el("span", { className: `selo-fonte ${f.situacao}`, textContent: f.texto }));
    secao.append(cab);
    if (f.situacao !== "desligada" && f.situacao !== "nunca") {
      const q = formatarGeradoEm(f.terminadaEm);
      if (q) secao.append(el("p", { className: "muted", textContent: `Terminou em ${q}` }));
      if (f.imagens) secao.append(el("p", { className: "muted", textContent: f.imagens }));
    }
    if (f.situacao === "erro") secao.append(el("p", { textContent: "Os preços desta fonte podem estar velhos. A Jéssica confere no PC." }));
    raiz.append(secao);
  }
  const { total, mercados } = ofertasPorMercado(dados);
  const c = el("section", { className: "cartao" }, el("h3", { textContent: "Ofertas no ar hoje" }),
    el("p", { textContent: total === 1 ? "1 oferta vigente" : `${total} ofertas vigentes` }));
  for (const m of mercados) c.append(el("p", { className: "muted", textContent: `${m.mercado}: ${m.n}` }));
  raiz.append(c);
}
