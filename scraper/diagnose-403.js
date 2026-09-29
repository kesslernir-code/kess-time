// Temporary diagnostic: mazkeka and hamecarer return HTTP 403 from the CI
// runner but 200 from a home connection. Run via the Diagnose workflow to tell
// an IP/ASN block (everything 403s, including a real browser) apart from a
// request-shape block (plain fetch 403s, Puppeteer succeeds).
import { renderPage } from "./lib/render.js";
import { todayISODate } from "./lib/util.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

const SCRAPER_HEADERS = {
  "User-Agent": UA,
  "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.5",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
};

const BROWSERISH_HEADERS = {
  ...SCRAPER_HEADERS,
  "sec-ch-ua": '"Chromium";v="125", "Not.A/Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
};

const targets = [
  ["mazkeka html", "https://mazkeka.com/events/"],
  [
    "mazkeka wp-json",
    `https://mazkeka.com/wp-json/wp/v2/events?per_page=5&after=${todayISODate()}T00:00:00&orderby=date&order=asc`,
  ],
  ["hamecarer html", "https://hamecarer.co.il/exhibitions/"],
];

const probe = async (label, url, headers) => {
  try {
    const r = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(30000) });
    const body = await r.text();
    console.log(`  ${label.padEnd(18)} ${r.status}  len=${body.length}  ${/cloudflare|Attention Required/i.test(body) ? "cloudflare" : ""}`);
  } catch (e) {
    console.log(`  ${label.padEnd(18)} ERR ${e.message}`);
  }
};

for (const [name, url] of targets) {
  console.log(`\n=== ${name} — ${url}`);
  await probe("scraper headers", url, SCRAPER_HEADERS);
  await probe("browser headers", url, BROWSERISH_HEADERS);
  try {
    const r = await renderPage(url, { timeoutMs: 30000 });
    console.log(`  puppeteer          ${r?.html ? `ok len=${r.html.length}` : "no html"}`);
  } catch (e) {
    console.log(`  puppeteer          ERR ${e.message}`);
  }
}
console.log("\n=== DONE ===");
