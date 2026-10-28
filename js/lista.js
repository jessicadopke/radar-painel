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

// Resumo para a faixa do Início: quantos itens, em quantos mercados e o total (null se nenhum item tem preço).
export function resumoDaLista(dados, lista) {
  const itens = itensDe(lista).length + extrasDe(lista).length;
  const plano = planoDeCompra(dados, lista);
  return { itens, mercados: plano.grupos.length, totalCent: plano.grupos.length ? plano.totalCent : null };
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

// Ordem de exibição: a de entrada, com os já pegos no fim (estável).
export function ordenarItens(itens) {
  const l = listaDe(itens);
  return [...l.filter((i) => !(i && i.pego)), ...l.filter((i) => i && i.pego)];
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
  const titulo = el("h2", { className: "so-leitor", textContent: "Lista de compras", tabIndex: -1 });
  const $foto = el("div", { className: "foto-area" });

  if (ctx.estadoDados === "atualize") {
    raiz.append(titulo, el("div", { className: "cartao" }, el("p", { textContent: "Atualize o app para montar a lista." }), el("div", { className: "acoes" }, el("a", { className: "botao", href: "#mais", textContent: "Ir para Mais" }))));
    return;
  }
  if (ctx.estadoDados !== "ok" || !ctx.dados) {
    raiz.append(titulo, el("div", { className: "cartao" }, el("p", { textContent: "Ainda sem preços. Abra o app com internet uma vez." })), $foto);
    renderListaFoto($foto, ctx, deps, () => {});
    return;
  }
  const dados = ctx.dados;
  let lista = storage ? lerLista(storage) : listaVazia();
  let confirmando = false;

  const $aviso = el("p", { className: "aviso", role: "status", hidden: true, textContent: "Não consegui guardar a lista neste aparelho" });
  const $busca = el("input", { type: "search", className: "busca", placeholder: "Procurar produto", autocomplete: "off" });
  $busca.setAttribute("aria-label", "Procurar produto para a lista");
  const $resultados = el("div", { className: "resultados-lista" });
  const $topo = el("div", { className: "topo-lista" });
  const $entrada = el("div", { className: "entrada-lista" });
  const $slot = el("div", { className: "foto-slot" });
  const $corpo = el("div", { className: "corpo-lista" });
  const vazia = () => !lista.itens.length && !lista.extras.length;
  let foto;
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

  // Um item aberto por vez (controles de quantidade); estado só em memória.
  let abertoId = null;
  let focarId = null;
  const botoesMeio = new Map();

  function botaoTirar(nome, aoClicar) {
    const b = el("button", { type: "button", className: "mini tirar", textContent: "×" });
    b.setAttribute("aria-label", "Tirar da lista: " + nome);
    b.addEventListener("click", aoClicar);
    return b;
  }

  function linhaItem(i) {
    const nome = i.nome ?? "Produto não está mais na lista do Radar";
    const o = i.oferta;
    const caixa = el("input", { type: "checkbox", className: "pego", checked: i.pego });
    caixa.setAttribute("aria-label", "Já peguei " + nome);
    caixa.addEventListener("change", () => mudar(alternarPego(lista, i.id)));
    const aberto = abertoId === i.id;
    const meio = el("button", { type: "button", className: "meio" },
      el("span", { className: "nome" + (i.pego ? " pego" : ""), textContent: nome }),
      el("span", { className: "sub", textContent: `${i.qtd}` + (o && o.mercado ? " · " + String(o.mercado) : "") }));
    botoesMeio.set(i.id, meio);
    meio.setAttribute("aria-expanded", aberto ? "true" : "false");
    meio.addEventListener("click", () => {
      abertoId = abertoId === i.id ? null : i.id;
      focarId = i.id;
      desenhar();
    });
    const principal = el("div", { className: "item-l" + (i.pego ? " pego-l" : "") },
      el("span", { className: "caixa" }, caixa), meio,
      el("span", { className: "p", textContent: o ? centavosParaTexto(centavos(o.preco) * i.qtd) : "" }),
      botaoTirar(nome, () => mudar(remover(lista, i.id))));
    const linha = el("div", { className: "item-bloco" }, principal);
    if (o && ehNumero(o.preco_condicional)) {
      linha.append(el("p", { className: "sub cond", textContent: "com condição: " + formatarPreco(o.preco_condicional) + (o.condicao ? " (" + String(o.condicao) + ")" : "") }));
    }
    if (aberto) {
      linha.append(el("div", { className: "qtd qtd-aberta" },
        botaoPequeno("−", "Diminuir quantidade de " + nome, () => { focarId = i.id; mudar(alterarQuantidade(lista, i.id, i.qtd - 1)); }),
        el("span", { className: "qtd-valor", textContent: String(i.qtd) }),
        botaoPequeno("+", "Aumentar quantidade de " + nome, () => { focarId = i.id; mudar(alterarQuantidade(lista, i.id, i.qtd + 1)); })));
    }
    return linha;
  }

  function desenhar() {
    desenharBusca();
    $topo.replaceChildren();
    $entrada.replaceChildren();
    $corpo.replaceChildren();
    botoesMeio.clear();
    if (vazia()) {
      $busca.placeholder = "Procurar produto";
      $entrada.append(el("div", { className: "cartao vazio" },
        el("p", { className: "vazio-titulo", textContent: "Sua lista está vazia" }),
        el("p", { className: "muted", textContent: "Procure um produto ou tire foto da sua lista de papel." }),
        $busca, $slot));
      if (foto) foto.redesenhar();
      return;
    }
    $busca.placeholder = "Adicionar produto";
    $entrada.append(el("div", { className: "linha-entrada" }, $busca, $slot));
    if (foto) foto.redesenhar();
    const todos = itensDaLista(dados, lista);
    const comOferta = todos.filter((i) => i.oferta);

    const plano = planoDeCompra(dados, lista);
    if (plano.grupos.length) {
      const bloco = el("div", { className: "cartao resultado" },
        el("p", { className: "muted", textContent: "Total estimado" }),
        el("p", { className: "total", textContent: centavosParaTexto(plano.totalCent) }));
      for (const g of plano.grupos) {
        bloco.append(el("p", { textContent: `${g.mercado}: ${g.itens.map((x) => (x.qtd > 1 ? `${x.qtd}× ` : "") + x.nome).join(", ")} · ${centavosParaTexto(g.subtotalCent)}` }));
      }
      const totais = totaisPorMercado(dados, lista);
      if (totais.length) {
        const comparar = el("details", { className: "comparar" }, el("summary", { className: "resumo", textContent: "Comparar com um mercado só" }));
        for (const t of totais) {
          comparar.append(el("p", { textContent: `${t.mercado}: ${centavosParaTexto(t.totalCent)}` + (t.faltam ? ` (${textoFaltam(t.faltam)})` : "") }));
        }
        bloco.append(comparar);
      }
      $topo.append(bloco);
    }
    if (comOferta.length) {
      const cartaoItens = el("div", { className: "cartao itens-lista" });
      for (const i of ordenarItens(comOferta)) cartaoItens.append(linhaItem(i));
      $corpo.append(cartaoItens);
    }
    const sem = todos.filter((i) => !i.oferta);
    if (sem.length || lista.extras.length) {
      const bloco = el("details", { className: "cartao sem-lista" }, el("summary", { className: "resumo", textContent: `Sem preço agora (${sem.length + lista.extras.length})` }));
      for (const i of sem) {
        const nome = i.nome ?? "Produto não está mais na lista do Radar";
        bloco.append(el("div", { className: "linha-busca" }, el("span", { className: "nome" }, nome, el("span", { className: "extra-texto", textContent: `Sem preço agora · ${i.qtd} un` })), botaoTirar(nome, () => mudar(remover(lista, i.id)))));
      }
      for (const x of lista.extras) {
        bloco.append(el("div", { className: "linha-busca" }, el("span", { className: "nome" }, x.texto, el("span", { className: "extra-texto", textContent: `Não está no Radar · ${x.qtd} un` })), botaoTirar(x.texto, () => mudar(removerExtra(lista, x.texto)))));
      }
      $corpo.append(bloco);
    }
    const limparBtn = el("button", { type: "button", className: "link", textContent: confirmando ? "Limpar mesmo?" : "Limpar lista" });
    limparBtn.addEventListener("click", () => {
      if (!confirmando) { confirmando = true; desenhar(); return; }
      mudar(limpar());
    });
    $corpo.append(el("div", { className: "acoes" }, limparBtn));
    if (foto) {
      const chave = el("button", { type: "button", className: "link", textContent: "Chave do Gemini" });
      chave.addEventListener("click", () => foto.abrirChave(chave));
      $corpo.append(el("div", { className: "acoes" }, chave));
    }
    if (focarId !== null) {
      const alvo = botoesMeio.get(focarId);
      focarId = null;
      if (alvo) alvo.focus();
    }
  }

  $busca.addEventListener("input", desenharBusca);
  $resto.append($aviso, $topo, $entrada, $resultados, $corpo);
  raiz.append(titulo, $foto, $resto);
  foto = renderListaFoto($foto, ctx, { ...deps, titulo, slotBotao: $slot, modoBotao: () => (vazia() ? "texto" : "icone"), obterLista: () => lista, alternarResto: (escondido) => { $resto.hidden = escondido; } }, mudar);
  desenhar();
}
