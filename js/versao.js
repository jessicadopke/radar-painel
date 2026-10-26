// Comparação de versões (SemVer simples X.Y.Z). Lógica pura, testada com node --test.

export function parseVersao(texto) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(texto ?? "").trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// true só se a versão `a` for maior que `b`. Versão malformada nunca é "mais nova".
export function newerThan(a, b) {
  const pa = parseVersao(a);
  const pb = parseVersao(b);
  if (!pa || !pb) return false;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i];
  }
  return false;
}
