// Tela Hoje: lógica pura (sem DOM) + montagem da tela. Nenhuma função lança exceção.
import { formatarPreco, formatarLojas } from "./inicio.js";

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
  itens.sort((a, b) =>
    ((a.oferta ? 0 : 1) - (b.oferta ? 0 : 1)) ||
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
export function textoDiferenca(diferenca, situacao) {
  if (situacao === "sem-oferta") return "Sem oferta agora";
  if (situacao === "sem-alvo") return "Alvo ainda em cálculo";
  if (situacao === "no-alvo") return "No alvo";
  if (!diferenca || !ehNumero(diferenca.valor) || !ehNumero(diferenca.pct)) return "";
  const dinheiro = formatarPreco(Math.abs(diferenca.valor));
  const pct = Math.abs(diferenca.pct);
  if (situacao === "abaixo") return `${dinheiro} abaixo do alvo (−${pct}%)`;
  if (situacao === "acima") return `${dinheiro} acima do alvo (+${pct}%)`;
  return "";
}

export function textoContagem(n, total) {
  if (!n) return "Nenhum produto encontrado";
  const palavra = (n === total ? n : total) === 1 ? "produto" : "produtos";
  return n === total ? `${n} ${palavra}` : `${n} de ${total} ${palavra}`;
}

// ---- DOM ----
// deps: { document, filtros ({busca, categoria, mercado}, alterado no lugar), linkProduto (bool) }
export function renderHoje(raiz, ctx, deps) {
  const doc = deps.document;
  const el = (tag, props = {}, ...filhos) => {
    const e = doc.createElement(tag);
    Object.assign(e, props);
    e.append(...filhos);
    return e;
  };
  const titulo = el("h2", { textContent: "Hoje" });
  const vazio = (texto, botao) => {
    const c = el("div", { className: "cartao" }, el("p", { textContent: texto }));
    if (botao) c.append(el("div", { className: "acoes" }, botao));
    raiz.append(titulo, c);
  };

  if (ctx.estadoDados === "atualize") return vazio("Atualize o app para ver as ofertas.", el("a", { className: "botao", href: "#sobre", textContent: "Ir para Sobre" }));
  if (ctx.estadoDados !== "ok" || !ctx.dados) return vazio("Ainda sem dados. Abra o app com internet uma vez.");
  const total = produtosDe(ctx.dados).length;
  if (!total) return vazio("Nenhum produto na lista ainda.");

  const filtros = deps.filtros;
  const $busca = el("input", {
    type: "search", className: "busca", placeholder: "Buscar produto (ex.: café)", value: filtros.busca || "",
    autocomplete: "off",
  });
  $busca.setAttribute("aria-label", "Buscar produto");
  $busca.setAttribute("enterkeyhint", "search");
  const $status = el("p", { className: "muted contagem", role: "status" });
  const $lista = el("div", { className: "lista-hoje" });

  function fileira(rotulo, todos, valores, chave) {
    const caixa = el("div", { className: "filtros", role: "group" });
    caixa.setAttribute("aria-label", rotulo);
    const botoes = [["", todos], ...valores.map((v) => [v, v])].map(([valor, texto]) => {
      const b = el("button", { type: "button", className: "filtro", textContent: texto });
      b.addEventListener("click", () => {
        filtros[chave] = valor;
        botoes.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        desenhar();
      });
      return b;
    });
    const marcar = () => botoes.forEach((x, i) => x.setAttribute("aria-pressed", String((filtros[chave] || "") === (i === 0 ? "" : valores[i - 1]))));
    marcar();
    caixa.append(...botoes);
    return { caixa, marcar };
  }
  const fCat = fileira("Categorias", "Todas", categoriasDe(ctx.dados), "categoria");
  const fMer = fileira("Mercados", "Todos", mercadosDe(ctx.dados), "mercado");

  function desenhar() {
    const itens = listaHoje(ctx.dados, filtros);
    $status.textContent = textoContagem(itens.length, total);
    $lista.replaceChildren();
    if (!itens.length) {
      const limpar = el("button", { type: "button", className: "botao", textContent: "Limpar filtros" });
      limpar.addEventListener("click", () => {
        filtros.busca = ""; filtros.categoria = ""; filtros.mercado = "";
        $busca.value = "";
        fCat.marcar(); fMer.marcar();
        desenhar();
      });
      $lista.append(el("div", { className: "cartao" }, el("p", { textContent: "Nenhum produto encontrado." }), el("div", { className: "acoes" }, limpar)));
      return;
    }
    itens.forEach((i) => $lista.append(cartao(i, Boolean(filtros.mercado), deps, el)));
  }

  $busca.addEventListener("input", () => { filtros.busca = $busca.value; desenhar(); });
  raiz.append(titulo, $busca, fCat.caixa, fMer.caixa, $status, $lista);
  desenhar();
}

function cartao(i, comMercado, deps, el) {
  const corpo = el("div", { className: "corpo" }, el("h3", { textContent: String(i.nome ?? "") }));
  if (i.categoria) corpo.append(el("p", { className: "muted", textContent: String(i.categoria) }));
  const o = i.oferta;
  if (o) {
    const medida = i.medida ? ` / ${i.medida}` : "";
    corpo.append(el("p", { className: "preco", textContent: formatarPreco(o.preco_medida) + medida }));
    const lojas = formatarLojas(o.lojas);
    corpo.append(el("p", { className: "muted", textContent: (comMercado ? "" : "Mais barato: ") + String(o.mercado ?? "") + (lojas ? " · " + lojas : "") }));
    if (ehNumero(o.preco) && ehNumero(o.quantidade) && o.unidade) {
      corpo.append(el("p", { className: "muted", textContent: `${formatarPreco(o.preco)} · ${o.quantidade} ${o.unidade}` }));
    }
    if (ehNumero(o.preco_condicional)) {
      const cond = ehNumero(o.preco_cond_medida) ? o.preco_cond_medida : o.preco_condicional;
      corpo.append(el("p", { className: "muted", textContent: `${formatarPreco(cond)}${medida} com condição` }));
      if (o.condicao) corpo.append(el("p", { className: "muted", textContent: String(o.condicao) }));
    }
  }
  const selo = i.situacao === "abaixo" ? "Abaixo do alvo" : i.situacao === "no-alvo" ? "No alvo" : "";
  const linha = el("p", { className: "diferenca" });
  if (selo) linha.append(el("span", { className: "selo-alvo", textContent: selo }), " ");
  linha.append(textoDiferenca(i.diferenca, i.situacao));
  corpo.append(linha);
  if (i.situacao !== "sem-alvo" && i.situacao !== "sem-oferta" && i.alvo && ehNumero(i.alvo.valor)) {
    corpo.append(el("p", { className: "muted", textContent: "Alvo: " + formatarPreco(i.alvo.valor) }));
  }
  return deps.linkProduto && i.id != null
    ? el("a", { className: "item-hoje", href: "#produto/" + encodeURIComponent(i.id) }, corpo)
    : el("div", { className: "item-hoje" }, corpo);
}
