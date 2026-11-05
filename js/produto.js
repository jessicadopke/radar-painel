// Tela Produto: lógica pura (sem DOM) + montagem da tela. Nenhuma função lança exceção.
import { formatarPreco, formatarLojas, formatarValidade } from "./inicio.js";
import { situacaoDe, textoEstado } from "./hoje.js";
import { precoDaOferta, rotuloComMarca } from "./oferta.js";
import { renderGrafico, tituloGrafico } from "./grafico.js";

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
  // em modo pacote o preço com condição é o do pacote, e o por medida vai entre parênteses
  const pacote = precoDaOferta(o, medida).modo === "pacote";
  const base = pacote
    ? `${formatarPreco(o.preco_condicional)} o pacote${ehNumero(o.preco_cond_medida) ? ` (${formatarPreco(o.preco_cond_medida)}${sufixoMedida(medida)})` : ""} com condição`
    : `${formatarPreco(valor)}${sufixoMedida(medida)} com condição`;
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

const ICONE_OCULTAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/></svg>';
export const textoContagem = (n) => `Esta tela volta para a lista em ${n} s`;

// ---- DOM ----
// deps: { document, ocultos (controle do #187; sem ele a tela não tem o botão de ocultar) }
// Usa ctx.dadosCompletos (com os ocultos) quando existir: um produto oculto ainda abre, com a faixa "Produto oculto".
export function renderProduto(raiz, ctx, deps) {
  const doc = deps.document;
  const el = (tag, props = {}, ...filhos) => {
    const e = doc.createElement(tag);
    Object.assign(e, props);
    e.append(...filhos);
    return e;
  };
  const voltar = el("a", { className: "voltar", href: "#produtos", textContent: "← Produtos" });
  const vazio = (texto, botao) => {
    const c = el("div", { className: "cartao" }, el("p", { textContent: texto }));
    if (botao) c.append(el("div", { className: "acoes" }, botao));
    raiz.append(voltar, c);
  };
  const irHoje = () => el("a", { className: "botao", href: "#produtos", textContent: "Ir para Produtos" });

  if (ctx.estadoDados === "atualize") return vazio("Atualize o app para ver as ofertas.", el("a", { className: "botao", href: "#mais", textContent: "Ir para Mais" }));
  const dados = ctx.dadosCompletos ?? ctx.dados;
  if (ctx.estadoDados !== "ok" || !dados) return vazio("Ainda sem preços. Abra o app com internet uma vez.", irHoje());
  const produto = acharProduto(dados, ctx.rota && ctx.rota.id);
  if (!produto) return vazio("Não achei esse produto na lista de hoje.", irHoje());

  const nome = String(produto.nome ?? "");
  const medida = produto.medida ? String(produto.medida) : "";
  raiz.append(voltar, el("h2", { textContent: nome }));
  const sub = [produto.categoria ? String(produto.categoria) : "", medida ? `preço por ${medida}` : ""].filter(Boolean).join(" · ");
  if (sub) raiz.append(el("p", { className: "muted sub-produto", textContent: sub }));
  const oc = deps.ocultos ?? null;
  const oculto = Boolean(oc && oc.estaOculto(produto.id));
  if (oculto) raiz.append(faixaOculto(oc, produto, el));

  const linhas = ofertasDoProduto(produto);
  if (!linhas.length) {
    raiz.append(cartaoGrafico(produto, medida, dados.parametros, el, doc));
    raiz.append(el("div", { className: "cartao" }, el("p", { textContent: "Sem oferta agora em nenhum mercado." })));
    if (oc && !oculto) raiz.append(botaoOcultar(oc, produto, nome, el));
    return;
  }
  raiz.append(heroi(linhas[0], produto, nome, medida, el));
  raiz.append(cartaoGrafico(produto, medida, dados.parametros, el, doc));
  if (linhas.length > 1) {
    raiz.append(el("h2", { className: "titulo-sec", textContent: "Outros mercados" }));
    const lista = el("div", { className: "cartao tight" });
    linhas.slice(1).forEach((l) => lista.append(linhaMercado(l, linhas[0].oferta, medida, nome, el)));
    raiz.append(lista);
  }
  raiz.append(detalhes(linhas[0].oferta, nome, medida, el, doc));
  if (oc && !oculto) raiz.append(botaoOcultar(oc, produto, nome, el));
}

// Fim da tela: o caminho sem gesto para ocultar.
function botaoOcultar(oc, produto, nome, el) {
  const b = el("button", { type: "button", className: "botao sec botao-ocultar" }, el("span", { className: "ico", ariaHidden: "true", innerHTML: ICONE_OCULTAR }), "Ocultar produto");
  b.addEventListener("click", () => oc.ocultarNaTela(produto.id, nome));
  return el("div", { className: "acoes-produto" }, b,
    el("p", { className: "muted", textContent: "Some das ofertas, dos produtos e da lista deste celular. Dá para voltar a mostrar em Mais." }));
}

// Faixa no alto do produto oculto. Logo depois de ocultar (janela de 8 s) mostra a contagem; aberto por Mais, sem contagem.
function faixaOculto(oc, produto, el) {
  const j = oc.janelaDe(produto.id);
  const frase = "Não aparece nas ofertas, nos produtos nem na lista deste celular." + (j && j.naLista ? " Também saiu da lista." : "");
  const faixa = el("section", { className: "faixa-oculto" },
    el("p", { className: "faixa-titulo" }, el("span", { className: "ico", ariaHidden: "true", innerHTML: ICONE_OCULTAR }), "Produto oculto"),
    el("p", { className: "muted", textContent: frase }));
  const voltar = el("button", { type: "button", className: "botao", textContent: "Voltar a mostrar" });
  voltar.addEventListener("click", () => oc.mostrar(produto.id));
  faixa.append(el("div", { className: "acoes" }, voltar));
  if (j) {
    // aria-hidden e sem aria-live: o leitor de tela não fala a cada segundo
    const contagem = el("p", { className: "contagem-oculto", textContent: textoContagem(j.restante) });
    contagem.setAttribute("aria-hidden", "true");
    faixa.append(contagem);
    oc.aoContar((n) => { contagem.textContent = textoContagem(n); });
  }
  return faixa;
}

export function textoVisto(coletadaEm) {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(coletadaEm ?? ""));
  return m ? `visto ${m[2]}/${m[1]}` : "";
}

// "+33%" em relação ao mais barato; vazio quando não é maior.
export function textoMais(oferta, maisBarato) {
  const a = oferta && oferta.preco_medida, b = maisBarato && maisBarato.preco_medida;
  if (!ehNumero(a) || !ehNumero(b) || b <= 0 || a <= b) return "";
  const pct = Math.round(((a - b) / b) * 100);
  return pct > 0 ? `+${pct}%` : "";
}

function heroi(l, produto, nome, medida, el) {
  const o = l.oferta;
  const validade = formatarValidade(o.validade_fim, hojeLocal());
  const loja = formatarLojas(o.lojas);
  const sub = loja ? `${loja} · ${validade.charAt(0).toLowerCase()}${validade.slice(1)}` : validade;
  const pc = precoDaOferta(o, medida);
  const et = el("span", { className: "preco-et" + (l.situacao === "abaixo" ? " bom" : "") }, formatarPreco(pc.principal));
  if (pc.modo === "pacote") et.append(...marcasDoPacote(pc, el));
  else if (medida && ehNumero(o.preco_medida)) et.append(el("small", { textContent: `por ${medida}` }));
  const meio = el("span", { className: "meio" }, el("span", { className: "merc" }, ...rotuloComMarca(el, o.marca, nome, o.mercado)));
  meio.append(el("span", { className: "muted", textContent: sub }));
  const caixa = el("section", { className: "heroi" }, el("p", { className: "cima", textContent: "Mais barato hoje" }), el("div", { className: "linha" }, meio, et));
  let fim = textoEstado(l.diferenca, l.situacao);
  // o alvo é por medida: em modo pacote a frase diz a medida ("R$ 6,00 / kg")
  if (fim && ehNumero(produto.alvo && produto.alvo.valor)) fim += ` (${formatarPreco(produto.alvo.valor)}${pc.modo === "pacote" ? sufixoMedida(medida) : ""})`;
  if (fim) caixa.append(el("p", { className: "fim", textContent: fim }));
  const cond = textoCondicao(o, medida);
  if (cond) caixa.append(el("p", { className: "muted", textContent: cond }));
  return caixa;
}

// Embalagem (lida como "embalagem de 5 kg") e preço por medida, sob o preço do pacote.
function marcasDoPacote(pc, el) {
  return [
    el("small", { className: "pc-emb" }, el("span", { className: "so-leitor", textContent: "embalagem de " }), pc.embalagem),
    el("small", { className: "pc-ref", textContent: `${formatarPreco(pc.referencia)} por ${pc.medida}` }),
  ];
}

function linhaMercado(l, maisBarato, medida, nome, el) {
  const o = l.oferta;
  const meio = el("span", { className: "meio" }, el("b", {}, ...rotuloComMarca(el, o.marca, nome, o.mercado)));
  const loja = [formatarLojas(o.lojas), textoVisto(o.coletada_em)].filter(Boolean).join(" · ");
  if (loja) meio.append(el("div", { className: "sub", textContent: loja }));
  const cond = textoCondicao(o, medida);
  if (cond) meio.append(el("div", { className: "sub", textContent: cond }));
  const pc = precoDaOferta(o, medida);
  const p = el("span", { className: "p" }, formatarPreco(pc.principal));
  if (pc.modo === "pacote") p.append(...marcasDoPacote(pc, el));
  const mais = textoMais(o, maisBarato);
  if (mais) {
    const m = el("small", { className: "mais", textContent: mais });
    m.setAttribute("aria-label", `${mais.slice(1)} mais caro${medida ? ` por ${medida}` : ""}`);
    p.append(m);
  }
  return el("div", { className: "linha-merc" }, meio, p);
}

function detalhes(o, nome, medida, el, doc) {
  const mercado = String(o.mercado ?? "");
  const corpo = el("div", { className: "corpo" });
  const add = (classe, texto) => { if (texto) corpo.append(el("p", { className: classe, textContent: texto })); };
  if (o.oferta) corpo.append(el("p", { textContent: String(o.oferta) }));
  if (o.marca) corpo.append(el("p", { textContent: String(o.marca) }));
  add("muted", textoEmbalagem(o));
  add("muted", formatarValidade(o.validade_fim, hojeLocal()));
  add("muted", [textoOrigem(o.origem), textoColetada(o.coletada_em)].filter(Boolean).join(" · "));
  const dentro = el("div", { className: "oferta-produto" });
  const caminho = miniaturaSegura(o.miniatura);
  if (caminho) dentro.append(botaoFoto(caminho, nome, mercado, el, doc));
  dentro.append(corpo);
  return el("details", { className: "rec detalhes-folheto" }, el("summary", { textContent: "Detalhes e foto do folheto" }), dentro);
}

function cartaoGrafico(produto, medida, parametros, el, doc) {
  const cartao = el("section", { className: "cartao" }, el("h3", { textContent: tituloGrafico(produto) }));
  try {
    renderGrafico(cartao, produto, parametros, { document: doc });
  } catch {
    cartao.append(el("p", { textContent: "Não consegui desenhar o gráfico" }));
  }
  return cartao;
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
