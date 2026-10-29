// Cartão de oferta único (Início e Produtos). Nenhuma função lança exceção.
import { formatarPreco, formatarLojas } from "./inicio.js";

// d: { id, nome, marca (opcional), mercado, lojas, preco, medida, situacao, texto, novo, link (bool), pacote (opcional) }
// preco/medida são sempre o preço por medida (kg, L, un). pacote: { preco, embalagem } troca o destaque pelo
// preço do pacote (igual ao anúncio) e deixa o preço por medida como referência, abaixo.
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
  return d.link && d.id != null
    ? el("a", { className: classe, href: "#produto/" + encodeURIComponent(d.id) }, meio, lado)
    : el("div", { className: classe }, meio, lado);
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
  return t.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, letra) => sep + letra.toUpperCase());
}

// Marca a exibir antes do mercado; "" quando não há marca ou quando o nome do produto exibido já a contém.
export function marcaParaMostrar(marca, nomeProduto) {
  const m = normalizarMarca(marca);
  if (!m) return "";
  const chave = semAcento(m);
  if (!chave) return "";
  return semAcento(nomeProduto ?? "").includes(chave) ? "" : m;
}

// Nós do rótulo "Marca · resto": a marca num <span class="marca"> (nunca quebra no meio) e o resto como texto.
export function rotuloComMarca(el, marca, nomeProduto, resto) {
  const m = marcaParaMostrar(marca, nomeProduto);
  const fim = resto == null ? "" : String(resto);
  if (!m) return fim ? [fim] : [];
  return fim ? [el("span", { className: "marca-prod", textContent: m }), " · " + fim] : [el("span", { className: "marca", textContent: m })];
}
