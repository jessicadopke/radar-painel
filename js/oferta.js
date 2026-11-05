// Cartão de oferta único (Início e Produtos). Nenhuma função lança exceção.
import { formatarPreco, formatarLojas } from "./inicio.js";

export const RELOGIO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

// d: { id, nome, marca (opcional), mercado, lojas, preco, medida, situacao, texto, novo, link (bool), pacote (opcional) }
// preco/medida são sempre o preço por medida (kg, L, un). pacote: { preco, embalagem } troca o destaque pelo
// preço do pacote (igual ao anúncio) e deixa o preço por medida como referência, abaixo.
// Opcionais (sem eles o cartão sai como sempre): venceHoje (aviso "Vence hoje", no lugar de validade), validade (texto
// "Vale até 30/10"), selo (selo "Preço bom"), condicao (texto da linha de condição do preço condicional).
// situacao: "abaixo" põe o preço na etiqueta; "sem-oferta" vira cartão tracejado.
export function cartaoOferta(el, d) {
  const semOferta = d.situacao === "sem-oferta";
  const nome = el("div", { className: "nome" });
  nome.append(String(d.nome ?? ""));
  if (d.novo) nome.append(" ", el("span", { className: "selo-novo", textContent: "Novo" }));
  const meio = el("span", { className: "meio" }, nome);
  if (!semOferta) {
    const lojas = formatarLojas(d.lojas);
    const resto = [d.mercado, lojas].filter(Boolean).join(" · ");
    meio.append(el("div", { className: "sub" }, ...rotuloComMarca(el, d.marca, d.nome, resto)));
    if (d.texto) meio.append(el("div", { className: "estado", textContent: d.texto }));
    if (d.condicao) meio.append(el("div", { className: "sub", textContent: String(d.condicao) }));
    const selos = [];
    if (d.venceHoje) selos.push(el("span", { className: "vence" }, el("span", { className: "ico", ariaHidden: "true", innerHTML: RELOGIO }), "Vence hoje"));
    else if (d.validade) selos.push(el("span", { className: "sub", textContent: String(d.validade) }));
    if (d.selo) selos.push(el("span", { className: "selo-alvo", textContent: "Preço bom" }));
    if (selos.length) meio.append(el("div", { className: "linha-selos" }, ...selos));
  }
  const pacote = !semOferta && d.pacote && d.medida ? d.pacote : null;
  const classeEt = "preco-et" + (d.situacao === "abaixo" ? " bom" : "");
  const lado = semOferta
    ? el("span", { className: "sub", textContent: "sem oferta agora" })
    : pacote
      ? el("span", { className: classeEt }, formatarPreco(pacote.preco),
        el("small", { className: "pc-emb" }, el("span", { className: "so-leitor", textContent: "embalagem de " }), String(pacote.embalagem)),
        el("small", { className: "pc-ref", textContent: `${formatarPreco(d.preco)} por ${d.medida}` }))
      : el("span", { className: classeEt }, formatarPreco(d.preco),
        ...(d.medida ? [el("small", { textContent: `por ${d.medida}` })] : []));
  const classe = "oferta" + (semOferta ? " sem" : "") + (pacote ? " pacote" : "");
  const cartao = d.link && d.id != null
    ? el("a", { className: classe, href: "#produto/" + encodeURIComponent(d.id) }, meio, lado)
    : el("div", { className: classe }, meio, lado);
  // Sem aoAdicionar o cartão sai como sempre. Com ele (aba Ofertas, #188): contêiner com o cartão e o botão lado a lado
  // (botão dentro de <a> é inválido) e a faixa que aparece atrás ao arrastar.
  if (typeof d.aoAdicionar !== "function" || semOferta) return cartao;
  return linhaComLista(el, cartao, d);
}

// ---- adicionar à lista (#188) ----
const ICONE_LISTA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M4 12h10M4 18h6M18 14v8M14 18h8"/></svg>';
const ICONE_ADD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const ICONE_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>';

// Liga/desliga uma classe sem depender de classList.
export function comClasse(no, classe, ligada) {
  const atuais = String(no.className ?? "").split(" ").filter(Boolean).filter((c) => c !== classe);
  no.className = (ligada ? [...atuais, classe] : atuais).join(" ");
}

// Estado "Na lista" do botão (e da linha). `linha.partes` vem de linhaComLista.
export function marcarNaLista(linha, naLista, nome) {
  const p = linha && linha.partes;
  if (!p) return;
  comClasse(linha, "ja", naLista);
  const n = String(nome ?? "");
  p.icone.innerHTML = naLista ? ICONE_OK : ICONE_ADD;
  p.botao.setAttribute("aria-label", naLista ? `Tirar ${n} da lista` : `Adicionar ${n} à lista`);
  if (typeof p.botao.removeAttribute === "function") p.botao.removeAttribute("aria-disabled");
}

// ---- ocultar produto (#187): faixa à esquerda, revelada ao arrastar o cartão para a direita ----
const ICONE_OCULTAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/></svg>';
const emPx = (n) => `${Math.round(Number.isFinite(n) ? n : 0)}px`;

function faixaOcultar(el) {
  const textoOcultar = el("span", { className: "texto-faixa", textContent: "Ocultar produto" });
  const faixaOc = el("span", { className: "acao-ocultar", ariaHidden: "true" }, el("span", { className: "ico", ariaHidden: "true", innerHTML: ICONE_OCULTAR }), textoOcultar);
  return { faixaOc, textoOcultar };
}

// Cartão de Produtos: a mesma linha, só com a faixa de ocultar (sem o botão "+").
export function linhaSoOcultar(el, cartao) {
  const { faixaOc, textoOcultar } = faixaOcultar(el);
  const frente = el("div", { className: "frente" }, cartao);
  const linha = el("div", { className: "oferta-linha so-ocultar" }, faixaOc, frente);
  linha.partes = { frente, faixaOc, textoOcultar };
  return linha;
}

// Desenha o arrasto para a direita (aoMudar do gesto). Devolve true quando é o lado de ocultar;
// nesse caso quem chamou não mexe em --dx. Qualquer outro lado (ou soltar) apaga a faixa.
export function mudarOcultar(linha, { lado, deslocamento, passou, arrastando } = {}) {
  const dir = Boolean(arrastando) && lado === "direita";
  comClasse(linha, "oc-ativo", dir);
  comClasse(linha, "oc-passou", dir && Boolean(passou));
  const p = linha.partes;
  if (p && p.textoOcultar) p.textoOcultar.textContent = dir && passou ? "Solte para ocultar" : "Ocultar produto";
  if (linha.style && typeof linha.style.setProperty === "function") linha.style.setProperty("--dxo", dir ? emPx(deslocamento) : "0px");
  return dir;
}

function linhaComLista(el, cartao, d) {
  const icone = el("span", { className: "ico", ariaHidden: "true", innerHTML: ICONE_ADD });
  const botao = el("button", { type: "button", className: "btn-lista" }, icone);
  botao.addEventListener("click", (e) => {
    try { e.preventDefault(); e.stopPropagation(); } catch {}
    d.aoAdicionar();
  });
  const iconeFaixa = el("span", { className: "ico", ariaHidden: "true", innerHTML: ICONE_LISTA });
  const textoFaixa = el("span", { className: "texto-faixa", textContent: "Adicionar à lista" });
  const faixa = el("span", { className: "acao-atras", ariaHidden: "true" }, iconeFaixa, textoFaixa);
  const frente = el("div", { className: "frente" }, cartao, botao);
  const { faixaOc, textoOcultar } = faixaOcultar(el);
  const linha = el("div", { className: "oferta-linha" }, faixaOc, faixa, frente);
  linha.partes = { frente, faixa, textoFaixa, botao, icone, faixaOc, textoOcultar };
  marcarNaLista(linha, Boolean(d.naLista), d.nome);
  return linha;
}

// ---- preço do pacote (#127) ----
// Fatores para a medida de comparação (mesma tabela do radar/comparar.py).
const FATOR = { kg: ["kg", 1], g: ["kg", 0.001], l: ["L", 1], lt: ["L", 1], ml: ["L", 0.001], un: ["un", 1] };
const NOME_UNIDADE = { kg: "kg", g: "g", l: "L", lt: "L", ml: "ml", un: "un" };
const numero = (n) => typeof n === "number" && Number.isFinite(n);

function textoNumero(n) {
  return String(Number(n.toFixed(3))).replace(".", ",");
}

// { texto, tamanho } quando a embalagem da oferta é diferente da medida do produto; senão null (= como hoje).
export function embalagemDe(oferta, medida) {
  if (!oferta || typeof oferta !== "object") return null;
  const alvo = typeof medida === "string" ? medida.trim().toLowerCase() : "";
  if (alvo !== "kg" && alvo !== "l" && alvo !== "un") return null;
  const { quantidade, unidade, preco, preco_medida: porMedida } = oferta;
  if (!numero(quantidade) || quantidade <= 0 || typeof unidade !== "string") return null;
  const chave = unidade.trim().toLowerCase();
  if (!Object.hasOwn(FATOR, chave)) return null;
  const [base, fator] = FATOR[chave];
  if (base.toLowerCase() !== alvo) return null;
  if (!numero(preco) || preco <= 0 || !numero(porMedida)) return null;
  const tamanho = quantidade * fator;
  if (Math.abs(tamanho - 1) < 1e-9) return null;
  return { texto: `${textoNumero(quantidade)} ${NOME_UNIDADE[chave]}`, tamanho };
}

// Modelo do que o cartão, o herói e as linhas mostram.
export function precoDaOferta(oferta, medida) {
  const emb = embalagemDe(oferta, medida);
  if (emb) return { modo: "pacote", principal: oferta.preco, embalagem: emb.texto, referencia: oferta.preco_medida, medida };
  const o = oferta && typeof oferta === "object" ? oferta : {};
  return { modo: "medida", principal: o.preco_medida, medida };
}

// A oferta que originou um alerta (o alerta só traz preço por medida, mercado, lojas e miniatura).
export function ofertaDoAlerta(dados, alerta) {
  if (!dados || typeof dados !== "object" || !Array.isArray(dados.produtos)) return null;
  if (!alerta || typeof alerta !== "object" || !numero(alerta.preco_medida)) return null;
  const produto = dados.produtos.find((p) => p && typeof p === "object" && alerta.produto_id != null && String(p.id) === String(alerta.produto_id));
  if (!produto || !Array.isArray(produto.ofertas)) return null;
  const lojas = formatarLojas(alerta.lojas);
  const achadas = produto.ofertas.filter((o) => o && typeof o === "object" && o.mercado === alerta.mercado
    && formatarLojas(o.lojas) === lojas && numero(o.preco_medida) && Math.abs(o.preco_medida - alerta.preco_medida) < 0.005);
  return achadas.find((o) => o.miniatura === alerta.miniatura) ?? achadas[0] ?? null;
}

// ---- marca do produto (#129) ----
const semAcento = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const PREPOSICOES = new Set(["de", "da", "do", "dos", "das", "e"]);
// Chave de comparação: sem acento, sem caixa e com pontuação como espaço ("Coca Cola" = "Coca-Cola").
const chaveMarca = (t) => semAcento(t).replace(/[^a-z0-9]+/g, " ").trim();

// Caixa uniforme sem mexer na grafia mista: só normaliza marca toda em maiúsculas ou toda em minúsculas
// (primeira letra de cada palavra e depois de hífen). "Coca-Cola", "ypê Mix" mistos ficam como vieram;
// sigla de uma palavra só com até 3 letras ("BRF") fica em maiúsculas.
export function normalizarMarca(marca) {
  if (typeof marca !== "string") return "";
  const t = marca.replace(/\s+/g, " ").trim();
  if (!t || (t === t.toUpperCase() && t === t.toLowerCase())) return t;
  const maiuscula = t === t.toUpperCase(), minuscula = t === t.toLowerCase();
  if (!maiuscula && !minuscula) return t;
  if (maiuscula && /^\p{L}{1,3}$/u.test(t)) return t;
  // preposições ficam em minúsculas no meio da marca; ponto e apóstrofo também iniciam palavra (M.Dias, D'Or)
  return t.toLowerCase().replace(/(^|[\s\-.'’])(\p{L}+)/gu, (tudo, sep, palavra, pos) =>
    pos > 0 && /\s/.test(sep) && PREPOSICOES.has(palavra) ? tudo : sep + palavra[0].toUpperCase() + palavra.slice(1));
}

// Marca a exibir antes do mercado; "" quando não há marca ou quando o nome do produto exibido já a contém.
export function marcaParaMostrar(marca, nomeProduto) {
  const m = normalizarMarca(marca);
  if (!m) return "";
  const chave = chaveMarca(m);
  if (!chave) return "";
  // limite de palavra: "Sol" não some em "Solução"
  return (" " + chaveMarca(nomeProduto ?? "") + " ").includes(" " + chave + " ") ? "" : m;
}

// Nós do rótulo "Marca · resto": a marca num <span class="marca"> (nunca quebra no meio) e o resto como texto.
export function rotuloComMarca(el, marca, nomeProduto, resto) {
  const m = marcaParaMostrar(marca, nomeProduto);
  const fim = resto == null ? "" : String(resto);
  if (!m) return fim ? [fim] : [];
  return fim ? [el("span", { className: "marca-prod", textContent: m }), " · " + fim] : [el("span", { className: "marca-prod", textContent: m })];
}
