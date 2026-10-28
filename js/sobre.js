// Tela Mais (tema, "Como funciona", novidades): lógica pura (sem DOM). Nenhuma função lança exceção.

export const CHAVE_TEMA = "radar-tema";
export const TEMAS = ["auto", "light", "dark"];
export const NOME_TEMA = { auto: "Automático", light: "Claro", dark: "Escuro" };

export const EXPLICACAO = [
  "O Radar junta as ofertas do Assaí e do Atacadão de Palmas.",
  "A leitura é automática e pode errar. Confira o preço na loja.",
  "Os preços são atualizados 2 vezes por dia. Sem internet, você vê a última cópia.",
  "Sua lista e seus alertas ficam só neste celular.",
  "O melhor mercado é o de menor preço por kg/un; o total soma o preço da embalagem.",
];

export function temaValido(t) {
  return TEMAS.includes(t) ? t : "auto";
}

export function proximoTema(atual) {
  const i = TEMAS.indexOf(temaValido(atual));
  return TEMAS[(i + 1) % TEMAS.length];
}

// Lê o tema salvo; qualquer problema (sem storage, valor estranho) vira "auto".
export function lerTema(storage) {
  try { return temaValido(storage.getItem(CHAVE_TEMA)); } catch { return "auto"; }
}

// Grava o tema; "auto" apaga a escolha. Devolve o tema efetivo.
export function gravarTema(storage, tema) {
  const t = temaValido(tema);
  try {
    if (t === "auto") storage.removeItem(CHAVE_TEMA);
    else storage.setItem(CHAVE_TEMA, t);
  } catch {}
  return t;
}

// "# Novidades ... ## 0.6.0 \n- item" -> [{ versao, itens: [...] }], mais nova primeiro (ordem do arquivo)
export function lerChangelog(texto) {
  const saida = [];
  if (typeof texto !== "string") return saida;
  let atual = null;
  for (const linha of texto.split(/\r?\n/)) {
    const v = /^##\s+(\d+\.\d+\.\d+)\s*$/.exec(linha);
    if (v) { atual = { versao: v[1], itens: [] }; saida.push(atual); continue; }
    const i = /^\s*[-*]\s+(.+?)\s*$/.exec(linha);
    if (i && atual) atual.itens.push(i[1]);
  }
  return saida;
}

// Versão mais nova do changelog (a primeira da lista); lista vazia ou inválida -> null.
export function versaoAtual(lista) {
  return Array.isArray(lista) && lista.length && lista[0] && typeof lista[0] === "object" ? lista[0] : null;
}
