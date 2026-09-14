import { nextDealQty, quoteOffer, shortOffer, unusedOfferHint } from "./offers";
import { unitRateFor, formatUnitRate, type UnitRate } from "./pack";
import { STORE_ORDER, storeName } from "./stores";
import type { ProductView, StoreId } from "./types";
import { formatHkd } from "@/lib/utils";

export const MIN_SPLIT_SAVE = 5;

export type PickedItem = {
  id: string;
  query: string;
  qty: number;
  product: ProductView;
};

export type ItemStoreQuote = {
  store: StoreId;
  storeLabel: string;
  unitPrice: number;
  total: number;
  offer: string | null;
  applied: boolean;
};

export type ItemPlan = {
  id: string;
  query: string;
  qty: number;
  product: ProductView;
  quotes: ItemStoreQuote[];
  cheapest: ItemStoreQuote | null;
};

export type StoreBasket = {
  store: StoreId;
  storeLabel: string;
  total: number;
  found: number;
  missing: Array<{ query: string; name: string }>;
  complete: boolean;
  offerHits: number;
};

export type SplitAssignment = {
  id: string;
  store: StoreId;
  storeLabel: string;
  total: number;
  name: string;
};

export type SplitPlan = {
  stores: [StoreId, StoreId];
  labels: [string, string];
  total: number;
  assignments: SplitAssignment[];
  extraStops: number;
};

export type QtyDealTip = {
  id: string;
  name: string;
  qty: number;
  dealQty: number;
  extra: number;
  offer: string;
  fromStore: StoreId;
  fromLabel: string;
  toStore: StoreId;
  toLabel: string;
  shopChanges: boolean;
  dealTotal: number;
  unitEffective: number;
  fromRate: UnitRate | null;
  toRate: UnitRate | null;
  saveVsStay: number;
  saveVsShelf: number;
};

export type CompareResult = {
  items: ItemPlan[];
  stores: StoreBasket[];
  cheapestComplete: StoreBasket | null;
  cheapestAny: StoreBasket | null;
  mixed: {
    total: number;
    storesUsed: StoreId[];
    vsComplete: number | null;
  };
  split: SplitPlan | null;
  tips: QtyDealTip[];
};

export function buildCompare(
  picked: PickedItem[],
  enabledStores: StoreId[],
): CompareResult {
  const enabled = uniqueStores([
    ...STORE_ORDER.filter((id) => enabledStores.includes(id)),
    ...enabledStores.filter((id) => !STORE_ORDER.includes(id)),
  ]);
  const items: ItemPlan[] = picked.map((row) => {
    const quotes: ItemStoreQuote[] = [];
    for (const price of row.product.prices) {
      if (!enabled.includes(price.store)) continue;
      const quoted = quoteOffer(price.unitPrice, row.qty, price.offer);
      quotes.push({
        store: price.store,
        storeLabel: storeName(price.store, price.shop),
        unitPrice: price.unitPrice,
        total: quoted.total,
        offer: price.offer,
        applied: quoted.applied,
      });
    }
    quotes.sort((a, b) => a.total - b.total);
    return {
      id: row.id,
      query: row.query,
      qty: row.qty,
      product: row.product,
      quotes,
      cheapest: quotes[0] ?? null,
    };
  });

  const stores: StoreBasket[] = enabled.map((store) => {
    let total = 0;
    let found = 0;
    let offerHits = 0;
    const missing: StoreBasket["missing"] = [];
    for (const item of items) {
      const quote = item.quotes.find((q) => q.store === store);
      if (!quote) {
        missing.push({
          query: item.query,
          name: `${item.product.brand} ${item.product.name}`,
        });
        continue;
      }
      found += 1;
      total += quote.total;
      if (quote.applied) offerHits += 1;
    }
    return {
      store,
      storeLabel: storeName(store),
      total: roundMoney(total),
      found,
      missing,
      complete: missing.length === 0 && found > 0,
      offerHits,
    };
  });

  stores.sort((a, b) => {
    if (a.complete !== b.complete) return a.complete ? -1 : 1;
    if (a.found !== b.found) return b.found - a.found;
    return a.total - b.total;
  });

  const cheapestComplete = stores.find((s) => s.complete) ?? null;
  const cheapestAny =
    [...stores].filter((s) => s.found > 0).sort((a, b) => a.total - b.total)[0] ?? null;

  const mixedStores = new Set<StoreId>();
  let mixedTotal = 0;
  for (const item of items) {
    if (!item.cheapest) continue;
    mixedTotal += item.cheapest.total;
    mixedStores.add(item.cheapest.store);
  }

  const split = bestSplit(items, enabled, cheapestComplete?.total ?? null);

  return {
    items,
    stores,
    cheapestComplete,
    cheapestAny,
    mixed: {
      total: roundMoney(mixedTotal),
      storesUsed: [...mixedStores],
      vsComplete:
        cheapestComplete != null
          ? roundMoney(cheapestComplete.total - mixedTotal)
          : null,
    },
    split,
    tips: dealTips(items),
  };
}

export function mixedStrategyHint(result: CompareResult): string {
  const n = result.mixed.storesUsed.length;
  const names = result.mixed.storesUsed.map((id) => storeName(id)).join("、");
  const save = result.mixed.vsComplete;
  if (n <= 1) return names ? `全部喺${names}最平` : "—";
  if (save != null && save > 0 && save < MIN_SPLIT_SAVE) {
    return `行 ${n} 間只慳 ${formatHkd(save)}，唔划算`;
  }
  if (save != null && save > 0) {
    return `行 ${n} 間，慳 ${formatHkd(save)}`;
  }
  return names || "—";
}

export function splitStrategyCopy(result: CompareResult): { value: string; hint: string } {
  if (result.split) {
    return {
      value: formatHkd(result.split.total),
      hint: `${result.split.labels[0]} + ${result.split.labels[1]}`,
    };
  }
  const save = result.mixed.vsComplete;
  const n = result.mixed.storesUsed.length;
  if (n <= 1) return { value: "唔使分", hint: "同一間已經最平" };
  if (save != null && save > 0 && save < MIN_SPLIT_SAVE) {
    return { value: "唔值得", hint: `行多間只慳 ${formatHkd(save)}` };
  }
  return { value: "唔使分", hint: "一間買晒已經夠低" };
}

export function formatCompareCopy(
  result: CompareResult,
  extra?: { pending?: string[]; skipped?: string[] },
): string {
  const lines: string[] = ["格價籃"];

  if (result.cheapestComplete) {
    lines.push(
      `一間買晒  ${result.cheapestComplete.storeLabel} ${formatHkd(result.cheapestComplete.total)}（齊貨）`,
    );
  } else {
    const any = result.cheapestAny;
    lines.push(
      any
        ? `一間買晒  冇一間齊貨 · 最多貨 ${any.storeLabel} ${any.found} 件 ${formatHkd(any.total)}`
        : "一間買晒  冇一間齊貨",
    );
  }

  lines.push(`逐件最平  ${formatHkd(result.mixed.total)} · ${mixedStrategyHint(result)}`);

  const splitCopy = splitStrategyCopy(result);
  if (result.split) {
    lines.push(`分兩間買  ${splitCopy.value} · ${splitCopy.hint}`);
  } else {
    lines.push(`分兩間買  ${splitCopy.value} — ${splitCopy.hint}`);
  }

  if (result.tips.length > 0) {
    lines.push("", "—— 買多D慳多D ——");
    for (const tip of result.tips) {
      lines.push(
        `${tip.name} 而家×${tip.qty}，${tip.toLabel}買${tip.dealQty}件 ${formatHkd(tip.dealTotal)}（每件 ${formatHkd(tip.unitEffective)}${tip.toRate ? ` · ${formatUnitRate(tip.toRate)}` : ""}）`,
      );
      if (tip.fromRate && tip.toRate && tip.toRate.per + 0.05 < tip.fromRate.per) {
        lines.push(`  每${tip.toRate.base}由 ${formatUnitRate(tip.fromRate)} 降至 ${formatUnitRate(tip.toRate)}`);
      }
      lines.push(
        tip.shopChanges
          ? `  最平舖由 ${tip.fromLabel} 改去 ${tip.toLabel}，相對原舖買${tip.dealQty}件慳 ${formatHkd(tip.saveVsStay)}`
          : `  仍然係 ${tip.toLabel} 最平，用優惠慳 ${formatHkd(tip.saveVsShelf)}`,
      );
    }
  }

  lines.push("", "—— 購物清單（逐件最平）——");
  result.items.forEach((item, index) => {
    const name = `${item.product.brand} ${item.product.name}`.replace(/\s+/g, " ").trim();
    const qty = item.qty > 1 ? ` ×${item.qty}` : "";
    if (!item.cheapest) {
      lines.push(`${index + 1}. ${name}${qty}`);
      lines.push("   篩選後冇價");
      return;
    }
    const cheapest = item.cheapest;
    const offerNote = cheapest.applied
      ? `已計：${shortOffer(cheapest.offer)}`
      : unusedOfferHint(cheapest.unitPrice, item.qty, cheapest.offer);
    lines.push(`${index + 1}. ${name}${qty}`);
    lines.push(
      `   ${cheapest.storeLabel} ${formatHkd(cheapest.total)}${offerNote ? `（${offerNote}）` : ""}`,
    );
    const runner = item.quotes[1];
    if (runner && runner.store !== cheapest.store) {
      lines.push(`   次平 ${runner.storeLabel} ${formatHkd(runner.total)}`);
    }
  });

  lines.push("", "—— 分店買 ——");
  if (result.split) {
    for (const store of result.split.stores) {
      const rows = result.split.assignments.filter((row) => row.store === store);
      const sub = rows.reduce((sum, row) => sum + row.total, 0);
      lines.push(`${storeName(store)} ${formatHkd(sub)}`);
      for (const row of rows) {
        lines.push(`  · ${row.name.trim()} ${formatHkd(row.total)}`);
      }
    }
  } else {
    lines.push("慳少過 $5 就當唔值得行多一間。一間買晒已經夠低。");
  }

  const baskets = result.stores.filter((basket) => basket.found > 0).slice(0, 4);
  if (baskets.length > 0) {
    lines.push("", "—— 按超市 ——");
    for (const basket of baskets) {
      if (basket.complete) {
        const deals = basket.offerHits > 0 ? ` · ${basket.offerHits} 件計埋優惠` : "";
        lines.push(`${basket.storeLabel} 齊貨 ${formatHkd(basket.total)}${deals}`);
      } else {
        const missing = basket.missing.map((row) => row.name.trim()).filter(Boolean).join("、");
        lines.push(
          `${basket.storeLabel} 缺${basket.missing.length} ${formatHkd(basket.total)} — 缺${missing || "—"}`,
        );
      }
    }
  }

  if (extra?.pending?.length) {
    lines.push("", "未確認");
    for (const query of extra.pending) lines.push(`· ${query} — 未揀`);
  }
  if (extra?.skipped?.length) {
    lines.push("", "已跳過");
    for (const query of extra.skipped) lines.push(`· ${query} — 跳過`);
  }

  lines.push(
    "",
    "注意",
    "· 買2件／第二件半價等貨品優惠，已按你填嘅件數計；件數唔夠會標「未用到」。",
    "· Visa／Mastercard 滿額九折、yuu、MoneyBack 等全場或信用卡優惠，消委會格價冇計入，入舖或 Pay 前再睇。",
  );
  return lines.join("\n");
}

export function bestUnusedDeal(item: ItemPlan): QtyDealTip | null {
  return dealTips([item])[0] ?? null;
}

function dealTips(items: ItemPlan[]): QtyDealTip[] {
  const tips: QtyDealTip[] = [];
  for (const item of items) {
    const current = item.cheapest;
    if (!current) continue;
    const name = `${item.product.brand} ${item.product.name}`.replace(/\s+/g, " ").trim();
    const dealQtys = new Set<number>();
    for (const quote of item.quotes) {
      const n = nextDealQty(quote.unitPrice, item.qty, quote.offer);
      if (n && n - item.qty <= 6) dealQtys.add(n);
    }
    let best: QtyDealTip | null = null;
    for (const dealQty of dealQtys) {
      const priced = item.quotes.map((quote) => {
        const quoted = quoteOffer(quote.unitPrice, dealQty, quote.offer);
        return { quote, quoted };
      });
      priced.sort((a, b) => a.quoted.total - b.quoted.total);
      const winner = priced[0];
      if (!winner || !priced.some((row) => row.quoted.applied)) continue;
      const stay = priced.find((row) => row.quote.store === current.store) ?? winner;
      const saveVsStay = roundMoney(stay.quoted.total - winner.quoted.total);
      const saveVsShelf = roundMoney(winner.quote.unitPrice * dealQty - winner.quoted.total);
      if (saveVsStay < 0.05 && saveVsShelf < 0.05) continue;
      const offer =
        shortOffer(winner.quoted.applied ? winner.quote.offer : priced.find((row) => row.quoted.applied)?.quote.offer) ||
        `買${dealQty}件優惠`;
      const tip: QtyDealTip = {
        id: item.id,
        name,
        qty: item.qty,
        dealQty,
        extra: dealQty - item.qty,
        offer,
        fromStore: current.store,
        fromLabel: current.storeLabel,
        toStore: winner.quote.store,
        toLabel: winner.quote.storeLabel,
        shopChanges: winner.quote.store !== current.store,
        dealTotal: winner.quoted.total,
        unitEffective: roundMoney(winner.quoted.total / dealQty),
        fromRate: unitRateFor(item.product, current.total, item.qty),
        toRate: unitRateFor(item.product, winner.quoted.total, dealQty),
        saveVsStay,
        saveVsShelf,
      };
      if (!best || tip.saveVsStay + tip.saveVsShelf > best.saveVsStay + best.saveVsShelf) {
        best = tip;
      }
    }
    if (best) tips.push(best);
  }
  return tips.sort((a, b) => b.saveVsShelf + b.saveVsStay - (a.saveVsShelf + a.saveVsStay)).slice(0, 4);
}

function bestSplit(
  items: ItemPlan[],
  stores: StoreId[],
  completeTotal: number | null,
): SplitPlan | null {
  if (items.length < 2 || stores.length < 2) return null;

  let best: SplitPlan | null = null;
  for (let i = 0; i < stores.length; i++) {
    for (let j = i + 1; j < stores.length; j++) {
      const a = stores[i]!;
      const b = stores[j]!;
      const assignments: SplitAssignment[] = [];
      let total = 0;
      let ok = true;
      const used = new Set<StoreId>();
      for (const item of items) {
        const qa = item.quotes.find((q) => q.store === a);
        const qb = item.quotes.find((q) => q.store === b);
        const pick = cheaper(qa, qb);
        if (!pick) {
          ok = false;
          break;
        }
        used.add(pick.store);
        total += pick.total;
        assignments.push({
          id: item.id,
          store: pick.store,
          storeLabel: pick.storeLabel,
          total: pick.total,
          name: `${item.product.brand} ${item.product.name}`,
        });
      }
      if (!ok || used.size < 2) continue;
      total = roundMoney(total);
      const candidate: SplitPlan = {
        stores: [a, b],
        labels: [storeName(a), storeName(b)],
        total,
        assignments,
        extraStops: 1,
      };
      if (!best || candidate.total < best.total) best = candidate;
    }
  }

  if (!best) return null;
  if (completeTotal != null && completeTotal - best.total < MIN_SPLIT_SAVE) return null;
  return best;
}

function cheaper(
  a: ItemStoreQuote | undefined,
  b: ItemStoreQuote | undefined,
): ItemStoreQuote | undefined {
  if (a && b) return a.total <= b.total ? a : b;
  return a ?? b;
}

function roundMoney(value: number): number {
  return Math.round(value * 10) / 10;
}

function uniqueStores(ids: StoreId[]): StoreId[] {
  const seen = new Set<StoreId>();
  const out: StoreId[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
