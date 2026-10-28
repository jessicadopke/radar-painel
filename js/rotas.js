// Roteador por hash: função pura (sem DOM), para poder ser testada. Nenhuma função lança exceção.
// Apelidos antigos: #hoje leva a Produtos; #coleta e #sobre levam a Mais.
const ABAS = ["inicio", "produtos", "lista", "mais"];
const APELIDOS = { hoje: "produtos", coleta: "mais", sobre: "mais" };

function decodificar(t) {
  try { return decodeURIComponent(t); } catch { return t; }
}

// { tela, aba, id? }
export function rota(hash) {
  const h = String(hash || "").replace(/^#/, "");
  const [nome, ...resto] = h.split("/");
  if (nome === "produto") {
    return resto[0] ? { tela: "produto", aba: "produtos", id: decodificar(resto[0]) } : { tela: "produtos", aba: "produtos" };
  }
  const destino = Object.hasOwn(APELIDOS, nome) ? APELIDOS[nome] : nome;
  return ABAS.includes(destino) ? { tela: destino, aba: destino } : { tela: "inicio", aba: "inicio" };
}
