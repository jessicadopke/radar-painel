// Tela Início: lógica pura (sem DOM) + montagem dos cartões. Nenhuma função lança exceção.

import { cartaoOferta } from "./oferta.js";
import { situacaoDe, textoEstado } from "./hoje.js";

export const CHAVE_VISTO = "radar-visto-ate";
const TIPOS = ["menor_periodo", "preco_bom"];

export function textoTipo(tipo, parametros) {
  if (tipo === "menor_periodo") {
    const n = parametros && Number.isFinite(parametros.janela_dias) ? parametros.janela_dias : 90;
    return `Menor preço em ${n} dias`;
  }
  if (tipo === "preco_bom") return "Preço bom";
  return "Oferta em destaque";
}

export function formatarPreco(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return "R$ " + n.toFixed(2).replace(".", ",");
}

export function formatarValidade(validadeFim, hojeIso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(validadeFim ?? ""));
  if (!m) return "Sem data de validade";
  if (`${m[1]}-${m[2]}-${m[3]}` === hojeIso) return "Vale só hoje";
  return `Vale até ${m[3]}/${m[2]}`;
}

export function formatarLojas(lojas) {
  return Array.isArray(lojas) ? lojas.join(", ") : "";
}

// Alertas prontos para a tela: novos primeiro; em cada grupo, mais recente primeiro; empate por nome.
export function alertasParaInicio(dados, visitaAnterior) {
  if (!dados || !Array.isArray(dados.alertas)) return [];
  const parametros = dados.parametros;
  const lista = [];
  for (const a of dados.alertas) {
    if (!a || typeof a !== "object" || a.tipo === "conferir") continue;
    const usaArquivo = visitaAnterior == null || a.primeira_vez_em == null;
    const novo = usaArquivo ? Boolean(a.novo) : String(a.primeira_vez_em) > String(visitaAnterior);
    lista.push({ ...a, novo, tipoTexto: textoTipo(a.tipo, parametros) });
  }
  const data = (a) => String(a.primeira_vez_em ?? "");
  const nome = (a) => String(a.produto_nome ?? "");
  lista.sort((a, b) =>
    (b.novo - a.novo) ||
    (data(a) < data(b) ? 1 : data(a) > data(b) ? -1 : 0) ||
    (nome(a) < nome(b) ? -1 : nome(a) > nome(b) ? 1 : 0));
  return lista;
}

// ---- visita anterior (localStorage recebido por parâmetro) ----
export function lerVisitaAnterior(storage) {
  try {
    const v = storage.getItem(CHAVE_VISTO);
    return v ? v : null;
  } catch {
    return null;
  }
}

export function gravarVisita(storage, geradoEm) {
  try {
    if (geradoEm) storage.setItem(CHAVE_VISTO, String(geradoEm));
  } catch {}
}

// ---- textos do cabeçalho ----
export function tituloLista(total, novos, primeiraAbertura) {
  const linhas = [total === 1 ? "1 alerta valendo" : `${total} alertas valendo`];
  if (novos > 0) linhas.push(primeiraAbertura ? `${novos} ${novos === 1 ? "novo" : "novos"}` : `${novos} ${novos === 1 ? "novo" : "novos"} desde a sua última visita`);
  return linhas;
}

// ---- DOM ----
// deps: { document, visitaAnterior, hojeIso, linkProduto (bool) }
export function renderInicio(raiz, ctx, deps) {
  const doc = deps.document;
  const el = (tag, props = {}, ...filhos) => {
    const e = doc.createElement(tag);
    Object.assign(e, props);
    e.append(...filhos);
    return e;
  };
  const vazio = (texto, botao) => {
    const c = el("div", { className: "cartao" }, el("p", { textContent: texto }));
    if (botao) {
      const b = el("a", { className: "botao", href: botao.href, textContent: botao.texto });
      c.append(el("div", { className: "acoes" }, b));
    }
    raiz.append(el("h2", { className: "so-leitor", textContent: "Início" }), c);
  };

  if (ctx.estadoDados === "atualize") return vazio("Atualize o app para ver os alertas.", { href: "#sobre", texto: "Ir para Sobre" });
  if (ctx.estadoDados !== "ok" || !ctx.dados) return vazio("Ainda sem preços. Abra o app com internet uma vez.");
  const alertas = alertasParaInicio(ctx.dados, deps.visitaAnterior);
  if (!alertas.length) return vazio("Nenhum alerta agora. Veja as ofertas de hoje na aba Hoje.", { href: "#hoje", texto: "Ver Hoje" });

  const novos = alertas.filter((a) => a.novo);
  const antigos = alertas.filter((a) => !a.novo);
  const [titulo, ...resto] = tituloLista(alertas.length, novos.length, deps.visitaAnterior == null);
  raiz.append(el("h2", { textContent: titulo }));
  for (const t of resto) raiz.append(el("p", { className: "muted", textContent: t }));
  const medidas = new Map((Array.isArray(ctx.dados.produtos) ? ctx.dados.produtos : []).map((p) => [p && p.id, p && p.medida]));
  novos.forEach((a) => raiz.append(cartao(a, medidas, deps, el)));
  if (novos.length && antigos.length) raiz.append(el("h3", { className: "subtitulo", textContent: "Já vistos" }));
  antigos.forEach((a) => raiz.append(cartao(a, medidas, deps, el)));
}

function cartao(a, medidas, deps, el) {
  const alvo = typeof a.alvo === "number" ? { valor: a.alvo } : null;
  const { situacao, diferenca } = situacaoDe({ preco_medida: a.preco_medida }, alvo);
  return cartaoOferta(el, {
    id: a.produto_id, nome: a.produto_nome, mercado: a.mercado, lojas: a.lojas, preco: a.preco_medida,
    medida: medidas.get(a.produto_id), situacao, texto: textoEstado(diferenca, situacao), novo: a.novo, link: deps.linkProduto,
  });
}
