// Lista por foto: aplicar os itens conferidos na lista (puro) e a tela (entrada, avisos, chave, conferência).
// Só cria elementos pelo DOM (texto nunca vira HTML). A foto fica só na memória (variável `foto`) e é descartada ao terminar; nada vai para o storage.
import { consolidar, associar } from "./associar.js";
import { adicionar, alterarQuantidade, adicionarExtra, limpar, buscarProdutos } from "./lista.js";
import { lerChave, gravarChave, apagarChave, marcarAviso, finalDaChave, validarArquivo, reduzirImagem, lerFoto, MENSAGENS } from "./foto.js";

const MAX_QTD = 99;
const SVG_NS = "http://www.w3.org/2000/svg";

// linhas = [{texto, qtd, produtoId|null}]; modo "juntar" soma com o que já existe, "substituir" parte do zero.
export function aplicarNaLista(lista, linhas, modo) {
  let atual = modo === "substituir" ? limpar() : { versao: 1, itens: [], extras: [], ...(lista && typeof lista === "object" ? lista : {}) };
  for (const l of consolidar(linhas)) {
    if (l.produtoId) {
      const ja = atual.itens.find((i) => i.id === l.produtoId);
      atual = alterarQuantidade(adicionar(atual, l.produtoId), l.produtoId, Math.min(MAX_QTD, (ja ? ja.qtd : 0) + l.qtd));
    } else {
      atual = adicionarExtra(atual, l.texto, l.qtd);
    }
  }
  return atual;
}

// ---- textos ----
const ICONES = {
  camera: ["M4 8h3l2-3h6l2 3h3v11H4z", "M12 9.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7z"],
  galeria: ["M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M9 8.2a1.8 1.8 0 1 0 0 3.6a1.8 1.8 0 0 0 0-3.6z", "M4 18l5-5 4 4 3-3 4 4"],
  alerta: ["M12 4l9 16H3z", "M12 10v4M12 17v.5"],
  ok: ["M5 12.5l4.5 4.5L19 7.5"],
  nenhum: ["M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16z", "M7 17L17 7"],
};
const ERROS = {
  "nao-leu": { titulo: "Não consegui ler a foto", texto: "Tente de novo com mais luz e a folha reta, ou digite a lista. Sua lista atual continua como estava.", botoes: ["tentar", "digitar"] },
  vazio: { titulo: "Não encontrei itens na foto", texto: "Fotografe só a lista, de perto e sem sombra, ou digite os itens.", botoes: ["refazer", "digitar"], vazio: true },
  "chave-invalida": { titulo: "O Google recusou a chave", texto: "Confira ou troque a chave do Gemini.", botoes: ["chave", "digitar"] },
  "sem-rede": { titulo: "Sem internet agora", texto: "A leitura da foto precisa de rede; você pode digitar a lista. O cálculo da lista continua funcionando sem internet.", botoes: ["digitar", "tentar"] },
  cota: { titulo: "O limite gratuito acabou", texto: MENSAGENS.cota, botoes: ["digitar", "tentar"] },
  demorou: { titulo: "A leitura demorou demais", texto: "Confira a internet e tente de novo, ou digite a lista.", botoes: ["tentar", "digitar"] },
  outro: { titulo: "O Google não conseguiu ler agora", texto: "Tente de novo ou digite a lista", botoes: ["tentar", "digitar"] },
  "nao-imagem": { titulo: "Esse arquivo não é uma foto", texto: "Escolha uma imagem (JPG ou PNG) de até 25 MB.", botoes: ["outra"] },
  "grande-demais": { titulo: "Essa foto é grande demais", texto: "Escolha uma imagem (JPG ou PNG) de até 25 MB.", botoes: ["outra"] },
  formato: { titulo: "Não consegui abrir essa foto", texto: "Tente tirar pela câmera.", botoes: ["camera"] },
};
const BOTOES = {
  tentar: "Tentar de novo", digitar: "Digitar a lista", refazer: "Refazer a foto", chave: "Trocar a chave", outra: "Escolher outra", camera: "Tirar foto",
};

const textoItens = (n) => (n === 1 ? "1 item" : n + " itens");
const textoTentativas = (n) => (n === 1 ? "1 tentativa" : n + " tentativas");

// deps = { document, storage, window?, gemini: {buscar, criarBitmap, online(), hoje()}, obterLista(), titulo?, alternarResto?(escondido), slotBotao?, modoBotao?: "icone"|"texto"|() => ... }
// Devolve { redesenhar(), abrirChave(disparador) } (ou undefined sem gemini).
export function renderListaFoto(raiz, ctx, deps, aoAplicar) {
  const g = deps && deps.gemini;
  if (!g) return;
  const doc = deps.document;
  const storage = deps.storage;
  const dados = ctx && ctx.estadoDados === "ok" && ctx.dados ? ctx.dados : null;
  const produtos = dados && Array.isArray(dados.produtos) ? dados.produtos.filter((p) => p && typeof p.id === "string" && p.id) : [];
  const nomeDe = (id) => { const p = produtos.find((x) => x.id === id); return p ? String(p.nome ?? id) : ""; };

  const el = (tag, props = {}, ...filhos) => {
    const e = doc.createElement(tag);
    Object.assign(e, props);
    e.append(...filhos);
    return e;
  };
  const icone = (nome, classe = "") => {
    const s = doc.createElementNS(SVG_NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    if (classe) s.setAttribute("class", classe);
    for (const d of ICONES[nome]) {
      const p = doc.createElementNS(SVG_NS, "path");
      p.setAttribute("d", d);
      s.append(p);
    }
    return s;
  };
  const botao = (texto, classe, aoClicar, rotulo) => {
    const b = el("button", { type: "button", className: classe, textContent: texto });
    if (rotulo) b.setAttribute("aria-label", rotulo);
    b.addEventListener("click", (ev) => { ultimoBotao = b; return aoClicar(ev); });
    return b;
  };
  const mini = (texto, rotulo, aoClicar) => botao(texto, "mini", aoClicar, rotulo);
  const foco = (e) => { try { e.focus(); } catch {} };
  let ultimoBotao = null; // quem abriu o diálogo, para devolver o foco ao fechar (toque nem sempre foca o botão)

  const host = el("div", { className: "foto-host" });
  const $status = el("p", { className: "so-leitor", role: "status", textContent: "" });
  $status.setAttribute("aria-live", "polite");
  raiz.append(host, $status);

  // ---- estado em memória ----
  let foto = null; // { base64 }: só na memória, sai ao terminar a leitura
  let origem = "arquivo";
  let comoFoiLido = null; // { modelo, tentativas, ms }
  let controle = null;
  let cancelado = false;
  let ocupado = false;
  let linhas = [];
  let corte = false;
  let proximoId = 1;
  const inputs = {};

  // ---- diálogo (<dialog> + showModal: foco preso e Esc nativos) ----
  function abrirDialogo(titulo, montar, opcoes = {}) {
    return new Promise((resolver) => {
      const disparador = ultimoBotao && ultimoBotao.isConnected !== false ? ultimoBotao : doc.activeElement || null;
      const d = el("dialog", { className: "dialogo" });
      if (opcoes.alerta) d.setAttribute("role", "alertdialog");
      const idTitulo = "dlg-titulo-" + (proximoId += 1);
      d.setAttribute("aria-labelledby", idTitulo);
      const h = el("h2", { id: idTitulo, tabIndex: -1, textContent: titulo });
      let feito = false;
      const fechar = (valor) => {
        if (feito) return;
        feito = true;
        try { if (typeof d.close === "function") d.close(); } catch {}
        try { d.remove(); } catch {}
        if (disparador && disparador.isConnected !== false) foco(disparador);
        resolver(valor);
      };
      d.addEventListener("cancel", (ev) => { try { ev.preventDefault(); } catch {} fechar(undefined); });
      d.addEventListener("close", () => fechar(undefined));
      d.append(h);
      const primeiro = montar(d, fechar);
      host.append(d);
      try { if (typeof d.showModal === "function") d.showModal(); else d.open = true; } catch { d.open = true; }
      foco(primeiro || h);
    });
  }

  const campo = (id, rotulo, props) => {
    const r = el("label", { className: "campo", textContent: rotulo });
    r.setAttribute("for", id);
    const c = el("input", { id, className: "campo-texto", ...props });
    return [r, c];
  };

  function dialogoAviso() {
    return abrirDialogo("Antes de ler a foto", (d, fechar) => {
      const ok = botao("Entendi, continuar", "botao", () => { marcarAviso(storage); fechar(true); });
      d.append(
        el("p", { textContent: "A foto é enviada ao Google (Gemini) só para ler a lista. O Radar não guarda a foto." }),
        el("p", { textContent: "No plano gratuito o Google pode usar o conteúdo para melhorar seus serviços." }),
        el("p", { className: "muted", textContent: "Evite fotografar dados pessoais junto com a lista." }),
        el("div", { className: "acoes" }, ok, botao("Cancelar", "botao sec", () => fechar(false))));
      return ok;
    });
  }

  // Resolve true quando há chave cadastrada ao fechar.
  function dialogoChave() {
    return abrirDialogo("Chave do Gemini", (d, fechar) => {
      const corpo = el("div", {});
      d.append(corpo);
      const desenharForm = () => {
        corpo.replaceChildren();
        const [rot, inp] = campo("chave-gemini", "Cole a chave aqui", { type: "password", autocomplete: "off", autocapitalize: "off", spellcheck: false });
        inp.setAttribute("aria-describedby", "chave-ajuda");
        const ajuda = el("p", { id: "chave-ajuda", className: "campo-ajuda", textContent: "A chave fica só neste aparelho, no navegador. Ela não aparece de novo depois de salva." });
        const erro = el("p", { id: "chave-erro", className: "campo-erro", role: "alert", hidden: true });
        const aviso = el("p", { className: "aviso", role: "status", hidden: true, textContent: "Não consegui guardar a chave neste aparelho" });
        const salvar = botao("Salvar", "botao", () => {
          const r = gravarChave(storage, inp.value);
          if (r.ok) { inp.value = ""; fechar(true); return; }
          if (r.motivo === "formato") {
            erro.textContent = "Isso não parece uma chave do Gemini";
            erro.hidden = false;
            inp.setAttribute("aria-invalid", "true");
            inp.setAttribute("aria-describedby", "chave-erro");
            foco(inp);
          } else aviso.hidden = false;
        });
        corpo.append(
          el("p", { textContent: "Para ler a foto, o Radar precisa de uma chave gratuita do Google. Você cria uma vez:" }),
          el("ol", {}, el("li", { textContent: "Abra o Google AI Studio e entre com sua conta." }), el("li", { textContent: "Toque em “Get API key” e crie uma chave." }), el("li", { textContent: "Copie a chave e cole abaixo." })),
          el("p", { className: "campo-ajuda", textContent: "Dica: crie a chave em um projeto novo, para não gastar o limite gratuito da coleta do Radar." }),
          rot, inp, ajuda, erro, aviso,
          el("div", { className: "acoes" }, salvar, botao("Cancelar", "botao sec", () => fechar(false))));
        foco(inp);
      };
      const desenharSalva = (chave) => {
        corpo.replaceChildren(
          el("p", { role: "status", textContent: "Chave cadastrada, termina em " + finalDaChave(chave) }),
          el("p", { className: "campo-ajuda", textContent: "Ela fica só neste aparelho. Apagar não afeta sua conta do Google." }),
          el("div", { className: "acoes" },
            botao("Trocar a chave", "botao", desenharForm),
            botao("Apagar a chave", "botao sec", () => { apagarChave(storage); fechar(false); }),
            botao("Fechar", "botao sec", () => fechar(true))));
      };
      const atual = lerChave(storage).chave;
      if (atual) desenharSalva(atual); else desenharForm();
      return null;
    });
  }

  // ---- entrada ----
  const online = () => { try { return g.online() !== false; } catch { return true; } };

  // Botão da câmera (criado uma vez por modo, para o foco voltar a ele) e avisos de sem dados / sem internet.
  const botaoIcone = botao("", "mini foto-camera", () => iniciar(), "Ler lista de papel");
  botaoIcone.append(icone("camera", "foto-ico"));
  const botaoTexto = botao("Ler lista de papel", "botao foto-camera-texto", () => iniciar());
  botaoTexto.prepend(icone("camera", "foto-ico"));
  const $entrada = el("div", { className: "foto-entrada-aviso" });
  const slot = deps.slotBotao || el("div", { className: "foto-slot" });

  function desenharEntrada() {
    const texto = (typeof deps.modoBotao === "function" ? deps.modoBotao() : deps.modoBotao) === "texto";
    const b = texto ? botaoTexto : botaoIcone;
    const desligado = !dados || !online() || ocupado;
    b.disabled = desligado;
    b.setAttribute("aria-disabled", desligado ? "true" : "false");
    slot.replaceChildren();
    slot.append(b);
    $entrada.replaceChildren();
    if (!dados) $entrada.append(el("p", { className: "muted", textContent: "Abra o app com internet uma vez" }));
    else if (!online() && !ocupado) $entrada.append(el("div", { className: "cartao" }, el("p", { className: "aviso", role: "status", textContent: MENSAGENS["sem-rede"] }), el("div", { className: "acoes" }, botao("Digitar a lista", "botao", () => digitar()))));
  }

  function blocoComoFoiLido() {
    if (!comoFoiLido) return null;
    const c = comoFoiLido;
    return el("details", { className: "cartao foto-como" }, el("summary", { className: "link", textContent: "Como foi lido" }),
      el("p", { textContent: `Modelo: ${c.modelo} · ${textoTentativas(c.tentativas)} · ${Math.max(0, Math.round(c.ms / 1000))} s` }));
  }

  function mostrarEntrada(extra, focarBotao = false) {
    ocupado = false;
    if (deps.alternarResto) deps.alternarResto(false);
    host.replaceChildren();
    desenharEntrada();
    if (focarBotao) foco(slot.children[0]);
    if (extra) host.append(extra);
    const c = blocoComoFoiLido();
    if (c) host.append(c);
  }

  function mostrarErro(motivo, texto) {
    const e = ERROS[motivo] ?? ERROS.outro;
    const cartao = el("div", { className: "cartao msg" + (e.vazio ? " msg-vazio" : ""), role: e.vazio ? "status" : "alert" });
    const h = el("h3", {});
    if (!e.vazio) h.append(icone("alerta", "foto-ico"));
    h.append(e.titulo);
    cartao.append(h, el("p", { textContent: texto ?? e.texto }));
    const acoes = el("div", { className: "acoes" });
    const mapa = {
      tentar: () => tentarDeNovo(),
      digitar: () => digitar(),
      refazer: () => abrirSeletor(origem),
      chave: async () => { const ok = await dialogoChave(); if (ok) tentarDeNovo(); },
      outra: () => abrirSeletor(origem),
      camera: () => abrirSeletor("camera"),
    };
    e.botoes.forEach((k, n) => acoes.append(botao(BOTOES[k], n === 0 ? "botao" : "botao sec", mapa[k])));
    cartao.append(acoes);
    mostrarEntrada(cartao);
  }

  // ---- seletor de arquivo ----
  function entradaArquivo(tipo) {
    if (inputs[tipo]) return inputs[tipo];
    const inp = el("input", { type: "file", hidden: true });
    inp.setAttribute("accept", "image/*");
    if (tipo === "camera") inp.setAttribute("capture", "environment"); // só para "Tirar foto" do erro de formato
    inp.setAttribute("aria-hidden", "true");
    inp.setAttribute("tabindex", "-1");
    inp.addEventListener("change", () => {
      const arquivo = inp.files && inp.files[0];
      try { inp.value = ""; } catch {}
      if (arquivo) processar(arquivo);
    });
    raiz.append(inp); // fora do `host`, que é redesenhado a cada etapa
    inputs[tipo] = inp;
    return inp;
  }

  function abrirSeletor(qual) {
    origem = qual;
    try { entradaArquivo(qual).click(); } catch {}
  }

  async function iniciar() {
    if (ocupado || !dados || !online()) return;
    if (!lerChave(storage).aviso) {
      const ok = await dialogoAviso();
      if (!ok) return;
    }
    abrirSeletor("arquivo");
  }

  function tentarDeNovo() {
    if (foto) return ler();
    return abrirSeletor(origem);
  }

  // ---- leitura ----
  function mostrarLendo() {
    ocupado = true;
    const cancelar = botao("Cancelar", "botao sec", () => { cancelado = true; if (controle) controle.abort(); });
    const status = el("p", { role: "status", textContent: "Lendo a foto…" });
    status.setAttribute("aria-live", "polite");
    const barra = el("div", { className: "foto-barra" }, el("span", {}));
    barra.setAttribute("aria-hidden", "true");
    const andamento = el("div", { className: "cartao foto-andamento" }, status, barra,
      el("p", { className: "muted", textContent: "Pode levar até 30 segundos." }), el("div", { className: "acoes" }, cancelar));
    andamento.setAttribute("aria-busy", "true");
    host.replaceChildren(andamento);
    desenharEntrada();
  }

  async function processar(arquivo) {
    if (ocupado) return;
    const v = validarArquivo(arquivo);
    if (!v.ok) { mostrarErro(v.motivo, v.mensagem); return; }
    cancelado = false;
    foto = null;
    comoFoiLido = null;
    mostrarLendo();
    const r = await reduzirImagem(arquivo, { document: doc, criarBitmap: g.criarBitmap });
    if (cancelado) { mostrarEntrada(null, true); return; }
    if (!r.ok) { mostrarErro("formato", r.mensagem); return; }
    foto = { base64: r.base64 };
    if (!lerChave(storage).chave) {
      const ok = await dialogoChave();
      if (!ok || !lerChave(storage).chave) { foto = null; mostrarEntrada(null, true); return; }
    }
    await ler();
  }

  async function ler() {
    const chave = lerChave(storage).chave;
    if (!chave || !foto) { foto = null; mostrarEntrada(); return; }
    cancelado = false;
    mostrarLendo();
    controle = new AbortController();
    const r = await lerFoto(foto, { chave, buscar: g.buscar, hoje: g.hoje(), online: online(), sinal: controle.signal });
    controle = null;
    if (r.motivo === "cancelado" || cancelado) { foto = null; mostrarEntrada(null, true); return; }
    comoFoiLido = r.ok ? { modelo: r.modelo, tentativas: r.tentativas.length, ms: r.ms } : null;
    if (!r.ok) {
      if (r.motivo === "sem-chave") { const ok = await dialogoChave(); if (ok) return ler(); }
      mostrarErro(r.motivo, ERROS[r.motivo] ? undefined : r.mensagem);
      return;
    }
    foto = null; // a foto não é mais necessária: sai da memória
    corte = r.cortado;
    linhas = r.itens.map((i) => novaLinha(i.texto, i.qtd));
    mostrarConferencia(`Li ${textoItens(linhas.length)}. Corrija o que estiver errado e toque em Calcular.`);
  }

  // ---- conferência ----
  function novaLinha(texto, qtd) {
    const a = associar(texto, dados);
    return { id: proximoId++, texto, qtd, produtoId: a.produtoId, certeza: a.certeza, candidatos: a.candidatos, manual: false };
  }

  function digitar() {
    foto = null;
    comoFoiLido = null;
    linhas = [];
    corte = false;
    mostrarConferencia("Sem itens. Acrescente um item ou refaça a foto.", false);
    acrescentar();
  }

  const linhasValidas = () => linhas.filter((l) => l.texto.trim());

  function mostrarConferencia(mensagem, focarTitulo = true, focoLinha = null) {
    ocupado = true;
    if (deps.alternarResto) deps.alternarResto(true);
    const titulo = el("h2", { tabIndex: -1, textContent: "Confira sua lista" });
    const pedacos = [titulo];
    if (mensagem) {
      $status.textContent = mensagem;
      pedacos.push(el("p", { className: "muted", textContent: mensagem }));
    }
    if (corte) pedacos.push(el("p", { className: "aviso", textContent: "Li mais de 60 itens. Mostrei só os 60 primeiros." }));
    let focoEl = null;
    for (const l of linhas) {
      const { cartao, campoTexto } = desenharLinha(l);
      pedacos.push(cartao);
      if (focoLinha === l.id) focoEl = campoTexto;
    }
    const pendentes = linhas.filter((l) => !l.produtoId && !l.manual && l.certeza === "confira").length;
    if (pendentes) pedacos.push(el("p", { className: "muted", textContent: `${textoItens(pendentes)} em “Confira”: sem escolher o produto, vão para “Sem preço agora”.` }));
    pedacos.push(el("div", { className: "acoes" },
      botao("Acrescentar item", "botao sec", () => acrescentar()),
      botao("Refazer a foto", "botao sec", () => { linhas = []; mostrarEntrada(); abrirSeletor(origem); })));
    const calcular = botao("Calcular", "botao", () => calcularLista());
    if (!linhasValidas().length) calcular.disabled = true;
    pedacos.push(el("div", { className: "conf-rodape" }, calcular));
    const como = blocoComoFoiLido();
    if (como) pedacos.push(como);
    host.replaceChildren(...pedacos);
    if (focoEl) foco(focoEl); else if (focarTitulo) foco(titulo);
  }

  function selo(tipo, texto) {
    return el("span", { className: "selo-" + tipo }, icone(tipo === "ok" ? "ok" : tipo === "confira" ? "alerta" : "nenhum"), texto);
  }

  function desenharLinha(l) {
    const idCampo = "conf-texto-" + l.id;
    const rot = el("label", { className: "campo", textContent: "Item lido" });
    rot.setAttribute("for", idCampo);
    const campoTexto = el("input", { id: idCampo, className: "campo-texto", type: "text", value: l.texto });
    campoTexto.addEventListener("input", () => { l.texto = campoTexto.value; });
    campoTexto.addEventListener("change", () => {
      l.texto = campoTexto.value;
      if (!l.manual) {
        const a = associar(l.texto, dados);
        l.produtoId = a.produtoId; l.certeza = a.certeza; l.candidatos = a.candidatos;
      }
      mostrarConferencia(null, false, l.id);
    });
    const nome = l.texto || "item";
    let assoc;
    if (l.produtoId) {
      assoc = el("p", { className: "conf-assoc" }, selo("ok", "Achei"),
        el("span", { className: "nome" }, `${l.texto} `, el("span", { className: "seta", textContent: "→" }), " ", el("strong", { textContent: nomeDe(l.produtoId) })));
      assoc.setAttribute("aria-label", `${l.texto} vira ${nomeDe(l.produtoId)}`);
    } else if (!l.manual && l.certeza === "confira" && l.candidatos.length) {
      assoc = el("p", { className: "conf-assoc" }, selo("confira", "Confira"),
        el("span", { className: "nome" }, `${l.texto} `, el("span", { className: "seta", textContent: "→" }), " ", el("strong", { textContent: l.candidatos[0].nome }), "?"));
      assoc.setAttribute("aria-label", `${l.texto} talvez seja ${l.candidatos[0].nome}`);
    } else {
      assoc = el("p", { className: "conf-assoc" }, selo("nenhum", "Não está no Radar"));
    }
    const valor = el("span", { className: "qtd-valor", textContent: String(l.qtd) });
    const mudaQtd = (n) => { l.qtd = Math.min(MAX_QTD, Math.max(1, n)); valor.textContent = String(l.qtd); };
    const qtd = el("div", { className: "qtd" },
      mini("−", "Diminuir quantidade de " + nome, () => mudaQtd(l.qtd - 1)),
      valor,
      mini("+", "Aumentar quantidade de " + nome, () => mudaQtd(l.qtd + 1)));
    const trocar = mini(l.produtoId ? "Trocar" : "Escolher", (l.produtoId ? "Trocar o produto de " : "Escolher o produto de ") + nome, async () => {
      const r = await escolherProduto(l);
      if (r === undefined) return;
      l.produtoId = r;
      l.manual = true;
      mostrarConferencia(null, false, l.id);
    });
    const remover = mini("Remover", "Remover " + nome + " da lista", () => { linhas = linhas.filter((x) => x !== l); mostrarConferencia(null, true); });
    remover.className = "mini remover";
    const cartao = el("div", { className: "cartao conf-linha" }, rot, campoTexto, assoc, el("div", { className: "conf-acoes" }, qtd, trocar, remover));
    return { cartao, campoTexto };
  }

  // Resolve o id do produto escolhido, null (nenhum) ou undefined (cancelou).
  function escolherProduto(l) {
    return abrirDialogo("Qual é o produto?", (d, fechar) => {
      let escolhido = l.produtoId ?? (l.certeza === "confira" && l.candidatos[0] ? l.candidatos[0].id : null);
      const [rot, busca] = campo("buscar-produto", "Procurar no Radar", { type: "search", autocomplete: "off", placeholder: "Ex.: açúcar" });
      const lista = el("ul", { className: "opcoes" });
      const grupo = el("fieldset", {}, el("legend", { className: "muted", textContent: "Opções parecidas" }), lista);
      const desenhar = () => {
        lista.replaceChildren();
        const texto = busca.value.trim();
        const itens = texto ? buscarProdutos(dados, texto, 8).map((p) => ({ id: p.id, nome: String(p.nome ?? p.id) })) : l.candidatos.slice();
        if (l.produtoId && !itens.some((x) => x.id === l.produtoId)) itens.unshift({ id: l.produtoId, nome: nomeDe(l.produtoId) });
        itens.push({ id: null, nome: "Nenhum / comprar em outro lugar" });
        itens.forEach((it, n) => {
          const idr = `opc-${l.id}-${n}`;
          const r = el("input", { type: "radio", name: "produto-" + l.id, id: idr, checked: escolhido === it.id });
          r.addEventListener("change", () => { escolhido = it.id; });
          const lab = el("label", { textContent: it.nome });
          lab.setAttribute("for", idr);
          lista.append(el("li", { className: "opcao" }, r, lab));
        });
      };
      busca.addEventListener("input", desenhar);
      desenhar();
      d.append(
        el("p", { className: "muted", textContent: "Item lido: " + l.texto }), rot, busca, grupo,
        el("div", { className: "acoes" }, botao("Usar este produto", "botao", () => fechar(escolhido)), botao("Cancelar", "botao sec", () => fechar(undefined))));
      return busca;
    });
  }

  async function acrescentar() {
    const texto = await abrirDialogo("Acrescentar item", (d, fechar) => {
      const [rot, inp] = campo("novo-item", "O que falta na lista?", { type: "text", autocomplete: "off", placeholder: "Ex.: café 500g" });
      inp.setAttribute("aria-describedby", "novo-item-ajuda");
      const enviar = () => { const t = inp.value.trim(); if (t) fechar(t); else foco(inp); };
      inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter") enviar(); });
      d.append(rot, inp, el("p", { id: "novo-item-ajuda", className: "campo-ajuda", textContent: "O Radar procura o produto parecido na hora." }),
        el("div", { className: "acoes" }, botao("Acrescentar", "botao", enviar), botao("Cancelar", "botao sec", () => fechar(undefined))));
      return inp;
    });
    if (typeof texto !== "string") return;
    const l = novaLinha(texto, 1);
    linhas.push(l);
    mostrarConferencia(null, false, l.id);
  }

  // ---- calcular ----
  function juntarOuSubstituir() {
    return abrirDialogo("Você já tem uma lista", (d, fechar) => {
      const juntar = botao("Juntar com a lista atual", "botao", () => fechar("juntar"));
      const substituir = botao("Substituir", "botao sec", async () => {
        const sim = await abrirDialogo("Substituir a lista?", (d2, fechar2) => {
          const voltar = botao("Voltar", "botao sec", () => fechar2(false));
          d2.append(el("p", { textContent: "Os itens atuais serão apagados." }),
            el("div", { className: "acoes" }, botao("Substituir mesmo", "botao", () => fechar2(true)), voltar));
          return voltar;
        }, { alerta: true });
        if (sim) fechar("substituir");
      });
      d.append(
        el("p", { textContent: "Juntar com a lista atual ou substituir?" }),
        el("p", { className: "muted", textContent: "Juntar soma as quantidades dos itens repetidos." }),
        el("div", { className: "acoes" }, juntar, substituir, botao("Voltar", "botao sec", () => fechar(undefined))));
      return juntar;
    });
  }

  async function calcularLista() {
    const prontas = consolidar(linhasValidas().map((l) => ({ texto: l.texto.trim(), qtd: l.qtd, produtoId: l.produtoId })));
    if (!prontas.length) return;
    const atual = typeof deps.obterLista === "function" ? deps.obterLista() : null;
    let modo = "juntar";
    if (atual && ((atual.itens && atual.itens.length) || (atual.extras && atual.extras.length))) {
      modo = await juntarOuSubstituir();
      if (!modo) return;
    }
    const nova = aplicarNaLista(atual, prontas, modo);
    linhas = [];
    mostrarEntrada();
    $status.textContent = `Lista pronta: ${textoItens(prontas.length)}`;
    aoAplicar(nova);
    if (deps.titulo) { foco(deps.titulo); try { deps.titulo.scrollIntoView(); } catch {} }
  }

  // ---- início ----
  if (deps.window && typeof deps.window.addEventListener === "function") {
    const refazer = () => { if (!ocupado) mostrarEntrada(); };
    deps.window.addEventListener("online", refazer);
    deps.window.addEventListener("offline", refazer);
  }
  raiz.append($entrada);
  if (!deps.slotBotao) raiz.append(slot);
  mostrarEntrada();
  return {
    redesenhar: () => { if (!ocupado) desenharEntrada(); },
    abrirChave: (disparador) => { if (disparador) ultimoBotao = disparador; return dialogoChave(); },
  };
}
