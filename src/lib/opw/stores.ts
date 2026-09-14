import type { StoreId } from "./types";
import { STORE_IDS } from "./types";

export type StoreMeta = {
  id: StoreId;
  name: string;
  short: string;
  kind: "超市" | "個人護理" | "其他";
};

export const STORES: Record<StoreId, StoreMeta> = {
  WELLCOME: { id: "WELLCOME", name: "惠康", short: "惠康", kind: "超市" },
  PARKNSHOP: { id: "PARKNSHOP", name: "百佳", short: "百佳", kind: "超市" },
  JASONS: { id: "JASONS", name: "Jason's", short: "Jason's", kind: "超市" },
  AEON: { id: "AEON", name: "AEON", short: "AEON", kind: "超市" },
  WATSONS: { id: "WATSONS", name: "屈臣氏", short: "屈臣氏", kind: "個人護理" },
  MANNINGS: { id: "MANNINGS", name: "萬寧", short: "萬寧", kind: "個人護理" },
  LUNGFUNG: { id: "LUNGFUNG", name: "龍豐", short: "龍豐", kind: "其他" },
  DCHFOOD: { id: "DCHFOOD", name: "大昌食品", short: "大昌", kind: "其他" },
  SASA: { id: "SASA", name: "莎莎", short: "莎莎", kind: "個人護理" },
  HKTV: { id: "HKTV", name: "HKTVmall", short: "HKTV", kind: "其他" },
  PRICEHK: { id: "PRICEHK", name: "Price.com.hk", short: "Price", kind: "其他" },
  OTHER: { id: "OTHER", name: "其他", short: "其他", kind: "其他" },
};

export const CATALOG_STORES: StoreId[] = STORE_IDS.filter(
  (id) => id !== "HKTV" && id !== "PRICEHK" && id !== "OTHER",
);
export const STORE_ORDER: StoreId[] = [...CATALOG_STORES];

export function isStoreId(value: string): value is StoreId {
  return (STORE_IDS as readonly string[]).includes(value);
}

export function storeName(id: StoreId, shop?: string | null): string {
  const custom = shop?.trim();
  if (id === "OTHER" && custom) return custom;
  return custom || STORES[id].name;
}
