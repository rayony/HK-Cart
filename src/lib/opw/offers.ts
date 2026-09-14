import { unitRateFor, type UnitRate } from "./pack";
import type { ProductView } from "./types";

export type OfferQuote = {
  total: number;
  unitEffective: number;
  applied: boolean;
  label: string | null;
};

export function quoteOffer(
  unitPrice: number,
  qty: number,
  offer: string | null | undefined,
): OfferQuote {
  const base = unitPrice * qty;
  if (!offer || !Number.isFinite(unitPrice) || qty < 1) {
    return { total: roundMoney(base), unitEffective: unitPrice, applied: false, label: null };
  }

  const primary = offer.split(/\s*\/\s*/)[0]?.trim() ?? offer;
  const parsed = parseOffer(unitPrice, qty, primary);
  if (parsed == null) {
    return { total: roundMoney(base), unitEffective: unitPrice, applied: false, label: offer };
  }

  const total = roundMoney(Math.min(base, parsed));
  return {
    total,
    unitEffective: qty > 0 ? total / qty : unitPrice,
    applied: total + 0.005 < base,
    label: offer,
  };
}

function parseOffer(unit: number, qty: number, text: string): number | null {
  let m =
    text.match(/買\s*(\d+)\s*件\s*\$?\s*(\d+(?:\.\d+)?)/) ??
    text.match(/(\d+)\s*for\s*\$?\s*(\d+(?:\.\d+)?)/i);
  if (m) {
    const n = Number(m[1]);
    const pack = Number(m[2]);
    if (n > 0) {
      const packs = Math.floor(qty / n);
      const rem = qty % n;
      return packs * pack + rem * unit;
    }
  }

  m = text.match(/買\s*(\d+)\s*件慳\s*\$?\s*(\d+(?:\.\d+)?)/);
  if (m) {
    const n = Number(m[1]);
    const save = Number(m[2]);
    if (n > 0 && qty >= n) {
      return unit * qty - Math.floor(qty / n) * save;
    }
  }

  if (/第\s*2\s*件半價|第二件半價|第二件50\s*%|第2件半價/.test(text)) {
    const pairs = Math.floor(qty / 2);
    const rem = qty % 2;
    return pairs * unit * 1.5 + rem * unit;
  }

  m = text.match(/買\s*(\d+)\s*(?:件)?送\s*(\d+)/);
  if (m) {
    const buy = Number(m[1]);
    const free = Number(m[2]);
    const group = buy + free;
    if (group > 0) {
      const groups = Math.floor(qty / group);
      const rem = qty % group;
      const paid = groups * buy + Math.min(rem, buy);
      return paid * unit;
    }
  }

  if (/買1送1|買一送一/.test(text)) {
    const groups = Math.floor(qty / 2);
    const rem = qty % 2;
    return (groups + rem) * unit;
  }

  m = text.match(/\$?\s*(\d+(?:\.\d+)?)\s*任揀\s*(\d+)\s*件/);
  if (m) {
    const pack = Number(m[1]);
    const n = Number(m[2]);
    if (n > 0 && qty >= n) {
      const packs = Math.floor(qty / n);
      const rem = qty % n;
      return packs * pack + rem * unit;
    }
  }

  m =
    text.match(/買\s*(\d+)\s*件(?:或以上)?(?:照價)?\s*(\d+(?:\.\d+)?)折/) ??
    text.match(/(\d+)\s*件或以上(?:照價)?\s*(\d+(?:\.\d+)?)折/);
  if (m) {
    const n = Number(m[1]);
    const zhe = Number(m[2]);
    if (qty >= n && zhe > 0 && zhe < 10) {
      return unit * qty * (zhe / 10);
    }
  }

  m = text.match(/買\s*(\d+)\s*件(?:或以上)?(?:享)?\s*(\d+(?:\.\d+)?)\s*%\s*折扣/);
  if (m) {
    const n = Number(m[1]);
    const pct = Number(m[2]);
    if (qty >= n) return unit * qty * (1 - pct / 100);
  }

  m = text.match(/^(\d+(?:\.\d+)?)\s*折/);
  if (m) {
    const zhe = Number(m[1]);
    if (zhe > 0 && zhe < 10) return unit * qty * (zhe / 10);
  }

  m = text.match(/(\d+(?:\.\d+)?)\s*%\s*off/i);
  if (m) {
    const pct = Number(m[1]);
    if (pct > 0 && pct < 100) return unit * qty * (1 - pct / 100);
  }

  return null;
}

export function shortOffer(offer: string | null | undefined): string {
  if (!offer) return "";
  const text = offer.split(/\s*\/\s*/)[0]?.replace(/\s+/g, " ").trim() ?? "";
  if (text.length <= 56) return text;
  return `${text.slice(0, 55)}…`;
}

export function nextDealQty(
  unitPrice: number,
  qty: number,
  offer: string | null | undefined,
): number | null {
  if (!offer) return null;
  if (quoteOffer(unitPrice, qty, offer).applied) return null;
  for (const n of [2, 3, 4, 6, 8, 12]) {
    if (n <= qty) continue;
    const next = quoteOffer(unitPrice, n, offer);
    if (next.applied && next.total + 0.05 < unitPrice * n) return n;
  }
  return null;
}

export type DealPreview = {
  qty: number;
  total: number;
  unitEffective: number;
  saveVsShelf: number;
  offer: string;
};

export function dealPreview(
  unitPrice: number,
  qty: number,
  offer: string | null | undefined,
): DealPreview | null {
  const n = nextDealQty(unitPrice, qty, offer);
  if (!n) return null;
  const next = quoteOffer(unitPrice, n, offer);
  if (!next.applied) return null;
  return {
    qty: n,
    total: next.total,
    unitEffective: roundMoney(next.total / n),
    saveVsShelf: roundMoney(unitPrice * n - next.total),
    offer: shortOffer(offer),
  };
}

export function unusedOfferHint(
  unitPrice: number,
  qty: number,
  offer: string | null | undefined,
): string | null {
  if (!offer) return null;
  const current = quoteOffer(unitPrice, qty, offer);
  if (current.applied) return null;
  const preview = dealPreview(unitPrice, qty, offer);
  if (preview) {
    return `買多D慳多D：買${preview.qty}件 $${preview.total.toFixed(1)}（每件 $${preview.unitEffective.toFixed(1)}）`;
  }
  return `未計入：${shortOffer(offer)}`;
}

export type ProductDealRates = {
  packPrice: number;
  rate: UnitRate | null;
  deal: { qty: number; packPrice: number; rate: UnitRate | null } | null;
};

export function productDealRates(product: ProductView, qty: number): ProductDealRates | null {
  if (product.prices.length === 0 || qty < 1) return null;
  let bestTotal = Number.POSITIVE_INFINITY;
  let deal: { qty: number; total: number } | null = null;
  for (const price of product.prices) {
    const quoted = quoteOffer(price.unitPrice, qty, price.offer);
    if (quoted.total < bestTotal) bestTotal = quoted.total;
    const preview = dealPreview(price.unitPrice, qty, price.offer);
    if (preview && (deal == null || preview.total < deal.total)) {
      deal = { qty: preview.qty, total: preview.total };
    }
  }
  if (!Number.isFinite(bestTotal)) return null;
  const rate = unitRateFor(product, bestTotal, qty);
  const dealRate = deal ? unitRateFor(product, deal.total, deal.qty) : null;
  const worthShowing =
    deal &&
    dealRate &&
    rate &&
    dealRate.per + 0.05 < rate.per;
  return {
    packPrice: roundMoney(bestTotal / qty),
    rate,
    deal: worthShowing && deal
      ? { qty: deal.qty, packPrice: roundMoney(deal.total / deal.qty), rate: dealRate }
      : null,
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 10) / 10;
}
