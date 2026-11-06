// Histórico de compras (#194-2): lógica pura, sem DOM e sem rede. Nenhuma função lança exceção.
// Fica só no aparelho (localStorage recebido por parâmetro), na chave radar.compras (versão 1). Dinheiro em centavos inteiros.
// Isolamento: este módulo não importa grafico.js, produto.js, oferta.js nem hoje.js; compras e preços pagos nunca entram no preço-alvo.
import { normalizar } from "./texto.js";
import { MAX_NOME, MAX_TEXTO, dataValida, novoId, limitarQtd, listaAtiva, trocarConteudoAtiva, criarLista, sanearExtras } from "./listas.js";
import { melhorOferta, ofertaNoMercado, centavos } from "./lista.js";

export const CHAVE_COMPRAS = "radar.compras";
export const MAX_COMPRAS = 100;
export const MAX_MERCADO = 40;
export const ORCAMENTO_COMPRAS = 1500000; // caracteres do JSON (o app inteiro fica abaixo de 2 milhões)
export const MAX_PRECO_CENT = 99999999;
const MAX_ID = 24;
const MAX_ITENS_COMPRA = 260;

const listaDe = (x) => (Array.isArray(x) ? x : []);
const objeto = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const produtosDe = (dados) => (objeto(dados) ? listaDe(dados.produtos) : []).filter(objeto);

// ---- saneamento do que está guardado ----
const centavosValidos = (n) => (typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_PRECO_CENT ? n : null);
const textoCurto = (t, max) => (typeof t === "string" ? t.trim().slice(0, max).trim() : "");

function sanearItem(b) {
  if (!objeto(b)) return null;
  const id = typeof b.id === "string" && b.id && b.id.length <= 120 ? b.id : null;
  const texto = id === null ? textoCurto(b.texto, MAX_TEXTO) : "";
  if (id === null && !texto) return null;
  const nome = textoCurto(b.nome, MAX_TEXTO) || (id ?? texto);
  const mercado = textoCurto(b.mercado, MAX_MERCADO) || null;
  const base = { nome, qtd: limitarQtd(b.qtd), mercado, preco_pago: centavosValidos(b.preco_pago) };
  return id !== null ? { id, ...base } : { texto, ...base };
}

function sanearCompra(b) {
  if (!objeto(b) || typeof b.id !== "string" || !b.id || b.id.length > MAX_ID || !dataValida(b.data)) return null;
  const itens = listaDe(b.itens).map(sanearItem).filter(Boolean).slice(0, MAX_ITENS_COMPRA);
  if (!itens.length) return null;
  return {
    id: b.id,
    data: b.data,
    lista_nome: textoCurto(b.lista_nome, MAX_NOME) || "Lista",
    lista_data: dataValida(b.lista_data) ? b.lista_data : b.data,
    itens,
  };
}

function lerTexto(storage, chave) {
  try {
    const t = storage.getItem(chave);
    return typeof t === "string" ? t : null;
  } catch {
    return null;
  }
}

export function comprasVazias() {
  return { versao: 1, compras: [] };
}

// JSON estragado, ausente ou sem storage = histórico vazio. Compra inválida é descartada; id repetido, só a primeira vale.
export function lerCompras(storage) {
  try {
    const t = lerTexto(storage, CHAVE_COMPRAS);
    if (t === null) return comprasVazias();
    let bruto = null;
    try { bruto = JSON.parse(t); } catch { bruto = null; }
    if (!objeto(bruto)) return comprasVazias();
    const vistos = new Set();
    const compras = [];
    for (const c of listaDe(bruto.compras)) {
      const s = sanearCompra(c);
      if (!s || vistos.has(s.id)) continue;
      vistos.add(s.id);
      compras.push(s);
    }
    return { versao: 1, compras };
  } catch {
    return comprasVazias();
  }
}

// Mais antiga = menor data; empate, a registrada antes (menor posição no array).
function maisAntigaPrimeiro(compras) {
  return compras.map((c, i) => ({ c, i })).sort((a, b) => (a.c.data < b.c.data ? -1 : a.c.data > b.c.data ? 1 : a.i - b.i));
}

// Corta para o máximo de compras e para o orçamento de tamanho, tirando sempre as mais antigas (a última registrada fica).
export function limitarCompras(compras, orcamento = ORCAMENTO_COMPRAS) {
  let atuais = listaDe(compras);
  const tamanho = (l) => JSON.stringify({ versao: 1, compras: l }).length;
  const tirar = (l, n) => {
    const fora = new Set(maisAntigaPrimeiro(l).slice(0, n).map((x) => x.c));
    return l.filter((c) => !fora.has(c));
  };
  if (atuais.length > MAX_COMPRAS) atuais = tirar(atuais, atuais.length - MAX_COMPRAS);
  while (atuais.length > 1 && tamanho(atuais) > orcamento) atuais = tirar(atuais, 1);
  return atuais;
}

// Recusa (false) se o que está guardado é de um app mais novo em formato que este não entende, ou se nem uma compra cabe no orçamento.
export function gravarCompras(storage, estado) {
  try {
    const atual = lerTexto(storage, CHAVE_COMPRAS);
    if (atual !== null) {
      let bruto = null;
      try { bruto = JSON.parse(atual); } catch { bruto = null; }
      if (objeto(bruto) && Number(bruto.versao) > 1 && !Array.isArray(bruto.compras)) return false;
    }
    const compras = limitarCompras(estado && estado.compras);
    const texto = JSON.stringify({ versao: 1, compras });
    if (texto.length > ORCAMENTO_COMPRAS) return false;
    storage.setItem(CHAVE_COMPRAS, texto);
    return true;
  } catch {
    return false;
  }
}

// ---- revisão da compra ----
export function mercadosDe(dados) {
  const nomes = new Set();
  for (const p of produtosDe(dados)) {
    for (const o of listaDe(p.ofertas)) {
      if (objeto(o) && typeof o.mercado === "string" && o.mercado.trim()) nomes.add(o.mercado.trim());
    }
  }
  return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export const chaveItem = (i) => (i && typeof i.id === "string" && i.id ? i.id : "x:" + normalizar(i && i.texto));

// Preço da oferta do produto naquele mercado, em centavos; null se não houver.
export function precoNoMercado(dados, id, mercado) {
  const produto = produtosDe(dados).find((p) => p.id === id);
  const o = produto ? ofertaNoMercado(produto, mercado) : null;
  return o ? centavos(o.preco) : null;
}

// Linhas da revisão: mercado = melhor mercado do item hoje, preço = preço da oferta nesse mercado (editáveis).
// Itens não marcados "já peguei" chegam desmarcados (incluir=false) e ficam na lista por padrão (sair=false).
export function prepararConclusao(dados, lista, hoje) {
  const porId = new Map(produtosDe(dados).map((p) => [p.id, p]));
  const linhas = [];
  for (const i of listaDe(lista && lista.itens)) {
    if (!objeto(i) || typeof i.id !== "string") continue;
    const produto = porId.get(i.id) ?? null;
    const o = produto ? melhorOferta(produto) : null;
    const mercado = o && typeof o.mercado === "string" && o.mercado ? o.mercado : null;
    linhas.push({
      chave: i.id, id: i.id, texto: null, nome: produto && produto.nome ? String(produto.nome) : i.id,
      qtd: limitarQtd(i.qtd), pego: i.pego === true, mercado, preco_cent: o ? centavos(o.preco) : null,
      incluir: i.pego === true, sair: false,
    });
  }
  for (const x of listaDe(lista && lista.extras)) {
    if (!objeto(x) || typeof x.texto !== "string") continue;
    linhas.push({
      chave: "x:" + normalizar(x.texto), id: null, texto: x.texto, nome: x.texto,
      qtd: limitarQtd(x.qtd), pego: x.pego === true, mercado: null, preco_cent: null,
      incluir: x.pego === true, sair: false,
    });
  }
  return { data: hoje, linhas };
}

// "12,90", "12.90", "R$ 12,90", "1.234,50", "12": centavos inteiros. Vazio = null ("não anotei"). Inválido = NaN.
export function lerPrecoDigitado(texto) {
  if (typeof texto === "number") return Number.isFinite(texto) && texto >= 0 ? Math.round(texto * 100) : NaN;
  if (texto === null || texto === undefined) return null;
  let t = String(texto).trim().replace(/^R\$\s*/i, "").trim();
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if ((t.match(/\./g) || []).length > 1) return NaN;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  const c = Math.round(Number(t) * 100);
  return Number.isFinite(c) && c <= MAX_PRECO_CENT ? c : NaN;
}

// Monta a compra e a lista nova. Não grava (a tela grava: primeiro radar.compras, depois radar.listas).
// resultado: "ok" | "vazia" (nenhum item marcado) | "data" (inválida ou depois de hoje) | "sem-lista".
export function registrarCompra(compras, listas, revisao, hoje, id) {
  const sem = (resultado) => ({ compras, listas, resultado, compra: null });
  try {
    const data = revisao && revisao.data;
    if (!dataValida(data) || (dataValida(hoje) && data > hoje)) return sem("data");
    const linhas = listaDe(revisao && revisao.linhas).filter(objeto);
    const compradas = linhas.filter((l) => l.incluir === true);
    if (!compradas.length) return sem("vazia");
    const ativa = listaAtiva(listas);
    if (!ativa) return sem("sem-lista");
    const itens = compradas.map((l) => {
      const mercado = textoCurto(l.mercado, MAX_MERCADO) || null;
      const base = { nome: textoCurto(l.nome, MAX_TEXTO) || String(l.id ?? l.texto ?? ""), qtd: limitarQtd(l.qtd), mercado, preco_pago: centavosValidos(l.preco_cent) };
      return typeof l.id === "string" && l.id ? { id: l.id, ...base } : { texto: textoCurto(l.texto, MAX_TEXTO), ...base };
    });
    const compra = { id: id ?? novoId("c"), data, lista_nome: ativa.nome, lista_data: ativa.data, itens };
    const saem = new Set(linhas.filter((l) => l.incluir === true || l.sair === true).map((l) => l.chave));
    const conteudo = {
      itens: ativa.itens.filter((i) => !saem.has(chaveItem(i))).map((i) => ({ ...i, pego: false })),
      extras: ativa.extras.filter((x) => !saem.has(chaveItem(x))),
    };
    return {
      compras: { versao: 1, compras: limitarCompras([...listaDe(compras && compras.compras), compra]) },
      listas: trocarConteudoAtiva(listas, conteudo),
      resultado: "ok",
      compra,
    };
  } catch {
    return sem("vazia");
  }
}

// ---- histórico ----
// Total = soma de preço pago x quantidade dos itens com preço; semPreco = itens sem preço anotado.
export function resumoCompra(compra) {
  const itens = listaDe(compra && compra.itens);
  let totalCent = 0;
  let semPreco = 0;
  for (const i of itens) {
    if (i && Number.isInteger(i.preco_pago)) totalCent += i.preco_pago * limitarQtd(i.qtd);
    else semPreco += 1;
  }
  return { itens: itens.length, totalCent, semPreco };
}

// Mais recente primeiro: data decrescente; empate, a registrada depois.
export function ordenar(compras) {
  return listaDe(compras)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.data > b.c.data ? -1 : a.c.data < b.c.data ? 1 : b.i - a.i))
    .map((x) => x.c);
}

export function apagarCompra(estado, id) {
  return { versao: 1, compras: listaDe(estado && estado.compras).filter((c) => c.id !== id) };
}

// Nova lista "Repetir: <nome>" (cortada em 40 caracteres), data = hoje, ativa. Produto que sumiu do dados.json
// (ou sem dados nenhum a comparar = não sumiu) vira item avulso com o nome copiado. resultado: "ok" | "limite" | "sem-compra".
export function refazerLista(listas, compra, dados, hoje, id) {
  if (!compra || !listaDe(compra.itens).length) return { estado: listas, resultado: "sem-compra", avulsos: 0 };
  const conhecidos = new Set(produtosDe(dados).map((p) => p.id));
  const temDados = dados !== null && dados !== undefined && objeto(dados);
  const nome = ("Repetir: " + String(compra.lista_nome ?? "")).slice(0, MAX_NOME).trim();
  const itens = [];
  const extras = [];
  let avulsos = 0;
  for (const i of listaDe(compra.itens)) {
    if (typeof i.id === "string" && i.id && (!temDados || conhecidos.has(i.id))) {
      if (!itens.some((x) => x.id === i.id)) itens.push({ id: i.id, qtd: limitarQtd(i.qtd), pego: false });
      continue;
    }
    if (typeof i.id === "string" && i.id) avulsos += 1;
    extras.push({ texto: i.nome ?? i.texto, qtd: i.qtd });
  }
  const r = criarLista(listas, nome, hoje, id);
  if (r.resultado === "limite") return { estado: listas, resultado: "limite", avulsos: 0 };
  if (r.resultado !== "ok") return { estado: listas, resultado: r.resultado, avulsos: 0 };
  return { estado: trocarConteudoAtiva(r.estado, { itens, extras: sanearExtras(extras) }), resultado: "ok", avulsos };
}

// ---- sugestões (#194-3) ----
export const JANELA_DIAS = 90;
export const MIN_COMPRAS_RECORRENTE = 3;
export const MAX_SUGESTOES = 5;

function diasAtras(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
}

// Produtos do dados.json que aparecem em pelo menos 3 compras diferentes dos últimos 90 dias e ainda não estão na lista ativa.
// Ordem: mais compras, depois a última compra mais antiga (pode estar acabando), depois nome. qtd = a mais frequente (empate = menor).
// Itens avulsos (texto) e produtos que saíram do dados.json não entram. Não usa preço: nada daqui toca o preço-alvo.
export function sugerir(historico, lista, dados, hoje) {
  try {
    if (!dataValida(hoje)) return [];
    const desde = diasAtras(hoje, JANELA_DIAS);
    const porId = new Map(produtosDe(dados).map((p) => [p.id, p]));
    const naLista = new Set(listaDe(lista && lista.itens).filter(objeto).map((i) => i.id));
    const por = new Map();
    for (const c of listaDe(historico && historico.compras)) {
      if (!objeto(c) || !dataValida(c.data) || c.data < desde || c.data > hoje) continue;
      const vistos = new Set();
      for (const i of listaDe(c.itens)) {
        if (!objeto(i) || typeof i.id !== "string" || !i.id || vistos.has(i.id)) continue;
        vistos.add(i.id);
        if (!porId.has(i.id) || naLista.has(i.id)) continue;
        const r = por.get(i.id) ?? { id: i.id, compras: 0, ultima: c.data, qtds: new Map() };
        r.compras += 1;
        if (c.data > r.ultima) r.ultima = c.data;
        const q = limitarQtd(i.qtd);
        r.qtds.set(q, (r.qtds.get(q) ?? 0) + 1);
        por.set(i.id, r);
      }
    }
    return [...por.values()]
      .filter((r) => r.compras >= MIN_COMPRAS_RECORRENTE)
      .map((r) => {
        const qtd = [...r.qtds.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
        const nome = String(porId.get(r.id).nome ?? r.id);
        return { id: r.id, nome, compras: r.compras, qtd, ultima: r.ultima };
      })
      .sort((a, b) => b.compras - a.compras || (a.ultima < b.ultima ? -1 : a.ultima > b.ultima ? 1 : 0) || a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, MAX_SUGESTOES);
  } catch {
    return [];
  }
}
