// Conjunto de listas de compras (#194-1): lógica pura, sem DOM e sem rede. Nenhuma função lança exceção.
// Fica só no aparelho (localStorage recebido por parâmetro): chave radar.listas (versão 2); a chave antiga radar.lista (versão 1) é migrada.
import { normalizar } from "./texto.js";

export const CHAVE_LISTAS = "radar.listas";
export const CHAVE_LISTA_ANTIGA = "radar.lista";
export const MAX_LISTAS = 20;
export const MAX_NOME = 40;
export const MAX_ITENS = 200;
export const MAX_EXTRAS = 60;
export const MAX_TEXTO = 80;
export const MAX_QTD = 99;
export const NOME_MIGRADA = "Minha lista";
export const ORCAMENTO_LISTAS = 400000; // caracteres do JSON (o app inteiro fica abaixo de 2 milhões)
const MAX_ID = 24;

const listaDe = (x) => (Array.isArray(x) ? x : []);
const objeto = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

// ---- saneamento do conteúdo de uma lista ----
export function limitarQtd(q) {
  const n = Math.trunc(Number(q));
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_QTD, Math.max(1, n));
}

// Itens lidos da foto que não estão no catálogo: [{texto, qtd}], sem repetidos por texto normalizado.
export function sanearExtras(brutos) {
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

// {itens, extras} saneados: id texto não vazio, sem repetidos, quantidade 1 a 99.
export function sanearConteudo(bruto) {
  const itens = [];
  const vistos = new Set();
  for (const i of listaDe(objeto(bruto) ? bruto.itens : null)) {
    if (!i || typeof i.id !== "string" || !i.id || vistos.has(i.id)) continue;
    vistos.add(i.id);
    itens.push({ id: i.id, qtd: limitarQtd(i.qtd), pego: i.pego === true });
    if (itens.length >= MAX_ITENS) break;
  }
  return { itens, extras: sanearExtras(objeto(bruto) ? bruto.extras : null) };
}

// ---- datas e ids ----
export function hojeLocal(date = new Date()) {
  const dois = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${dois(date.getMonth() + 1)}-${dois(date.getDate())}`;
}

export function dataValida(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ""));
  if (!m) return false;
  const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (a < 1 || me < 1 || me > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(a, me, 0)).getUTCDate();
}

export function novoId(prefixo = "l") {
  let sufixo = "";
  for (let i = 0; i < 4; i += 1) sufixo += Math.floor(Math.random() * 36).toString(36);
  return `${prefixo}-${Date.now().toString(36)}-${sufixo}`;
}

// ---- estado ----
function listaNova(id, nome, data, conteudo) {
  const c = conteudo ?? { itens: [], extras: [] };
  return { id, nome, data, itens: c.itens, extras: c.extras };
}

export function estadoInicial(hoje = hojeLocal(), id = novoId("l")) {
  return { versao: 2, ativa: id, listas: [listaNova(id, NOME_MIGRADA, hoje)] };
}

function nomeValido(nome) {
  const n = typeof nome === "string" ? nome.trim() : "";
  return n.length >= 1 && n.length <= MAX_NOME ? n : null;
}

// Estado vindo do que está guardado (campos desconhecidos ignorados). null = nenhuma lista aproveitável.
function sanearEstado(bruto, hoje) {
  if (!objeto(bruto) || !Array.isArray(bruto.listas)) return null;
  const vistos = new Set();
  const listas = [];
  for (const b of bruto.listas) {
    if (!objeto(b) || typeof b.id !== "string" || !b.id || b.id.length > MAX_ID || vistos.has(b.id)) continue;
    vistos.add(b.id);
    const aparado = typeof b.nome === "string" ? b.nome.trim().slice(0, MAX_NOME).trim() : "";
    listas.push(listaNova(b.id, aparado || NOME_MIGRADA, dataValida(b.data) ? b.data : hoje, sanearConteudo(b)));
    if (listas.length >= MAX_LISTAS) break;
  }
  if (!listas.length) return null;
  const ativa = listas.some((l) => l.id === bruto.ativa) ? bruto.ativa : listas[0].id;
  return { versao: 2, ativa, listas };
}

const corpo = (estado) => ({
  versao: 2,
  ativa: estado.ativa,
  listas: estado.listas.map((l) => ({ id: l.id, nome: l.nome, data: l.data, itens: l.itens, extras: l.extras })),
});

export function listaAtiva(estado) {
  const ls = listaDe(estado && estado.listas);
  return ls.find((l) => l.id === estado.ativa) ?? ls[0];
}

// ---- ler, migrar e gravar ----
function lerTexto(storage, chave) {
  try {
    const t = storage.getItem(chave);
    return typeof t === "string" ? t : null;
  } catch {
    return null;
  }
}

function tentar(f) {
  try { f(); return true; } catch { return false; }
}

// Lê (e migra radar.lista se preciso). { estado, gravou }: gravou=false quando a migração não pôde ser guardada
// (ou o que está guardado é de um app mais novo e não foi tocado). Sempre devolve um estado com pelo menos uma lista.
export function abrirListas(storage, hoje = hojeLocal(), idNovo) {
  try {
    const textoNovo = lerTexto(storage, CHAVE_LISTAS);
    let novo = null;
    let futuro = false;
    if (textoNovo !== null) {
      let bruto = null;
      try { bruto = JSON.parse(textoNovo); } catch { bruto = null; }
      novo = sanearEstado(bruto, hoje);
      if (!novo && objeto(bruto) && Number(bruto.versao) > 2) futuro = true;
    }
    const textoAntigo = lerTexto(storage, CHAVE_LISTA_ANTIGA);
    // 1. a nova é válida: a antiga (se ainda existir) já cumpriu o papel
    if (novo) {
      if (textoAntigo !== null) tentar(() => storage.removeItem(CHAVE_LISTA_ANTIGA));
      return { estado: novo, gravou: true };
    }
    // 2. formato de um app mais novo: não migra, não grava, não apaga nada
    if (futuro) return { estado: estadoInicial(hoje, idNovo), gravou: false };
    // 3. sem nova e sem antiga: uma lista vazia em memória (só grava na primeira edição)
    if (textoAntigo === null) return { estado: estadoInicial(hoje, idNovo), gravou: true };
    // 4. migração: escrever, conferir, só então apagar a antiga
    let antigo = null;
    try { antigo = JSON.parse(textoAntigo); } catch { antigo = null; }
    const conteudo = sanearConteudo(antigo);
    const id = idNovo ?? novoId("l");
    const estado = { versao: 2, ativa: id, listas: [listaNova(id, NOME_MIGRADA, hoje, conteudo)] };
    const escrito = JSON.stringify(corpo(estado));
    let conferiu = false;
    try {
      storage.setItem(CHAVE_LISTAS, escrito);
      const lido = storage.getItem(CHAVE_LISTAS);
      const volta = lido === escrito ? JSON.parse(lido) : null;
      const l = volta && volta.listas && volta.listas[0];
      conferiu = Boolean(l) && listaDe(l.itens).length === conteudo.itens.length && listaDe(l.extras).length === conteudo.extras.length;
    } catch {
      conferiu = false;
    }
    if (!conferiu) {
      tentar(() => storage.removeItem(CHAVE_LISTAS)); // não deixa uma cópia duvidosa valendo
      return { estado, gravou: false };
    }
    tentar(() => storage.removeItem(CHAVE_LISTA_ANTIGA));
    return { estado, gravou: true };
  } catch {
    return { estado: estadoInicial(hoje, idNovo), gravou: false };
  }
}

// Recusa (false) se o que está guardado é de um app mais novo em formato que este não entende, ou se passar do orçamento.
export function gravarListas(storage, estado) {
  try {
    const atual = lerTexto(storage, CHAVE_LISTAS);
    if (atual !== null) {
      let bruto = null;
      try { bruto = JSON.parse(atual); } catch { bruto = null; }
      if (objeto(bruto) && Number(bruto.versao) > 2 && !Array.isArray(bruto.listas)) return false;
    }
    const texto = JSON.stringify(corpo(estado));
    if (texto.length > ORCAMENTO_LISTAS) return false;
    storage.setItem(CHAVE_LISTAS, texto);
    return true;
  } catch {
    return false;
  }
}

// ---- edição (devolvem estado novo) ----
const mapear = (estado, id, f) => ({ ...estado, listas: estado.listas.map((l) => (l.id === id ? f(l) : l)) });

// Só itens e extras da ativa; id, nome e data nunca mudam por aqui.
export function trocarConteudoAtiva(estado, conteudo) {
  const c = sanearConteudo(conteudo);
  return mapear(estado, listaAtiva(estado).id, (l) => ({ ...l, itens: c.itens, extras: c.extras }));
}

export function criarLista(estado, nome, data, id = novoId("l")) {
  if (estado.listas.length >= MAX_LISTAS) return { estado, resultado: "limite" };
  const n = nomeValido(nome);
  if (!n) return { estado, resultado: "nome" };
  if (!dataValida(data)) return { estado, resultado: "data" };
  let idFinal = id;
  while (estado.listas.some((l) => l.id === idFinal)) idFinal = novoId("l");
  return { estado: { ...estado, ativa: idFinal, listas: [...estado.listas, listaNova(idFinal, n, data)] }, resultado: "ok" };
}

export function renomearLista(estado, id, nome) {
  if (!estado.listas.some((l) => l.id === id)) return { estado, resultado: "nao-existe" };
  const n = nomeValido(nome);
  if (!n) return { estado, resultado: "nome" };
  return { estado: mapear(estado, id, (l) => ({ ...l, nome: n })), resultado: "ok" };
}

export function mudarDataLista(estado, id, data) {
  if (!estado.listas.some((l) => l.id === id)) return { estado, resultado: "nao-existe" };
  if (!dataValida(data)) return { estado, resultado: "data" };
  return { estado: mapear(estado, id, (l) => ({ ...l, data })), resultado: "ok" };
}

// Apagar a ativa ativa a primeira que sobrar; apagar a última deixa uma "Minha lista" vazia de hoje (resultado "recriada").
export function apagarLista(estado, id, hoje = hojeLocal(), idNovo = novoId("l")) {
  if (!estado.listas.some((l) => l.id === id)) return { estado, resultado: "nao-existe" };
  const sobra = estado.listas.filter((l) => l.id !== id);
  if (!sobra.length) return { estado: estadoInicial(hoje, idNovo), resultado: "recriada" };
  const ativa = estado.ativa === id ? sobra[0].id : estado.ativa;
  return { estado: { ...estado, ativa, listas: sobra }, resultado: "ok" };
}

export function ativar(estado, id) {
  return estado.listas.some((l) => l.id === id) ? { ...estado, ativa: id } : estado;
}
