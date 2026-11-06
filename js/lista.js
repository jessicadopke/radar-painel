// Lista de compras: lógica pura (sem DOM; a tela está em lista_tela.js). Nenhuma função lança exceção.
// A lista fica só no aparelho (localStorage); a única coisa que sai é a foto da lista por foto, enviada ao Google só para ser lida (rede em foto.js).
import { normalizar } from "./texto.js";
import { sanearExtras, limitarQtd, abrirListas, gravarListas, listaAtiva, trocarConteudoAtiva } from "./listas.js";

const ehNumero = (n) => typeof n === "number" && Number.isFinite(n);
const listaDe = (x) => (Array.isArray(x) ? x : []);
const produtosDe = (dados) => (dados && typeof dados === "object" ? listaDe(dados.produtos) : []).filter((p) => p && typeof p === "object");
const comparaTexto = (a, b) => normalizar(a).localeCompare(normalizar(b), "pt-BR");
export const centavos = (reais) => Math.round(reais * 100);

export const listaVazia = () => ({ versao: 1, itens: [], extras: [] });

// ---- guardar e ler: valem para a lista ATIVA (o conjunto de listas está em listas.js) ----
// Quem edita a lista fora da tela Lista (Ofertas, Início, ocultar produto) continua usando só estas duas funções.
export function lerLista(storage, hoje) {
  try {
    const a = listaAtiva(abrirListas(storage, hoje).estado);
    return { versao: 1, itens: a.itens, extras: a.extras };
  } catch {
    return listaVazia();
  }
}

export function gravarLista(storage, lista, hoje) {
  try {
    const { estado } = abrirListas(storage, hoje);
    return gravarListas(storage, trocarConteudoAtiva(estado, lista));
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

// O produto já está na lista? (lista já lida por lerLista)
export function estaNaLista(lista, id) {
  return typeof id === "string" && itensDe(lista).some((i) => i && i.id === id);
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

export function ofertaNoMercado(produto, mercado) {
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
