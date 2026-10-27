// Tela Lista de compras: lógica pura (sem DOM) + montagem da tela. Nenhuma função lança exceção.
// A lista fica só no aparelho (localStorage); a única coisa que sai é a foto da lista por foto, enviada ao Google só para ser lida (rede em foto.js).
import { normalizar } from "./hoje.js";
import { formatarPreco, formatarLojas } from "./inicio.js";
import { renderListaFoto } from "./lista_foto.js";

export const CHAVE_LISTA = "radar.lista";
const MAX_QTD = 99;
const MAX_EXTRAS = 60;
const MAX_TEXTO = 80;

const ehNumero = (n) => typeof n === "number" && Number.isFinite(n);
const listaDe = (x) => (Array.isArray(x) ? x : []);
const produtosDe = (dados) => (dados && typeof dados === "object" ? listaDe(dados.produtos) : []).filter((p) => p && typeof p === "object");
const comparaTexto = (a, b) => normalizar(a).localeCompare(normalizar(b), "pt-BR");
const centavos = (reais) => Math.round(reais * 100);

export const listaVazia = () => ({ versao: 1, itens: [], extras: [] });

function limitarQtd(q) {
  const n = Math.trunc(Number(q));
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_QTD, Math.max(1, n));
}

// Itens lidos da foto que não estão no catálogo: [{texto, qtd}], sem repetidos por texto normalizado.
function sanearExtras(brutos) {
  const vistos = new Set();
  const extras = [];
  for (const x of listaDe(brutos)) {
    if (!x || typeof x.texto !== "string") continue;
    const texto = x.texto.trim().slice(0, MAX_TEXTO).trim();
    const chave = normalizar(texto);
    if (!texto || vistos.has(chave)) continue;
    vistos.add(chave);
    extras.push({ texto, qtd: limitarQtd(x.qtd) });
    if (extras.length >= MAX_EXTRAS) break;
  }
  return extras;
}

// ---- guardar e ler (storage recebido por parâmetro) ----
export function lerLista(storage) {
  try {
    const bruto = JSON.parse(storage.getItem(CHAVE_LISTA));
    if (!bruto || typeof bruto !== "object" || !Array.isArray(bruto.itens)) return listaVazia();
    const vistos = new Set();
    const itens = [];
    for (const i of bruto.itens) {
      if (!i || typeof i.id !== "string" || !i.id || vistos.has(i.id)) continue;
      vistos.add(i.id);
      itens.push({ id: i.id, qtd: limitarQtd(i.qtd), pego: i.pego === true });
    }
    return { versao: 1, itens, extras: sanearExtras(bruto.extras) };
  } catch {
    return listaVazia();
  }
}

export function gravarLista(storage, lista) {
  try {
    const extras = listaDe(lista && lista.extras);
    const corpo = { versao: 1, itens: listaDe(lista && lista.itens) };
    if (extras.length) corpo.extras = extras;
    storage.setItem(CHAVE_LISTA, JSON.stringify(corpo));
    return true;
  } catch {
    return false;
  }
}

// ---- edição (devolvem lista nova) ----
const itensDe = (lista) => listaDe(lista && lista.itens);
const extrasDe = (lista) => listaDe(lista && lista.extras);
const nova = (lista, itens) => ({ versao: 1, itens, extras: extrasDe(lista) });

export function adicionar(lista, id) {
  const itens = itensDe(lista);
  if (typeof id !== "string" || !id || itens.some((i) => i.id === id)) return nova(lista, itens);
  return nova(lista, [...itens, { id, qtd: 1, pego: false }]);
}

export function remover(lista, id) {
  return nova(lista, itensDe(lista).filter((i) => i.id !== id));
}

export function alterarQuantidade(lista, id, qtd) {
  return nova(lista, itensDe(lista).map((i) => (i.id === id ? { ...i, qtd: limitarQtd(qtd) } : i)));
}

export function alternarPego(lista, id) {
  return nova(lista, itensDe(lista).map((i) => (i.id === id ? { ...i, pego: !i.pego } : i)));
}

// ---- itens fora do catálogo (extras) ----
export function adicionarExtra(lista, texto, qtd = 1) {
  const atuais = extrasDe(lista);
  const novo = sanearExtras([{ texto, qtd }])[0];
  if (!novo) return { versao: 1, itens: itensDe(lista), extras: atuais };
  const chave = normalizar(novo.texto);
  // texto repetido: soma a quantidade ao que já existe
  if (atuais.some((x) => normalizar(x.texto) === chave)) {
    return { versao: 1, itens: itensDe(lista), extras: atuais.map((x) => (normalizar(x.texto) === chave ? { ...x, qtd: limitarQtd(x.qtd + novo.qtd) } : x)) };
  }
  return { versao: 1, itens: itensDe(lista), extras: sanearExtras([...atuais, novo]) };
}

export function removerExtra(lista, texto) {
  const chave = normalizar(texto);
  return { versao: 1, itens: itensDe(lista), extras: extrasDe(lista).filter((x) => normalizar(x.texto) !== chave) };
}

export function alterarQuantidadeExtra(lista, texto, qtd) {
  const chave = normalizar(texto);
  return { versao: 1, itens: itensDe(lista), extras: extrasDe(lista).map((x) => (normalizar(x.texto) === chave ? { ...x, qtd: limitarQtd(qtd) } : x)) };
}

export function limpar() {
  return listaVazia();
}

// ---- ofertas ----
function compara(a, b) {
  const pa = ehNumero(a.preco_medida) ? a.preco_medida : Infinity;
  const pb = ehNumero(b.preco_medida) ? b.preco_medida : Infinity;
  if (pa !== pb) return pa < pb ? -1 : 1;
  const ea = ehNumero(a.preco) ? a.preco : Infinity;
  const eb = ehNumero(b.preco) ? b.preco : Infinity;
  if (ea !== eb) return ea < eb ? -1 : 1;
  return comparaTexto(a.mercado ?? "", b.mercado ?? "");
}

const ofertasValidas = (produto) =>
  listaDe(produto && produto.ofertas).filter((o) => o && typeof o === "object" && ehNumero(o.preco));

// Oferta de menor preço da medida (empate: menor preço da embalagem, depois nome do mercado).
export function melhorOferta(produto) {
  const o = ofertasValidas(produto);
  return o.length ? [...o].sort(compara)[0] : null;
}

function ofertaNoMercado(produto, mercado) {
  const o = ofertasValidas(produto).filter((x) => x.mercado === mercado);
  return o.length ? [...o].sort(compara)[0] : null;
}

// Itens ainda por pegar, com produto e melhor oferta. Os sem oferta ficam fora de "ativos".
function resolver(dados, lista) {
  const porId = new Map(produtosDe(dados).map((p) => [p.id, p]));
  return itensDe(lista).map((i) => {
    const produto = porId.get(i.id) ?? null;
    return { id: i.id, qtd: i.qtd, pego: i.pego, produto, nome: produto ? String(produto.nome ?? "") : null, oferta: produto ? melhorOferta(produto) : null };
  });
}

export function itensDaLista(dados, lista) {
  return resolver(dados, lista);
}

export function semOferta(dados, lista) {
  return resolver(dados, lista).filter((i) => !i.oferta);
}

const ativos = (dados, lista) => resolver(dados, lista).filter((i) => i.oferta && !i.pego);

// Agrupa os itens pelo melhor mercado. Valores em centavos inteiros.
export function planoDeCompra(dados, lista) {
  const grupos = new Map();
  for (const i of ativos(dados, lista)) {
    const mercado = String(i.oferta.mercado ?? "");
    const subtotal = centavos(i.oferta.preco) * i.qtd;
    if (!grupos.has(mercado)) grupos.set(mercado, { mercado, itens: [], subtotalCent: 0 });
    const g = grupos.get(mercado);
    g.itens.push({ id: i.id, nome: i.nome, qtd: i.qtd, oferta: i.oferta, subtotalCent: subtotal });
    g.subtotalCent += subtotal;
  }
  const lista2 = [...grupos.values()].sort((a, b) => comparaTexto(a.mercado, b.mercado));
  return { grupos: lista2, totalCent: lista2.reduce((s, g) => s + g.subtotalCent, 0) };
}

// Total se comprar tudo em cada mercado; itens que o mercado não tem ficam de fora ("faltam").
export function totaisPorMercado(dados, lista) {
  const itens = ativos(dados, lista);
  const mercados = [...new Set(itens.flatMap((i) => ofertasValidas(i.produto).map((o) => o.mercado)).filter((m) => typeof m === "string" && m))];
  const linhas = mercados.map((mercado) => {
    let totalCent = 0;
    let cobertos = 0;
    for (const i of itens) {
      const o = ofertaNoMercado(i.produto, mercado);
      if (!o) continue;
      cobertos += 1;
      totalCent += centavos(o.preco) * i.qtd;
    }
    return { mercado, totalCent, cobertos, faltam: itens.length - cobertos };
  });
  linhas.sort((a, b) => (b.cobertos - a.cobertos) || (a.totalCent - b.totalCent) || comparaTexto(a.mercado, b.mercado));
  return linhas;
}

// ---- busca para adicionar ----
export function buscarProdutos(dados, texto, limite = 8) {
  const palavras = normalizar(texto).split(/\s+/).filter(Boolean);
  if (!palavras.length) return [];
  return produtosDe(dados)
    .filter((p) => typeof p.id === "string" && p.id && palavras.every((w) => normalizar(p.nome).includes(w)))
    .sort((a, b) => comparaTexto(a.nome ?? "", b.nome ?? ""))
    .slice(0, limite);
}

// ---- textos ----
export const centavosParaTexto = (c) => formatarPreco(c / 100);

export function textoFaltam(n) {
  return n === 1 ? "falta 1 item" : `faltam ${n} itens`;
}

// ---- DOM ----
// deps: { document, storage (pode ser null) }
export function renderLista(raiz, ctx, deps) {
  const doc = deps.document;
  const storage = deps.storage;
  const el = (tag, props = {}, ...filhos) => {
    const e = doc.createElement(tag);
    Object.assign(e, props);
    e.append(...filhos);
    return e;
  };
  const titulo = el("h2", { textContent: "Lista de compras", tabIndex: -1 });
  const $foto = el("div", { className: "foto-area" });

  if (ctx.estadoDados === "atualize") {
    raiz.append(titulo, el("div", { className: "cartao" }, el("p", { textContent: "Atualize o app para montar a lista." }), el("div", { className: "acoes" }, el("a", { className: "botao", href: "#sobre", textContent: "Ir para Sobre" }))));
    return;
  }
  if (ctx.estadoDados !== "ok" || !ctx.dados) {
    raiz.append(titulo, el("div", { className: "cartao" }, el("p", { textContent: "Ainda sem dados. Abra o app com internet uma vez." })), $foto);
    renderListaFoto($foto, ctx, deps, () => {});
    return;
  }
  const dados = ctx.dados;
  let lista = storage ? lerLista(storage) : listaVazia();
  let confirmando = false;

  const $aviso = el("p", { className: "aviso", role: "status", hidden: true, textContent: "Não consegui guardar a lista neste aparelho" });
  const $busca = el("input", { type: "search", className: "busca", placeholder: "Procurar produto (ex.: café)", autocomplete: "off" });
  $busca.setAttribute("aria-label", "Procurar produto para a lista");
  const $resultados = el("div", { className: "resultados-lista" });
  const $corpo = el("div", { className: "corpo-lista" });
  const $resto = el("div", { className: "resto-lista" });

  function mudar(novaLista) {
    lista = novaLista;
    confirmando = false;
    $aviso.hidden = storage ? gravarLista(storage, lista) : false;
    desenhar();
  }

  function botaoPequeno(texto, rotulo, aoClicar) {
    const b = el("button", { type: "button", className: "mini", textContent: texto });
    b.setAttribute("aria-label", rotulo);
    b.addEventListener("click", aoClicar);
    return b;
  }

  function desenharBusca() {
    $resultados.replaceChildren();
    const achados = buscarProdutos(dados, $busca.value);
    if (!normalizar($busca.value)) return;
    if (!achados.length) {
      $resultados.append(el("p", { className: "muted", textContent: "Nenhum produto encontrado." }));
      return;
    }
    for (const p of achados) {
      const nalista = lista.itens.some((i) => i.id === p.id);
      const linha = el("div", { className: "linha-busca" }, el("span", { className: "nome", textContent: String(p.nome ?? "") }));
      if (nalista) linha.append(el("span", { className: "muted", textContent: "na lista" }));
      else linha.append(botaoPequeno("Adicionar", "Adicionar " + String(p.nome ?? "") + " à lista", () => mudar(adicionar(lista, p.id))));
      $resultados.append(linha);
    }
  }

  function linhaItem(i) {
    const nome = i.nome ?? "Produto não está mais na lista do Radar";
    const caixa = el("input", { type: "checkbox", className: "pego", checked: i.pego });
    caixa.setAttribute("aria-label", "Já peguei " + nome);
    caixa.addEventListener("change", () => mudar(alternarPego(lista, i.id)));
    const topo = el("div", { className: "topo-item" }, caixa, el("span", { className: "nome" + (i.pego ? " pego" : ""), textContent: nome }));
    const qtd = el("div", { className: "qtd" },
      botaoPequeno("−", "Diminuir quantidade de " + nome, () => mudar(alterarQuantidade(lista, i.id, i.qtd - 1))),
      el("span", { className: "qtd-valor", textContent: String(i.qtd) }),
      botaoPequeno("+", "Aumentar quantidade de " + nome, () => mudar(alterarQuantidade(lista, i.id, i.qtd + 1))));
    const rem = el("button", { type: "button", className: "mini remover", textContent: "Remover" });
    rem.setAttribute("aria-label", "Remover " + nome + " da lista");
    rem.addEventListener("click", () => mudar(remover(lista, i.id)));
    const cartao = el("div", { className: "cartao item-lista" }, topo);
    const o = i.oferta;
    if (o) {
      const lojas = formatarLojas(o.lojas);
      cartao.append(el("p", { className: "muted", textContent: "Melhor: " + String(o.mercado ?? "") + (lojas ? " · " + lojas : "") }));
      const emb = ehNumero(o.quantidade) && o.unidade ? ` · ${o.quantidade} ${o.unidade}` : "";
      cartao.append(el("p", { className: "preco-item", textContent: formatarPreco(o.preco) + emb }));
      if (ehNumero(o.preco_condicional)) {
        cartao.append(el("p", { className: "muted", textContent: "com condição: " + formatarPreco(o.preco_condicional) + (o.condicao ? " (" + String(o.condicao) + ")" : "") }));
      }
    }
    cartao.append(el("div", { className: "acoes" }, qtd, rem));
    return cartao;
  }

  function desenhar() {
    desenharBusca();
    $corpo.replaceChildren();
    if (!lista.itens.length && !lista.extras.length) {
      const ir = el("button", { type: "button", className: "botao", textContent: "Ir para a busca" });
      ir.addEventListener("click", () => { try { $busca.focus(); } catch {} });
      $corpo.append(el("div", { className: "cartao" }, el("p", { textContent: "Procure um produto acima para montar sua lista" }), el("div", { className: "acoes" }, ir)));
      return;
    }
    const todos = itensDaLista(dados, lista);
    const comOferta = todos.filter((i) => i.oferta);
    for (const i of comOferta) $corpo.append(linhaItem(i));

    const plano = planoDeCompra(dados, lista);
    if (plano.grupos.length) {
      const bloco = el("div", { className: "cartao" }, el("h3", { textContent: "Onde comprar" }));
      for (const g of plano.grupos) {
        bloco.append(el("p", { textContent: `Comprar no ${g.mercado}: ${g.itens.map((x) => (x.qtd > 1 ? `${x.qtd}× ` : "") + x.nome).join(", ")}` }));
        bloco.append(el("p", { className: "muted", textContent: "Subtotal: " + centavosParaTexto(g.subtotalCent) }));
      }
      bloco.append(el("p", { className: "preco-item", textContent: "Total estimado (melhor de cada): " + centavosParaTexto(plano.totalCent) }));
      bloco.append(el("p", { className: "muted", textContent: "O melhor mercado é o de menor preço por kg/un; o total soma o preço da embalagem." }));
      $corpo.append(bloco);
    }
    const totais = totaisPorMercado(dados, lista);
    if (totais.length) {
      const bloco = el("div", { className: "cartao" }, el("h3", { textContent: "Se comprar tudo em um só mercado" }));
      for (const t of totais) {
        bloco.append(el("p", { textContent: `${t.mercado}: ${centavosParaTexto(t.totalCent)}` + (t.faltam ? ` (${textoFaltam(t.faltam)})` : "") }));
      }
      $corpo.append(bloco);
    }
    const sem = todos.filter((i) => !i.oferta);
    if (sem.length || lista.extras.length) {
      const bloco = el("div", { className: "cartao sem-lista" }, el("h3", { textContent: "Sem oferta/preço" }), el("p", { className: "muted", textContent: "Ficam fora do total." }));
      for (const i of sem) {
        const nome = i.nome ?? "Produto não está mais na lista do Radar";
        const rem = el("button", { type: "button", className: "mini remover", textContent: "Remover" });
        rem.setAttribute("aria-label", "Remover " + nome + " da lista");
        rem.addEventListener("click", () => mudar(remover(lista, i.id)));
        bloco.append(el("div", { className: "linha-busca" }, el("span", { className: "nome" }, nome, el("span", { className: "extra-texto", textContent: `Sem oferta agora · ${i.qtd} un` })), rem));
      }
      for (const x of lista.extras) {
        const rem = el("button", { type: "button", className: "mini remover", textContent: "Remover" });
        rem.setAttribute("aria-label", "Remover " + x.texto + " da lista");
        rem.addEventListener("click", () => mudar(removerExtra(lista, x.texto)));
        bloco.append(el("div", { className: "linha-busca" }, el("span", { className: "nome" }, x.texto, el("span", { className: "extra-texto", textContent: `Não está no Radar · ${x.qtd} un` })), rem));
      }
      $corpo.append(bloco);
    }
    const limparBtn = el("button", { type: "button", className: "botao sec", textContent: confirmando ? "Limpar mesmo?" : "Limpar lista" });
    limparBtn.addEventListener("click", () => {
      if (!confirmando) { confirmando = true; desenhar(); return; }
      mudar(limpar());
    });
    $corpo.append(el("div", { className: "acoes" }, limparBtn));
  }

  $busca.addEventListener("input", desenharBusca);
  $resto.append($aviso, $busca, $resultados, $corpo);
  raiz.append(titulo, $foto, $resto);
  renderListaFoto($foto, ctx, { ...deps, titulo, obterLista: () => lista, alternarResto: (escondido) => { $resto.hidden = escondido; } }, mudar);
  desenhar();
}
