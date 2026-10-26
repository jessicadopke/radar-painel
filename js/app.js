import { newerThan } from "./versao.js";
import { carregarDados, formatarGeradoEm } from "./dados.js";
import { renderHoje } from "./hoje.js";
import { renderLista } from "./lista.js";
import { atualizarAviso } from "./frescor.js";
import { renderColeta } from "./coleta.js";
import { renderProduto } from "./produto.js";
import { EXPLICACAO, NOME_TEMA, lerTema, gravarTema, proximoTema, lerChangelog } from "./sobre.js";
import { renderInicio, lerVisitaAnterior, gravarVisita } from "./inicio.js";

const VERSION = "0.9.0";
const PREFIXO_CACHE = "radar-";

const $tela = document.getElementById("tela");
const $atualizado = document.getElementById("atualizado");
const $avisoVelho = document.getElementById("aviso-velho");
const ABAS = ["inicio", "hoje", "lista", "coleta", "sobre"];

let dados = null;
let estadoDados = "sem-dados";
let eventoInstalar = null;
let registro = null;
// visita anterior lida uma vez ao abrir; só é gravada ao sair (assim os "Novo" não somem na sessão)
const storage = (() => { try { return window.localStorage; } catch { return null; } })();
const visitaAnterior = storage ? lerVisitaAnterior(storage) : null;

function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...filhos);
  return e;
}

// Pontos de entrada das telas: #13 a #16 só substituem estas funções (raiz, contexto).
export const telas = {
  inicio: telaInicio,
  hoje: telaHoje,
  lista: telaLista,
  coleta: telaColeta,
  sobre: telaSobre,
  produto: telaProduto,
};

// ---- roteador (hash) ----
function decodificar(t) {
  try { return decodeURIComponent(t); } catch { return t; }
}

export function rota(hash) {
  const h = String(hash || "").replace(/^#/, "");
  const [nome, ...resto] = h.split("/");
  if (nome === "produto") {
    return telas.produto && resto[0] ? { tela: "produto", aba: "hoje", id: decodificar(resto[0]) } : { tela: "hoje", aba: "hoje" };
  }
  return ABAS.includes(nome) ? { tela: nome, aba: nome } : { tela: "inicio", aba: "inicio" };
}

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
  if (estadoDados === "atualize") $atualizado.textContent = "Atualize o app para ler os dados.";
  else if (estadoDados === "ok" && dados) $atualizado.textContent = "Dados de " + formatarGeradoEm(dados.gerado_em);
  else $atualizado.textContent = "Ainda sem dados";
  conferirFrescor();
}

// Aviso de mais de 26 h sem coleta: usa a hora de agora do aparelho, também sem internet (última cópia).
function conferirFrescor() {
  const dadosOk = estadoDados === "ok" ? dados : null;
  atualizarAviso($avisoVelho, dadosOk, { agora: new Date(), offline: navigator.onLine === false });
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
  renderInicio(raiz, ctx, { document, visitaAnterior, hojeIso: hojeIso(), linkProduto: Boolean(telas.produto) });
}

// filtros da tela Hoje: só em memória (sobrevivem à troca de aba, somem ao reabrir o app)
const filtrosHoje = { busca: "", categoria: "", mercado: "" };
function telaHoje(raiz, ctx) {
  renderHoje(raiz, ctx, { document, filtros: filtrosHoje, linkProduto: Boolean(telas.produto) });
}

function telaLista(raiz, ctx) {
  renderLista(raiz, ctx, { document, storage });
}

function telaColeta(raiz, ctx) {
  renderColeta(raiz, ctx, { document });
}

function telaProduto(raiz, ctx) {
  renderProduto(raiz, ctx, { document });
}

function guardarVisita() {
  if (storage && estadoDados === "ok" && dados) gravarVisita(storage, dados.gerado_em);
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") guardarVisita(); });
window.addEventListener("pagehide", guardarVisita);

function telaSobre(raiz) {
  const msg = el("p", { className: "muted", textContent: "", role: "status" });
  const buscar = el("button", { type: "button", className: "botao", textContent: "Buscar atualização" });
  const instalar = el("button", { type: "button", className: "botao sec", textContent: "Instalar", hidden: !eventoInstalar });
  buscar.addEventListener("click", async () => {
    msg.textContent = "Buscando…";
    const r = await checkUpdate();
    if (r.erro) msg.textContent = "Não consegui verificar agora. Tente de novo com internet.";
    else if (r.nova) {
      msg.textContent = `A versão ${r.version} está disponível.`;
      const ir = el("button", { type: "button", className: "botao", textContent: "Atualizar" });
      ir.addEventListener("click", applyUpdate);
      buscar.after(ir);
    } else msg.textContent = `Você está na versão atual (${VERSION}).`;
  });
  instalar.addEventListener("click", async () => {
    if (!eventoInstalar) return;
    eventoInstalar.prompt();
    await eventoInstalar.userChoice;
    eventoInstalar = null;
    instalar.hidden = true;
  });
  const tema = el("button", { type: "button", className: "botao sec" });
  const mostrarTema = () => { tema.textContent = "Tema: " + NOME_TEMA[lerTema(storage)]; };
  tema.addEventListener("click", () => {
    const t = gravarTema(storage, proximoTema(lerTema(storage)));
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    mostrarTema();
  });
  mostrarTema();
  const novidades = el("div", { className: "cartao" }, el("h3", { textContent: "Novidades" }), el("p", { className: "muted", textContent: "Carregando…" }));
  carregarNovidades(novidades);
  raiz.append(
    el("h2", { textContent: "Sobre o app" }),
    el("div", { className: "cartao" },
      el("p", { textContent: "Radar — ofertas dos mercados de Palmas." }),
      el("p", { className: "muted", textContent: "Versão " + VERSION }),
      msg,
      el("div", { className: "acoes" }, buscar, instalar, tema)),
    el("div", { className: "cartao" },
      el("h3", { textContent: "Como funciona" }),
      ...EXPLICACAO.map((t) => el("p", { textContent: t }))),
    novidades,
  );
}

async function carregarNovidades(caixa) {
  const p = caixa.querySelector("p");
  try {
    const resp = await fetch("CHANGELOG.md", { cache: "no-cache" });
    if (!resp.ok) throw new Error("http");
    const versoes = lerChangelog(await resp.text()).slice(0, 5);
    if (!versoes.length) throw new Error("vazio");
    p.remove();
    for (const v of versoes) {
      caixa.append(el("h4", { textContent: "Versão " + v.versao }), el("ul", {}, ...v.itens.map((i) => el("li", { textContent: i }))));
    }
  } catch {
    p.textContent = "Não consegui carregar as novidades agora.";
  }
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  eventoInstalar = e;
  if (rota(location.hash).tela === "sobre") mostrar();
});

// ---- início ----
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").then((r) => { registro = r; }).catch(() => {});
}
mostrar();
iniciarDados();
