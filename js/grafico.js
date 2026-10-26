// Gráfico de preços da tela Produto: lógica pura (sem DOM) + desenho em SVG feito pelo próprio app.
// Nenhuma função lança exceção.
import { formatarPreco } from "./inicio.js";

const ehNumero = (n) => typeof n === "number" && Number.isFinite(n);
const MS_DIA = 86400000;
const MAX_MERCADOS = 4;
const DIAS_COM_PONTOS = 30;
// Identificador do SVG montado em partes: o app não tem nenhum endereço literal.
const NS = ["http:/", "", "www.w3.org", "2000", "svg"].join("/");

// ---- datas (calendário em UTC, sem fuso) ----
function diaParaNumero(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  if (!m) return null;
  const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(a, me - 1, d);
  const x = new Date(t);
  if (x.getUTCFullYear() !== a || x.getUTCMonth() !== me - 1 || x.getUTCDate() !== d) return null;
  return t / MS_DIA;
}

function numeroParaDia(n) {
  const x = new Date(n * MS_DIA);
  const dois = (v) => String(v).padStart(2, "0");
  return `${String(x.getUTCFullYear()).padStart(4, "0")}-${dois(x.getUTCMonth() + 1)}-${dois(x.getUTCDate())}`;
}

const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const ddmmaaaa = (iso) => `${ddmm(iso)}/${iso.slice(0, 4)}`;

// ---- lógica pura ----
export function pontosDaSerie(serie) {
  if (!Array.isArray(serie)) return [];
  const saida = [];
  for (const s of serie) {
    if (!s || typeof s !== "object" || !Array.isArray(s.precos)) continue;
    const ini = diaParaNumero(s.inicio);
    if (ini == null) continue;
    const pontos = s.precos.map((p, n) => ({ dia: numeroParaDia(ini + n), preco: ehNumero(p) && p >= 0 ? p : null }));
    const comPreco = pontos.filter((p) => p.preco != null).length;
    if (comPreco > 0) saida.push({ mercado: String(s.mercado ?? ""), pontos, comPreco });
  }
  return saida;
}

// Marcas "redondas" (1, 2, 2,5, 5 x 10^n) dentro de [min, max], no máximo 4.
export function marcasY(min, max) {
  if (!ehNumero(min) || !ehNumero(max) || max <= min) return [];
  const bruto = (max - min) / 3;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passos = [];
  for (let k = -1; k <= 1; k++) for (const f of [1, 2, 2.5, 5]) passos.push(f * mag * 10 ** k);
  passos.sort((a, b) => a - b);
  for (const passo of passos) {
    if (passo < bruto * 0.9) continue;
    const marcas = [];
    for (let v = Math.ceil(min / passo - 1e-9); v * passo <= max + 1e-9; v++) marcas.push(Math.round(v * passo * 1e6) / 1e6 || 0);
    if (marcas.length >= 1 && marcas.length <= 4) return marcas;
  }
  return [];
}

const alvoValido = (alvo) => !!alvo && typeof alvo === "object" && ehNumero(alvo.valor) && alvo.suficiente !== false;

export function escalas(series, alvo, largura, altura) {
  const lista = Array.isArray(series) ? series : [];
  const L = ehNumero(largura) && largura > 0 ? largura : 320;
  const A = ehNumero(altura) && altura > 0 ? altura : 180;
  const margem = { esq: 56, dir: 10, topo: 12, base: 26 };
  const dias = [];
  const precos = [];
  for (const s of lista) {
    const n = diaParaNumero(s && s.pontos && s.pontos[0] && s.pontos[0].dia);
    if (n == null) continue;
    dias.push(n, n + s.pontos.length - 1);
    for (const p of s.pontos) if (ehNumero(p.preco)) precos.push(p.preco);
  }
  const temAlvo = alvoValido(alvo);
  if (temAlvo) precos.push(alvo.valor);
  const d0 = dias.length ? Math.min(...dias) : 0;
  const d1 = dias.length ? Math.max(...dias) : 0;
  const nDias = Math.max(1, d1 - d0);
  let lo = precos.length ? Math.min(...precos) : 0;
  let hi = precos.length ? Math.max(...precos) : 1;
  if (lo === hi) { lo -= 0.5; hi += 0.5; }
  const folga = (hi - lo) * 0.08;
  lo = Math.max(0, lo - folga);
  hi += folga;
  const larguraUtil = L - margem.esq - margem.dir;
  const alturaUtil = A - margem.topo - margem.base;
  const x = (dia) => margem.esq + (((typeof dia === "string" ? diaParaNumero(dia) : dia) - d0) / nDias) * larguraUtil;
  const y = (preco) => margem.topo + (1 - (preco - lo) / (hi - lo)) * alturaUtil;
  const inicio = numeroParaDia(d0);
  const meio = numeroParaDia(d0 + Math.round(nDias / 2));
  const fim = numeroParaDia(d1 > d0 ? d1 : d0 + 1);
  const marcasX = [inicio, meio, fim].map((dia, i) => ({ dia, texto: ddmm(dia), x: x(dia), ancora: i === 0 ? "start" : i === 2 ? "end" : "middle" }));
  return {
    largura: L, altura: A, margem, x, y,
    eixoX: { inicio, fim: numeroParaDia(d1), dias: nDias },
    eixoY: { min: lo, max: hi },
    marcasY: marcasY(lo, hi).map((valor) => ({ valor, y: y(valor) })),
    marcasX,
  };
}

const ultimoPonto = (s) => {
  for (let i = s.pontos.length - 1; i >= 0; i--) if (s.pontos[i].preco != null) return s.pontos[i];
  return null;
};

export function estadoGrafico(series) {
  const dias = new Set();
  for (const s of Array.isArray(series) ? series : []) {
    for (const p of (s && s.pontos) || []) if (p && ehNumero(p.preco)) dias.add(p.dia);
  }
  return dias.size === 0 ? "vazio" : dias.size < 2 ? "pouco" : "ok";
}

export function tabelaDaSerie(series) {
  const porDia = new Map();
  const lista = Array.isArray(series) ? series : [];
  for (const s of lista) {
    for (const p of (s && s.pontos) || []) {
      if (!p || !ehNumero(p.preco)) continue;
      if (!porDia.has(p.dia)) porDia.set(p.dia, {});
      porDia.get(p.dia)[s.mercado] = p.preco;
    }
  }
  return [...porDia.keys()].sort().reverse().map((data) => {
    const valores = {};
    for (const s of lista) valores[s.mercado] = porDia.get(data)[s.mercado] ?? null;
    return { data, valores };
  });
}

export function resumoGrafico(produto) {
  const p = produto && typeof produto === "object" ? produto : {};
  const series = pontosDaSerie(p.serie);
  if (!series.length) return "Ainda sem histórico de preços.";
  const medida = p.medida ? ` por ${p.medida}` : "";
  const partes = [`Preço${medida} de ${String(p.nome ?? "")} nos últimos 90 dias.`];
  const ultimoDia = series.map((s) => ultimoPonto(s).dia).sort().pop();
  for (const s of series) {
    const valores = s.pontos.map((x) => x.preco).filter((v) => v != null);
    const hoje = ultimoPonto(s);
    const quando = hoje.dia === ultimoDia ? "hoje" : `em ${ddmm(hoje.dia)}`;
    const faixa = valores.length > 1 && Math.max(...valores) !== Math.min(...valores)
      ? `de ${formatarPreco(Math.max(...valores))} a ${formatarPreco(Math.min(...valores))}, ` : "";
    partes.push(`${s.mercado}: ${faixa}${quando} ${formatarPreco(hoje.preco)}.`);
  }
  if (alvoValido(p.alvo)) partes.push(`Alvo: ${formatarPreco(p.alvo.valor)}.`);
  return partes.join(" ");
}

// ---- estilos dos mercados: traço + marcador próprios, além da cor ----
const ESTILOS = [
  { cor: "var(--brand)", traco: "", marcador: "circulo" },
  { cor: "var(--fg)", traco: "7 3", marcador: "quadrado" },
  { cor: "var(--muted)", traco: "2 3", marcador: "losango" },
  { cor: "var(--brand)", traco: "9 3 2 3", marcador: "triangulo" },
];

// ---- DOM ----
// deps: { document }
export function renderGrafico(raiz, produto, parametros, deps) {
  const doc = deps.document;
  const p = produto && typeof produto === "object" ? produto : {};
  const html = (tag, props = {}, ...filhos) => {
    const e = doc.createElement(tag);
    Object.assign(e, props);
    e.append(...filhos);
    return e;
  };
  const svgEl = (tag, attrs = {}, texto) => {
    const e = doc.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (texto != null) e.textContent = texto;
    return e;
  };
  const caixa = html("div", { className: "grafico" });
  const todas = pontosDaSerie(p.serie);
  const estado = estadoGrafico(todas);
  if (estado === "vazio") {
    caixa.append(html("p", { className: "muted", textContent: "Ainda sem histórico de preços deste produto." }));
    raiz.append(caixa);
    return;
  }

  const ordenadas = [...todas].sort((a, b) => ultimoPonto(a).preco - ultimoPonto(b).preco);
  const mostradas = ordenadas.slice(0, MAX_MERCADOS);
  const extras = ordenadas.length - mostradas.length;
  const alvo = alvoValido(p.alvo) ? p.alvo : null;
  const esc = escalas(mostradas, alvo, 320, 180);
  const { margem } = esc;
  const idBase = "grafico-" + String(p.id ?? "x").replace(/[^\w-]/g, "_");

  const svg = svgEl("svg", { viewBox: "0 0 320 180", role: "img", "aria-labelledby": `${idBase}-t ${idBase}-d`, class: "grafico-svg" });
  svg.append(svgEl("title", { id: `${idBase}-t` }, `Preço nos últimos 90 dias: ${String(p.nome ?? "")}`));
  svg.append(svgEl("desc", { id: `${idBase}-d` }, resumoGrafico(p)));

  for (const m of esc.marcasY) {
    svg.append(svgEl("line", { class: "grafico-grade", x1: margem.esq, x2: esc.largura - margem.dir, y1: m.y, y2: m.y }));
    svg.append(svgEl("text", { class: "grafico-rotulo", x: margem.esq - 4, y: m.y + 4, "text-anchor": "end" }, formatarPreco(m.valor)));
  }
  for (const m of esc.marcasX) {
    svg.append(svgEl("text", { class: "grafico-rotulo", x: m.x, y: esc.altura - 6, "text-anchor": m.ancora }, m.texto));
  }
  if (alvo) {
    const ya = esc.y(alvo.valor);
    svg.append(svgEl("line", { class: "grafico-alvo", x1: margem.esq, x2: esc.largura - margem.dir, y1: ya, y2: ya, "stroke-dasharray": "4 3" }));
    const acima = ya - 5 > margem.topo + 8;
    svg.append(svgEl("text", { class: "grafico-rotulo grafico-rotulo-alvo", x: esc.largura - margem.dir, y: acima ? ya - 4 : ya + 13, "text-anchor": "end" }, `Alvo ${formatarPreco(alvo.valor)}`));
  }

  mostradas.forEach((s, i) => {
    const est = ESTILOS[i % ESTILOS.length];
    const g = svgEl("g", { class: "grafico-mercado", stroke: est.cor, fill: est.cor });
    let trecho = [];
    const fecha = () => {
      if (trecho.length >= 2) {
        g.append(svgEl("polyline", { class: "grafico-linha", fill: "none", "stroke-width": 2, "stroke-dasharray": est.traco, points: trecho.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ") }));
      }
      trecho = [];
    };
    const ult = ultimoPonto(s);
    for (const pt of s.pontos) {
      if (pt.preco == null) { fecha(); continue; }
      trecho.push([esc.x(pt.dia), esc.y(pt.preco)]);
    }
    fecha();
    // pontos: todos se houver até 30 dias com preço (dias isolados sempre); o último é maior
    for (let n = 0; n < s.pontos.length; n++) {
      const pt = s.pontos[n];
      if (pt.preco == null) continue;
      const isolado = (n === 0 || s.pontos[n - 1].preco == null) && (n === s.pontos.length - 1 || s.pontos[n + 1].preco == null);
      const ultimo = pt === ult;
      if (!(ultimo || isolado || s.comPreco <= DIAS_COM_PONTOS)) continue;
      g.append(marcador(svgEl, est.marcador, esc.x(pt.dia), esc.y(pt.preco), ultimo ? 4.5 : 2.5));
    }
    svg.append(g);
  });

  caixa.append(svg);
  if (estado === "pouco") {
    caixa.append(html("p", { className: "muted", textContent: "Só há 1 dia de histórico: o gráfico aparece quando houver mais dias." }));
  }

  const legenda = html("ul", { className: "grafico-legenda" });
  mostradas.forEach((s, i) => {
    const est = ESTILOS[i % ESTILOS.length];
    const amostra = svgEl("svg", { class: "grafico-amostra", viewBox: "0 0 28 12", "aria-hidden": "true", focusable: "false" });
    const g = svgEl("g", { stroke: est.cor, fill: est.cor });
    g.append(svgEl("line", { x1: 1, x2: 27, y1: 6, y2: 6, "stroke-width": 2, "stroke-dasharray": est.traco }));
    g.append(marcador(svgEl, est.marcador, 14, 6, 3.5));
    amostra.append(g);
    legenda.append(html("li", {}, amostra, html("span", { className: "grafico-nome", textContent: s.mercado }),
      html("span", { className: "grafico-valor", textContent: formatarPreco(ultimoPonto(s).preco) })));
  });
  legenda.append(html("li", { className: "grafico-alvo-legenda", textContent: alvo ? `Alvo ${formatarPreco(alvo.valor)} (linha tracejada)` : "Alvo ainda em cálculo" }));
  caixa.append(legenda);
  if (extras > 0) caixa.append(html("p", { className: "muted", textContent: `e mais ${extras} ${extras === 1 ? "mercado" : "mercados"} na tabela` }));

  // tabela alternativa (todos os mercados)
  const nomes = ordenadas.map((s) => s.mercado).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const cab = html("tr", {}, ...["Data", ...nomes].map((t) => { const th = html("th", { textContent: t }); th.setAttribute("scope", "col"); return th; }));
  const corpo = html("tbody", {}, ...tabelaDaSerie(todas).map((linha) => {
    const th = html("th", { textContent: ddmmaaaa(linha.data) });
    th.setAttribute("scope", "row");
    return html("tr", {}, th, ...nomes.map((n) => html("td", { textContent: linha.valores[n] != null ? formatarPreco(linha.valores[n]) : "—" })));
  }));
  const tabela = html("table", {}, html("thead", {}, cab), corpo);
  caixa.append(html("details", { className: "grafico-tabela" }, html("summary", { textContent: "Ver os preços em tabela" }), html("div", { className: "grafico-rolagem" }, tabela)));
  raiz.append(caixa);
}

function marcador(svgEl, tipo, cx, cy, r) {
  const f = (n) => n.toFixed(1);
  if (tipo === "quadrado") return svgEl("rect", { x: f(cx - r), y: f(cy - r), width: f(2 * r), height: f(2 * r), stroke: "none" });
  if (tipo === "losango") return svgEl("polygon", { points: `${f(cx)},${f(cy - r - 1)} ${f(cx + r + 1)},${f(cy)} ${f(cx)},${f(cy + r + 1)} ${f(cx - r - 1)},${f(cy)}`, stroke: "none" });
  if (tipo === "triangulo") return svgEl("polygon", { points: `${f(cx)},${f(cy - r - 1)} ${f(cx + r + 1)},${f(cy + r)} ${f(cx - r - 1)},${f(cy + r)}`, stroke: "none" });
  return svgEl("circle", { cx: f(cx), cy: f(cy), r: f(r), stroke: "none" });
}
