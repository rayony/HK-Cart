import { opwProductUrl } from "./external";
import { isStoreId } from "./stores";
import type { ProductView, RawProduct, StoreId, StorePrice } from "./types";

const OPW_JSON =
  "https://online-price-watch.consumer.org.hk/opw/opendata/pricewatch.json";

const TTL_MS = 6 * 60 * 60 * 1000;

type Catalog = {
  products: ProductView[];
  updatedAt: string | null;
  fetchedAt: number;
};

let cache: Catalog | null = null;
let inflight: Promise<Catalog> | null = null;

export function peekCatalog(): Catalog | null {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;
  return null;
}

export function warmCatalog(): void {
  void getCatalog().catch(() => {
    /* first-load fetch; UI polls peek */
  });
}

export async function getCatalog(): Promise<Catalog> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;
  if (inflight) return inflight;
  inflight = loadCatalog().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function loadCatalog(): Promise<Catalog> {
  const response = await fetch(OPW_JSON, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    if (cache) return cache;
    throw new Error(`格價資訊通暫時連唔上（${response.status}）`);
  }

  const raw = (await response.json()) as RawProduct[];
  if (!Array.isArray(raw)) throw new Error("格價資訊通資料格式唔正確");

  const products = raw.map(toProduct).filter((p): p is ProductView => p != null);
  const updatedAt =
    response.headers.get("last-modified") ??
    new Date().toISOString();

  cache = { products, updatedAt, fetchedAt: Date.now() };
  return cache;
}

function toProduct(raw: RawProduct): ProductView | null {
  if (!raw?.code) return null;
  const brand = pickText(raw.brand);
  const name = pickText(raw.name);
  if (!name) return null;

  const offerByStore = new Map<StoreId, string>();
  for (const offer of raw.offers ?? []) {
    if (!isStoreId(offer.supermarketCode)) continue;
    const text = offer["zh-Hant"] || offer.en || "";
    if (text) offerByStore.set(offer.supermarketCode, text);
  }

  const prices: StorePrice[] = [];
  for (const row of raw.prices ?? []) {
    if (!isStoreId(row.supermarketCode)) continue;
    const unitPrice = Number(row.price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;
    prices.push({
      store: row.supermarketCode,
      unitPrice,
      offer: offerByStore.get(row.supermarketCode) ?? null,
    });
  }
  if (prices.length === 0) return null;

  return {
    code: raw.code,
    brand: brand,
    name,
    brandEn: raw.brand?.en ?? "",
    nameEn: raw.name?.en ?? "",
    category:
      [pickText(raw.cat2Name), pickText(raw.cat3Name)].filter(Boolean).join(" / ") ||
      pickText(raw.cat1Name),
    url: opwProductUrl(raw.code),
    prices,
  };
}

function pickText(value?: { en?: string; "zh-Hant"?: string; "zh-Hans"?: string }): string {
  if (!value) return "";
  return value["zh-Hant"] || value.en || value["zh-Hans"] || "";
}
