// Telas do histórico de compras (#194-2): revisão "Concluir compra", Histórico e detalhe da compra. Montagem do DOM
// (a lógica pura está em historico.js). Nenhuma função lança exceção. Tudo fica só no aparelho (localStorage).
import { centavosParaTexto } from "./inicio.js";
import { situacaoFrescor } from "./frescor.js";
import { abrirListas, gravarListas, listaAtiva, hojeLocal, MAX_LISTAS, limitarQtd } from "./listas.js";
import {
  MAX_COMPRAS, lerCompras, gravarCompras, mercadosDe, prepararConclusao, precoNoMercado, lerPrecoDigitado,
  registrarCompra, resumoCompra, ordenar, apagarCompra, refazerLista, sugerir,
} from "./historico.js";

const dataBr = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};
const nItens = (n) => (n === 1 ? "1 item" : `${n} itens`);
const semPrecoTxt = (n) => (n === 1 ? "1 item sem preço" : `${n} itens sem preço`);
const reais = (c) => centavosParaTexto(c);
// 450 -> "4,50" (campo de preço, sem o R$)
const paraCampo = (c) => (Number.isInteger(c) ? (c / 100).toFixed(2).replace(".", ",") : "");

// api: { avisar(texto, acao?), depois(texto, acao?) (aviso para a próxima tela), irPara(hash) }
function criarEl(doc) {
  return (tag, props = {}, ...filhos) => {
    const e = doc.createElement(tag);
    Object.assign(e, props);
    e.append(...filhos);
    return e;
  };
}

function botaoDe(el, texto, classe, aoClicar) {
  const b = el("button", { type: "button", className: classe, textContent: texto });
  b.addEventListener("click", aoClicar);
  return b;
}

const erroEl = (el, id) => {
  const p = el("p", { id, className: "campo-erro lst-erro", role: "alert", hidden: true });
  p.spanTexto = el("span", { textContent: "" });
  p.append(el("strong", { className: "lst-erro-rotulo", textContent: "Atenção:" }), p.spanTexto);
  return p;
};
const mostrarErro = (p, texto) => { p.spanTexto.textContent = " " + texto; p.hidden = false; };

const foco = (e) => { try { if (e) e.focus(); } catch {} };
const alvoVoltar = (el, texto, hash) => el("a", { className: "voltar", href: hash, textContent: "← " + texto });

// ---- Sugestões: "Você costuma comprar" (#194-3) ----
// Mostra as sugestões já calculadas (sugestoes) para a lista ativa; o toque só chama aoAdicionar(id, qtd), nada entra sozinho.
// adicionados: ids que acabaram de entrar (botão "Adicionado", desligado). Sem sugestões, devolve null (o cartão não existe).
export function calcularSugestoes(deps, lista, dados, hoje) {
  const { compras } = lerCompras(deps.storage);
  return sugerir({ compras }, lista, dados, hoje);
}

export function blocoSugestoes(deps, sugestoes, adicionados, aoAdicionar) {
  if (!Array.isArray(sugestoes) || !sugestoes.length) return null;
  const el = criarEl(deps.document);
  const bloco = el("div", { className: "cartao sug-bloco" },
    el("h3", { textContent: "Você costuma comprar" }),
    el("p", { className: "muted", textContent: "Produtos que você comprou 3 vezes ou mais nos últimos 90 dias." }));
  const botoes = new Map();
  for (const s of sugestoes) {
    const ja = adicionados.has(s.id);
    const b = el("button", { type: "button", className: "mini", textContent: ja ? "Adicionado" : "Adicionar", disabled: ja });
    b.setAttribute("aria-label", ja ? `${s.nome} já foi adicionado à lista` : `Adicionar ${s.nome} à lista`);
    b.addEventListener("click", () => aoAdicionar(s.id, s.qtd));
    botoes.set(s.id, b);
    bloco.append(el("div", { className: "sug-linha" },
      el("span", { className: "sug-texto" },
        el("strong", { className: "sug-nome", textContent: s.nome }),
        el("span", { className: "sub", textContent: `Comprou ${s.compras} vezes · leva ${s.qtd} por compra` })),
      b));
  }
  bloco.botoes = botoes;
  return bloco;
}

// ---- Histórico (lista de compras) ----
export function renderHistorico(raiz, deps) {
  const el = criarEl(deps.document);
  const { compras } = lerCompras(deps.storage);
  if (!compras.length) {
    raiz.append(el("div", { className: "cartao vazio" },
      el("p", { className: "vazio-titulo", textContent: "Nenhuma compra guardada ainda" }),
      el("p", { className: "muted", textContent: "Quando terminar as compras, toque em Concluir compra na sua lista. A compra fica guardada aqui, só neste aparelho." }),
      el("div", { className: "acoes" }, el("a", { className: "botao", href: "#lista", textContent: "Ir para a lista" }))));
    return;
  }
  for (const c of ordenar(compras)) {
    const r = resumoCompra(c);
    const tot = el("span", { className: "tot" }, r.itens === r.semPreco ? el("span", { className: "muted", textContent: "sem preço" }) : el("span", { textContent: reais(r.totalCent) }));
    if (r.semPreco > 0 && r.semPreco < r.itens) tot.append(el("small", { textContent: semPrecoTxt(r.semPreco) }));
    raiz.append(el("a", { className: "hist-compra", href: "#lista/compra/" + encodeURIComponent(c.id) },
      el("span", { className: "meio" }, el("span", { className: "data", textContent: dataBr(c.data) }), el("span", { className: "sub", textContent: `${c.lista_nome} · ${nItens(r.itens)}` })),
      tot));
  }
  if (compras.length >= MAX_COMPRAS) raiz.append(el("p", { className: "muted hist-limite", textContent: `Guardamos as últimas ${MAX_COMPRAS} compras.` }));
}

// ---- Detalhe de uma compra ----
export function renderDetalhe(raiz, ctx, deps, api, id) {
  const el = criarEl(deps.document);
  const hoje = () => (typeof deps.hojeIso === "string" && deps.hojeIso ? deps.hojeIso : hojeLocal());
  const compra = lerCompras(deps.storage).compras.find((c) => c.id === id);
  raiz.append(alvoVoltar(el, "Voltar para o Histórico", "#lista/historico"));
  if (!compra) {
    raiz.append(el("div", { className: "cartao vazio" }, el("p", { className: "vazio-titulo", textContent: "Não achei esta compra" }), el("p", { className: "muted", textContent: "Ela pode ter sido apagada." })));
    return;
  }
  const r = resumoCompra(compra);
  const cab = el("div", { className: "hist-det-cab" },
    el("h2", { textContent: compra.lista_nome, tabIndex: -1 }),
    el("p", { className: "muted", textContent: `Comprado em ${dataBr(compra.data)} · lista de ${dataBr(compra.lista_data)}` }),
    el("p", { className: "total", textContent: r.itens === r.semPreco ? "Sem preço anotado" : reais(r.totalCent) }));
  if (r.semPreco > 0) cab.append(el("p", { className: "muted", textContent: r.semPreco === 1 ? "1 item está sem preço." : `${r.semPreco} itens estão sem preço.` }));
  raiz.append(cab);
  const cartao = el("div", { className: "cartao" });
  for (const i of compra.itens) {
    const preco = Number.isInteger(i.preco_pago) ? `${i.qtd} × ${reais(i.preco_pago)}` : `${i.qtd} un`;
    cartao.append(el("div", { className: "hist-item" },
      el("span", { className: "meio" }, el("span", { className: "nome", textContent: i.nome }), el("span", { className: "sub", textContent: `${preco} · ${i.mercado ?? "Mercado não anotado"}` })),
      Number.isInteger(i.preco_pago) ? el("span", { className: "p", textContent: reais(i.preco_pago * i.qtd) }) : el("span", { className: "p sem", textContent: "Sem preço" })));
  }
  raiz.append(cartao);

  const $acoes = el("div", { className: "lst-rodape" });
  raiz.append($acoes);
  const botoes = () => {
    $acoes.replaceChildren();
    const refazer = botaoDe(el, "Refazer esta lista", "botao", () => {
      const aberta = deps.storage ? abrirListas(deps.storage, hoje()) : null;
      if (!aberta) { api.avisar("Não consegui guardar a lista neste aparelho."); return; }
      const f = refazerLista(aberta.estado, compra, ctx.dados, hoje());
      if (f.resultado === "limite") { api.avisar(`Você já tem ${MAX_LISTAS} listas. Apague uma para refazer esta.`); return; }
      if (f.resultado !== "ok") { api.avisar("Não consegui refazer esta lista."); return; }
      if (!gravarListas(deps.storage, f.estado)) { api.avisar("Não consegui guardar a lista neste aparelho."); return; }
      const nome = listaAtiva(f.estado).nome;
      const extra = f.avulsos === 1 ? " 1 item não está mais no Radar e entrou como item avulso." : f.avulsos > 1 ? ` ${f.avulsos} itens não estão mais no Radar e entraram como item avulso.` : "";
      api.depois(`Lista "${nome}" criada.${extra}`);
      api.irPara("#lista");
    });
    const apagar = botaoDe(el, "Apagar compra", "botao sec", () => confirmar());
    $acoes.append(refazer, el("div", { className: "acoes" }, apagar),
      el("p", { className: "campo-ajuda", textContent: `Refazer cria uma lista nova chamada Repetir: ${compra.lista_nome}, com estes itens e quantidades.` }));
  };
  const confirmar = () => {
    $acoes.replaceChildren();
    const sim = botaoDe(el, "Sim, apagar", "botao", () => {
      if (!deps.storage || !gravarCompras(deps.storage, apagarCompra(lerCompras(deps.storage), compra.id))) {
        api.avisar("Não consegui apagar a compra neste aparelho.");
        botoes();
        return;
      }
      api.depois("Compra apagada.");
      api.irPara("#lista/historico");
    });
    const caixa = el("div", { className: "lst-confirma" },
      el("p", { className: "confirma-titulo", textContent: "Apagar esta compra?" }),
      el("p", { textContent: "Esta compra será apagada do Histórico e não dá para desfazer. Suas listas não mudam." }),
      el("div", { className: "acoes" }, sim, botaoDe(el, "Cancelar", "botao sec", () => { botoes(); })));
    caixa.setAttribute("role", "alertdialog");
    $acoes.append(caixa);
    foco(sim);
  };
  botoes();
}

// ---- Revisão: Concluir compra ----
export function renderRevisao(raiz, ctx, deps, api) {
  const el = criarEl(deps.document);
  const hoje = () => (typeof deps.hojeIso === "string" && deps.hojeIso ? deps.hojeIso : hojeLocal());
  const storage = deps.storage;
  raiz.append(alvoVoltar(el, "Voltar para a lista", "#lista"));
  const aberta = storage ? abrirListas(storage, hoje()) : null;
  if (!aberta) {
    raiz.append(el("div", { className: "cartao" }, el("p", { textContent: "Não consegui abrir a lista neste aparelho." })));
    return;
  }
  if (ctx.carregando === true) {
    raiz.append(el("h2", { textContent: "Concluir compra", tabIndex: -1 }), el("div", { className: "cartao msg msg-vazio" },
      el("p", { className: "vazio-titulo", textContent: "Carregando…" }),
      el("p", { className: "muted", textContent: "Buscando os preços para preencher a compra." })));
    return;
  }
  const listas = aberta.estado;
  const ativa = listaAtiva(listas);
  // dadosCompletos: produto oculto no app ainda mostra nome e mercado na revisão
  const todos = ctx.dadosCompletos ?? ctx.dados;
  const dados = ctx.estadoDados === "ok" ? todos : null;
  const rev = prepararConclusao(dados, ativa, hoje());
  if (!rev.linhas.length) {
    raiz.append(el("h2", { textContent: "Concluir compra", tabIndex: -1 }), el("div", { className: "cartao vazio" },
      el("p", { className: "vazio-titulo", textContent: "Esta lista está vazia" }),
      el("p", { className: "muted", textContent: "Coloque itens na lista para concluir a compra." })));
    return;
  }
  const mercados = dados ? mercadosDe(dados) : [];
  for (const l of rev.linhas) { l.precoTexto = paraCampo(l.preco_cent); l.editado = false; l.erro = false; l.semOferta = Boolean(dados) && l.mercado === null && l.preco_cent === null; }

  const naoPegos0 = rev.linhas.filter((l) => !l.pego).length;
  const pegos0 = rev.linhas.length - naoPegos0;
  const cab = el("div", { className: "rev-cabeca" },
    el("h2", { textContent: "Concluir compra", tabIndex: -1 }),
    el("p", { className: "muted", textContent: `Lista ${ativa.nome} · ${pegos0 === 1 ? "1 item pego" : `${pegos0} itens pegos`} · ${naoPegos0 === 1 ? "1 item não pego" : `${naoPegos0} itens não pegos`}` }));
  raiz.append(cab);

  // avisos sobre os preços
  if (!dados) {
    raiz.append(el("div", { className: "cartao msg" }, el("p", { className: "vazio-titulo", textContent: "Não consegui carregar os preços" }), el("p", { className: "muted", textContent: "Você ainda pode guardar a compra. Escolha o mercado e digite o preço, ou deixe em branco." })));
  } else if (typeof deps.offline === "function" && deps.offline()) {
    raiz.append(el("p", { className: "aviso", textContent: "Sem internet agora. Os preços vêm da última cópia guardada. Confira o que você pagou." }));
  } else if (situacaoFrescor(dados.gerado_em, deps.agora instanceof Date ? deps.agora : new Date()).estado === "velho") {
    raiz.append(el("p", { className: "aviso", textContent: "Os preços têm mais de um dia. Confira o que você pagou de verdade." }));
  }

  // data da compra
  const rotData = el("label", { className: "campo", textContent: "Data da compra" });
  rotData.setAttribute("for", "rev-data");
  const inData = el("input", { id: "rev-data", className: "campo-texto", type: "date", value: rev.data });
  inData.setAttribute("max", hoje());
  const erData = erroEl(el, "rev-erro-data");
  inData.setAttribute("aria-describedby", "rev-ajuda-data rev-erro-data");
  raiz.append(el("div", { className: "cartao" }, rotData, inData, erData, el("p", { id: "rev-ajuda-data", className: "campo-ajuda", textContent: "Não pode ser depois de hoje." })));
  inData.addEventListener("input", () => { rev.data = String(inData.value); erData.hidden = true; inData.setAttribute("aria-invalid", "false"); });

  const $pegos = el("div", { className: "rev-pegos" });
  const $nao = el("div", { className: "rev-nao" });
  raiz.append($pegos, $nao);

  // rodapé
  const $resumo = el("p", { className: "resumo-rev", role: "status" });
  const $ajuda = el("p", { className: "campo-ajuda", hidden: true });
  const $guardar = botaoDe(el, "Guardar compra", "botao", () => guardar());
  const $fim = el("div", { className: "rev-fim" }, $resumo, $ajuda, el("div", { className: "linha-botoes" }, $guardar, el("a", { className: "botao sec", href: "#lista", textContent: "Voltar" })));
  raiz.append($fim);

  const valor = (l) => {
    const c = lerPrecoDigitado(l.precoTexto);
    return Number.isNaN(c) ? null : c;
  };
  const temErro = () => rev.linhas.some((l) => l.incluir && l.erro);

  function atualizarRodape() {
    let total = 0;
    let sem = 0;
    let marcados = 0;
    for (const l of rev.linhas) {
      if (!l.incluir) continue;
      marcados += 1;
      const c = valor(l);
      if (c === null) sem += 1; else total += c * l.qtd;
    }
    $resumo.replaceChildren();
    if (temErro()) { $resumo.append("Corrija os campos marcados para guardar."); }
    else {
      $resumo.append("Total: ", el("span", { className: "t", textContent: reais(total) }));
      if (sem > 0) $resumo.append(" · " + semPrecoTxt(sem));
    }
    if (guardada) return;
    $guardar.disabled = marcados === 0;
    $ajuda.hidden = marcados > 0;
    $ajuda.textContent = marcados > 0 ? "" : "Marque ao menos um item que você comprou.";
  }

  function totalDoItem(l, alvo) {
    const c = valor(l);
    alvo.replaceChildren("Item: ", el("b", { textContent: c === null ? "sem preço" : reais(c * l.qtd) }));
  }

  function caixaComprei(l, idx) {
    const id = "rev-ck-" + idx;
    const ck = el("input", { id, type: "checkbox", className: "pego", checked: l.incluir });
    ck.setAttribute("aria-label", "Comprei " + l.nome);
    ck.addEventListener("change", () => { l.incluir = ck.checked; if (!l.incluir) l.erro = false; desenhar(id); });
    return ck;
  }

  function linhaPega(l, idx) {
    const ck = caixaComprei(l, idx);
    const nome = el("label", { textContent: l.nome });
    nome.setAttribute("for", ck.id);
    const topo = el("div", { className: "rev-topo" }, el("span", { className: "caixa" }, ck), nome);
    if (l.semOferta) topo.append(el("span", { className: "selo-nenhum", textContent: "Sem oferta agora" }));
    const sel = el("select", { id: "rev-mercado-" + idx, className: "campo-texto" });
    sel.append(el("option", { value: "", textContent: "Outro ou não sei" }));
    const nomes = [...mercados];
    if (l.mercado && !nomes.includes(l.mercado)) nomes.push(l.mercado);
    for (const m of nomes) sel.append(el("option", { value: m, textContent: m }));
    sel.value = l.mercado ?? "";
    const rotM = el("label", { className: "campo", textContent: "Mercado" });
    rotM.setAttribute("for", sel.id);
    const valorQtd = el("span", { className: "qtd-valor", textContent: String(l.qtd) });
    const total = el("p", { className: "rev-total-item" });
    const inPreco = el("input", { id: "rev-preco-" + idx, className: "campo-texto", type: "text", value: l.precoTexto, placeholder: "Não anotei", autocomplete: "off" });
    inPreco.setAttribute("inputmode", "decimal");
    const erro = erroEl(el, "rev-erro-preco-" + idx);
    inPreco.setAttribute("aria-describedby", erro.id);
    const marcarErro = (ruim) => {
      l.erro = ruim;
      inPreco.setAttribute("aria-invalid", ruim ? "true" : "false");
      if (ruim) mostrarErro(erro, "Digite o preço só com números, como 3,00."); else erro.hidden = true;
    };
    l.marcarErro = marcarErro;
    l.campoPreco = inPreco;
    sel.addEventListener("change", () => {
      l.mercado = sel.value || null;
      if (!l.editado && l.id) {
        l.precoTexto = paraCampo(precoNoMercado(dados, l.id, l.mercado));
        inPreco.value = l.precoTexto;
        marcarErro(false);
      }
      totalDoItem(l, total);
      atualizarRodape();
    });
    inPreco.addEventListener("input", () => {
      l.editado = true;
      l.precoTexto = String(inPreco.value);
      marcarErro(false);
      totalDoItem(l, total);
      atualizarRodape();
    });
    const mudaQtd = (n) => { l.qtd = limitarQtd(n); valorQtd.textContent = String(l.qtd); totalDoItem(l, total); atualizarRodape(); };
    const menos = botaoDe(el, "−", "mini", () => mudaQtd(l.qtd - 1));
    menos.setAttribute("aria-label", "Diminuir quantidade de " + l.nome);
    const mais = botaoDe(el, "+", "mini", () => mudaQtd(l.qtd + 1));
    mais.setAttribute("aria-label", "Aumentar quantidade de " + l.nome);
    const rotQ = el("span", { className: "campo", textContent: "Quantidade" });
    const rotP = el("label", { className: "campo", textContent: "Preço de cada" });
    rotP.setAttribute("for", inPreco.id);
    totalDoItem(l, total);
    return el("div", { className: "cartao rev-linha" }, topo,
      el("div", { className: "rev-corpo" }, rotM, sel,
        el("div", { className: "rev-grade" },
          el("div", {}, rotQ, el("div", { className: "qtd" }, menos, valorQtd, mais)),
          el("div", {}, rotP, el("div", { className: "rev-preco" }, el("span", { className: "rs", textContent: "R$" }), inPreco))),
        erro, total));
  }

  function linhaNaoPega(l, idx) {
    const ck = caixaComprei(l, idx);
    const nome = el("label", { textContent: l.nome });
    nome.setAttribute("for", ck.id);
    const grupo = el("fieldset", { className: "rev-escolha" }, el("legend", { textContent: "O que fazer com este item?" }));
    const opcao = (valorSair, texto) => {
      const id = `rev-sair-${idx}-${valorSair ? "sai" : "fica"}`;
      const r = el("input", { id, type: "radio", name: "rev-sair-" + idx, checked: l.sair === valorSair });
      r.addEventListener("change", () => { l.sair = valorSair; });
      const rot = el("label", { textContent: texto });
      rot.setAttribute("for", id);
      return el("div", { className: "opcao" }, r, rot);
    };
    grupo.append(opcao(false, "Continua na lista"), opcao(true, "Sai da lista sem registrar"));
    return el("div", { className: "cartao rev-linha fora" }, el("div", { className: "rev-topo" }, el("span", { className: "caixa" }, ck), nome), grupo);
  }

  function desenhar(focarId) {
    $pegos.replaceChildren();
    $nao.replaceChildren();
    const pegas = rev.linhas.map((l, i) => [l, i]).filter(([l]) => l.incluir);
    const fora = rev.linhas.map((l, i) => [l, i]).filter(([l]) => !l.incluir);
    if (pegas.length) {
      $pegos.append(el("h3", { className: "subtitulo", textContent: "Itens que você pegou" }));
      for (const [l, i] of pegas) $pegos.append(linhaPega(l, i));
    }
    if (fora.length) {
      $nao.append(el("h3", { className: "subtitulo", textContent: "Itens que você não pegou" }));
      for (const [l, i] of fora) $nao.append(linhaNaoPega(l, i));
    }
    atualizarRodape();
    if (focarId) foco(acharPorId(focarId));
  }
  function acharPorId(id) {
    const varre = (n) => (n.id === id ? n : (n.children || []).map(varre).find(Boolean));
    return varre(raiz);
  }

  let guardada = false;
  function guardar() {
    if ($guardar.disabled || guardada) return;
    let primeiro = null;
    for (const l of rev.linhas) {
      if (!l.incluir) continue;
      const c = lerPrecoDigitado(l.precoTexto);
      if (Number.isNaN(c)) { l.marcarErro(true); primeiro = primeiro ?? l.campoPreco; }
    }
    erData.hidden = true;
    inData.setAttribute("aria-invalid", "false");
    if (primeiro) { atualizarRodape(); foco(primeiro); return; }
    const linhas = rev.linhas.map((l) => ({ ...l, preco_cent: l.incluir ? valor(l) : l.preco_cent }));
    $guardar.disabled = true;
    const compras = lerCompras(storage);
    const r = registrarCompra(compras, listas, { data: rev.data, linhas }, hoje());
    const falha = (texto) => { api.avisar(texto); atualizarRodape(); };
    if (r.resultado === "data") {
      mostrarErro(erData, "A data não pode ser depois de hoje.");
      inData.setAttribute("aria-invalid", "true");
      atualizarRodape();
      foco(inData);
      return;
    }
    if (r.resultado !== "ok") { falha("Marque ao menos um item que você comprou."); return; }
    if (!gravarCompras(storage, r.compras)) { falha("Não consegui guardar a compra neste aparelho. Sua lista continua como estava."); return; }
    const listaOk = gravarListas(storage, r.listas);
    if (!listaOk) {
      // a compra já está guardada: não deixa guardar de novo (duplicaria)
      guardada = true;
      $guardar.disabled = true;
      $ajuda.hidden = false;
      $ajuda.textContent = "A compra foi guardada. Volte para a lista.";
      api.avisar("Compra guardada, mas não consegui guardar a lista neste aparelho.");
      return;
    }
    const resto = listaAtiva(r.listas);
    const sobrou = resto.itens.length + resto.extras.length;
    let texto = "Compra guardada.";
    if (sobrou === 1) texto += " 1 item ficou na lista.";
    else if (sobrou > 1) texto += ` ${sobrou} itens ficaram na lista.`;
    api.depois(texto, { rotulo: "Ver", hash: "#lista/compra/" + encodeURIComponent(r.compra.id) });
    api.irPara("#lista");
  }

  desenhar();
}
