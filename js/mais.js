// Tela Mais: cartão de linhas (versão, tema, chave do Gemini, instalar) e três blocos que abrem e fecham
// (Situação da coleta, Como funciona, Novidades). Nenhuma função lança exceção.
// deps: { document, storage, VERSION, checkUpdate(), applyUpdate(), eventoInstalar() -> evento|null, instalado(),
//         agora: Date, buscar(url, init), gemini }. Usa só o que o dados.json traz em "coleta" (sem mensagem de erro, sem caminhos).
import { EXPLICACAO, NOME_TEMA, lerTema, gravarTema, proximoTema, lerChangelog, versaoAtual } from "./sobre.js";
import { fontesParaTela, linhaFonte, coletaPrecisaAtencao } from "./coleta.js";
import { situacaoFrescor } from "./frescor.js";
import { renderListaFoto } from "./lista_foto.js";

export function renderMais(raiz, ctx, deps) {
  const doc = deps.document;
  const el = (tag, props = {}, ...filhos) => {
    const e = doc.createElement(tag);
    Object.assign(e, props);
    e.append(...filhos);
    return e;
  };
  const botao = (texto, aoClicar, rotulo) => {
    const b = el("button", { type: "button", className: "botao sec", textContent: texto });
    if (rotulo) b.setAttribute("aria-label", rotulo);
    b.addEventListener("click", aoClicar);
    return b;
  };
  const linha = (titulo, apoio, ...acoes) => {
    const texto = el("div", { className: "texto-mais" }, el("p", { className: "titulo-mais", textContent: titulo }));
    if (apoio) texto.append(apoio);
    return el("div", { className: "linha-mais" }, texto, ...acoes);
  };
  const apoioTexto = (t) => el("p", { className: "apoio-mais", textContent: t });

  const tela = el("div", { className: "tela-mais" });
  tela.append(el("h2", { className: "so-leitor", textContent: "Mais" }));
  const cartao = el("div", { className: "cartao" });

  // ---- versão: "Buscar" só afirma o que foi checado ----
  let nova = false;
  const msg = el("p", { className: "apoio-mais", textContent: "", role: "status" });
  const buscar = botao("Buscar", async () => {
    if (nova) { deps.applyUpdate(); return; }
    msg.textContent = "Buscando…";
    const r = await deps.checkUpdate();
    if (r.erro) msg.textContent = "Não consegui verificar agora. Tente de novo com internet.";
    else if (r.nova) {
      nova = true;
      msg.textContent = `A versão ${r.version} está disponível`;
      buscar.textContent = "Atualizar";
    } else msg.textContent = "Você está na versão mais nova";
  });
  cartao.append(linha(`Versão ${deps.VERSION}`, msg, buscar));

  // ---- tema ----
  const tema = botao("", () => {
    const t = gravarTema(deps.storage, proximoTema(lerTema(deps.storage)));
    const raizDoc = doc.documentElement;
    if (raizDoc) {
      if (t === "auto") raizDoc.removeAttribute("data-theme");
      else raizDoc.setAttribute("data-theme", t);
    }
    mostrarTema();
  });
  const mostrarTema = () => { tema.textContent = NOME_TEMA[lerTema(deps.storage)]; };
  mostrarTema();
  tema.setAttribute("aria-label", "Tema do app");
  cartao.append(linha("Tema", null, tema));

  // ---- chave do Gemini: reaproveita o diálogo da Lista (a âncora fica vazia na tela) ----
  const ancora = el("div", { className: "ancora-mais" });
  const abrirChave = deps.gemini
    ? renderListaFoto(ancora, { estadoDados: "ok", dados: { produtos: [] } },
      { document: doc, storage: deps.storage, gemini: deps.gemini, slotBotao: el("div", {}), obterLista: () => null }, () => {})
    : null;
  if (abrirChave) {
    const abrir = botao("Abrir", () => abrirChave.abrirChave(abrir), "Abrir a chave do Gemini");
    cartao.append(linha("Chave do Gemini", apoioTexto("Para ler a lista por foto"), abrir));
  }

  // ---- instalar: só se o navegador ofereceu ----
  const evento = typeof deps.eventoInstalar === "function" ? deps.eventoInstalar() : null;
  if (evento) {
    const instalar = botao("Instalar", async () => {
      evento.prompt();
      await evento.userChoice;
      if (typeof deps.aoInstalar === "function") deps.aoInstalar();
      linhaInstalar.hidden = true;
    });
    const linhaInstalar = linha("Instalar o app", apoioTexto("Fica na tela inicial do celular"), instalar);
    cartao.append(linhaInstalar);
  }
  tela.append(cartao);

  // ---- Situação da coleta ----
  const dadosOk = ctx.estadoDados === "ok" && ctx.dados ? ctx.dados : null;
  const agora = deps.agora instanceof Date ? deps.agora : new Date();
  const coleta = el("details", { className: "rec" }, el("summary", { textContent: "Situação da coleta" }));
  const corpoColeta = el("div", { className: "bloco-mais" });
  if (ctx.estadoDados === "atualize") corpoColeta.append(el("p", { textContent: "Atualize o app para ver a coleta." }));
  else if (!dadosOk) corpoColeta.append(el("p", { textContent: "Ainda sem preços. Abra o app com internet uma vez." }));
  else {
    const fontes = fontesParaTela(dadosOk);
    if (!fontes.length) corpoColeta.append(el("p", { textContent: "Nenhuma fonte registrada ainda." }));
    for (const f of fontes) corpoColeta.append(el("p", { textContent: linhaFonte(f, agora) }));
    if (situacaoFrescor(dadosOk.gerado_em, agora).estado === "velho") {
      corpoColeta.append(el("p", { className: "apoio-mais", textContent: "O computador da coleta pode estar desligado." }));
    }
    if (coletaPrecisaAtencao(dadosOk, agora)) coleta.open = true;
  }
  coleta.append(corpoColeta);

  // ---- Como funciona ----
  const como = el("details", { className: "rec" }, el("summary", { textContent: "Como funciona" }),
    el("div", { className: "bloco-mais" }, ...EXPLICACAO.map((t) => el("p", { textContent: t }))));

  // ---- Novidades: só a versão mais nova ----
  const corpoNovidades = el("div", { className: "bloco-mais" }, el("p", { className: "apoio-mais", textContent: "Carregando…" }));
  const novidades = el("details", { className: "rec" }, el("summary", { textContent: "Novidades" }), corpoNovidades);
  tela.append(coleta, como, novidades, ancora);
  raiz.append(tela);

  const pronto = (async () => {
    try {
      const resp = await deps.buscar("CHANGELOG.md", { cache: "no-cache" });
      if (!resp.ok) throw new Error("http");
      const v = versaoAtual(lerChangelog(await resp.text()));
      if (!v) throw new Error("vazio");
      corpoNovidades.replaceChildren(
        el("h4", { textContent: "Versão " + v.versao }),
        el("ul", {}, ...v.itens.map((i) => el("li", { textContent: i }))),
        el("p", { className: "apoio-mais", textContent: "As versões anteriores ficam no arquivo de novidades do projeto." }));
    } catch {
      corpoNovidades.replaceChildren(el("p", { textContent: "Não consegui carregar as novidades agora." }));
    }
  })();
  return { pronto };
}
