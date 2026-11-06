// Tela Lista de compras: montagem do DOM (a lógica pura está em lista.js e listas.js). Nenhuma função lança exceção.
// Tudo fica só no aparelho (localStorage); a única coisa que sai é a foto da lista por foto, enviada ao Google só para ser lida (rede em foto.js).
import { normalizar } from "./texto.js";
import { formatarPreco, centavosParaTexto } from "./inicio.js";
import { renderListaFoto } from "./lista_foto.js";
import {
  adicionar, remover, alterarQuantidade, alternarPego, removerExtra, limpar, centavos,
  buscarProdutos, itensDaLista, planoDeCompra, totaisPorMercado, ordenarItens,
} from "./lista.js";
import { renderHistorico, renderDetalhe, renderRevisao, calcularSugestoes, blocoSugestoes } from "./historico_tela.js";
import {
  MAX_LISTAS, MAX_NOME, NOME_MIGRADA, abrirListas, gravarListas, listaAtiva, trocarConteudoAtiva, estadoInicial,
  criarLista, renomearLista, mudarDataLista, apagarLista, ativar, hojeLocal,
} from "./listas.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const DURACAO_AVISO = 5000; // ms

const ehNumero = (n) => typeof n === "number" && Number.isFinite(n);

export function textoFaltam(n) {
  return n === 1 ? "falta 1 item" : `faltam ${n} itens`;
}

// "2026-11-05" -> "05/11/2026"
export function dataBr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export const textoNItens = (n) => (n === 0 ? "sem itens" : n === 1 ? "1 item" : `${n} itens`);
const totalItens = (l) => l.itens.length + l.extras.length;

// Aviso para a próxima tela (ex.: "Compra guardada." aparece na Lista depois de sair da revisão).
let avisoPendente = null;

// Aviso de baixo (.aviso-lista) com botão; acao opcional { rotulo, aoClicar } troca o "Ok".
function criarAvisos(el, deps) {
  const area = el("div", { className: "aviso-area" });
  area.setAttribute("role", "status");
  area.setAttribute("aria-live", "polite");
  const agendar = deps.setTimeout ?? globalThis.setTimeout;
  const cancelar = deps.clearTimeout ?? globalThis.clearTimeout;
  let relogio = null;
  function fechar() {
    if (relogio !== null) { try { cancelar(relogio); } catch {} relogio = null; }
    area.replaceChildren();
  }
  function avisar(texto, acao) {
    fechar();
    if (deps.ocultos && typeof deps.ocultos.fecharAviso === "function") deps.ocultos.fecharAviso();
    const b = el("button", { type: "button", textContent: acao ? acao.rotulo : "Ok" });
    b.addEventListener("click", () => { fechar(); if (acao && typeof acao.aoClicar === "function") acao.aoClicar(); });
    area.append(el("div", { className: "aviso-lista" }, el("span", { textContent: texto }), b));
    try { relogio = agendar(fechar, DURACAO_AVISO); } catch { relogio = null; }
  }
  return { area, avisar, fechar };
}

// deps: { document, storage (pode ser null), hojeIso?, setTimeout?, clearTimeout?, ocultos?, irPara?, offline?, agora? }
export function renderLista(raiz, ctx, deps) {
  const doc = deps.document;
  const storage = deps.storage;
  const hoje = () => (typeof deps.hojeIso === "string" && deps.hojeIso ? deps.hojeIso : hojeLocal());
  const el = (tag, props = {}, ...filhos) => {
    const e = doc.createElement(tag);
    Object.assign(e, props);
    e.append(...filhos);
    return e;
  };
  const foco = (e) => { try { if (e) e.focus(); } catch {} };
  const titulo = el("h1", { textContent: "Lista", tabIndex: -1 });
  const $foto = el("div", { className: "foto-area" });
  const irPara = typeof deps.irPara === "function" ? deps.irPara : (hash) => { try { deps.window.location.hash = hash; } catch {} };
  const sub = ctx.rota && ctx.estadoDados !== "atualize" ? ctx.rota.sub : undefined;

  const mostrarPendente = (avisar) => {
    const p = avisoPendente;
    avisoPendente = null;
    if (!p) return;
    avisar(p.texto, p.acao ? { rotulo: p.acao.rotulo, aoClicar: () => irPara(p.acao.hash) } : undefined);
  };

  // Alternador "Listas | Histórico" (a aba Lista continua sendo uma só)
  const alternador = (ativo) => {
    const b = (texto, chave, hash) => {
      const x = el("button", { type: "button", className: "filtro", textContent: texto });
      x.setAttribute("aria-pressed", ativo === chave ? "true" : "false");
      x.addEventListener("click", () => { if (ativo !== chave) irPara(hash); });
      return x;
    };
    return el("div", { className: "alterna" }, b("Listas", "listas", "#lista"), b("Histórico", "historico", "#lista/historico"));
  };

  // Histórico, revisão e detalhe só leem e gravam o aparelho; não dependem de o dados.json ter chegado.
  if (sub === "historico" || sub === "concluir" || sub === "compra") {
    const avisosSub = criarAvisos(el, deps);
    const api = {
      avisar: avisosSub.avisar,
      depois: (texto, acao) => { avisoPendente = { texto, acao }; },
      irPara,
    };
    if (sub === "historico") {
      raiz.append(titulo, alternador("historico"));
      renderHistorico(raiz, deps);
    } else if (sub === "concluir") {
      raiz.append(titulo);
      renderRevisao(raiz, ctx, deps, api);
    } else {
      raiz.append(titulo);
      renderDetalhe(raiz, ctx, deps, api, ctx.rota.id);
    }
    raiz.append(avisosSub.area);
    mostrarPendente(avisosSub.avisar);
    return;
  }

  if (ctx.estadoDados === "atualize") {
    raiz.append(titulo, el("div", { className: "cartao" }, el("p", { textContent: "Atualize o app para montar a lista." }), el("div", { className: "acoes" }, el("a", { className: "botao", href: "#mais", textContent: "Ir para Mais" }))));
    return;
  }
  if (ctx.estadoDados !== "ok" || !ctx.dados) {
    raiz.append(titulo, alternador("listas"), el("div", { className: "cartao" }, el("p", { textContent: "Ainda sem preços. Abra o app com internet uma vez." })), $foto);
    renderListaFoto($foto, ctx, deps, () => {});
    return;
  }
  const dados = ctx.dados;
  const aberta = storage ? abrirListas(storage, hoje()) : { estado: estadoInicial(hoje()), gravou: true };
  let estado = aberta.estado;
  let lista = conteudoDe(estado);
  let confirmando = false;

  function conteudoDe(e) {
    const a = listaAtiva(e);
    return { versao: 1, itens: a.itens, extras: a.extras };
  }

  const $aviso = el("p", { className: "aviso", role: "status", hidden: aberta.gravou, textContent: "Não consegui guardar a lista neste aparelho" });
  const $busca = el("input", { type: "search", className: "busca", placeholder: "Buscar produto para a lista", autocomplete: "off" });
  $busca.setAttribute("aria-label", "Buscar produto para a lista");
  const $seletor = el("div", { className: "lst-atual" });
  const $resultados = el("div", { className: "resultados-lista" });
  const $topo = el("div", { className: "topo-lista" });
  const $entrada = el("div", { className: "entrada-lista" });
  const $slot = el("div", { className: "foto-slot" });
  const $corpo = el("div", { className: "corpo-lista" });
  const $dialogos = el("div", { className: "dialogos-lista" });
  const vazia = () => !lista.itens.length && !lista.extras.length;
  let foto;
  const $resto = el("div", { className: "resto-lista" });

  // ---- mudanças ----
  // Edição do conteúdo da lista ativa (itens, extras): grava o conjunto todo.
  function mudar(novaLista) {
    estado = trocarConteudoAtiva(estado, novaLista);
    lista = conteudoDe(estado);
    confirmando = false;
    $aviso.hidden = storage ? gravarListas(storage, estado) : false;
    desenhar();
  }

  // Mudança no conjunto de listas (trocar, criar, renomear, data, apagar).
  function mudarEstado(novo) {
    estado = novo;
    lista = conteudoDe(estado);
    confirmando = false;
    abertoId = null;
    focarId = null;
    $busca.value = "";
    $aviso.hidden = storage ? gravarListas(storage, estado) : false;
    desenhar();
  }

  // ---- avisos de baixo ----
  const avisos = criarAvisos(el, deps);
  const $avisos = avisos.area;
  const avisar = avisos.avisar;

  function botaoPequeno(texto, rotulo, aoClicar) {
    const b = el("button", { type: "button", className: "mini", textContent: texto });
    b.setAttribute("aria-label", rotulo);
    b.addEventListener("click", aoClicar);
    return b;
  }

  // ---- diálogos (<dialog> + showModal: foco preso e Esc nativos) ----
  let contadorId = 0;
  let botaoSeletor = null;
  let botaoEditar = null;

  // montar(d, fechar) devolve o que recebe o foco; quem abriu volta a ter o foco ao fechar.
  function abrirDialogo(tituloDlg, montar, voltarFoco) {
    const d = el("dialog", { className: "dialogo" });
    contadorId += 1;
    const idTitulo = "dlg-lista-" + contadorId;
    d.setAttribute("aria-labelledby", idTitulo);
    const h = el("h2", { id: idTitulo, tabIndex: -1, textContent: tituloDlg });
    let feito = false;
    const fechar = () => {
      if (feito) return;
      feito = true;
      try { if (typeof d.close === "function") d.close(); } catch {}
      try { d.remove(); } catch {}
      foco(voltarFoco ? voltarFoco() : null);
    };
    d.addEventListener("cancel", (ev) => { try { ev.preventDefault(); } catch {} fechar(); });
    d.addEventListener("close", fechar);
    d.append(h);
    const primeiro = montar(d, fechar);
    $dialogos.append(d);
    try { if (typeof d.showModal === "function") d.showModal(); else d.open = true; } catch { d.open = true; }
    foco(primeiro || h);
    return d;
  }

  const botao = (texto, classe, aoClicar) => {
    const b = el("button", { type: "button", className: classe, textContent: texto });
    b.addEventListener("click", aoClicar);
    return b;
  };

  // Erro sem "!" no começo: rótulo "Atenção:" em negrito e sublinhado, nunca só a cor.
  const erroEl = (id, texto) => {
    const p = el("p", { id, className: "campo-erro lst-erro", role: "alert", hidden: texto === null });
    p.spanTexto = el("span", { textContent: " " + (texto ?? "") });
    p.append(el("strong", { className: "lst-erro-rotulo", textContent: "Atenção:" }), p.spanTexto);
    return p;
  };
  const mostrarErro = (p, texto) => {
    p.spanTexto.textContent = " " + texto;
    p.hidden = false;
  };

  function campoLista(prefixo, nome, data) {
    const idN = prefixo + "-nome";
    const idD = prefixo + "-data";
    const idE = prefixo + "-erro-nome";
    const idC = prefixo + "-conta";
    const idED = prefixo + "-erro-data";
    const rotN = el("label", { className: "campo", textContent: "Nome da lista" });
    rotN.setAttribute("for", idN);
    const inN = el("input", { id: idN, className: "campo-texto", type: "text", placeholder: "Ex.: Churrasco", value: nome, autocomplete: "off" });
    inN.setAttribute("maxlength", String(MAX_NOME));
    inN.setAttribute("aria-describedby", idC);
    const erN = erroEl(idE, null);
    const conta = el("p", { id: idC, className: "campo-ajuda lst-contador", textContent: `${nome.length} de ${MAX_NOME}` });
    inN.addEventListener("input", () => { conta.textContent = `${String(inN.value).length} de ${MAX_NOME}`; });
    const rotD = el("label", { className: "campo", textContent: "Data" });
    rotD.setAttribute("for", idD);
    const inD = el("input", { id: idD, className: "campo-texto", type: "date", value: data });
    const erD = erroEl(idED, null);
    const ajudaD = el("p", { className: "campo-ajuda", textContent: "Pode ser hoje ou um dia à frente." });
    const marcar = (campoEl, erro, idErro, texto) => {
      mostrarErro(erro, texto);
      campoEl.setAttribute("aria-invalid", "true");
      campoEl.setAttribute("aria-describedby", campoEl === inN ? idErro + " " + idC : idErro);
      foco(campoEl);
    };
    const limpa = () => {
      for (const [c, e] of [[inN, erN], [inD, erD]]) { e.hidden = true; c.setAttribute("aria-invalid", "false"); }
      inN.setAttribute("aria-describedby", idC);
    };
    return {
      inN, inD, ajudaD,
      nodes: [rotN, inN, erN, conta, rotD, inD, erD, ajudaD],
      limpa,
      erroNome: () => marcar(inN, erN, idE, "Digite um nome para a lista."),
      erroData: () => marcar(inD, erD, idED, "Escolha uma data válida."),
    };
  }

  function dialogoTrocar(disparador) {
    abrirDialogo("Suas listas", (d, fechar) => {
      const ul = el("ul", { className: "lst-opcoes" });
      for (const l of estado.listas) {
        const atual = l.id === estado.ativa;
        const b = el("button", { type: "button", className: "lst-opcao" });
        b.setAttribute("aria-current", atual ? "true" : "false");
        b.append(
          el("span", { className: "txt" }, el("span", { className: "nome", textContent: l.nome }), el("span", { className: "sub", textContent: `${dataBr(l.data)} · ${textoNItens(totalItens(l))}` })),
          el("span", { className: "marca" }, icone("ok")));
        b.addEventListener("click", () => {
          fechar();
          if (!atual) mudarEstado(ativar(estado, l.id));
          foco(botaoSeletor);
        });
        ul.append(el("li", {}, b));
      }
      const nova = botao("Nova lista", "botao", () => { fechar(); dialogoNova(); });
      d.append(ul, el("p", { className: "campo-ajuda", textContent: `${estado.listas.length} de ${MAX_LISTAS} listas.` }),
        el("div", { className: "acoes" }, nova, botao("Fechar", "botao sec", fechar)));
      return nova;
    }, () => botaoSeletor);
  }

  function dialogoNova() {
    abrirDialogo("Nova lista", (d, fechar) => {
      if (estado.listas.length >= MAX_LISTAS) {
        const p = erroEl("lst-limite", `Você já tem ${MAX_LISTAS} listas. Apague uma para criar outra.`);
        const ok = botao("Entendi", "botao", fechar);
        d.append(p, el("div", { className: "acoes" }, ok));
        return ok;
      }
      const c = campoLista("lst-nova", "", hoje());
      const criar = botao("Criar lista", "botao", () => {
        c.limpa();
        const r = criarLista(estado, c.inN.value, c.inD.value);
        if (r.resultado === "nome") return c.erroNome();
        if (r.resultado === "data") return c.erroData();
        if (r.resultado === "limite") { fechar(); return; }
        fechar();
        mudarEstado(r.estado);
        foco(botaoSeletor);
      });
      d.append(...c.nodes, el("div", { className: "acoes" }, criar, botao("Cancelar", "botao sec", fechar)));
      return c.inN;
    }, () => botaoSeletor);
  }

  function dialogoEditar() {
    const a = listaAtiva(estado);
    abrirDialogo("Editar lista", (d, fechar) => {
      const corpo = el("div", {});
      d.append(corpo);
      const formulario = () => {
        corpo.replaceChildren();
        const c = campoLista("lst-edita", a.nome, a.data);
        const guardar = botao("Guardar", "botao", () => {
          c.limpa();
          const r1 = renomearLista(estado, a.id, c.inN.value);
          if (r1.resultado === "nome") return c.erroNome();
          const r2 = mudarDataLista(r1.estado, a.id, c.inD.value);
          if (r2.resultado === "data") return c.erroData();
          fechar();
          mudarEstado(r2.estado);
          foco(botaoEditar);
        });
        const apagar = botao("Apagar esta lista", "link", () => confirmacao());
        corpo.append(...c.nodes, el("div", { className: "acoes" }, guardar, botao("Cancelar", "botao sec", fechar)), el("div", { className: "acoes" }, apagar));
        return c.inN;
      };
      const confirmacao = () => {
        corpo.replaceChildren();
        const n = totalItens(a);
        const aviso = n === 0 ? "A lista será apagada." : n === 1 ? "O item desta lista será apagado." : `Os ${n} itens desta lista serão apagados.`;
        const sim = botao("Sim, apagar", "botao", () => {
          const r = apagarLista(estado, a.id, hoje());
          fechar();
          mudarEstado(r.estado);
          avisar("Lista apagada.");
        });
        const caixa = el("div", { className: "lst-confirma" },
          el("p", { id: "lst-apagar-titulo", className: "confirma-titulo", textContent: "Apagar esta lista?" }),
          el("p", { textContent: aviso }),
          el("div", { className: "acoes" }, sim, botao("Cancelar", "botao sec", () => { foco(formulario()); })));
        caixa.setAttribute("role", "alertdialog");
        caixa.setAttribute("aria-labelledby", "lst-apagar-titulo");
        corpo.append(el("p", { className: "muted", textContent: `${a.nome} · ${dataBr(a.data)} · ${textoNItens(n)}` }), caixa);
        if (estado.listas.length === 1) corpo.append(el("p", { className: "campo-ajuda", textContent: `Se esta for a sua única lista, ela volta vazia, com o nome ${NOME_MIGRADA}.` }));
        foco(sim);
      };
      return formulario();
    }, () => botaoEditar);
  }

  function icone(nome) {
    const s = doc.createElementNS(SVG_NS, "svg");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("viewBox", "0 0 16 16");
    const p = doc.createElementNS(SVG_NS, "path");
    p.setAttribute("d", nome === "seta" ? "M3 6l5 5 5-5" : "M3 8.5l3.2 3.2L13 4.8");
    s.append(p);
    return s;
  }

  function desenharSeletor() {
    const a = listaAtiva(estado);
    $seletor.replaceChildren();
    botaoSeletor = el("button", { type: "button", className: "lst-seletor" },
      el("span", { className: "txt" }, el("span", { className: "nome", textContent: a.nome }), el("span", { className: "sub", textContent: `${dataBr(a.data)} · ${textoNItens(totalItens(a))}` })),
      el("span", { className: "seta" }, icone("seta")));
    botaoSeletor.setAttribute("aria-label", `Trocar de lista. Lista atual: ${a.nome}, ${dataBr(a.data)}`);
    botaoSeletor.addEventListener("click", () => dialogoTrocar());
    botaoEditar = botaoPequeno("Editar", `Editar a lista ${a.nome}`, () => dialogoEditar());
    $seletor.append(botaoSeletor, botaoEditar);
  }

  function desenharBusca() {
    $resultados.replaceChildren();
    const achados = buscarProdutos(dados, $busca.value);
    if (!normalizar($busca.value)) return;
    if (!achados.length) {
      $resultados.append(el("p", { className: "muted", textContent: "Nenhum produto encontrado." }));
      return;
    }
    for (const p of achados) {
      const nalista = lista.itens.some((i) => i.id === p.id);
      const linha = el("div", { className: "linha-busca" }, el("span", { className: "nome", textContent: String(p.nome ?? "") }));
      if (nalista) linha.append(el("span", { className: "muted", textContent: "na lista" }));
      else linha.append(botaoPequeno("Adicionar", "Adicionar " + String(p.nome ?? "") + " à lista", () => mudar(adicionar(lista, p.id))));
      $resultados.append(linha);
    }
  }

  // Um item aberto por vez (controles de quantidade); estado só em memória.
  let abertoId = null;
  let focarId = null;
  const botoesMeio = new Map();

  function botaoTirar(nome, aoClicar) {
    const b = el("button", { type: "button", className: "mini tirar", textContent: "×" });
    b.setAttribute("aria-label", "Tirar da lista: " + nome);
    b.addEventListener("click", aoClicar);
    return b;
  }

  function linhaItem(i) {
    const nome = i.nome ?? "Produto não está mais na lista do Radar";
    const o = i.oferta;
    const caixa = el("input", { type: "checkbox", className: "pego", checked: i.pego });
    caixa.setAttribute("aria-label", "Já peguei " + nome);
    caixa.addEventListener("change", () => mudar(alternarPego(lista, i.id)));
    const aberto = abertoId === i.id;
    const meio = el("button", { type: "button", className: "meio" },
      el("span", { className: "nome" + (i.pego ? " pego" : ""), textContent: nome }),
      el("span", { className: "sub", textContent: `${i.qtd}` + (o && o.mercado ? " · " + String(o.mercado) : "") }));
    botoesMeio.set(i.id, meio);
    meio.setAttribute("aria-expanded", aberto ? "true" : "false");
    meio.addEventListener("click", () => {
      abertoId = abertoId === i.id ? null : i.id;
      focarId = i.id;
      desenhar();
    });
    const principal = el("div", { className: "item-l" + (i.pego ? " pego-l" : "") },
      el("span", { className: "caixa" }, caixa), meio,
      el("span", { className: "p", textContent: o ? centavosParaTexto(centavos(o.preco) * i.qtd) : "" }),
      botaoTirar(nome, () => mudar(remover(lista, i.id))));
    const linha = el("div", { className: "item-bloco" }, principal);
    if (o && ehNumero(o.preco_condicional)) {
      linha.append(el("p", { className: "sub cond", textContent: "com condição: " + formatarPreco(o.preco_condicional) + (o.condicao ? " (" + String(o.condicao) + ")" : "") }));
    }
    if (aberto) {
      linha.append(el("div", { className: "qtd qtd-aberta" },
        botaoPequeno("−", "Diminuir quantidade de " + nome, () => { focarId = i.id; mudar(alterarQuantidade(lista, i.id, i.qtd - 1)); }),
        el("span", { className: "qtd-valor", textContent: String(i.qtd) }),
        botaoPequeno("+", "Aumentar quantidade de " + nome, () => { focarId = i.id; mudar(alterarQuantidade(lista, i.id, i.qtd + 1)); })));
    }
    return linha;
  }

  // Concluir compra: leva à revisão; desligado com a lista vazia
  function blocoConcluir() {
    const vz = vazia();
    const b = botao("Concluir compra", "botao", () => irPara("#lista/concluir"));
    b.disabled = vz;
    const bloco = el("div", { className: "lst-rodape" }, b);
    if (vz) bloco.append(el("p", { className: "campo-ajuda", textContent: "Coloque itens na lista para concluir a compra." }));
    return bloco;
  }

  // Você costuma comprar (#194-3): depois de um "Adicionar" a linha fica ("Adicionado") até a próxima tela; nada entra sozinho.
  let sugestoes = [];
  let adicionados = new Set();
  let manterSug = false;
  let focarSug = null;
  function blocoSug() {
    if (manterSug) manterSug = false;
    else { sugestoes = calcularSugestoes(deps, lista, dados, hoje()); adicionados = new Set(); }
    const b = blocoSugestoes(deps, sugestoes, adicionados, (id, qtd) => {
      adicionados.add(id);
      manterSug = true;
      focarSug = id;
      mudar(alterarQuantidade(adicionar(lista, id), id, qtd));
    });
    if (b && focarSug !== null) {
      const alvo = b.botoes.get(focarSug);
      focarSug = null;
      if (alvo) { try { alvo.focus(); } catch {} }
    }
    return b;
  }

  function desenhar() {
    desenharSeletor();
    desenharBusca();
    $topo.replaceChildren();
    $entrada.replaceChildren();
    $corpo.replaceChildren();
    botoesMeio.clear();
    if (vazia()) {
      $entrada.append(el("div", { className: "cartao vazio" },
        el("p", { className: "vazio-titulo", textContent: "Esta lista está vazia" }),
        el("p", { className: "muted", textContent: "Busque um produto abaixo ou toque no + de uma oferta para colocar aqui." }),
        $busca, $slot));
      const sugVazia = blocoSug();
      if (sugVazia) $corpo.append(sugVazia);
      $corpo.append(blocoConcluir());
      if (foto) foto.redesenhar();
      return;
    }
    $entrada.append(el("div", { className: "linha-entrada" }, $busca, $slot));
    if (foto) foto.redesenhar();
    const todos = itensDaLista(dados, lista);
    const comOferta = todos.filter((i) => i.oferta);

    const plano = planoDeCompra(dados, lista);
    if (plano.grupos.length) {
      const bloco = el("div", { className: "cartao resultado" },
        el("p", { className: "muted", textContent: "Total estimado" }),
        el("p", { className: "total", textContent: centavosParaTexto(plano.totalCent) }));
      for (const g of plano.grupos) {
        bloco.append(el("p", { textContent: `${g.mercado}: ${g.itens.map((x) => (x.qtd > 1 ? `${x.qtd}× ` : "") + x.nome).join(", ")} · ${centavosParaTexto(g.subtotalCent)}` }));
      }
      const totais = totaisPorMercado(dados, lista);
      if (totais.length) {
        const comparar = el("details", { className: "comparar" }, el("summary", { className: "resumo", textContent: "Comparar com um mercado só" }));
        for (const t of totais) {
          comparar.append(el("p", { textContent: `${t.mercado}: ${centavosParaTexto(t.totalCent)}` + (t.faltam ? ` (${textoFaltam(t.faltam)})` : "") }));
        }
        bloco.append(comparar);
      }
      $topo.append(bloco);
    }
    if (comOferta.length) {
      const cartaoItens = el("div", { className: "cartao itens-lista" });
      for (const i of ordenarItens(comOferta)) cartaoItens.append(linhaItem(i));
      $corpo.append(cartaoItens);
    }
    const sem = todos.filter((i) => !i.oferta);
    if (sem.length || lista.extras.length) {
      const bloco = el("details", { className: "cartao sem-lista" }, el("summary", { className: "resumo", textContent: `Sem preço agora (${sem.length + lista.extras.length})` }));
      for (const i of sem) {
        const nome = i.nome ?? "Produto não está mais na lista do Radar";
        bloco.append(el("div", { className: "linha-busca" }, el("span", { className: "nome" }, nome, el("span", { className: "extra-texto", textContent: `Sem preço agora · ${i.qtd} un` })), botaoTirar(nome, () => mudar(remover(lista, i.id)))));
      }
      for (const x of lista.extras) {
        bloco.append(el("div", { className: "linha-busca" }, el("span", { className: "nome" }, x.texto, el("span", { className: "extra-texto", textContent: `Não está no Radar · ${x.qtd} un` })), botaoTirar(x.texto, () => mudar(removerExtra(lista, x.texto)))));
      }
      $corpo.append(bloco);
    }
    // "Limpar lista" esvazia só a lista ativa
    const limparBtn = el("button", { type: "button", className: "link", textContent: confirmando ? "Limpar esta lista?" : "Limpar lista" });
    limparBtn.addEventListener("click", () => {
      if (!confirmando) { confirmando = true; desenhar(); return; }
      mudar(limpar());
    });
    const sug = blocoSug();
    if (sug) $corpo.append(sug);
    $corpo.append(blocoConcluir(), el("div", { className: "lst-rodape" }, limparBtn));
    if (focarId !== null) {
      const alvo = botoesMeio.get(focarId);
      focarId = null;
      if (alvo) alvo.focus();
    }
  }

  $busca.addEventListener("input", desenharBusca);
  $resto.append($aviso, $seletor, $topo, $entrada, $resultados, $corpo);
  raiz.append(titulo, alternador("listas"), $foto, $resto, $dialogos, $avisos);
  foto = renderListaFoto($foto, ctx, { ...deps, titulo, slotBotao: $slot, modoBotao: () => (vazia() ? "texto" : "icone"), obterLista: () => lista, alternarResto: (escondido) => { $resto.hidden = escondido; } }, mudar);
  desenhar();
  mostrarPendente(avisar);
}
