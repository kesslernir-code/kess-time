// Strategy: Radical's /calendar/ page. The site used to publish events as a WP
// `events` post type drawn in "uc_post_grid_style_one_item" cards; it now sells
// them as WooCommerce products drawn in an Elementor loop grid, so none of the
// old classes exist any more. Each card is still fully server-rendered:
//   <div data-elementor-type="loop-item" ...>
//     <a href="https://radical.org.il/product/SLUG/"><img src=...>
//     <h3 class="elementor-heading-title">TITLE</h3>
//     <div ...text-editor...>יום שלישי, 29/09</div>
//     <div ...text-editor...>18:30</div>
// The grid pages (/calendar/2/, /calendar/3/, …) and the page count comes from
// the load-more anchor's data-max-page. Price and description are not on the
// card at all — they only exist in the WooCommerce Store API.
import { fetchText, fetchJson } from "../lib/fetchPage.js";
import { decodeEntities, inferYear, israelISO, reconcilePrice, stripHtml } from "../lib/util.js";

export const name = "radical-calendar";

const ORIGIN = "https://radical.org.il";
const STORE = `${ORIGIN}/wp-json/wc/store/v1`;
const MAX_PAGES = 10; // data-max-page comes from the page; don't loop on it unbounded

/** slug -> Store API product, for price and description. */
async function productsBySlug() {
  try {
    const cats = await fetchJson(`${STORE}/products/categories?per_page=100`);
    const events = cats.find((c) => c.slug === "events");
    if (!events) return new Map();
    const items = await fetchJson(
      `${STORE}/products?category=${events.id}&per_page=100&orderby=date&order=desc`
    );
    return new Map(items.map((p) => [p.slug, p]));
  } catch {
    return new Map(); // price/description are nice-to-have; never fail the scrape over them
  }
}

/**
 * Store API money is an integer in minor units ("6000" + minor_unit 2 = ₪60).
 * A ₪0 product is a free event, not a price — say so instead of printing "₪0".
 */
function priceOf(p) {
  const pr = p?.prices;
  if (!pr) return undefined;
  const scale = 10 ** Number(pr.currency_minor_unit ?? 0);
  const sym = pr.currency_symbol || "₪";
  const amount = (v) => Number(v) / scale;
  const { min_amount: min, max_amount: max } = pr.price_range || {};
  if (min != null && max != null && amount(min) !== amount(max)) {
    return `${sym}${amount(min)}-${amount(max)}`;
  }
  const one = amount(min ?? pr.price);
  if (!Number.isFinite(one)) return undefined;
  return one === 0 ? "כניסה חופשית" : `${sym}${one}`;
}

export async function scrape(source) {
  const first = await fetchText(source.url);
  const maxPage = Math.min(Number(first.match(/data-max-page="(\d+)"/)?.[1]) || 1, MAX_PAGES);
  const pages = [first];
  for (let p = 2; p <= maxPage; p++) {
    pages.push(await fetchText(`${ORIGIN}/calendar/${p}/`));
  }

  const products = await productsBySlug();
  const events = new Map(); // slug_date -> event (the same card can repeat across pages)

  for (const html of pages) {
    for (const card of html.split('data-elementor-type="loop-item"').slice(1)) {
      const link = card.match(/href="(https:\/\/radical\.org\.il\/product\/[^"]+)"/)?.[1];
      const title = card.match(/<h3 class="elementor-heading-title[^"]*">([\s\S]*?)<\/h3>/)?.[1];
      // Anchor the date on the Hebrew weekday — a bare DD/MM also matches the
      // "/2026/09/" in every poster's upload path.
      const day = card.match(/יום\s+[^,<]{2,8},\s*(\d{1,2})\/(\d{1,2})/);
      if (!link || !title || !day) continue;

      const dd = Number(day[1]);
      const mo = Number(day[2]);
      // The time sits in the card's next text-editor block. Some cards (all-day
      // exhibitions) have none — israelISO falls back to 20:00 for those.
      const t = card.slice(day.index).match(/>\s*(\d{1,2}):(\d{2})\s*</);
      const hh = t ? Number(t[1]) : NaN;
      const mm = t ? Number(t[2]) : NaN;

      const slug = decodeURIComponent(link.replace(/\/$/, "").split("/").pop());
      const product = products.get(slug);
      const { priceText, isFree } = reconcilePrice(priceOf(product), undefined);
      const startsAt = israelISO(inferYear(mo, dd), mo, dd, hh, mm);
      const key = `${slug}_${startsAt}`;
      if (events.has(key)) continue;

      events.set(key, {
        occurrenceKey: slug,
        title: decodeEntities(title).trim(),
        description: product
          ? stripHtml(product.short_description || product.description || "").slice(0, 400) || null
          : null,
        startsAt,
        priceText,
        isFree,
        bookingUrl: link,
        eventUrl: link,
        imageUrl: card.match(/<img[^>]+src="([^"]+)"/)?.[1] || null,
        lang: "he",
        confidence: t ? 1.0 : 0.8, // no printed time = the 20:00 default is a guess
      });
    }
  }
  return [...events.values()];
}
