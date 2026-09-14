import type { PickReason, ProductView } from "./types";
import { formatHkd } from "@/lib/utils";

export type { PickReason };

export type PackInfo = {
  label: string;
  ml: number | null;
  g: number | null;
  count: number;
};

const SIZE_RE = /(\d+(?:\.\d+)?)\s*(公斤|千克|kg|克|g|毫升|ml|公升|升|l)(?![a-z\u4e00-\u9fff])/i;
const PACK_RE = /(?:x|×)\s*(\d+)/i;

function compact(input: string): string {
  return input.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

export function familyKey(product: ProductView): string {
  return compact(`${product.brand}${product.name}`)
    .replace(/\d+(?:\.\d+)?(?:公斤|克|毫升|公升|升|片|件|盒|磅|kg|g|ml|l)/gi, "")
    .replace(/[x×]\d+/g, "")
    .replace(/樽裝|罐裝|包裝|支裝|盒裝/g, "");
}

export function sameFamily(a: ProductView, b: ProductView): boolean {
  const key = familyKey(a);
  return key.length >= 4 && key === familyKey(b);
}

export function parsePack(text: string): PackInfo {
  const pack = text.match(PACK_RE);
  const count = pack ? Number(pack[1]) : 1;
  const size = text.match(SIZE_RE);
  if (!size) {
    return { label: count > 1 ? `×${count}` : "", ml: null, g: null, count };
  }
  const n = Number(size[1]);
  const unit = (size[2] ?? "").toLowerCase();
  let ml: number | null = null;
  let g: number | null = null;
  let unitLabel = size[0].replace(/\s+/g, "");
  if (unit === "毫升" || unit === "ml") {
    ml = n * count;
    unitLabel = `${n}毫升`;
  } else if (unit === "公升" || unit === "升" || unit === "l") {
    ml = n * 1000 * count;
    unitLabel = `${n}公升`;
  } else if (unit === "克" || unit === "g") {
    g = n * count;
    unitLabel = `${n}克`;
  } else if (unit === "公斤" || unit === "kg") {
    g = n * 1000 * count;
    unitLabel = `${n}公斤`;
  }
  const label = count > 1 ? `${unitLabel}×${count}` : unitLabel;
  return { label, ml, g, count };
}

export function productPack(product: ProductView): PackInfo {
  return parsePack(`${product.name} ${product.nameEn}`);
}

export function queryPack(query: string): PackInfo | null {
  const parsed = parsePack(query);
  if (!parsed.ml && !parsed.g && parsed.count <= 1) return null;
  return parsed;
}

export function shelfPrice(product: ProductView): number {
  if (product.prices.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...product.prices.map((row) => row.unitPrice));
}

export function sortByShelfPrice(products: ProductView[]): ProductView[] {
  return [...products].sort((a, b) => {
    const diff = shelfPrice(a) - shelfPrice(b);
    if (diff !== 0) return diff;
    return `${a.brand}${a.name}`.localeCompare(`${b.brand}${b.name}`, "zh-Hant");
  });
}

export type UnitRate = {
  per: number;
  base: "升" | "公斤";
};

export function unitRateFor(product: ProductView, total: number, qty = 1): UnitRate | null {
  const pack = productPack(product);
  if (!Number.isFinite(total) || total <= 0 || qty < 1) return null;
  if (pack.ml && pack.ml > 0) return { per: total / ((pack.ml * qty) / 1000), base: "升" };
  if (pack.g && pack.g > 0) return { per: total / ((pack.g * qty) / 1000), base: "公斤" };
  return null;
}

export function unitRate(product: ProductView): UnitRate | null {
  return unitRateFor(product, shelfPrice(product), 1);
}

export function formatUnitRate(rate: UnitRate): string {
  return `${formatHkd(rate.per)}/${rate.base}`;
}

export function packCompatible(product: ProductView, wanted: PackInfo): boolean {
  const got = productPack(product);
  if (wanted.ml && got.ml) {
    const singleWanted = wanted.ml / wanted.count;
    const singleGot = got.ml / got.count;
    if (Math.abs(singleWanted - singleGot) > 1) return false;
    if (wanted.count > 1 && got.count !== wanted.count) return false;
    return true;
  }
  if (wanted.g && got.g) {
    const singleWanted = wanted.g / wanted.count;
    const singleGot = got.g / got.count;
    return Math.abs(singleWanted - singleGot) <= 1;
  }
  return false;
}

export function cheapestUnitProduct(products: ProductView[]): ProductView | null {
  let best: ProductView | null = null;
  let bestPer = Number.POSITIVE_INFINITY;
  for (const product of products) {
    const rate = unitRate(product);
    if (!rate) continue;
    if (rate.per < bestPer) {
      bestPer = rate.per;
      best = product;
    }
  }
  return best;
}

export function cheapestPackProduct(products: ProductView[]): ProductView | null {
  if (products.length === 0) return null;
  return [...products].sort((a, b) => shelfPrice(a) - shelfPrice(b) || a.name.length - b.name.length)[0] ?? null;
}

export function pickReasonLabel(
  reason: PickReason | "user" | null,
  label: string,
  base: "升" | "公斤" | null,
): string | null {
  if (!reason) return null;
  if (reason === "query-size") return `跟清單揀咗 ${label}`;
  if (reason === "alt-size") return `冇你寫嘅容量，改顯示同類嘅 ${label}`;
  if (reason === "best-unit") {
    return base
      ? `未寫容量，預設揀咗每${base}最抵嘅 ${label}`
      : `未寫容量，預設揀咗 ${label}`;
  }
  if (reason === "best-match") return `自動配對：${label}`;
  return `你揀咗 ${label}`;
}

export function valueHint(selected: ProductView, family: ProductView[]): string | null {
  if (family.length < 2) return null;
  const bestUnit = cheapestUnitProduct(family);
  const bestPack = cheapestPackProduct(family);
  if (!bestUnit || !bestPack || bestUnit.code === bestPack.code) return null;
  if (selected.code === bestUnit.code) {
    const pack = productPack(bestPack);
    const rate = unitRate(bestPack);
    return `件價最平係 ${pack.label || bestPack.name} ${formatHkd(shelfPrice(bestPack))}${
      rate ? `，但每${rate.base}要 ${formatHkd(rate.per)}` : ""
    }。`;
  }
  if (selected.code === bestPack.code) {
    const pack = productPack(bestUnit);
    const rate = unitRate(bestUnit);
    return `更抵容量：${pack.label || bestUnit.name} ${formatHkd(shelfPrice(bestUnit))}${
      rate ? `（${formatUnitRate(rate)}）` : ""
    }`;
  }
  return null;
}
