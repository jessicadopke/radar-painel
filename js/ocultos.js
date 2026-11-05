// Produtos ocultos no aparelho (#187, opção A): lógica pura com `storage` injetado (sem DOM). Nada sai do aparelho.
// Estado: { versao: 1, itens: [{ id, nome, em }] } em localStorage "radar.ocultos". Nenhuma função lança exceção.

export const CHAVE_OCULTOS = "radar.ocultos";
export const LIMITE_OCULTOS = 300;
export const MAX_TEXTO_OCULTO = 80;

const vazio = () => ({ versao: 1, itens: [] });
const texto = (v) => (typeof v === "string" || typeof v === "number" ? String(v).slice(0, MAX_TEXTO_OCULTO) : "");

// Aceita só itens com id; campos desconhecidos são ignorados; repetidos saem; no máximo LIMITE_OCULTOS.
function limparItens(itens) {
  if (!Array.isArray(itens)) return null;
  const vistos = new Set();
  const saida = [];
  for (const i of itens) {
    if (!i || typeof i !== "object") continue;
    const id = texto(i.id);
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    saida.push({ id, nome: texto(i.nome), em: typeof i.em === "string" ? i.em.slice(0, 10) : "" });
    if (saida.length >= LIMITE_OCULTOS) break;
  }
  return saida;
}

// Lê o JSON guardado: null = ilegível ou formato estranho; { versao, itens } = lido.
function lerBruto(storage) {
  try {
    const bruto = storage && typeof storage.getItem === "function" ? storage.getItem(CHAVE_OCULTOS) : null;
    if (bruto == null) return { ausente: true };
    const j = JSON.parse(bruto);
    if (!j || typeof j !== "object" || Array.isArray(j)) return null;
    const itens = limparItens(j.itens);
    if (!itens) return null;
    const versao = typeof j.versao === "number" && Number.isFinite(j.versao) && j.versao >= 1 ? Math.floor(j.versao) : 1;
    return { versao, itens };
  } catch {
    return null;
  }
}

// JSON inválido ou formato estranho = nenhum oculto, sem erro. Versão maior que 1 é lida se `itens` tiver o formato esperado.
export function lerOcultos(storage) {
  const r = lerBruto(storage);
  return r && !r.ausente ? { versao: r.versao, itens: r.itens } : vazio();
}

// true se guardou. Não sobrescreve o que um app mais novo gravou num formato que este não entende; nunca lança.
export function gravarOcultos(storage, estado) {
  try {
    if (!storage || typeof storage.setItem !== "function") return false;
    let atual = null;
    try {
      const bruto = typeof storage.getItem === "function" ? storage.getItem(CHAVE_OCULTOS) : null;
      if (bruto != null) atual = JSON.parse(bruto);
    } catch {}
    if (atual && typeof atual === "object" && typeof atual.versao === "number" && atual.versao > 1 && !limparItens(atual.itens)) return false;
    const itens = limparItens(estado && estado.itens) ?? [];
    const versao = estado && typeof estado.versao === "number" && estado.versao >= 1 ? Math.floor(estado.versao) : 1;
    storage.setItem(CHAVE_OCULTOS, JSON.stringify({ versao, itens }));
    return true;
  } catch {
    return false;
  }
}

export const estaOculto = (estado, id) => Boolean(estado && Array.isArray(estado.itens) && id != null && estado.itens.some((i) => i.id === String(id).slice(0, MAX_TEXTO_OCULTO)));

// Devolve { estado, resultado }: "ok", "ja" (já estava) ou "limite" (já há 300). Não altera o estado recebido.
export function ocultar(estado, produto, hojeIso) {
  const base = estado && Array.isArray(estado.itens) ? estado : vazio();
  const id = produto && produto.id != null ? texto(produto.id) : "";
  if (!id) return { estado: base, resultado: "ja" };
  if (estaOculto(base, id)) return { estado: base, resultado: "ja" };
  if (base.itens.length >= LIMITE_OCULTOS) return { estado: base, resultado: "limite" };
  const em = /^\d{4}-\d{2}-\d{2}$/.test(String(hojeIso ?? "")) ? String(hojeIso) : "";
  return { estado: { ...base, itens: [...base.itens, { id, nome: texto(produto.nome), em }] }, resultado: "ok" };
}

export function mostrar(estado, id) {
  const base = estado && Array.isArray(estado.itens) ? estado : vazio();
  const alvo = id == null ? "" : String(id).slice(0, MAX_TEXTO_OCULTO);
  return { ...base, itens: base.itens.filter((i) => i.id !== alvo) };
}

export function mostrarTodos(estado) {
  const base = estado && Array.isArray(estado.itens) ? estado : vazio();
  return { ...base, itens: [] };
}

// Cópia rasa dos dados sem os produtos ocultos e sem os alertas deles; o original não muda.
export function filtrarDados(dados, estado) {
  if (!dados || typeof dados !== "object") return dados;
  const ocultos = new Set((estado && Array.isArray(estado.itens) ? estado.itens : []).map((i) => i.id));
  const copia = { ...dados };
  if (Array.isArray(dados.produtos)) copia.produtos = dados.produtos.filter((p) => !(p && typeof p === "object" && ocultos.has(String(p.id).slice(0, MAX_TEXTO_OCULTO))));
  if (Array.isArray(dados.alertas)) copia.alertas = dados.alertas.filter((a) => !(a && typeof a === "object" && a.produto_id != null && ocultos.has(String(a.produto_id).slice(0, MAX_TEXTO_OCULTO))));
  return copia;
}

// Ocultos que não estão mais no dados.json (saíram da coleta). Ficam guardados: se voltarem, continuam ocultos.
export function orfaos(dados, estado) {
  const itens = estado && Array.isArray(estado.itens) ? estado.itens : [];
  if (!dados || typeof dados !== "object" || !Array.isArray(dados.produtos)) return [];
  const ids = new Set(dados.produtos.filter((p) => p && typeof p === "object").map((p) => String(p.id).slice(0, MAX_TEXTO_OCULTO)));
  return itens.filter((i) => !ids.has(i.id));
}
