// Ocultar produto (#187): o que as telas chamam (ocultar, desfazer, voltar a mostrar), o aviso com "Desfazer" e a janela
// de 8 s da tela Produto. A lógica de guardar fica em ocultos.js; aqui só orquestra. Nenhuma função lança exceção.
// deps: { document, storage, area (nó fixo do aviso, criado em app.js), redesenhar({ manterRolagem }), irPara(hash),
//         voltarOrigem(), hojeIso(), setTimeout/clearTimeout/setInterval/clearInterval (opcionais, para o teste) }
import { lerOcultos, gravarOcultos, ocultar as ocultarEm, mostrar as mostrarEm, mostrarTodos as mostrarTodosEm, estaOculto } from "./ocultos.js";
import { lerLista, gravarLista, remover, estaNaLista } from "./lista.js";

export const DURACAO_AVISO = 8000; // ms
export const SEGUNDOS_JANELA = 8;

export function criarControle(deps) {
  const doc = deps.document;
  const storage = deps.storage ?? null;
  const area = deps.area;
  const agendar = deps.setTimeout ?? globalThis.setTimeout;
  const cancelar = deps.clearTimeout ?? globalThis.clearTimeout;
  const repetir = deps.setInterval ?? globalThis.setInterval;
  const parar = deps.clearInterval ?? globalThis.clearInterval;
  const redesenhar = (manter = true) => { try { if (typeof deps.redesenhar === "function") deps.redesenhar({ manterRolagem: manter }); } catch {} };
  const el = (tag, props = {}, ...filhos) => {
    const e = doc.createElement(tag);
    Object.assign(e, props);
    e.append(...filhos);
    return e;
  };

  // ---- aviso (8 s; não some enquanto houver foco ou toque nele) ----
  let relogio = null;
  let aberto = false;
  let preso = false;
  const soltarRelogio = () => { if (relogio !== null) { try { cancelar(relogio); } catch {} relogio = null; } };
  function fecharAviso() {
    soltarRelogio();
    aberto = false;
    preso = false;
    if (area) area.replaceChildren();
  }
  function armar() {
    soltarRelogio();
    try { relogio = agendar(fecharAviso, DURACAO_AVISO); } catch { relogio = null; }
  }
  if (area && typeof area.addEventListener === "function") {
    const prender = () => { if (aberto) { preso = true; soltarRelogio(); } };
    const largar = () => { if (aberto && preso) { preso = false; armar(); } };
    for (const t of ["focusin", "pointerdown", "touchstart"]) area.addEventListener(t, prender);
    for (const t of ["focusout", "pointerup", "pointercancel", "touchend"]) area.addEventListener(t, largar);
  }
  function avisar(texto, desfazer) {
    fecharAviso();
    if (!area) return;
    const caixa = el("div", { className: "aviso-lista" }, el("span", { textContent: texto }));
    if (desfazer) {
      const b = el("button", { type: "button", textContent: "Desfazer" });
      b.addEventListener("click", () => { fecharAviso(); desfazer(); });
      caixa.append(b);
    }
    area.append(caixa);
    aberto = true;
    armar();
  }

  // ---- janela de 8 s da tela Produto ----
  let janela = null; // { id, naLista, item, pos, restante, timer }
  let aoContar = null;
  function cancelarJanela() {
    if (janela && janela.timer !== null) { try { parar(janela.timer); } catch {} }
    janela = null;
  }
  function iniciarJanela(id, item, pos) {
    cancelarJanela();
    const j = { id, naLista: Boolean(item), item, pos, restante: SEGUNDOS_JANELA, timer: null };
    janela = j;
    try {
      j.timer = repetir(() => {
        if (janela !== j) return;
        j.restante -= 1;
        try { if (aoContar) aoContar(j.restante); } catch {}
        if (j.restante <= 0) { cancelarJanela(); try { if (typeof deps.voltarOrigem === "function") deps.voltarOrigem(); } catch {} }
      }, 1000);
    } catch { j.timer = null; }
  }

  // ---- a lista de compras acompanha o produto ----
  function tirarDaLista(id) {
    if (!storage) return { item: null, pos: -1 };
    const lista = lerLista(storage);
    const pos = lista.itens.findIndex((i) => i.id === id);
    if (pos < 0) return { item: null, pos: -1 };
    const item = lista.itens[pos];
    gravarLista(storage, remover(lista, id));
    return { item, pos };
  }
  function devolverALista(item, pos) {
    if (!storage || !item) return;
    const lista = lerLista(storage);
    if (estaNaLista(lista, item.id)) return;
    const itens = [...lista.itens];
    itens.splice(Math.min(Math.max(pos, 0), itens.length), 0, item);
    gravarLista(storage, { ...lista, itens });
  }

  // Guarda o oculto (e tira o item da lista). { ok, item, pos } ou { ok: false } com o aviso já dado.
  function guardarOculto(id, nome) {
    const idTexto = String(id);
    const r = ocultarEm(lerOcultos(storage), { id: idTexto, nome }, typeof deps.hojeIso === "function" ? deps.hojeIso() : "");
    if (r.resultado === "ja") return { ok: false };
    if (r.resultado === "limite") { avisar("Limite de produtos ocultos"); return { ok: false }; }
    if (!gravarOcultos(storage, r.estado)) { avisar("Não deu para guardar neste aparelho"); return { ok: false }; }
    return { ok: true, ...tirarDaLista(idTexto) };
  }
  function tirarDosOcultos(id) {
    if (!gravarOcultos(storage, mostrarEm(lerOcultos(storage), id))) { avisar("Não deu para guardar neste aparelho"); return false; }
    return true;
  }

  return {
    estaOculto: (id) => estaOculto(lerOcultos(storage), id),
    contar: () => lerOcultos(storage).itens.length,
    fecharAviso,

    // Gesto no cartão (Ofertas e Produtos): some o produto, aviso com Desfazer.
    ocultarDoCartao(id, nome) {
      const r = guardarOculto(id, nome);
      if (!r.ok) return;
      redesenhar(true);
      avisar(r.item ? "Produto oculto e tirado da lista" : "Produto oculto", () => {
        if (!tirarDosOcultos(id)) return;
        devolverALista(r.item, r.pos);
        redesenhar(true);
      });
    },

    // Botão na tela Produto: a tela fica 8 s como "Produto oculto" e volta sozinha; sem aviso por cima.
    ocultarNaTela(id, nome) {
      const r = guardarOculto(id, nome);
      if (!r.ok) return;
      fecharAviso();
      iniciarJanela(String(id), r.item, r.pos);
      redesenhar(true);
    },

    // "Voltar a mostrar" (faixa do produto, Mais) e "Esquecer". Dentro da janela da tela Produto funciona como Desfazer.
    mostrar(id) {
      if (!tirarDosOcultos(id)) return;
      if (janela && janela.id === String(id)) { devolverALista(janela.item, janela.pos); cancelarJanela(); }
      redesenhar(true);
    },
    mostrarTodos() {
      if (!gravarOcultos(storage, mostrarTodosEm(lerOcultos(storage)))) { avisar("Não deu para guardar neste aparelho"); return; }
      cancelarJanela();
      redesenhar(true);
    },

    // A tela Produto pergunta: { naLista, restante } enquanto a janela de 8 s do produto estiver aberta, senão null.
    janelaDe: (id) => (janela && janela.id === String(id) ? { naLista: janela.naLista, restante: janela.restante } : null),
    aoContar(f) { aoContar = typeof f === "function" ? f : null; },
    // Sair da tela Produto antes dos 8 s cancela o contador (o produto continua oculto).
    aoMudarRota(rota) {
      if (janela && !(rota && rota.tela === "produto" && String(rota.id) === janela.id)) cancelarJanela();
      if (!rota || rota.tela !== "produto") aoContar = null;
    },
    irPara: (hash) => { try { if (typeof deps.irPara === "function") deps.irPara(hash); } catch {} },
  };
}
