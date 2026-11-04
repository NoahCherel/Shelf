// Downloads the images, video and stylesheet listed in _evidence/assets.json. Skips files already saved.
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "_evidence", "assets");
const assets = require("../_evidence/assets.json");
const HEADERS = { "User-Agent": "Mozilla/5.0 (private reference study)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let saved = 0;
  const failed = [];
  for (const url of Object.keys(assets)) {
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop());
    if (!/\.[a-z0-9]+$/i.test(name)) continue; // page links, not files
    const file = path.join(OUT, name);
    if (fs.existsSync(file)) continue;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      failed.push(`${res.status} ${url}`);
      continue;
    }
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    saved++;
    await sleep(250);
  }
  console.log(`saved ${saved}, failed ${failed.length}`);
  if (failed.length) console.log(failed.join("\n"));
})();
