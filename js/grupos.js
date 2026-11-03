// Grupos que abrem e fecham (Ofertas e Produtos): lógica pura (sem DOM) + desenho dos grupos.
// Nenhuma função lança exceção. Hoje, alertas e armazenamento chegam por parâmetro (nunca Date nem globais).
import { situacaoDe, listaHoje, normalizar } from "./hoje.js";
import { ofertaDoAlerta, RELOGIO } from "./oferta.js";

export const CHAVE_GRUPOS = "radar.grupos";
export const NOME_VENCEM_HOJE = "Vencem hoje";
const NOME_OUTROS = "Outros";
const MODOS = ["merc", "cat", "boas"];
const TIPOS_BONS = ["preco_bom", "menor_periodo"];

const ehNumero = (n) => typeof n === "number" && Number.isFinite(n);
const listaDe = (x) => (Array.isArray(x) ? x : []);
const objeto = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const produtosDe = (dados) => (objeto(dados) ? listaDe(dados.produtos) : []).filter(objeto);
const compara = (a, b) => normalizar(a).localeCompare(normalizar(b), "pt-BR");

// ---- regras de uma oferta ----

// validade_fim começa com a data de hoje (AAAA-MM-DD). Nulo, inválido ou outra data nunca vence hoje.
export function ehVenceHoje(oferta, hoje) {
  if (!objeto(oferta) || typeof hoje !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(hoje)) return false;
  const m = /^(\d{4}-(\d{2})-(\d{2}))/.exec(String(oferta.validade_fim ?? ""));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12 || Number(m[3]) < 1 || Number(m[3]) > 31) return false;
  return m[1] === hoje;
}

// Conjunto das ofertas que originaram um alerta de preço bom ou menor do período.
export function ofertasComAlerta(dados, alertas) {
  const achadas = new Set();
  const lista = alertas === undefined ? (objeto(dados) ? dados.alertas : []) : alertas;
  for (const a of listaDe(lista)) {
    if (!objeto(a) || !TIPOS_BONS.includes(a.tipo)) continue;
    const o = ofertaDoAlerta(dados, a);
    if (o) achadas.add(o);
  }
  return achadas;
}

// Boa = preço por medida abaixo do alvo ou com alerta. Só o preço sem condição conta.
export function ehBoa(oferta, produto, comAlerta) {
  if (!objeto(oferta) || !ehNumero(oferta.preco_medida)) return false;
  if (comAlerta instanceof Set && comAlerta.has(oferta)) return true;
  return situacaoDe(oferta, objeto(produto) ? produto.alvo : null).situacao === "abaixo";
}

const temPreco = (o) => objeto(o) && (ehNumero(o.preco_medida) || ehNumero(o.preco_condicional));

function descontoPct(oferta, produto) {
  const { situacao, diferenca } = situacaoDe(oferta, objeto(produto) ? produto.alvo : null);
  return situacao === "abaixo" && diferenca ? Math.abs(diferenca.pct) : 0;
}

// ---- agrupamento ----

const palavrasDe = (busca) => normalizar(busca).split(/\s+/).filter(Boolean);

function ordemItens(a, b) {
  return (b.venceHoje - a.venceHoje) || (b.boa - a.boa) || (b.desconto - a.desconto) ||
    compara(a.produto.nome ?? "", b.produto.nome ?? "") || compara(a.oferta.mercado ?? "", b.oferta.mercado ?? "") ||
    String(a.produto.id ?? "").localeCompare(String(b.produto.id ?? "")) || (a.indice - b.indice);
}

// Cada oferta vigentes como itens { chave, produto, oferta, indice, mercado, categoria, boa, venceHoje, desconto }.
export function itensDeOfertas(dados, { hoje, alertas } = {}) {
  const comAlerta = ofertasComAlerta(dados, alertas);
  const itens = [];
  for (const produto of produtosDe(dados)) {
    listaDe(produto.ofertas).forEach((oferta, indice) => {
      if (!temPreco(oferta)) return;
      const boa = ehBoa(oferta, produto, comAlerta);
      itens.push({
        chave: `${produto.id}#${indice}`, produto, oferta, indice,
        mercado: typeof oferta.mercado === "string" && oferta.mercado ? oferta.mercado : NOME_OUTROS,
        categoria: typeof produto.categoria === "string" && produto.categoria ? produto.categoria : NOME_OUTROS,
        boa, venceHoje: ehVenceHoje(oferta, hoje), desconto: boa ? descontoPct(oferta, produto) : 0,
      });
    });
  }
  return itens;
}

export function slug(texto) {
  return normalizar(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "grupo";
}

function montar(porNome, ordenar) {
  const nomes = [...porNome.keys()].sort((a, b) => (a === NOME_OUTROS) - (b === NOME_OUTROS) || compara(a, b));
  return nomes.map((nome) => ({ chave: slug(nome), nome, vence: false, itens: ordenar(porNome.get(nome)) }));
}

function juntar(porNome, nome, item) {
  if (!porNome.has(nome)) porNome.set(nome, []);
  porNome.get(nome).push(item);
}

// { grupos: [{ chave, nome, vence, itens }], total, plano }. modo: "merc" | "cat" | "boas" ("boas" = lista única).
// "Vencem hoje" vem primeiro (só se houver) e a oferta também fica no grupo normal; total conta ofertas distintas.
export function agruparOfertas(dados, { modo = "merc", busca = "", hoje, alertas } = {}) {
  const palavras = palavrasDe(busca);
  let itens = itensDeOfertas(dados, { hoje, alertas });
  if (palavras.length) {
    itens = itens.filter((i) => {
      const alvo = normalizar([i.produto.nome, i.oferta.marca ?? i.produto.marca, i.oferta.mercado, i.produto.categoria].filter((x) => x != null).join(" "));
      return palavras.every((w) => alvo.includes(w));
    });
  }
  const ordenar = (lista) => [...lista].sort(ordemItens);
  if (modo === "boas") {
    const boas = itens.filter((i) => i.boa);
    return { grupos: [{ chave: "boas", nome: "Ofertas boas hoje", vence: false, itens: ordenar(boas) }], total: boas.length, plano: true };
  }
  const porNome = new Map();
  for (const i of itens) juntar(porNome, modo === "cat" ? i.categoria : i.mercado, i);
  const grupos = montar(porNome, ordenar);
  const vencem = itens.filter((i) => i.venceHoje);
  if (vencem.length) grupos.unshift({ chave: slug(NOME_VENCEM_HOJE), nome: NOME_VENCEM_HOJE, vence: true, itens: ordenar(vencem) });
  return { grupos, total: itens.length, plano: false };
}

// Produtos por categoria (um produto em um só grupo). Cada item é o de listaHoje() mais boa e venceHoje.
export function agruparProdutos(dados, { busca = "", mercado = "", hoje, alertas } = {}) {
  const comAlerta = ofertasComAlerta(dados, alertas);
  const porNome = new Map();
  const produtos = new Map(produtosDe(dados).map((p) => [p.id, p]));
  let total = 0;
  for (const i of listaHoje(dados, { busca, mercado })) {
    const boa = ehBoa(i.oferta, produtos.get(i.id), comAlerta);
    juntar(porNome, typeof i.categoria === "string" && i.categoria ? i.categoria : NOME_OUTROS,
      { ...i, boa, venceHoje: ehVenceHoje(i.oferta, hoje) });
    total += 1;
  }
  // a ordem de listaHoje() dentro do grupo é mantida
  return { grupos: montar(porNome, (l) => l), total, plano: false };
}

// ---- abertura ----

const algoBom = (g) => g.vence || g.itens.some((i) => i.boa || i.venceHoje);

// Mapa nome -> aberto. Com busca: tudo aberto. Senão o lembrado vence o padrão; se o padrão
// deixaria todos fechados, todos abrem.
export function abertoInicial(grupos, lembrado, busca = false) {
  const lista = listaDe(grupos);
  const mapa = new Map();
  if (busca) { lista.forEach((g) => mapa.set(g.nome, true)); return mapa; }
  const memo = objeto(lembrado) ? lembrado : {};
  const padrao = lista.some(algoBom) ? algoBom : () => true;
  for (const g of lista) mapa.set(g.nome, typeof memo[g.nome] === "boolean" ? memo[g.nome] : padrao(g));
  return mapa;
}

// Texto do link: a próxima ação ("Recolher tudo" se todos os grupos visíveis estão abertos).
export function textoAcaoTudo(abertos) {
  const v = listaDe(abertos);
  return v.length && v.every(Boolean) ? "Recolher tudo" : "Expandir tudo";
}

// ---- estado lembrado (storage recebido por parâmetro) ----

function mapaBooleano(x) {
  const r = {};
  if (objeto(x)) for (const [k, v] of Object.entries(x)) if (typeof v === "boolean") r[k] = v;
  return r;
}

export function lerEstado(storage) {
  const vazio = { "ofertas.merc": {}, "ofertas.cat": {}, "produtos.cat": {}, "ofertas.modo": null };
  try {
    const bruto = JSON.parse(storage.getItem(CHAVE_GRUPOS));
    if (!objeto(bruto)) return vazio;
    return {
      "ofertas.merc": mapaBooleano(bruto["ofertas.merc"]), "ofertas.cat": mapaBooleano(bruto["ofertas.cat"]),
      "produtos.cat": mapaBooleano(bruto["produtos.cat"]),
      "ofertas.modo": MODOS.includes(bruto["ofertas.modo"]) ? bruto["ofertas.modo"] : null,
    };
  } catch {
    return vazio;
  }
}

// Grava só o que a pessoa mudou à mão: { escopo: { nome: aberto } } ou o modo.
export function gravarEstado(storage, mudanca) {
  try {
    const estado = lerEstado(storage);
    const m = objeto(mudanca) ? mudanca : {};
    for (const escopo of ["ofertas.merc", "ofertas.cat", "produtos.cat"]) {
      if (objeto(m[escopo])) estado[escopo] = { ...estado[escopo], ...mapaBooleano(m[escopo]) };
    }
    if (MODOS.includes(m["ofertas.modo"])) estado["ofertas.modo"] = m["ofertas.modo"];
    const saida = {};
    for (const [k, v] of Object.entries(estado)) if (typeof v === "string" || (objeto(v) && Object.keys(v).length)) saida[k] = v;
    storage.setItem(CHAVE_GRUPOS, JSON.stringify(saida));
  } catch {}
}

// ---- DOM ----
const SETA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

// deps: { document, tela ("ofertas"|"produtos"), modo ("merc"|"cat"), storage (opcional), busca (bool, estado temporário),
//         resumo (nós do resumo; opcional), semLink (bool), cartao(item, el) -> nó }
// Abrir/fechar muda o DOM no lugar (sem redesenhar). Devolve { grupos, link } para quem precisar.
export function desenharGrupos(raiz, grupos, deps) {
  const doc = deps.document;
  const el = (tag, props = {}, ...filhos) => {
    const e = doc.createElement(tag);
    Object.assign(e, props);
    e.append(...filhos);
    return e;
  };
  const lista = listaDe(grupos);
  const escopo = `${deps.tela}.${deps.modo}`;
  const busca = Boolean(deps.busca);
  const lembrado = deps.storage ? lerEstado(deps.storage)[escopo] : {};
  const abertos = abertoInicial(lista, lembrado, busca);
  const vistos = new Set();
  const partes = lista.map((g) => {
    let id = `g-${deps.tela}-${deps.modo}-${g.chave}`;
    for (let n = 2; vistos.has(id); n += 1) id = `g-${deps.tela}-${deps.modo}-${g.chave}-${n}`;
    vistos.add(id);
    const nome = el("span", { className: "nome-grupo" }, g.nome);
    nome.append(el("span", { className: "contagem-ofertas", textContent: String(g.itens.length) }));
    const btn = el("button", { type: "button", className: "grupo-btn" });
    if (g.vence) btn.append(el("span", { className: "ico", ariaHidden: "true", innerHTML: RELOGIO }));
    btn.append(nome, el("span", { className: "seta", ariaHidden: "true", innerHTML: SETA }));
    btn.setAttribute("aria-controls", id);
    const painel = el("div", { className: "grupo-painel", id });
    painel.setAttribute("role", "region");
    painel.setAttribute("aria-label", g.nome);
    g.itens.forEach((i) => painel.append(deps.cartao(i, el)));
    const secao = el("section", { className: "grupo" }, el("h2", { className: "grupo-h" }, btn), painel);
    return { g, btn, painel, secao };
  });

  const aplicar = (p, aberto) => {
    p.btn.setAttribute("aria-expanded", aberto ? "true" : "false");
    p.painel.hidden = !aberto;
    abertos.set(p.g.nome, aberto);
  };
  partes.forEach((p) => aplicar(p, abertos.get(p.g.nome)));

  let link = null;
  const atualizarLink = () => { if (link) link.textContent = textoAcaoTudo(partes.map((p) => abertos.get(p.g.nome))); };
  const gravar = (mapa) => { if (!busca && deps.storage) gravarEstado(deps.storage, { [escopo]: mapa }); };
  partes.forEach((p) => p.btn.addEventListener("click", () => {
    const aberto = !abertos.get(p.g.nome);
    aplicar(p, aberto);
    gravar({ [p.g.nome]: aberto });
    atualizarLink();
  }));

  if (!deps.semLink && !busca && partes.length > 1) {
    link = el("button", { type: "button", className: "link" });
    link.addEventListener("click", () => {
      const abrir = textoAcaoTudo(partes.map((p) => abertos.get(p.g.nome))) === "Expandir tudo";
      const mapa = {};
      partes.forEach((p) => { aplicar(p, abrir); mapa[p.g.nome] = abrir; });
      gravar(mapa);
      atualizarLink();
    });
    atualizarLink();
  }
  if (deps.resumo || link) {
    const resumo = el("p", { className: "linha-resumo" }, ...listaDe(deps.resumo));
    resumo.setAttribute("role", "status");
    raiz.append(el("div", { className: "barra-grupos" }, resumo, ...(link ? [link] : [])));
  }
  partes.forEach((p) => raiz.append(p.secao));
  return { grupos: partes.map((p) => p.secao), link };
}
