// Gesto de arrastar o cartão para o lado (Pointer Events), genérico e compartilhado: hoje o lado esquerdo
// adiciona à lista (#188); o lado direito já é suportado e fica livre para o "Ocultar" (#187).
// Não rouba a rolagem vertical: só vira arrastar o movimento predominantemente horizontal.
// Nenhuma função lança exceção.

export const ZONA_MORTA = 10; // px: abaixo disso ainda não se decide a direção
export const RAZAO_HORIZONTAL = 1.5; // horizontal só se |dx| > 1,5 x |dy|
export const LIMIAR_MINIMO = 80; // px
export const LIMIAR_FRACAO = 0.35; // da largura do cartão
export const MAXIMO_FRACAO = 0.6; // deslocamento máximo, da largura do cartão

const num = (n) => (typeof n === "number" && Number.isFinite(n) ? n : 0);

// Distância a passar para soltar valendo: o maior entre 80 px e 35% da largura (ou o `limiar` em px, se vier).
export function limiarDe(largura, limiar) {
  if (typeof limiar === "number" && Number.isFinite(limiar) && limiar > 0) return limiar;
  return Math.max(LIMIAR_MINIMO, Math.round(LIMIAR_FRACAO * Math.max(0, num(largura))));
}

// Lógica pura. Entrada: deslocamentos desde o toque (dx, dy), `direcao` já travada (null | "h" | "v"), `soltou`
// (o dedo saiu), a largura do cartão e quais lados têm ação (esquerda, direita: booleanos).
// Saída: { estado: "ignorar" | "arrastando" | "confirmar" | "cancelar", direcao, lado, deslocamento (px, >= 0), passou }.
export function decidirGesto({ dx, dy, direcao = null, soltou = false, largura = 0, limiar, esquerda = false, direita = false } = {}) {
  const x = num(dx), y = num(dy);
  const nada = (d) => ({ estado: "ignorar", direcao: d, lado: null, deslocamento: 0, passou: false });
  if (direcao === "v") return nada("v");
  let dir = direcao === "h" ? "h" : null;
  if (!dir) {
    if (Math.max(Math.abs(x), Math.abs(y)) < ZONA_MORTA) return nada(null);
    if (!(Math.abs(x) > RAZAO_HORIZONTAL * Math.abs(y))) return nada("v");
    dir = "h";
  }
  const lado = x < 0 ? "esquerda" : "direita";
  const tem = lado === "esquerda" ? Boolean(esquerda) : Boolean(direita);
  if (!tem) return { estado: soltou ? "cancelar" : "arrastando", direcao: "h", lado, deslocamento: 0, passou: false };
  const lim = limiarDe(largura, limiar);
  const maximo = Math.max(MAXIMO_FRACAO * Math.max(0, num(largura)), lim + ZONA_MORTA);
  const distancia = Math.abs(x);
  const passou = distancia >= lim;
  const estado = soltou ? (passou ? "confirmar" : "cancelar") : "arrastando";
  return { estado, direcao: "h", lado, deslocamento: Math.min(distancia, maximo), passou };
}

// Liga o gesto a `elemento`. Cada lado é { rotulo, acao } ou null/ausente.
// aoMudar({ lado, deslocamento, passou, arrastando }) avisa quem desenha (deslocamento 0 e arrastando false = voltou).
// deps: { setTimeout } (opcional, para teste). Devolve { desativar }.
export function ativarArrastar(elemento, { esquerda = null, direita = null, limiar, aoMudar, deps = {} } = {}) {
  const sem = { desativar() {} };
  if (!elemento || typeof elemento.addEventListener !== "function") return sem;
  const agendar = deps.setTimeout ?? globalThis.setTimeout;
  const avisar = (m) => { try { if (typeof aoMudar === "function") aoMudar(m); } catch {} };
  const lados = { esquerda: esquerda && typeof esquerda.acao === "function" ? esquerda : null, direita: direita && typeof direita.acao === "function" ? direita : null };

  let ativo = false, id = null, x0 = 0, y0 = 0, largura = 0, direcao = null, mexeu = false, bloquearClique = false;

  const largura_ = () => {
    try {
      const r = typeof elemento.getBoundingClientRect === "function" ? elemento.getBoundingClientRect() : null;
      return num(r && r.width) || num(elemento.offsetWidth) || 360;
    } catch { return 360; }
  };
  const decidir = (e, soltou) => decidirGesto({ dx: num(e.clientX) - x0, dy: num(e.clientY) - y0, direcao, soltou, largura, limiar, esquerda: Boolean(lados.esquerda), direita: Boolean(lados.direita) });
  const encerrar = () => {
    const estavaMexendo = mexeu;
    ativo = false; id = null; direcao = null; mexeu = false;
    if (estavaMexendo) avisar({ lado: null, deslocamento: 0, passou: false, arrastando: false });
  };
  const liberarClique = () => { try { agendar(() => { bloquearClique = false; }, 0); } catch { bloquearClique = false; } };

  const aoApertar = (e) => {
    if (ativo || !e) return;
    if (e.isPrimary === false || (typeof e.button === "number" && e.button > 0)) return;
    ativo = true; id = e.pointerId; x0 = num(e.clientX); y0 = num(e.clientY);
    largura = largura_(); direcao = null; mexeu = false; bloquearClique = false;
  };
  const aoMover = (e) => {
    if (!ativo || !e || e.pointerId !== id) return;
    const r = decidir(e, false);
    const primeiraVez = direcao !== "h" && r.direcao === "h";
    direcao = r.direcao;
    if (direcao === "v") { encerrar(); return; }
    if (direcao !== "h") return;
    if (primeiraVez) {
      bloquearClique = true;
      try { if (typeof elemento.setPointerCapture === "function") elemento.setPointerCapture(id); } catch {}
    }
    mexeu = true;
    avisar({ lado: r.lado, deslocamento: r.deslocamento, passou: r.passou, arrastando: true });
  };
  const aoSoltar = (e) => {
    if (!ativo || !e || e.pointerId !== id) return;
    const r = decidir(e, true);
    const acao = r.estado === "confirmar" && lados[r.lado] ? lados[r.lado].acao : null;
    if (direcao === "h") liberarClique();
    encerrar();
    if (acao) { try { acao(); } catch {} }
  };
  const aoCancelar = (e) => {
    if (!ativo) return;
    if (e && e.pointerId !== undefined && id !== null && e.pointerId !== id) return;
    if (direcao === "h") liberarClique();
    encerrar();
  };
  // O clique que o navegador gera ao soltar um arrasto não pode abrir o link do cartão.
  const aoClicar = (e) => {
    if (!bloquearClique) return;
    bloquearClique = false;
    try { e.preventDefault(); e.stopPropagation(); } catch {}
  };
  const semArrastoNativo = (e) => { try { e.preventDefault(); } catch {} };

  const ouvintes = [
    ["pointerdown", aoApertar], ["pointermove", aoMover], ["pointerup", aoSoltar],
    ["pointercancel", aoCancelar], ["pointerleave", aoCancelar], ["click", aoClicar, true], ["dragstart", semArrastoNativo],
  ];
  for (const [tipo, f, captura] of ouvintes) elemento.addEventListener(tipo, f, captura);
  return {
    desativar() {
      for (const [tipo, f, captura] of ouvintes) { try { elemento.removeEventListener(tipo, f, captura); } catch {} }
      encerrar();
    },
  };
}
