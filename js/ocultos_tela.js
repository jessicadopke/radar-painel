// Mais > Produtos ocultos (#187): lista por nome, "Voltar a mostrar", "Esquecer" nos que saíram da coleta e "Mostrar todos"
// com confirmação no próprio cartão. Nenhuma função lança exceção.
// deps: { document, storage, ocultos (controle) }. Usa ctx.dadosCompletos (os ocultos continuam lá) só para separar os órfãos.
import { lerOcultos, orfaos } from "./ocultos.js";

const dataCurta = (iso) => {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[2]}/${m[1]}` : "";
};

export function renderOcultos(raiz, ctx, deps) {
  const doc = deps.document;
  const el = (tag, props = {}, ...filhos) => {
    const e = doc.createElement(tag);
    Object.assign(e, props);
    e.append(...filhos);
    return e;
  };
  const estado = lerOcultos(deps.storage);
  const dados = ctx.estadoDados === "ok" ? (ctx.dadosCompletos ?? ctx.dados) : null;
  const saidos = new Set(dados ? orfaos(dados, estado).map((i) => i.id) : []);
  const porNome = [...estado.itens].sort((a, b) => String(a.nome || a.id).localeCompare(String(b.nome || b.id), "pt-BR"));
  const normais = porNome.filter((i) => !saidos.has(i.id));
  const sumidos = porNome.filter((i) => saidos.has(i.id));
  const nomeDe = (i) => i.nome || i.id;

  const voltar = el("a", { className: "voltar", href: "#mais", textContent: "← Mais" });
  const caixa = el("div", { className: "tela-ocultos" });
  caixa.append(el("h2", { textContent: "Produtos ocultos" }),
    el("p", { className: "muted sub-ocultos", textContent: "Não aparecem nas ofertas, nos produtos nem nos alertas deste celular. A coleta e os preços continuam iguais." }));

  const linhaItem = (i, rotulo, apoio, acao) => {
    const b = el("button", { type: "button", className: "botao sec", textContent: rotulo });
    b.setAttribute("aria-label", `${rotulo}: ${nomeDe(i)}`);
    b.addEventListener("click", acao);
    return el("div", { className: "linha-oculto" },
      el("div", { className: "texto-oculto" }, el("p", { className: "nome-oculto", textContent: nomeDe(i) }), el("p", { className: "muted", textContent: apoio })), b);
  };

  const corpo = el("div", { className: "corpo-ocultos" });
  function desenhar(confirmando, foco) {
    corpo.replaceChildren();
    if (!estado.itens.length) {
      corpo.append(el("div", { className: "cartao" }, el("p", { className: "vazio-titulo", textContent: "Nenhum produto oculto." }),
        el("p", { className: "muted", textContent: "Os produtos que você ocultar aparecem aqui." })));
      return;
    }
    if (normais.length) {
      corpo.append(el("div", { className: "cartao tight" },
        ...normais.map((i) => linhaItem(i, "Voltar a mostrar", i.em ? "Oculto em " + dataCurta(i.em) : "Oculto", () => deps.ocultos.mostrar(i.id)))));
    }
    if (sumidos.length) {
      corpo.append(el("h3", { className: "titulo-sec", textContent: "Não aparecem mais nos preços" }),
        el("div", { className: "cartao tight" },
          ...sumidos.map((i) => linhaItem(i, "Esquecer", "Saiu da coleta. Se voltar, continua oculto.", () => deps.ocultos.mostrar(i.id)))));
    }
    if (confirmando) {
      const sim = el("button", { type: "button", className: "botao", textContent: "Mostrar todos" });
      const nao = el("button", { type: "button", className: "botao sec", textContent: "Cancelar" });
      sim.addEventListener("click", () => deps.ocultos.mostrarTodos());
      nao.addEventListener("click", () => { desenhar(false, "todos"); });
      const c = el("div", { className: "cartao confirma" },
        el("p", { className: "confirma-titulo", textContent: `Mostrar de novo os ${estado.itens.length} produtos ocultos?` }),
        el("p", { className: "muted", textContent: "Eles voltam para as ofertas e para os produtos." }),
        el("div", { className: "acoes" }, sim, nao));
      c.setAttribute("role", "group");
      c.setAttribute("aria-label", "Confirmar");
      corpo.append(c);
      if (foco && typeof sim.focus === "function") sim.focus();
      return;
    }
    const todos = el("button", { type: "button", className: "botao sec", textContent: "Mostrar todos" });
    todos.addEventListener("click", () => desenhar(true, "confirma"));
    corpo.append(el("div", { className: "acoes" }, todos));
    if (foco === "todos" && typeof todos.focus === "function") todos.focus();
  }
  desenhar(false, null);
  caixa.append(corpo);
  raiz.append(voltar, caixa);
  return { pronto: Promise.resolve() };
}
