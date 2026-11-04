// Saves every public page of the reference site to _evidence/, politely, for private study.
// Run: node docs/lumabar/_tools/capture-pages.js
const fs = require("fs");
const path = require("path");

const ORIGIN = "https://lumabar.xyz";
const OUT = path.join(__dirname, "..", "_evidence");
const DELAY_MS = 800;
const HEADERS = { "User-Agent": "Mozilla/5.0 (private reference study)" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (url) => new URL(url).pathname.replace(/^\/|\/$/g, "").replace(/\//g, "__") || "home";

function pageText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function findAssets(html, base) {
  const found = new Set();
  const add = (raw) => {
    try {
      const url = new URL(raw.replace(/&amp;/g, "&").replace(/\\u0026/g, "&"), base);
      if (url.origin === ORIGIN) found.add(url.href);
    } catch {}
  };
  for (const m of html.matchAll(/(?:src|href|poster|content)="([^"]+\.(?:png|jpe?g|webp|avif|gif|svg|mp4|webm|mov|css)(?:\?[^"]*)?)"/gi)) add(m[1]);
  for (const m of html.matchAll(/srcSet="([^"]+)"/gi)) for (const part of m[1].split(",")) add(part.trim().split(" ")[0]);
  for (const m of html.matchAll(/["'(](\/[^"'()\s]+\.(?:png|jpe?g|webp|avif|gif|mp4|webm|mov|css)(?:\?[^"'()\s]*)?)["')]/gi)) add(m[1]);
  return [...found];
}

function findLinks(html, base) {
  const links = new Set();
  for (const m of html.matchAll(/href="([^"#]+)/g)) {
    try {
      const url = new URL(m[1], base);
      if (url.origin === ORIGIN && !/\.[a-z0-9]+$/i.test(url.pathname) && !url.pathname.startsWith("/api")) {
        links.add(url.origin + url.pathname.replace(/\/$/, ""));
      }
    } catch {}
  }
  return [...links];
}

(async () => {
  for (const d of ["html", "text"]) fs.mkdirSync(path.join(OUT, d), { recursive: true });
  const sitemap = await (await fetch(`${ORIGIN}/sitemap.xml`, { headers: HEADERS })).text();
  fs.writeFileSync(path.join(OUT, "sitemap.xml"), sitemap);
  for (const file of ["llms.txt", "robots.txt"]) {
    fs.writeFileSync(path.join(OUT, file), await (await fetch(`${ORIGIN}/${file}`, { headers: HEADERS })).text());
    await sleep(DELAY_MS);
  }
  const fromSitemap = [...sitemap.matchAll(/<loc>([^<]+)/g)].map((m) => m[1].replace(/\/$/, ""));
  const queue = [...fromSitemap];
  const seen = new Set();
  const manifest = [];
  const assets = {};
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const res = await fetch(url, { headers: HEADERS });
    const html = await res.text();
    const name = slug(url);
    manifest.push({ url, slug: name, status: res.status, inSitemap: fromSitemap.includes(url), bytes: html.length });
    if (res.ok) {
      fs.writeFileSync(path.join(OUT, "html", `${name}.html`), html);
      fs.writeFileSync(path.join(OUT, "text", `${name}.txt`), pageText(html));
      for (const asset of findAssets(html, url)) (assets[asset] ??= []).push(name);
      for (const link of findLinks(html, url)) if (!seen.has(link)) queue.push(link);
    }
    console.log(res.status, name);
    await sleep(DELAY_MS);
  }
  fs.writeFileSync(path.join(OUT, "pages.json"), JSON.stringify(manifest, null, 1));
  fs.writeFileSync(path.join(OUT, "assets.json"), JSON.stringify(assets, null, 1));
  const ok = manifest.filter((p) => p.status === 200).length;
  console.log(`pages ${manifest.length}, ok ${ok}, not in sitemap ${manifest.filter((p) => !p.inSitemap).length}, assets ${Object.keys(assets).length}`);
})();
