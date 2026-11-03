// Tela Ofertas (aba antes chamada Início; rota e id continuam "inicio"): todas as ofertas vigentes em grupos
// que abrem e fecham. Nenhuma função lança exceção.
import { cartaoOferta, precoDaOferta, ofertaDoAlerta } from "./oferta.js";
import { situacaoDe, textoEstado } from "./hoje.js";
import { textoCondicao } from "./produto.js";
import { alertasParaInicio, faixaDaLista, formatarValidade } from "./inicio.js";
import { agruparOfertas, desenharGrupos, lerEstado, gravarEstado } from "./grupos.js";

const ehNumero = (n) => typeof n === "number" && Number.isFinite(n);
const MODOS = [["merc", "Mercado"], ["cat", "Categoria"], ["boas", "Só as boas"]];

// Ofertas que originaram um alerta novo (selo "Novo", mesma lógica do alertasParaInicio).
export function ofertasNovas(dados, visitaAnterior) {
  const novas = new Set();
  for (const a of alertasParaInicio(dados, visitaAnterior)) {
    if (!a.novo) continue;
    const o = ofertaDoAlerta(dados, a);
    if (o) novas.add(o);
  }
  return novas;
}

// Dados do cartão de uma oferta (item de agruparOfertas). Só preço condicional: mostra o condicional e a condição.
export function dadosDoCartao(item, { hoje, novas, linkProduto } = {}) {
  const { produto: p, oferta: o } = item;
  const base = { id: p.id, nome: p.nome, marca: o.marca ?? p.marca, mercado: o.mercado, lojas: o.lojas, novo: Boolean(novas && novas.has(o)), link: linkProduto };
  const temDia = /^\d{4}-\d{2}-\d{2}/.test(String(o.validade_fim ?? ""));
  const aviso = { venceHoje: item.venceHoje, validade: !item.venceHoje && temDia ? formatarValidade(o.validade_fim, hoje) : undefined, selo: item.boa };
  const cond = textoCondicao(o, p.medida);
  if (!ehNumero(o.preco_medida)) {
    const porMedida = ehNumero(o.preco_cond_medida);
    return { ...base, ...aviso, selo: false, preco: porMedida ? o.preco_cond_medida : o.preco_condicional, medida: porMedida ? p.medida : undefined,
      situacao: "sem-alvo", condicao: cond };
  }
  const { situacao, diferenca } = situacaoDe(o, p.alvo);
  const pc = precoDaOferta(o, p.medida);
  return { ...base, ...aviso, preco: o.preco_medida, medida: p.medida, situacao, texto: textoEstado(diferenca, situacao),
    pacote: pc.modo === "pacote" ? { preco: pc.principal, embalagem: pc.embalagem } : undefined, condicao: cond || undefined };
}

// deps: { document, visitaAnterior, hojeIso, linkProduto, storage, filtros ({busca, modo}, só em memória) }
export function renderOfertas(raiz, ctx, deps) {
  const doc = deps.document;
  const el = (tag, props = {}, ...filhos) => {
    const e = doc.createElement(tag);
    Object.assign(e, props);
    e.append(...filhos);
    return e;
  };
  const titulo = () => el("h2", { className: "so-leitor", textContent: "Ofertas" });
  const vazio = (texto, botao) => {
    const c = el("div", { className: "cartao" }, el("p", { textContent: texto }));
    if (botao) c.append(el("div", { className: "acoes" }, el("a", { className: "botao", href: botao.href, textContent: botao.texto })));
    raiz.append(titulo(), c);
  };
  if (ctx.estadoDados === "atualize") return vazio("Atualize o app para ver os alertas.", { href: "#mais", texto: "Ir para Mais" });
  if (ctx.estadoDados !== "ok" || !ctx.dados) return vazio("Ainda sem preços. Abra o app com internet uma vez.");

  const dados = ctx.dados;
  const filtros = deps.filtros && typeof deps.filtros === "object" ? deps.filtros : { busca: "" };
  const lembrado = deps.storage ? lerEstado(deps.storage)["ofertas.modo"] : null;
  let modo = filtros.modo ?? lembrado ?? "merc";
  const novas = ofertasNovas(dados, deps.visitaAnterior);
  const opcoes = (extra) => ({ hoje: deps.hojeIso, alertas: dados.alertas, ...extra });

  const faixa = faixaDaLista(el, ctx, deps.storage);
  if (faixa) raiz.append(faixa);
  if (!agruparOfertas(dados, opcoes({ modo: "merc" })).total) {
    raiz.append(titulo(),
      el("div", { className: "cartao vazio-inicio" },
        el("p", { className: "vazio-titulo", textContent: "Nenhuma oferta agora" }),
        el("p", { className: "muted", textContent: "Quando houver ofertas vigentes, elas aparecem aqui." }),
        el("div", { className: "acoes" }, el("a", { className: "botao", href: "#produtos", textContent: "Ver todos os produtos" }))));
    return;
  }

  const $busca = el("input", { type: "search", className: "busca", placeholder: "Buscar produto, marca ou mercado", value: filtros.busca || "", autocomplete: "off" });
  $busca.setAttribute("aria-label", "Buscar produto, marca ou mercado");
  $busca.setAttribute("enterkeyhint", "search");
  const caixa = el("div", { className: "filtros uma", role: "group" });
  caixa.setAttribute("aria-label", "Agrupar por");
  const chips = MODOS.map(([chave, texto]) => {
    const b = el("button", { type: "button", className: "filtro", textContent: texto });
    b.addEventListener("click", () => {
      modo = chave;
      filtros.modo = chave;
      if (deps.storage) gravarEstado(deps.storage, { "ofertas.modo": chave });
      marcar();
      desenhar();
    });
    return { chave, b };
  });
  function marcar() { chips.forEach(({ chave, b }) => b.setAttribute("aria-pressed", String(chave === modo))); }
  marcar();
  caixa.append(...chips.map((x) => x.b));
  const $lista = el("div", { className: "lista-ofertas" });
  $busca.addEventListener("input", () => { filtros.busca = $busca.value; desenhar(); });

  const cartao = (item, e) => cartaoOferta(e, dadosDoCartao(item, { hoje: deps.hojeIso, novas, linkProduto: deps.linkProduto }));

  function desenhar() {
    $lista.replaceChildren();
    const busca = (filtros.busca || "").trim();
    const r = agruparOfertas(dados, opcoes({ modo, busca }));
    if (!r.total) {
      const resumo = el("p", { className: "linha-resumo", textContent: busca ? "Nada encontrado" : "Nenhuma oferta boa agora" });
      resumo.setAttribute("role", "status");
      let conteudo;
      if (busca) {
        const limpar = el("button", { type: "button", className: "botao", textContent: "Limpar busca" });
        limpar.addEventListener("click", () => { filtros.busca = ""; $busca.value = ""; desenhar(); });
        conteudo = el("div", { className: "cartao" }, el("p", { textContent: `Nada com “${busca}”` }),
          el("p", { className: "muted", textContent: "Tente outra palavra ou apague a busca." }), el("div", { className: "acoes" }, limpar));
      } else {
        conteudo = el("div", { className: "cartao vazio-inicio" }, el("p", { className: "vazio-titulo", textContent: "Nenhuma oferta boa agora" }),
          el("p", { className: "muted", textContent: "Quando um preço ficar abaixo do alvo, ele aparece aqui." }));
      }
      $lista.append(el("div", { className: "barra-grupos" }, resumo), conteudo);
      return;
    }
    if (r.plano) {
      const itens = r.grupos[0].itens;
      const novos = itens.filter((i) => novas.has(i.oferta));
      const antigos = itens.filter((i) => !novas.has(i.oferta));
      $lista.append(el("h2", { className: "titulo-ofertas" }, "Ofertas boas hoje", el("span", { className: "contagem-ofertas", textContent: String(r.total) })));
      novos.forEach((i) => $lista.append(cartao(i, el)));
      if (novos.length && antigos.length) $lista.append(el("h3", { className: "subtitulo", textContent: "Já vistos" }));
      antigos.forEach((i) => $lista.append(cartao(i, el)));
      return;
    }
    desenharGrupos($lista, r.grupos, {
      document: doc, tela: "ofertas", modo, storage: deps.storage, busca: Boolean(busca),
      resumo: [el("b", { textContent: String(r.total) }), r.total === 1 ? " oferta" : " ofertas"], cartao,
    });
  }
  desenhar();
  raiz.append(titulo(), $busca, caixa, $lista,
    el("div", { className: "acoes" }, el("a", { className: "botao sec", href: "#produtos", textContent: "Ver todos os produtos" })));
}
