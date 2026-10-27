// Cartão de oferta único (Início e Produtos). Nenhuma função lança exceção.
import { formatarPreco, formatarLojas } from "./inicio.js";

// d: { id, nome, mercado, lojas, preco, medida, situacao, texto, novo, link (bool) }
// situacao: "abaixo" põe o preço na etiqueta; "sem-oferta" vira cartão tracejado.
export function cartaoOferta(el, d) {
  const semOferta = d.situacao === "sem-oferta";
  const nome = el("div", { className: "nome" });
  nome.append(String(d.nome ?? ""));
  if (d.novo) nome.append(" ", el("span", { className: "selo-novo", textContent: "Novo" }));
  const meio = el("span", { className: "meio" }, nome);
  if (!semOferta) {
    const lojas = formatarLojas(d.lojas);
    meio.append(el("div", { className: "sub", textContent: [d.mercado, lojas].filter(Boolean).join(" · ") }));
    if (d.texto) meio.append(el("div", { className: "estado", textContent: d.texto }));
  }
  const lado = semOferta
    ? el("span", { className: "sub", textContent: "sem oferta agora" })
    : el("span", { className: "preco-et" + (d.situacao === "abaixo" ? " bom" : "") }, formatarPreco(d.preco),
      ...(d.medida ? [el("small", { textContent: `por ${d.medida}` })] : []));
  const classe = "oferta" + (semOferta ? " sem" : "");
  return d.link && d.id != null
    ? el("a", { className: classe, href: "#produto/" + encodeURIComponent(d.id) }, meio, lado)
    : el("div", { className: classe }, meio, lado);
}
