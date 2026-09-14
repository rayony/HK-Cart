import { uid } from "@/lib/utils";
import type { ListLine } from "./types";

const QTY_PREFIX = /^\s*(\d{1,2})\s*[xX×*]\s+(.+)$/;
const QTY_SUFFIX = /^(.+?)\s*[xX×*]\s*(\d{1,2})\s*$/;
const QTY_LEADING = /^\s*(\d{1,2})\s+([^\d].+)$/;
const QTY_TRAILING_PIECE = /^(.+?)\s+(\d{1,2})\s*(件|盒|包|罐|支|瓶|袋)\s*$/;

export function parseShoppingList(text: string): ListLine[] {
  const lines = text
    .split(/[\n,，;；]+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: ListLine[] = [];

  for (const raw of lines) {
    const parsed = parseLine(raw);
    const key = parsed.query.toLowerCase();
    if (seen.has(key)) {
      const existing = out.find((l) => l.query.toLowerCase() === key);
      if (existing) existing.qty += parsed.qty;
      continue;
    }
    seen.add(key);
    out.push({ id: uid(), query: parsed.query, qty: parsed.qty });
  }

  return out.slice(0, 40);
}

function parseLine(raw: string): { query: string; qty: number } {
  // "330毫升 x8" is a pack size in OPW names, not a shopping qty.
  if (/(?:毫升|公斤|克|升|片|盒|包|罐|支|瓶)\s*[xX×*]\s*\d{1,2}\s*$/.test(raw)) {
    return { qty: 1, query: cleanQuery(raw) };
  }

  let m = raw.match(QTY_PREFIX);
  if (m) return { qty: clampQty(Number(m[1])), query: cleanQuery(m[2] ?? raw) };

  m = raw.match(QTY_SUFFIX);
  if (m) return { qty: clampQty(Number(m[2])), query: cleanQuery(m[1] ?? raw) };

  m = raw.match(QTY_TRAILING_PIECE);
  if (m) return { qty: clampQty(Number(m[2])), query: cleanQuery(m[1] ?? raw) };

  m = raw.match(QTY_LEADING);
  if (m) return { qty: clampQty(Number(m[1])), query: cleanQuery(m[2] ?? raw) };

  return { qty: 1, query: cleanQuery(raw) };
}

function cleanQuery(value: string): string {
  return value.replace(/\s+/g, " ").replace(/^[\-–—•]+\s*/, "").trim();
}

function clampQty(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(99, Math.round(n));
}

export function linesToText(lines: ListLine[]): string {
  return lines
    .map((line) => (line.qty > 1 ? `${line.query} x${line.qty}` : line.query))
    .join("\n");
}
