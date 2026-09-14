import { hktvSearchUrl, marketplaceSearchUrl, priceHkSearchUrl, wellcomeSearchUrl } from "./external";
import type { MoreSourceHit, ProductSource, ProductView, StoreId } from "./types";

const ALGOLIA_APP = "8RN1Y79F02";
const ALGOLIA_KEY = "a4a336abc62ab842842a81de642b484a";
const ALGOLIA_INDEX = "hktvProduct";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

type HktvHit = {
  code?: string;
  nameZh?: string;
  nameEn?: string;
  brandZh?: string;
  brandEn?: string;
  brand?: string;
  sellingPrice?: number;
  packingSpecZh?: string;
  promotionTextZh?: string;
  urlZh?: string;
  catNameZh?: string[];
  hasStock?: boolean;
  storeNameZh?: string;
  invisible?: boolean;
};

export async function searchMoreShops(
  query: string,
  round = 1,
): Promise<{ products: ProductView[]; sources: MoreSourceHit[] }> {
  const q = query.trim();
  if (!q) return { products: [], sources: [] };

  const jobs =
    round <= 1
      ? [
          tagged("hktv", () => searchHktv(q, 0), hktvSearchUrl(q), "HKTVmall"),
          tagged("wellcome", () => searchDfi({
            host: "www.wellcome.com.hk",
            store: "WELLCOME",
            source: "wellcome",
            query: q,
          }), wellcomeSearchUrl(q), "惠康"),
          tagged("pricehk", () => searchPriceHk(q), priceHkSearchUrl(q), "Price.com.hk"),
        ]
      : [
          tagged("hktv", () => searchHktv(q, 1), hktvSearchUrl(q), "HKTVmall"),
          tagged("marketplace", () => searchDfi({
            host: "www.marketplacehk.com",
            store: "JASONS",
            source: "marketplace",
            query: q,
          }), marketplaceSearchUrl(q), "Market Place"),
          tagged("pricehk", () => searchPriceHk(q), priceHkSearchUrl(q), "Price.com.hk"),
        ];

  const settled = await Promise.all(jobs);
  const merged = new Map<string, ProductView>();
  const sources: MoreSourceHit[] = [];
  for (const row of settled) {
    sources.push(row.source);
    for (const product of row.products) {
      if (!merged.has(product.code)) merged.set(product.code, product);
    }
  }
  return { products: [...merged.values()].slice(0, 24), sources };
}

async function tagged(
  id: MoreSourceHit["id"],
  run: () => Promise<{ products: ProductView[]; blocked?: boolean } | ProductView[]>,
  url: string,
  label: string,
): Promise<{ products: ProductView[]; source: MoreSourceHit }> {
  try {
    const raw = await run();
    const products = Array.isArray(raw) ? raw : raw.products;
    const blocked = Array.isArray(raw) ? false : Boolean(raw.blocked);
    return {
      products,
      source: { id, label, count: products.length, url, blocked },
    };
  } catch {
    return {
      products: [],
      source: { id, label, count: 0, url, blocked: id === "pricehk" },
    };
  }
}

export async function searchHktv(query: string, page = 0): Promise<ProductView[]> {
  const q = query.trim();
  if (!q) return [];

  const response = await fetch(
    `https://${ALGOLIA_APP}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Algolia-Application-Id": ALGOLIA_APP,
        "X-Algolia-API-Key": ALGOLIA_KEY,
      },
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({
        query: q,
        page,
        hitsPerPage: 8,
        attributesToRetrieve: [
          "code",
          "nameZh",
          "nameEn",
          "brandZh",
          "brandEn",
          "brand",
          "sellingPrice",
          "packingSpecZh",
          "promotionTextZh",
          "urlZh",
          "catNameZh",
          "hasStock",
          "storeNameZh",
          "invisible",
        ],
      }),
    },
  );
  if (!response.ok) return [];

  const body = (await response.json()) as { hits?: HktvHit[] };
  const products: ProductView[] = [];
  for (const hit of body.hits ?? []) {
    const mapped = toHktvProduct(hit);
    if (mapped) products.push(mapped);
  }
  return products;
}

async function searchDfi(opts: {
  host: string;
  store: StoreId;
  source: ProductSource;
  query: string;
}): Promise<ProductView[]> {
  const url = `https://${opts.host}/search?keyword=${encodeURIComponent(opts.query)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      "Accept-Language": "zh-HK,zh;q=0.9,en;q=0.8",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return [];
  const html = await response.text();
  return parseDfiCards(html, opts).filter((product) => nameHitsQuery(product.name, opts.query));
}

async function searchPriceHk(query: string): Promise<{ products: ProductView[]; blocked: boolean }> {
  const url = priceHkSearchUrl(query);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept-Language": "zh-HK,zh;q=0.9,en;q=0.8",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 403 || response.status === 503) {
      return { products: [], blocked: true };
    }
    if (!response.ok) return { products: [], blocked: true };
    const html = await response.text();
    if (/just a moment|cf-browser-verification|challenge-platform/i.test(html)) {
      return { products: [], blocked: true };
    }
    return { products: parsePriceHk(html), blocked: false };
  } catch {
    return { products: [], blocked: true };
  }
}

function parsePriceHk(html: string): ProductView[] {
  const products: ProductView[] = [];
  const seen = new Set<string>();
  const cardRe =
    /href="(product\.php\?p=(\d+)[^"]*)"[\s\S]{0,400}?>([^<]{2,80})[\s\S]{0,600}?\$([0-9][0-9,]*(?:\.[0-9]+)?)/gi;
  let match: RegExpExecArray | null;
  while ((match = cardRe.exec(html))) {
    const id = String(match[2] ?? "").trim();
    const name = decodeHtml(String(match[3] ?? "")).replace(/\s+/g, " ").trim();
    const price = Number(String(match[4] ?? "").replace(/,/g, ""));
    if (!id || !name || name.length < 2 || !Number.isFinite(price) || price <= 0) continue;
    const code = `pricehk:${id}`;
    if (seen.has(code)) continue;
    seen.add(code);
    products.push({
      code,
      brand: "",
      name,
      brandEn: "",
      nameEn: "",
      category: "Price.com.hk",
      url: `https://www.price.com.hk/product.php?p=${id}`,
      prices: [
        {
          store: "PRICEHK",
          unitPrice: price,
          offer: "Price.com.hk 參考價",
        },
      ],
      source: "pricehk",
    });
    if (products.length >= 6) break;
  }
  return products;
}

function parseDfiCards(
  html: string,
  opts: { host: string; store: StoreId; source: ProductSource },
): ProductView[] {
  const products: ProductView[] = [];
  const seen = new Set<string>();
  const cardRe =
    /href="([^"]+\/i\/(\d+)\.html)"[\s\S]{0,1800}?class="promo"[^>]*>([^<]+)[\s\S]{0,1200}?class="current-price"[\s\S]{0,240}?class="price"[^>]*>\$([^<]+)(?:[\s\S]{0,240}?class="small-price"[^>]*>([^<]*))?/g;
  let match: RegExpExecArray | null;
  while ((match = cardRe.exec(html))) {
    const path = String(match[1] ?? "").trim();
    const sku = String(match[2] ?? "").trim();
    const name = decodeHtml(String(match[3] ?? "")).trim();
    const dollars = Number(String(match[4] ?? "").replace(/,/g, ""));
    const cents = String(match[5] ?? "").replace(/[^\d.]/g, "");
    const price = Number(`${dollars}${cents.startsWith(".") ? cents : ""}`);
    if (!sku || !name || !Number.isFinite(price) || price <= 0) continue;
    const code = `${opts.source}:${sku}`;
    if (seen.has(code)) continue;
    seen.add(code);
    const href = path.startsWith("http") ? path : `https://${opts.host}${path}`;
    products.push({
      code,
      brand: "",
      name,
      brandEn: "",
      nameEn: "",
      category: opts.store === "WELLCOME" ? "惠康網上" : "Market Place",
      url: href,
      prices: [
        {
          store: opts.store,
          unitPrice: price,
          offer: `${opts.store === "WELLCOME" ? "惠康" : "Market Place"} 網上價`,
        },
      ],
      source: opts.source,
    });
    if (products.length >= 6) break;
  }
  return products;
}

function toHktvProduct(hit: HktvHit): ProductView | null {
  if (hit.invisible) return null;
  const code = String(hit.code ?? "").trim();
  const name = String(hit.nameZh || hit.nameEn || "").trim();
  const price = Number(hit.sellingPrice);
  if (!code || !name || !Number.isFinite(price) || price <= 0) return null;

  const brand = String(hit.brandZh || hit.brand || hit.brandEn || "").trim();
  const spec = String(hit.packingSpecZh ?? "").trim();
  const path = String(hit.urlZh ?? "").replace(/^\//, "");
  const offer = String(hit.promotionTextZh ?? "").trim();
  const store = String(hit.storeNameZh ?? "").trim();

  return {
    code: `hktv:${code}`,
    brand,
    name: spec && !name.includes(spec) ? `${name} ${spec}` : name,
    brandEn: String(hit.brandEn ?? ""),
    nameEn: String(hit.nameEn ?? ""),
    category: hit.catNameZh?.[0] || "HKTVmall",
    url: path
      ? `https://www.hktvmall.com/hktv/zh/${path}`
      : `https://www.hktvmall.com/hktv/zh/search_a?keyword=${encodeURIComponent(name)}`,
    prices: [
      {
        store: "HKTV",
        unitPrice: price,
        offer: [offer, store && `HKTVmall · ${store}`, !hit.hasStock ? "可能缺貨" : ""]
          .filter(Boolean)
          .join(" · ") || "HKTVmall 網上價",
      },
    ],
    source: "hktv",
  };
}

function nameHitsQuery(name: string, query: string): boolean {
  const n = name.replace(/\s+/g, "").toLowerCase();
  const compact = query.replace(/\s+/g, "").toLowerCase();
  if (compact.length >= 2 && n.includes(compact)) return true;
  const tokens = query
    .toLowerCase()
    .split(/[\s\-_/]+/)
    .filter((token) => token.length >= 2);
  if (tokens.some((token) => n.includes(token))) return true;
  if (compact.length >= 2) {
    for (let i = 0; i <= compact.length - 2; i++) {
      if (n.includes(compact.slice(i, i + 2))) return true;
    }
  }
  return false;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
