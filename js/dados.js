// Leitura mínima do dados.json (formato 1). Nenhuma função lança exceção.

export const FORMATO_CONHECIDO = 1;

// Texto do JSON -> { estado: "ok" | "atualize" | "sem-dados", dados }
export function interpretar(texto) {
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    return { estado: "sem-dados", dados: null };
  }
  if (!dados || typeof dados !== "object" || !Number.isInteger(dados.formato)) {
    return { estado: "sem-dados", dados: null };
  }
  if (dados.formato > FORMATO_CONHECIDO) return { estado: "atualize", dados: null };
  return { estado: "ok", dados };
}

// "2026-10-23T12:05:00" -> "23/10/2026 às 12:05" (o horário já é o de Palmas)
export function formatarGeradoEm(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]} às ${m[4]}:${m[5]}` : "";
}

// ISO local sem fuso -> minutos desde 1970 tratando os números como relógio de parede; null se inválido.
export function minutosIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(iso ?? ""));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000 : null;
}

// Busca dados.json (rede primeiro; sem rede, o service worker entrega a cópia).
export async function carregarDados(buscar = fetch) {
  try {
    const resp = await buscar("dados.json", { cache: "no-cache" });
    if (!resp || !resp.ok) return { estado: "sem-dados", dados: null };
    return interpretar(await resp.text());
  } catch {
    return { estado: "sem-dados", dados: null };
  }
}
