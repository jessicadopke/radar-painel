// Tela Sobre: lógica pura (sem DOM). Nenhuma função lança exceção.

export const CHAVE_TEMA = "radar-tema";
export const TEMAS = ["auto", "light", "dark"];
export const NOME_TEMA = { auto: "Automático (segue o celular)", light: "Claro", dark: "Escuro" };

export const EXPLICACAO = [
  "O Radar acompanha as ofertas dos mercados de Palmas: folhetos do Assaí e do Atacadão e as publicações dos mercados no Instagram.",
  "Os preços são lidos das imagens por inteligência artificial e podem ter erros. Confira na loja antes de decidir.",
  "A coleta roda duas vezes por dia, perto das 12h e das 21h, num computador. Se ele estiver desligado, os preços ficam velhos e o app avisa.",
  "O app guarda a última cópia dos dados e abre sem internet. Os alertas aparecem só aqui dentro; nada é enviado para fora do celular.",
  "A lista de compras também fica guardada só no seu aparelho: ninguém mais vê o que você marcou.",
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
