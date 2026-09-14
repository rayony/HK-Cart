import { uid } from "@/lib/utils";
import { googleSearchUrl, priceHkSearchUrl } from "./external";
import { storeName } from "./stores";
import type { ProductSource, ProductView, StoreId } from "./types";

export function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0 || value > 99999) return null;
  return Math.round(value * 10) / 10;
}

export function makeCustomProduct(opts: {
  name: string;
  price: number;
  store: StoreId;
  shop?: string;
  url?: string;
  query: string;
}): ProductView {
  const name = opts.name.replace(/\s+/g, " ").trim();
  const url = opts.url?.trim();
  const shop = opts.shop?.replace(/\s+/g, " ").trim();
  let source: ProductSource = "custom";
  if (opts.store === "PRICEHK") source = "pricehk";
  if (opts.store === "HKTV") source = "hktv";
  const storeLabel = storeName(opts.store, shop);
  return {
    code: `custom:${uid()}`,
    brand: "",
    name,
    brandEn: "",
    nameEn: "",
    category: "自己填",
    url:
      url ||
      (opts.store === "PRICEHK" ? priceHkSearchUrl(opts.query) : googleSearchUrl(opts.query)),
    prices: [
      {
        store: opts.store,
        unitPrice: opts.price,
        offer: `自己填 · ${storeLabel}`,
        shop,
      },
    ],
    source,
  };
}
