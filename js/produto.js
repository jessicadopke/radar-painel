// Tela Produto: lógica pura (sem DOM) + montagem da tela. Nenhuma função lança exceção.
import { formatarPreco, formatarLojas, formatarValidade } from "./inicio.js";
import { situacaoDe, textoDiferenca } from "./hoje.js";
import { renderGrafico } from "./grafico.js";

const ehNumero = (n) => typeof n === "number" && Number.isFinite(n);

export function acharProduto(dados, id) {
  if (!dados || typeof dados !== "object" || !Array.isArray(dados.produtos)) return null;
  if (id == null || id === "") return null;
  return dados.produtos.find((p) => p && typeof p === "object" && String(p.id) === String(id)) ?? null;
}

export function ofertasDoProduto(produto) {
  if (!produto || typeof produto !== "object" || !Array.isArray(produto.ofertas)) return [];
  return produto.ofertas.filter((o) => o && typeof o === "object").map((oferta, i) => {
    const { situacao, diferenca } = situacaoDe(oferta, produto.alvo);
    return { oferta, diferenca, situacao, maisBarato: i === 0 };
  });
}

export function textoAlvo(alvo, parametros) {
  const par = parametros && typeof parametros === "object" ? parametros : {};
  const a = alvo && typeof alvo === "object" ? alvo : {};
  if (ehNumero(a.valor) && a.suficiente !== false) {
    const dias = ehNumero(par.janela_dias) ? par.janela_dias : 90;
    return `Alvo: ${formatarPreco(a.valor)} (preço típico bom dos últimos ${dias} dias)`;
  }
  if (ehNumero(a.dias) && ehNumero(par.minimo_dias)) {
    const faltam = Math.max(1, par.minimo_dias - a.dias);
    return `Alvo ainda em cálculo (faltam ${faltam} ${faltam === 1 ? "dia" : "dias"} de histórico)`;
  }
  return "Alvo ainda em cálculo";
}

const sufixoMedida = (medida) => (medida ? ` / ${medida}` : "");

export function textoLinhaPreco(oferta, medida) {
  const o = oferta && typeof oferta === "object" ? oferta : {};
  return formatarPreco(o.preco_medida) + (ehNumero(o.preco_medida) ? sufixoMedida(medida) : "");
}

export function textoEmbalagem(oferta) {
  const o = oferta && typeof oferta === "object" ? oferta : {};
  if (ehNumero(o.preco) && ehNumero(o.quantidade) && o.unidade) return `${formatarPreco(o.preco)} · ${o.quantidade} ${o.unidade}`;
  return "";
}

export function textoCondicao(oferta, medida) {
  const o = oferta && typeof oferta === "object" ? oferta : {};
  if (!ehNumero(o.preco_condicional)) return "";
  const valor = ehNumero(o.preco_cond_medida) ? o.preco_cond_medida : o.preco_condicional;
  const base = `${formatarPreco(valor)}${sufixoMedida(medida)} com condição`;
  return o.condicao ? `${base} · ${String(o.condicao)}` : base;
}

const ORIGENS = { folheto: "Folheto", feed: "Instagram (feed)", story: "Instagram (story)" };
export function textoOrigem(origem) {
  return typeof origem === "string" && Object.hasOwn(ORIGENS, origem) ? ORIGENS[origem] : "Outra fonte";
}

export function textoColetada(coletadaEm) {
  const m = /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(coletadaEm ?? ""));
  return m ? `Visto em ${m[2]}/${m[1]} às ${m[3]}:${m[4]}` : "";
}

// Só caminho relativo da pasta de miniaturas; qualquer outra coisa vira "sem miniatura".
export function miniaturaSegura(valor) {
  if (typeof valor !== "string") return null;
  if (!/^miniaturas\/[\w.-]+\.jpg$/.test(valor) || valor.includes("..")) return null;
  return valor;
}

// ---- DOM ----
// deps: { document }
export function renderProduto(raiz, ctx, deps) {
  const doc = deps.document;
  const el = (tag, props = {}, ...filhos) => {
    const e = doc.createElement(tag);
    Object.assign(e, props);
    e.append(...filhos);
    return e;
  };
  const voltar = el("a", { className: "voltar", href: "#hoje", textContent: "← Voltar" });
  const vazio = (texto, botao) => {
    const c = el("div", { className: "cartao" }, el("p", { textContent: texto }));
    if (botao) c.append(el("div", { className: "acoes" }, botao));
    raiz.append(voltar, c);
  };
  const irHoje = () => el("a", { className: "botao", href: "#hoje", textContent: "Ir para Hoje" });

  if (ctx.estadoDados === "atualize") return vazio("Atualize o app para ver as ofertas.", el("a", { className: "botao", href: "#sobre", textContent: "Ir para Sobre" }));
  if (ctx.estadoDados !== "ok" || !ctx.dados) return vazio("Ainda sem dados. Abra o app com internet uma vez.", irHoje());
  const produto = acharProduto(ctx.dados, ctx.rota && ctx.rota.id);
  if (!produto) return vazio("Não achei esse produto na lista de hoje.", irHoje());

  const nome = String(produto.nome ?? "");
  const medida = produto.medida ? String(produto.medida) : "";
  raiz.append(voltar, el("h2", { textContent: nome }));
  if (produto.categoria) raiz.append(el("p", { className: "muted", textContent: String(produto.categoria) }));
  if (medida) raiz.append(el("p", { className: "muted", textContent: `Preço por ${medida}` }));
  raiz.append(el("div", { className: "cartao" }, el("p", { textContent: textoAlvo(produto.alvo, ctx.dados.parametros) })));

  raiz.append(cartaoGrafico(produto, medida, ctx.dados.parametros, el, doc));

  const linhas = ofertasDoProduto(produto);
  if (!linhas.length) {
    raiz.append(el("div", { className: "cartao" }, el("p", { textContent: "Sem oferta agora em nenhum mercado." })));
    return;
  }
  linhas.forEach((l, n) => raiz.append(cartaoOferta(l, n, nome, medida, el, doc)));
}

function cartaoGrafico(produto, medida, parametros, el, doc) {
  const cartao = el("section", { className: "cartao" }, el("h3", { textContent: "Preço nos últimos 90 dias" }));
  try {
    renderGrafico(cartao, produto, parametros, { document: doc });
  } catch {
    cartao.append(el("p", { textContent: "Não consegui desenhar o gráfico" }));
  }
  return cartao;
}

function cartaoOferta(l, n, nomeProduto, medida, el, doc) {
  const o = l.oferta;
  const mercado = String(o.mercado ?? "");
  const idTitulo = `oferta-${n}`;
  const titulo = el("h3", { id: idTitulo, textContent: mercado });
  const cab = el("div", { className: "cab-oferta" }, titulo);
  if (l.maisBarato) cab.append(el("span", { className: "selo-barato", textContent: "Mais barato" }));
  const corpo = el("div", { className: "corpo" }, cab);
  const add = (classe, texto) => { if (texto) corpo.append(el("p", { className: classe, textContent: texto })); };

  add("muted", formatarLojas(o.lojas));
  corpo.append(el("p", { className: "preco", textContent: textoLinhaPreco(o, medida) }));
  if (o.oferta) corpo.append(el("p", { textContent: String(o.oferta) }));
  if (o.marca) corpo.append(el("p", { textContent: String(o.marca) }));
  add("muted", textoEmbalagem(o));
  add("muted", textoCondicao(o, medida));
  const selo = l.situacao === "abaixo" ? "Abaixo do alvo" : l.situacao === "no-alvo" ? "No alvo" : "";
  const linha = el("p", { className: "diferenca" });
  if (selo) linha.append(el("span", { className: "selo-alvo", textContent: selo }), " ");
  linha.append(textoDiferenca(l.diferenca, l.situacao));
  corpo.append(linha);
  add("muted", formatarValidade(o.validade_fim, hojeLocal()));
  add("muted", [textoOrigem(o.origem), textoColetada(o.coletada_em)].filter(Boolean).join(" · "));

  const secao = el("section", { className: "cartao oferta-produto" });
  secao.setAttribute("aria-labelledby", idTitulo);
  const caminho = miniaturaSegura(o.miniatura);
  if (caminho) secao.append(botaoFoto(caminho, nomeProduto, mercado, el, doc));
  secao.append(corpo);
  return secao;
}

function hojeLocal() {
  const d = new Date();
  const dois = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

function botaoFoto(caminho, produto, mercado, el, doc) {
  const img = el("img", { src: caminho, loading: "lazy", width: 72, height: 72, alt: `Foto da oferta de ${produto} no ${mercado}` });
  const botao = el("button", { type: "button", className: "miniatura-botao" }, img);
  botao.setAttribute("aria-label", "Ampliar foto da oferta");
  img.onerror = () => botao.remove();
  botao.addEventListener("click", () => ampliar(caminho, produto, mercado, botao, el, doc));
  return botao;
}

function ampliar(caminho, produto, mercado, botao, el, doc) {
  const nativo = typeof HTMLDialogElement !== "undefined";
  const grande = el("img", { src: caminho, alt: `Foto da oferta de ${produto} no ${mercado}` });
  grande.onerror = () => grande.remove();
  const fechar = el("button", { type: "button", className: "botao", textContent: "Fechar" });
  fechar.setAttribute("aria-label", "Fechar foto");
  const legenda = el("p", { className: "legenda-foto", textContent: `${mercado} · ${produto}` });
  const caixa = el(nativo ? "dialog" : "div", { className: "foto-grande" }, grande, legenda, fechar);
  if (!nativo) { caixa.setAttribute("role", "dialog"); caixa.setAttribute("aria-modal", "true"); caixa.classList.add("aberta"); }
  const fecharTudo = () => {
    if (nativo && caixa.open) caixa.close();
    caixa.remove();
    if (botao.isConnected) botao.focus();
  };
  fechar.addEventListener("click", fecharTudo);
  caixa.addEventListener("click", (e) => { if (e.target !== grande && e.target !== fechar) fecharTudo(); });
  if (nativo) caixa.addEventListener("close", () => { caixa.remove(); if (botao.isConnected) botao.focus(); });
  doc.body.append(caixa);
  if (nativo && typeof caixa.showModal === "function") caixa.showModal();
  else caixa.setAttribute("open", "");
  fechar.focus();
}
