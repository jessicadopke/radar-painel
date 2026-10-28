import { newerThan } from "./versao.js";
import { carregarDados } from "./dados.js";
import { renderHoje } from "./hoje.js";
import { renderLista } from "./lista.js";
import { atualizarChip } from "./frescor.js";
import { renderMais } from "./mais.js";
import { renderProduto } from "./produto.js";
import { rota } from "./rotas.js";
import { renderInicio, lerVisitaAnterior, gravarVisita } from "./inicio.js";

const VERSION = "0.12.1";
const PREFIXO_CACHE = "radar-";

const $tela = document.getElementById("tela");
const $atualizado = document.getElementById("atualizado");
const $avisoVelho = document.getElementById("aviso-velho");

let dados = null;
let estadoDados = "sem-dados";
let eventoInstalar = null;
let registro = null;
// visita anterior lida uma vez ao abrir; só é gravada ao sair (assim os "Novo" não somem na sessão)
const storage = (() => { try { return window.localStorage; } catch { return null; } })();
const visitaAnterior = storage ? lerVisitaAnterior(storage) : null;

// Pontos de entrada das telas: #13 a #16 só substituem estas funções (raiz, contexto).
export const telas = {
  inicio: telaInicio,
  produtos: telaProdutos,
  lista: telaLista,
  mais: telaMais,
  produto: telaProduto,
};

// ---- roteador (hash): a função rota() fica em rotas.js ----
function mostrar() {
  const r = rota(location.hash);
  $tela.replaceChildren();
  if (r.tela === "produto") window.scrollTo(0, 0);
  telas[r.tela]($tela, { dados, estadoDados, rota: r });
  document.querySelectorAll(".abas button").forEach((b) => {
    if (b.dataset.tela === r.aba) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
}

document.querySelectorAll(".abas button").forEach((b) => {
  b.addEventListener("click", () => {
    if (location.hash === "#" + b.dataset.tela) mostrar();
    else location.hash = b.dataset.tela;
  });
});
window.addEventListener("hashchange", mostrar);

// ---- dados ----
function cabecalho() {
  conferirFrescor();
}

// Chip do topo: usa a hora de agora do aparelho, também sem internet (última cópia).
// A faixa cheia fica só para "app velho" (o dados.json é de um formato que este app não lê).
function conferirFrescor() {
  const dadosOk = estadoDados === "ok" ? dados : null;
  if (estadoDados === "atualize") {
    $atualizado.hidden = true;
    $avisoVelho.textContent = "Há uma versão nova. Toque em Mais, depois em Buscar.";
    $avisoVelho.hidden = false;
    return;
  }
  $atualizado.hidden = false;
  $avisoVelho.hidden = true;
  atualizarChip($atualizado, dadosOk, { agora: new Date(), offline: navigator.onLine === false });
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") conferirFrescor(); });
window.addEventListener("online", conferirFrescor);
window.addEventListener("offline", conferirFrescor);
setInterval(conferirFrescor, 10 * 60 * 1000);

async function iniciarDados() {
  const r = await carregarDados();
  dados = r.dados;
  estadoDados = r.estado;
  cabecalho();
  mostrar();
}

// ---- atualização do app ----
export async function checkUpdate() {
  try {
    const resp = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
    if (!resp.ok) return { erro: true };
    const { version } = await resp.json();
    return { erro: false, version, nova: newerThan(version, VERSION) };
  } catch {
    return { erro: true };
  }
}

export async function applyUpdate() {
  try {
    if (registro) await registro.update();
    // só os caches do programa; o que a pessoa guardou (localStorage) não é tocado
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((n) => n.startsWith(PREFIXO_CACHE)).map((n) => caches.delete(n)));
  } catch {}
  location.reload();
}

function hojeIso() {
  const d = new Date();
  const dois = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

function telaInicio(raiz, ctx) {
  renderInicio(raiz, ctx, { document, visitaAnterior, hojeIso: hojeIso(), linkProduto: Boolean(telas.produto), storage });
}

// filtros da tela Produtos: só em memória (sobrevivem à troca de aba, somem ao reabrir o app)
const filtrosProdutos = { busca: "", categoria: "", mercado: "" };
function telaProdutos(raiz, ctx) {
  renderHoje(raiz, ctx, { document, filtros: filtrosProdutos, linkProduto: Boolean(telas.produto) });
}

// Rede e câmera da lista por foto entram aqui; lista.js e lista_foto.js nunca chamam o fetch direto.
const gemini = {
  buscar: (url, init) => fetch(url, init),
  criarBitmap: typeof createImageBitmap === "function" ? (arquivo, opcoes) => createImageBitmap(arquivo, opcoes) : null,
  online: () => navigator.onLine !== false,
  hoje: () => new Date(),
};

function telaLista(raiz, ctx) {
  renderLista(raiz, ctx, { document, storage, window, gemini });
}

function telaProduto(raiz, ctx) {
  renderProduto(raiz, ctx, { document });
}

function guardarVisita() {
  if (storage && estadoDados === "ok" && dados) gravarVisita(storage, dados.gerado_em);
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") guardarVisita(); });
window.addEventListener("pagehide", guardarVisita);

function telaMais(raiz, ctx) {
  renderMais(raiz, ctx, {
    document, storage, VERSION, checkUpdate, applyUpdate, gemini, agora: new Date(),
    buscar: (url, init) => fetch(url, init),
    eventoInstalar: () => eventoInstalar,
    aoInstalar: () => { eventoInstalar = null; },
  });
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  eventoInstalar = e;
  if (rota(location.hash).tela === "mais") mostrar();
});

// ---- início ----
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").then((r) => { registro = r; }).catch(() => {});
}
mostrar();
iniciarDados();
