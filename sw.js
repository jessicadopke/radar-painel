// Service worker do Radar: o app abre sem internet depois da primeira vez.
const VERSION = "radar-0.12.1";
// dados.json e miniaturas/ NÃO entram aqui: vêm do site publicado, não de app/.
const FILES = [
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "version.json",
  "CHANGELOG.md",
  "js/app.js",
  "js/associar.js",
  "js/coleta.js",
  "js/dados.js",
  "js/foto.js",
  "js/frescor.js",
  "js/grafico.js",
  "js/hoje.js",
  "js/inicio.js",
  "js/lista.js",
  "js/lista_foto.js",
  "js/mais.js",
  "js/oferta.js",
  "js/produto.js",
  "js/rotas.js",
  "js/sobre.js",
  "js/versao.js",
  "fonts/bricolage-grotesque-800.woff2",
  "fonts/nunito-sans-400.woff2",
  "fonts/nunito-sans-700.woff2",
  "fonts/LICENSE.txt",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const base = new URL("./", self.location).pathname;
  const caminho = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : url.pathname;
  const chave = url.origin + url.pathname; // sem ?t=..., para não encher o cache

  // cache primeiro: arquivos grandes que não mudam
  if (/^(fonts|icons|vendor)\//.test(caminho)) {
    e.respondWith(caches.match(chave).then((c) => c || fetch(req).then((r) => guardar(chave, r))));
    return;
  }

  // o resto (inclusive dados.json e miniaturas/): rede primeiro, guarda cópia, sem rede usa a cópia
  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((r) => guardar(chave, r))
      .catch(async () => {
        const copia = await caches.match(chave);
        if (copia) return copia;
        if (req.mode === "navigate") {
          const inicio = await caches.match("index.html");
          if (inicio) return inicio;
        }
        return new Response("", { status: 503, statusText: "Sem rede e sem cópia" });
      }),
  );
});

function guardar(chave, resp) {
  if (resp && resp.ok) {
    const copia = resp.clone();
    caches.open(VERSION).then((c) => c.put(chave, copia));
  }
  return resp;
}
