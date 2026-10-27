// Gráfico de preços da tela Produto: lógica pura (sem DOM) + desenho em SVG feito pelo próprio app.
// Nenhuma função lança exceção.
import { formatarPreco } from "./inicio.js";

const ehNumero = (n) => typeof n === "number" && Number.isFinite(n);
const MS_DIA = 86400000;
const MAX_MERCADOS = 3;
const MIN_DIAS_LINHA = 7;
const LARG = 320;
const ALT = 196;
// Identificador do SVG montado em partes: o app não tem nenhum endereço literal.
const NS = ["http:", "", "www.w3.org", "2000", "svg"].join("/");

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

const alvoValido = (alvo) => !!alvo && typeof alvo === "object" && ehNumero(alvo.valor) && alvo.suficiente !== false;

export function escalas(series, alvo, largura, altura) {
  const lista = Array.isArray(series) ? series : [];
  const L = ehNumero(largura) && largura > 0 ? largura : 320;
  const A = ehNumero(altura) && altura > 0 ? altura : ALT;
  const margem = { esq: 10, dir: 70, topo: 12, base: 28 };
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
  const textoInicio = nDias === 1 ? "há 1 dia" : `há ${nDias} dias`;
  const marcasX = [
    { texto: textoInicio, x: x(d0), ancora: "start" },
    { texto: "hoje", x: x(d0 + nDias), ancora: "end" },
  ];
  return {
    largura: L, altura: A, margem, x, y,
    eixoX: { inicio: numeroParaDia(d0), fim: numeroParaDia(d1), dias: nDias },
    eixoY: { min: lo, max: hi },
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
  return dias.size === 0 ? "vazio" : dias.size < MIN_DIAS_LINHA ? "pouco" : "ok";
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

// Título do cartão: período real da série (até 90 dias).
export function tituloGrafico(produto) {
  const series = pontosDaSerie(produto && produto.serie);
  if (estadoGrafico(series) === "vazio") return "Histórico de preços";
  if (estadoGrafico(series) === "pouco") return "Hoje, por mercado";
  const n = Math.min(90, escalas(series, null).eixoX.dias);
  return n === 1 ? "Último dia" : `Últimos ${n} dias`;
}

const GAP_ROTULO = 36; // nome (13 px) + preço/etiqueta (24 px) sem encostar no vizinho
const nomeCurto = (t) => (t.length > 9 ? `${t.slice(0, 8)}…` : t);

// Posições verticais dos rótulos da ponta: ordena, empurra para baixo e, se passar do limite, sobe.
export function afastarRotulos(ys, min, max, gap = GAP_ROTULO) {
  const ord = ys.map((y, i) => ({ i, y: Math.min(max, Math.max(min, y)) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ord.length; k++) if (ord[k].y - ord[k - 1].y < gap) ord[k].y = ord[k - 1].y + gap;
  for (let k = ord.length - 1; k >= 0; k--) {
    const teto = k === ord.length - 1 ? max : ord[k + 1].y - gap;
    if (ord[k].y > teto) ord[k].y = teto;
  }
  const saida = [];
  for (const o of ord) saida[o.i] = o.y;
  return saida;
}

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
    caixa.append(html("p", { className: "muted", textContent: "Ainda sem histórico deste produto." }));
    raiz.append(caixa);
    return;
  }

  const ordenadas = [...todas].sort((a, b) => ultimoPonto(a).preco - ultimoPonto(b).preco);
  const mostradas = ordenadas.slice(0, MAX_MERCADOS);
  const extras = ordenadas.length - mostradas.length;
  const alvo = alvoValido(p.alvo) ? p.alvo : null;

  if (estado === "pouco") {
    caixa.append(barras(html, mostradas, alvo, p.medida));
    if (alvo) caixa.append(html("p", { className: "nota-alvo", textContent: `Risca preta: alvo ${formatarPreco(alvo.valor)}. Com mais dias de coleta, aqui aparece a linha do tempo.` }));
  } else {
    caixa.append(linhas(svgEl, p, mostradas, alvo));
  }
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
  caixa.append(html("details", { className: "grafico-tabela" }, html("summary", { textContent: "Ver em tabela" }), html("div", { className: "grafico-rolagem" }, tabela)));
  raiz.append(caixa);
}

// Pouco histórico: barras horizontais com o preço de hoje de cada mercado.
function barras(html, mostradas, alvo, medida) {
  const precos = mostradas.map((s) => ultimoPonto(s).preco);
  const topo = Math.max(...precos, alvo ? alvo.valor : 0) || 1;
  const pct = (v) => `${Math.min(100, (v / topo) * 100).toFixed(1)}%`;
  const ul = html("ul", { className: "barras" });
  ul.setAttribute("aria-label", `Preço de hoje${medida ? ` por ${medida}` : ""}`);
  mostradas.forEach((s, i) => {
    const barra = html("div", { className: i === 0 ? "bar hoje" : "bar" });
    barra.style.width = pct(precos[i]);
    const trilho = html("div", { className: "tr" }, barra);
    if (alvo) {
      const marca = html("div", { className: "alvo" });
      marca.style.left = pct(alvo.valor);
      trilho.append(marca);
    }
    ul.append(html("li", {}, html("span", { className: "n", textContent: s.mercado }), trilho, html("span", { className: "v", textContent: formatarPreco(precos[i]) })));
  });
  return ul;
}

function linhas(svgEl, p, mostradas, alvo) {
  const esc = escalas(mostradas, alvo, LARG, ALT);
  const { margem } = esc;
  const idBase = "grafico-" + String(p.id ?? "x").replace(/[^\w-]/g, "_");
  const xFim = esc.largura - margem.dir;
  const yBase = esc.altura - margem.base;
  const svg = svgEl("svg", { viewBox: `0 0 ${LARG} ${ALT}`, role: "img", "aria-labelledby": `${idBase}-t ${idBase}-d`, class: "grafico-svg" });
  svg.append(svgEl("title", { id: `${idBase}-t` }, `${tituloGrafico(p)}: ${String(p.nome ?? "")}`));
  svg.append(svgEl("desc", { id: `${idBase}-d` }, resumoGrafico(p)));

  const trechos = mostradas.map((s) => {
    const lista = [];
    let atual = [];
    for (const pt of s.pontos) {
      if (pt.preco == null) { if (atual.length) lista.push(atual); atual = []; continue; }
      atual.push([esc.x(pt.dia), esc.y(pt.preco)]);
    }
    if (atual.length) lista.push(atual);
    return lista;
  });

  if (alvo) {
    const ya = esc.y(alvo.valor);
    svg.append(svgEl("rect", { class: "grafico-faixa", x: margem.esq, y: ya.toFixed(1), width: xFim - margem.esq, height: Math.max(0, yBase - ya).toFixed(1) }));
    svg.append(svgEl("line", { class: "grafico-alvo", x1: margem.esq, x2: xFim, y1: ya.toFixed(1), y2: ya.toFixed(1), "stroke-dasharray": "3 3" }));
    // rótulo à esquerda: acima da linha, ou abaixo se for onde a linha dos preços passa
    const bate = (y0, y1) => trechos.some((t) => t.some((q) => q.length && q[0] < margem.esq + 92 && q[1] > y0 - 2 && q[1] < y1 + 2));
    const abaixo = bate(ya - 19, ya - 3) && !bate(ya + 3, ya + 19);
    svg.append(svgEl("text", { class: "grafico-txt-fg", x: margem.esq + 2, y: (abaixo ? ya + 16 : ya - 5).toFixed(1) }, `Alvo ${formatarPreco(alvo.valor)}`));
  }

  for (const m of esc.marcasX) {
    svg.append(svgEl("text", { class: "grafico-txt", x: m.x.toFixed(1), y: esc.altura - 6, "text-anchor": m.ancora }, m.texto));
  }

  // outras primeiro, o mais barato por cima
  for (let i = mostradas.length - 1; i >= 0; i--) {
    const barato = i === 0;
    for (const t of trechos[i]) {
      if (t.length < 2) continue;
      svg.append(svgEl("polyline", { class: barato ? "grafico-linha grafico-hoje" : "grafico-linha grafico-outra", points: t.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ") }));
    }
  }
  const fins = mostradas.map((s) => { const u = ultimoPonto(s); return { x: esc.x(u.dia), y: esc.y(u.preco), preco: u.preco }; });
  const ly = afastarRotulos(fins.map((f) => f.y), margem.topo + 8, yBase - 22);
  mostradas.forEach((s, i) => {
    const barato = i === 0;
    const f = fins[i];
    svg.append(svgEl("circle", { class: barato ? "grafico-pt" : "grafico-pt-m", cx: f.x.toFixed(1), cy: f.y.toFixed(1), r: barato ? 6 : 4 }));
    const tx = xFim + 6;
    svg.append(svgEl("text", { class: "grafico-txt", x: tx, y: (ly[i] - 8).toFixed(1) }, nomeCurto(s.mercado)));
    if (barato) {
      svg.append(svgEl("rect", { class: "grafico-et", x: tx - 2, y: (ly[i] - 4).toFixed(1), width: LARG - xFim - 4, height: 24, rx: 12 }));
      svg.append(svgEl("text", { class: "grafico-et-txt", x: tx + 6, y: (ly[i] + 13).toFixed(1) }, formatarPreco(f.preco)));
    } else {
      svg.append(svgEl("text", { class: "grafico-preco", x: tx, y: (ly[i] + 7).toFixed(1) }, formatarPreco(f.preco)));
    }
  });
  return svg;
}
