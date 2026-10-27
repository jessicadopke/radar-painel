// Associa o texto lido da foto aos produtos do catálogo. Puro (sem DOM, sem rede); nenhuma função lança exceção.
import { normalizar } from "./hoje.js";

export const LIMIAR = 0.8; // pontuação mínima para associar sozinho
export const FOLGA = 0.15; // quanto o melhor precisa vencer o segundo
export const MINIMO = 0.45; // abaixo disso nem aparece como candidato
const MAX_QTD = 99;

const VAZIAS = new Set(["de", "da", "do", "das", "dos", "e", "com", "tipo"]);
const MEDIDA = /\d+([.,]\d+)?\s?(kg|g|mg|l|ml|un|und|unid|pct|pc|cx|dz|duzia)\b/g;

const listaDe = (x) => (Array.isArray(x) ? x : []);

// Palavras comparáveis: sem acento, sem número/medida/palavra vazia, plural simples tirado.
export function prepararTexto(texto) {
  const limpo = normalizar(texto).replace(MEDIDA, " ").replace(/[0-9]+/g, " ");
  return limpo
    .split(/[^a-z]+/)
    .filter((p) => p.length > 1 && !VAZIAS.has(p))
    .map((p) => (p.length >= 4 && p.endsWith("s") ? p.slice(0, -1) : p));
}

function distancia(a, b) {
  let ant = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const atual = [i];
    for (let j = 1; j <= b.length; j += 1) {
      atual[j] = Math.min(ant[j] + 1, atual[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    ant = atual;
  }
  return ant[b.length];
}

// 0..1: 1 - distância de edição / maior tamanho; 0 quando os tamanhos diferem em mais de 3.
export function semelhanca(a, b) {
  const x = String(a ?? "");
  const y = String(b ?? "");
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (Math.abs(x.length - y.length) > 3) return 0;
  return 1 - distancia(x, y) / Math.max(x.length, y.length);
}

// Semelhança de uma palavra, com bônus quando uma contém a outra (a menor com 4+ letras).
function palavraContraPalavra(p, q) {
  const s = semelhanca(p, q);
  const [curta, longa] = p.length <= q.length ? [p, q] : [q, p];
  if (curta.length >= 4 && longa.includes(curta)) return Math.max(s, 0.85);
  return s;
}

function pontuar(palavras, alvo) {
  if (!palavras.length || !alvo.length) return 0;
  let soma = 0;
  for (const p of palavras) soma += Math.max(0, ...alvo.map((q) => palavraContraPalavra(p, q)));
  return soma / palavras.length;
}

export function associar(texto, dados) {
  const vazio = { produtoId: null, pontuacao: 0, certeza: "nenhum", candidatos: [] };
  try {
    const palavras = prepararTexto(texto);
    if (!palavras.length) return vazio;
    const produtos = (dados && typeof dados === "object" ? listaDe(dados.produtos) : [])
      .filter((p) => p && typeof p === "object" && typeof p.id === "string" && p.id);
    const juntas = palavras.join(" ");
    const ranque = produtos.map((p) => {
      const nome = String(p.nome ?? "");
      const doNome = prepararTexto(nome);
      const exato = doNome.length > 0 && doNome.join(" ") === juntas;
      const pontuacao = exato ? 1 : pontuar(palavras, [...new Set([...doNome, ...prepararTexto(p.id)])]);
      return { id: p.id, nome, pontuacao };
    });
    ranque.sort((a, b) => (b.pontuacao - a.pontuacao) || normalizar(a.nome).localeCompare(normalizar(b.nome), "pt-BR") || a.id.localeCompare(b.id));
    const melhor = ranque[0];
    if (!melhor || melhor.pontuacao < MINIMO) return vazio;
    const segundo = ranque[1] ? ranque[1].pontuacao : 0;
    const candidatos = ranque.filter((r) => r.pontuacao >= MINIMO).slice(0, 3).map((r) => ({ id: r.id, nome: r.nome }));
    const certa = melhor.pontuacao >= LIMIAR - 1e-9 && melhor.pontuacao - segundo >= FOLGA - 1e-9;
    return { produtoId: certa ? melhor.id : null, pontuacao: melhor.pontuacao, certeza: certa ? "certa" : "confira", candidatos };
  } catch {
    return vazio;
  }
}

const limitar = (q) => Math.min(MAX_QTD, Math.max(1, Math.trunc(Number(q)) || 1));

// Junta linhas do mesmo produto (ou, sem produto, do mesmo texto), somando quantidades até 99.
export function consolidar(linhas) {
  const saida = [];
  const indice = new Map();
  for (const l of listaDe(linhas)) {
    if (!l || typeof l !== "object") continue;
    const chave = l.produtoId ? "p:" + l.produtoId : "t:" + normalizar(l.texto);
    if (indice.has(chave)) {
      const alvo = indice.get(chave);
      alvo.qtd = limitar(alvo.qtd + limitar(l.qtd));
    } else {
      const nova = { ...l, qtd: limitar(l.qtd) };
      indice.set(chave, nova);
      saida.push(nova);
    }
  }
  return saida;
}
