// Leitura da lista de compras por foto: chave do Gemini, pedido, resposta e imagem.
// Toda a rede do recurso fica aqui, por meio de `deps.buscar` (injetável). Nenhuma função lança exceção.
// A chave só vai ao cabeçalho x-goog-api-key; nunca a URL, log ou mensagem. A foto só existe na memória.

export const MODELOS = ["gemini-flash-lite-latest", "gemini-flash-latest"];
export const ESPERA_RESERVA_MS = 12000;
export const LIMITE_TOTAL_MS = 30000;
export const MAX_LADO = 1600;
export const QUALIDADES = [0.8, 0.6];
export const ALVO_BYTES = 1_000_000;
export const MAX_ARQUIVO = 25 * 1024 * 1024;
export const MAX_ITENS = 60;
export const MAX_TEXTO = 80;
export const CHAVE_GEMINI = "radar.gemini";
const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

export const ESQUEMA = {
  type: "OBJECT",
  properties: {
    itens: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { texto: { type: "STRING" }, qtd: { type: "INTEGER", nullable: true } },
        required: ["texto", "qtd"],
      },
    },
  },
  required: ["itens"],
};

export const MENSAGENS = {
  "sem-chave": "Cadastre a chave do Gemini para ler a foto",
  "sem-rede": "Sem internet agora. A leitura da foto precisa de rede; você pode digitar a lista",
  "chave-invalida": "O Google recusou a chave. Confira ou troque a chave do Gemini",
  cota: "O limite gratuito do Google acabou por agora. Tente mais tarde ou digite a lista",
  demorou: "A leitura demorou demais",
  "nao-leu": "Não consegui ler a foto",
  vazio: "Não encontrei itens na foto",
  cancelado: "",
  outro: "O Google não conseguiu ler agora. Tente de novo ou digite a lista",
};

const ehObjeto = (x) => x !== null && typeof x === "object";

// ---- chave do Gemini (storage recebido por parâmetro; sempre com try/catch) ----
function lerRegistro(storage) {
  try {
    const bruto = JSON.parse(storage.getItem(CHAVE_GEMINI));
    if (!ehObjeto(bruto) || bruto.versao !== 1) return { chave: null, aviso: false };
    return { chave: typeof bruto.chave === "string" && bruto.chave ? bruto.chave : null, aviso: bruto.aviso === true };
  } catch {
    return { chave: null, aviso: false };
  }
}

function gravarRegistro(storage, registro) {
  try {
    storage.setItem(CHAVE_GEMINI, JSON.stringify({ versao: 1, chave: registro.chave, aviso: registro.aviso }));
    return true;
  } catch {
    return false;
  }
}

export const lerChave = (storage) => lerRegistro(storage);

export function gravarChave(storage, texto) {
  const chave = String(texto ?? "").trim();
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(chave)) return { ok: false, motivo: "formato" };
  return gravarRegistro(storage, { chave, aviso: lerRegistro(storage).aviso }) ? { ok: true } : { ok: false, motivo: "storage" };
}

export function marcarAviso(storage) {
  return gravarRegistro(storage, { chave: lerRegistro(storage).chave, aviso: true });
}

// Apaga a chave e mantém o aviso já aceito.
export function apagarChave(storage) {
  return gravarRegistro(storage, { chave: null, aviso: lerRegistro(storage).aviso });
}

export const finalDaChave = (chave) => (typeof chave === "string" && chave ? "••••" + chave.slice(-4) : "");

// ---- imagem (parte pura) ----
export function escalaPara(largura, altura, max) {
  const l = Number(largura);
  const a = Number(altura);
  const m = Number(max);
  if (![l, a, m].every((n) => Number.isFinite(n) && n > 0)) return { largura: 0, altura: 0 };
  const f = Math.min(1, m / Math.max(l, a));
  return { largura: Math.max(1, Math.round(l * f)), altura: Math.max(1, Math.round(a * f)) };
}

export function validarArquivo(arquivo) {
  const tipo = ehObjeto(arquivo) ? String(arquivo.type ?? "") : "";
  if (!tipo.startsWith("image/")) return { ok: false, motivo: "nao-imagem", mensagem: "Esse arquivo não é uma foto. Escolha uma imagem" };
  if (Number(arquivo.size) > MAX_ARQUIVO) return { ok: false, motivo: "grande-demais", mensagem: "A foto é grande demais (máximo 25 MB). Tire outra ou escolha uma menor" };
  return { ok: true };
}

// ---- pedido ----
export function montarPrompt(hoje) {
  const d = hoje instanceof Date && !Number.isNaN(hoje.getTime()) ? hoje.toISOString().slice(0, 10) : "";
  return [
    "Esta é a foto de uma lista de compras de supermercado, escrita à mão ou impressa" + (d ? " (hoje é " + d + ")" : "") + ".",
    "Leia somente os itens de compra, um por linha da lista, em português.",
    "Ignore rabiscos, desenhos, preços, datas, totais e qualquer texto que não seja um item para comprar.",
    "Em `texto` copie o item como está escrito (ex.: \"arroz 5kg\"), sem inventar nem trocar por outro produto.",
    "Em `qtd` ponha a quantidade inteira quando estiver escrita (\"2x leite\", \"leite 2\"); se não estiver escrita, ponha null.",
    "Se não houver nenhum item, devolva a lista vazia.",
  ].join(" ");
}

export function montarPedido(modelo, base64, hoje, opcoes = {}) {
  const generationConfig = { temperature: 0, responseMimeType: "application/json", responseSchema: ESQUEMA };
  if (!(opcoes && opcoes.semRaciocinio)) generationConfig.thinkingConfig = { thinkingLevel: "minimal" };
  return {
    url: BASE + modelo + ":generateContent",
    corpo: {
      contents: [{ parts: [{ text: montarPrompt(hoje) }, { inline_data: { mime_type: "image/jpeg", data: base64 } }] }],
      generationConfig,
    },
  };
}

// ---- resposta ----
function mensagemDe(corpo) {
  return ehObjeto(corpo) && ehObjeto(corpo.error) && typeof corpo.error.message === "string" ? corpo.error.message : "";
}

export function classificarErro(status, corpo) {
  const s = Number(status);
  if (s === 429) return "cota";
  if ([500, 502, 503, 504].includes(s)) return "fora-do-ar";
  if (s === 404) return "modelo-sumiu";
  if (s === 401 || s === 403) return "chave-invalida";
  if (s === 400) {
    const detalhes = ehObjeto(corpo) && ehObjeto(corpo.error) && Array.isArray(corpo.error.details) ? corpo.error.details : [];
    const msg = mensagemDe(corpo);
    if (detalhes.some((d) => ehObjeto(d) && d.reason === "API_KEY_INVALID") || /api key/i.test(msg)) return "chave-invalida";
    if (/thinking/i.test(msg)) return "raciocinio";
  }
  return "outro";
}

function inteiro(qtd) {
  const n = Math.trunc(Number(qtd));
  return Number.isFinite(n) ? Math.min(99, Math.max(1, n)) : 1;
}

export function interpretarResposta(json) {
  try {
    const partes = json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts;
    const texto = Array.isArray(partes) && partes[0] ? partes[0].text : null;
    if (typeof texto !== "string") return { ok: false, motivo: "nao-leu" };
    const lido = JSON.parse(texto);
    if (!ehObjeto(lido) || !Array.isArray(lido.itens)) return { ok: false, motivo: "nao-leu" };
    const itens = [];
    for (const i of lido.itens) {
      if (!ehObjeto(i) || typeof i.texto !== "string") continue;
      const t = i.texto.trim().slice(0, MAX_TEXTO).trim();
      if (!t) continue;
      itens.push({ texto: t, qtd: inteiro(i.qtd) });
    }
    if (!itens.length) return { ok: false, motivo: "vazio" };
    return { ok: true, itens: itens.slice(0, MAX_ITENS), cortado: itens.length > MAX_ITENS };
  } catch {
    return { ok: false, motivo: "nao-leu" };
  }
}

// ---- leitura (rede por deps.buscar) ----
// Lembrados até fechar o app: modelos que recusam o raciocínio mínimo e modelos que deram 404.
const semRaciocinioLembrado = new Set();
const modelosSumidos = new Set();

export function reiniciarMemoria() {
  semRaciocinioLembrado.clear();
  modelosSumidos.clear();
}

const relogioPadrao = () => ({
  agora: () => Date.now(),
  setTimeout: (f, ms) => setTimeout(f, ms),
  clearTimeout: (id) => clearTimeout(id),
});

// deps = { chave, buscar, hoje: Date, online: boolean, sinal?: AbortSignal, relogio?: {agora, setTimeout, clearTimeout} }
export function lerFoto(imagem, deps) {
  return new Promise((resolve) => {
    const tentativas = [];
    let relogio = relogioPadrao();
    let t0 = 0;
    let fim = false;
    try {
      relogio = (deps && deps.relogio) || relogio;
      t0 = relogio.agora();
      const base64 = imagem && typeof imagem.base64 === "string" ? imagem.base64 : "";
      const chave = deps && typeof deps.chave === "string" ? deps.chave : "";
      const falha = (motivo) => ({ ok: false, motivo, mensagem: MENSAGENS[motivo] ?? "", tentativas, ms: 0 });
      if (!chave) return resolve(falha("sem-chave"));
      if (!deps.buscar || deps.online === false) return resolve(falha(!deps.buscar ? "outro" : "sem-rede"));

      const modelos = MODELOS.filter((m) => !modelosSumidos.has(m));
      const fila = modelos.length ? modelos : MODELOS;
      const iniciados = new Set();
      const controles = new Map(); // AbortController -> {modelo, ini} das tentativas em andamento
      const resultados = []; // por modelo: "cota" | "rede" | "fora-do-ar" | "modelo-sumiu" | "nao-leu" | "vazio"
      let pendentes = 0;
      const timers = [];

      const finalizar = (resultado, abortarOutros = true) => {
        if (fim) return;
        fim = true;
        for (const id of timers) relogio.clearTimeout(id);
        if (abortarOutros) for (const c of controles.keys()) { try { c.abort(); } catch {} }
        resolve({ ...resultado, tentativas, ms: relogio.agora() - t0 });
      };
      const erro = (motivo) => finalizar({ ok: false, motivo, mensagem: MENSAGENS[motivo] ?? "" });

      const fimDeTodos = () => {
        if (resultados.length && resultados.every((r) => r === "cota")) return erro("cota");
        if (resultados.length && resultados.every((r) => r === "rede")) return erro("sem-rede");
        if (resultados.includes("vazio")) return erro("vazio");
        if (resultados.includes("nao-leu")) return erro("nao-leu");
        return erro("outro");
      };

      const uma = async (modelo, semRaciocinio) => {
        const ini = relogio.agora();
        const c = new AbortController();
        controles.set(c, { modelo, ini });
        const registrar = (resultado) => tentativas.push({ modelo, resultado, ms: relogio.agora() - ini });
        try {
          const { url, corpo } = montarPedido(modelo, base64, deps.hoje, { semRaciocinio });
          let res;
          try {
            res = await deps.buscar(url, {
              method: "POST",
              headers: { "content-type": "application/json", "x-goog-api-key": chave },
              body: JSON.stringify(corpo),
              signal: c.signal,
            });
          } catch {
            if (fim) return { tipo: "abortada" };
            registrar("fora-do-ar");
            return { tipo: "rede" };
          }
          let json = null;
          try { json = await res.json(); } catch {}
          if (fim) return { tipo: "abortada" };
          if (!res.ok) {
            const tipo = classificarErro(res.status, json);
            registrar(tipo === "chave-invalida" ? "outro" : tipo);
            return { tipo };
          }
          const lido = interpretarResposta(json);
          if (!lido.ok) { registrar("nao-leu"); return { tipo: lido.motivo }; }
          registrar("ok");
          return { tipo: "ok", itens: lido.itens, cortado: lido.cortado };
        } finally {
          controles.delete(c);
        }
      };

      const rodar = async (modelo) => {
        let r = await uma(modelo, semRaciocinioLembrado.has(modelo));
        if (r.tipo === "raciocinio" && !semRaciocinioLembrado.has(modelo)) {
          semRaciocinioLembrado.add(modelo);
          r = await uma(modelo, true);
        }
        return r;
      };

      const iniciar = (i) => {
        if (fim || i >= fila.length || iniciados.has(i)) return;
        iniciados.add(i);
        pendentes += 1;
        const modelo = fila[i];
        rodar(modelo).then((r) => {
          pendentes -= 1;
          if (fim || r.tipo === "abortada") return;
          if (r.tipo === "ok") return finalizar({ ok: true, itens: r.itens, cortado: r.cortado, modelo });
          if (r.tipo === "chave-invalida" || r.tipo === "outro" || r.tipo === "raciocinio") return erro(r.tipo === "chave-invalida" ? "chave-invalida" : "outro");
          if (r.tipo === "modelo-sumiu") modelosSumidos.add(modelo);
          // fora-do-ar e modelo-sumiu entram como "outro" no balanço final (só cota, rede, vazio e nao-leu têm mensagem própria)
          resultados.push(["cota", "rede", "vazio", "nao-leu"].includes(r.tipo) ? r.tipo : "outro");
          iniciar(i + 1);
          if (!fim && pendentes === 0 && iniciados.size >= fila.length) fimDeTodos();
        }).catch(() => { if (!fim) erro("outro"); });
      };

      timers.push(relogio.setTimeout(() => {
        if (fim) return;
        for (const { modelo, ini } of controles.values()) tentativas.push({ modelo, resultado: "demorou", ms: relogio.agora() - ini });
        erro("demorou");
      }, LIMITE_TOTAL_MS));
      timers.push(relogio.setTimeout(() => iniciar(1), ESPERA_RESERVA_MS));
      if (deps.sinal) {
        if (deps.sinal.aborted) return erro("cancelado");
        deps.sinal.addEventListener("abort", () => erro("cancelado"));
      }
      iniciar(0);
    } catch {
      if (!fim) { fim = true; resolve({ ok: false, motivo: "outro", mensagem: MENSAGENS.outro, tentativas, ms: 0 }); }
    }
  });
}

// ---- imagem (só no navegador; a foto fica na memória e nunca é guardada) ----
const MSG_FORMATO = "Não consegui abrir essa foto. Tente tirar pela câmera";

function carregarPorImg(arquivo, doc, urlApi) {
  return new Promise((ok, falha) => {
    const url = urlApi.createObjectURL(arquivo);
    const img = doc.createElement("img");
    const soltar = () => { try { urlApi.revokeObjectURL(url); } catch {} };
    img.onload = () => { soltar(); ok(img); };
    img.onerror = () => { soltar(); falha(new Error("img")); };
    img.src = url;
  });
}

async function blobParaBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let texto = "";
  for (let i = 0; i < bytes.length; i += 0x8000) texto += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(texto);
}

// deps opcionais: { document, criarBitmap, URL }
export async function reduzirImagem(arquivo, deps = {}) {
  const recusa = (mensagem = MSG_FORMATO) => ({ ok: false, motivo: "formato", mensagem });
  try {
    const v = validarArquivo(arquivo);
    if (!v.ok) return recusa(v.mensagem);
    const doc = deps.document ?? globalThis.document;
    const urlApi = deps.URL ?? globalThis.URL;
    const criarBitmap = deps.criarBitmap ?? (typeof createImageBitmap === "function" ? createImageBitmap : null);
    let fonte = null;
    if (criarBitmap) {
      try { fonte = await criarBitmap(arquivo, { imageOrientation: "from-image" }); } catch { fonte = null; }
    }
    if (!fonte) fonte = await carregarPorImg(arquivo, doc, urlApi);
    const larg = fonte.width || fonte.naturalWidth;
    const alt = fonte.height || fonte.naturalHeight;
    const { largura, altura } = escalaPara(larg, alt, MAX_LADO);
    if (!largura) return recusa();
    const canvas = doc.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // fundo branco: PNG transparente não vira preto no JPEG
    ctx.fillRect(0, 0, largura, altura);
    ctx.drawImage(fonte, 0, 0, largura, altura);
    if (typeof fonte.close === "function") { try { fonte.close(); } catch {} }
    let blob = null;
    for (const q of QUALIDADES) {
      blob = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", q));
      if (!blob) return recusa();
      if (blob.size <= ALVO_BYTES) break;
    }
    const base64 = await blobParaBase64(blob);
    if (!base64) return recusa();
    return { ok: true, base64, mime: "image/jpeg", bytes: blob.size };
  } catch {
    return recusa();
  }
}
