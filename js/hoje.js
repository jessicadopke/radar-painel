// Tela Produtos (arquivo ainda chamado hoje.js): lógica pura (sem DOM) + montagem da tela. Nenhuma função lança exceção.
import { formatarPreco } from "./inicio.js";
import { cartaoOferta, precoDaOferta, linhaSoOcultar, mudarOcultar, comClasse } from "./oferta.js";
import { ativarArrastar } from "./gesto_arrastar.js";
import { textoCondicao } from "./produto.js";
import { agruparProdutos, desenharGrupos } from "./grupos.js";

export function normalizar(texto) {
  if (texto == null) return "";
  return String(texto).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const ehNumero = (n) => typeof n === "number" && Number.isFinite(n);
const listaDe = (x) => (Array.isArray(x) ? x : []);
const produtosDe = (dados) => (dados && typeof dados === "object" ? listaDe(dados.produtos) : []).filter((p) => p && typeof p === "object");

export function diferencaAlvo(precoMedida, alvoValor) {
  if (!ehNumero(precoMedida) || !ehNumero(alvoValor) || alvoValor <= 0) return null;
  return { valor: precoMedida - alvoValor, pct: Math.round(((precoMedida - alvoValor) / alvoValor) * 100) };
}

export function situacaoDe(oferta, alvo) {
  if (!oferta) return { situacao: "sem-oferta", diferenca: null };
  if (!alvo || typeof alvo !== "object" || alvo.suficiente === false) return { situacao: "sem-alvo", diferenca: null };
  const diferenca = diferencaAlvo(oferta.preco_medida, alvo.valor);
  if (!diferenca) return { situacao: "sem-alvo", diferenca: null };
  if (Math.abs(diferenca.valor) < alvo.valor * 0.01) return { situacao: "no-alvo", diferenca };
  return { situacao: diferenca.valor < 0 ? "abaixo" : "acima", diferenca };
}

const comparaNome = (a, b) => normalizar(a).localeCompare(normalizar(b), "pt-BR");

export function listaHoje(dados, filtros) {
  const f = filtros && typeof filtros === "object" ? filtros : {};
  const palavras = normalizar(f.busca).split(/\s+/).filter(Boolean);
  const categoria = f.categoria || "";
  const mercado = f.mercado || "";
  const itens = [];
  for (const p of produtosDe(dados)) {
    const nome = normalizar(p.nome);
    if (!palavras.every((w) => nome.includes(w))) continue;
    if (categoria && p.categoria !== categoria) continue;
    const ofertas = listaDe(p.ofertas).filter((o) => o && typeof o === "object");
    let oferta = ofertas[0] ?? null;
    if (mercado) {
      oferta = ofertas.find((o) => o.mercado === mercado) ?? null;
      if (!oferta) continue;
    }
    const { situacao, diferenca } = situacaoDe(oferta, p.alvo);
    itens.push({ id: p.id, nome: p.nome, categoria: p.categoria, medida: p.medida, alvo: p.alvo ?? null, oferta, diferenca, situacao });
  }
  // ofertas boas (abaixo do alvo, maior desconto primeiro), depois as demais por nome, sem oferta no fim
  const grupo = (i) => (!i.oferta ? 2 : i.situacao === "abaixo" ? 0 : 1);
  itens.sort((a, b) =>
    (grupo(a) - grupo(b)) ||
    (grupo(a) === 0 ? a.diferenca.pct - b.diferenca.pct : 0) ||
    comparaNome(a.nome ?? "", b.nome ?? "") ||
    String(a.id ?? "").localeCompare(String(b.id ?? "")));
  return itens;
}

const unicos = (valores) => [...new Set(valores.filter((v) => typeof v === "string" && v))].sort(comparaNome);

export function categoriasDe(dados) {
  return unicos(produtosDe(dados).map((p) => p.categoria));
}

export function mercadosDe(dados) {
  return unicos(produtosDe(dados).flatMap((p) => listaDe(p.ofertas).map((o) => o && o.mercado)));
}

// ---- textos ----
// Estado do cartão de oferta: uma frase só ("14% abaixo do alvo"); vazio quando não há o que dizer.
export function textoEstado(diferenca, situacao) {
  if (situacao === "no-alvo") return "No alvo";
  if (situacao !== "abaixo" && situacao !== "acima") return "";
  if (!diferenca || !ehNumero(diferenca.pct)) return "";
  return `${Math.abs(diferenca.pct)}% ${situacao === "abaixo" ? "abaixo" : "acima"} do alvo`;
}

// ---- DOM ----
// deps: { document, filtros ({busca, mercado}, alterado no lugar), linkProduto (bool), hojeIso, storage, ocultos (controle, #187) }
export function renderHoje(raiz, ctx, deps) {
  const doc = deps.document;
  const el = (tag, props = {}, ...filhos) => {
    const e = doc.createElement(tag);
    Object.assign(e, props);
    e.append(...filhos);
    return e;
  };
  const titulo = el("h2", { className: "so-leitor", textContent: "Produtos" });
  const vazio = (texto, botao) => {
    const c = el("div", { className: "cartao" }, el("p", { textContent: texto }));
    if (botao) c.append(el("div", { className: "acoes" }, botao));
    raiz.append(titulo, c);
  };

  if (ctx.estadoDados === "atualize") return vazio("Atualize o app para ver as ofertas.", el("a", { className: "botao", href: "#mais", textContent: "Ir para Mais" }));
  if (ctx.estadoDados !== "ok" || !ctx.dados) return vazio("Ainda sem preços. Abra o app com internet uma vez.");
  const total = produtosDe(ctx.dados).length;
  if (!total) return vazio("Nenhum produto na lista ainda.");

  const filtros = deps.filtros;
  const $busca = el("input", {
    type: "search", className: "busca", placeholder: "Buscar produto", value: filtros.busca || "",
    autocomplete: "off",
  });
  $busca.setAttribute("aria-label", "Buscar produto");
  $busca.setAttribute("enterkeyhint", "search");
  const $lista = el("div", { className: "lista-hoje" });

  // uma fileira só: Todos e mercados (tracejados); a categoria virou o grupo. Tocar no marcado desmarca
  const caixa = el("div", { className: "filtros uma", role: "group" });
  caixa.setAttribute("aria-label", "Filtros");
  const chips = [
    { chave: "", valor: "", texto: "Todos" },
    ...mercadosDe(ctx.dados).map((v) => ({ chave: "mercado", valor: v, texto: v })),
  ].map((c) => {
    const b = el("button", { type: "button", className: c.chave === "mercado" ? "filtro mercado" : "filtro", textContent: c.texto });
    b.addEventListener("click", () => {
      if (!c.chave) filtros.mercado = "";
      else filtros.mercado = filtros.mercado === c.valor ? "" : c.valor;
      marcar();
      desenhar();
    });
    return { c, b };
  });
  function marcar() {
    chips.forEach(({ c, b }) => b.setAttribute("aria-pressed", String(c.chave ? filtros.mercado === c.valor : !filtros.mercado)));
  }
  marcar();
  caixa.append(...chips.map((x) => x.b));

  function desenhar() {
    $lista.replaceChildren();
    const busca = (filtros.busca || "").trim();
    const r = agruparProdutos(ctx.dados, { busca, mercado: filtros.mercado || "", hoje: deps.hojeIso });
    if (!r.total) {
      const limpar = el("button", { type: "button", className: "botao", textContent: "Limpar filtros" });
      limpar.addEventListener("click", () => {
        filtros.busca = ""; filtros.categoria = ""; filtros.mercado = "";
        $busca.value = "";
        marcar();
        desenhar();
      });
      $lista.append(el("div", { className: "cartao" }, el("p", { textContent: "Nenhum produto encontrado." }), el("div", { className: "acoes" }, limpar)));
      return;
    }
    desenharGrupos($lista, r.grupos, {
      document: doc, tela: "produtos", modo: "cat", storage: deps.storage, busca: Boolean(busca),
      resumo: [el("b", { textContent: String(r.total) }), r.total === 1 ? " produto" : " produtos"],
      cartao: (i, e) => cartao(i, deps, e),
    });
  }

  $busca.addEventListener("input", () => { filtros.busca = $busca.value; desenhar(); });
  raiz.append(titulo, $busca, caixa, $lista);
  desenhar();
}

function cartao(i, deps, el) {
  const o = i.oferta;
  const pc = o ? precoDaOferta(o, i.medida) : null;
  // só preço condicional: mostra o condicional e a condição (nunca fica sem ela)
  const soCondicional = o && !ehNumero(o.preco_medida);
  const porMedida = soCondicional && ehNumero(o.preco_cond_medida);
  const cond = o ? textoCondicao(o, i.medida) : "";
  const c = cartaoOferta(el, {
    pacote: !soCondicional && pc && pc.modo === "pacote" ? { preco: pc.principal, embalagem: pc.embalagem } : undefined,
    id: i.id, nome: i.nome, marca: o ? o.marca : undefined, mercado: o && o.mercado, lojas: o && o.lojas,
    preco: soCondicional ? (porMedida ? o.preco_cond_medida : o.preco_condicional) : o && o.preco_medida,
    medida: soCondicional && !porMedida ? undefined : i.medida,
    situacao: i.situacao, texto: textoEstado(i.diferenca, i.situacao), link: deps.linkProduto,
    venceHoje: Boolean(i.venceHoje), selo: Boolean(i.boa), condicao: cond || undefined,
  });
  if (!deps.ocultos || i.id == null) return c;
  // arrastar para a direita oculta o produto (#187); aqui não há o "+" da lista, só a faixa de ocultar
  const linha = linhaSoOcultar(el, c);
  const id = String(i.id), nome = String(i.nome ?? "");
  ativarArrastar(linha.partes.frente, {
    direita: { rotulo: "Ocultar produto", acao: () => deps.ocultos.ocultarDoCartao(id, nome) },
    aoMudar: (m) => comClasse(linha, "arrastando", mudarOcultar(linha, m)),
  });
  return linha;
}
