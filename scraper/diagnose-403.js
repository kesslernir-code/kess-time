// Temporary diagnostic: mazkeka and hamecarer return HTTP 403 from the CI
// runner but 200 from a home connection. Plain fetch is 403 from CI with both
// the scraper's headers and a full browser header set; Puppeteer returns HTML.
// This round checks WHAT Puppeteer actually got — a real page, or Cloudflare's
// ~28KB "Just a moment" challenge, which would look like success by length.
import { renderPage } from "./lib/render.js";
import { stripHtml, todayISODate } from "./lib/util.js";

const targets = [
  ["mazkeka html", "https://mazkeka.com/events/"],
  [
    "mazkeka wp-json",
    `https://mazkeka.com/wp-json/wp/v2/events?per_page=5&after=${todayISODate()}T00:00:00&orderby=date&order=asc`,
  ],
  ["hamecarer html", "https://hamecarer.co.il/exhibitions/"],
];

for (const [name, url] of targets) {
  console.log(`\n=== ${name} — ${url}`);
  try {
    const r = await renderPage(url, { timeoutMs: 45000, settleMs: 4000 });
    const html = r?.html || "";
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "(none)";
    const challenge = /Just a moment|cf-browser-verification|challenge-platform|Attention Required/i.test(html);
    console.log(`  len=${html.length}  challenge=${challenge}`);
    console.log(`  title: ${title}`);
    console.log(`  text:  ${stripHtml(html).replace(/\s+/g, " ").slice(0, 300)}`);
  } catch (e) {
    console.log(`  ERR ${e.message}`);
  }
}
console.log("\n=== DONE ===");
