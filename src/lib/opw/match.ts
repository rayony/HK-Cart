import type { PickReason, ProductView } from "./types";
import {
  cheapestUnitProduct,
  packCompatible,
  queryPack,
  sameFamily,
} from "./pack";

export type RankedMatch = {
  product: ProductView;
  score: number;
};

const UNIT_MAP: Array<[RegExp, string]> = [
  [/(\d+(?:\.\d+)?)\s*kgs?\b/gi, "$1公斤"],
  [/(\d+(?:\.\d+)?)\s*g\b/gi, "$1克"],
  [/(\d+(?:\.\d+)?)\s*mls?\b/gi, "$1毫升"],
  [/(\d+(?:\.\d+)?)\s*l\b/gi, "$1升"],
  [/(\d+(?:\.\d+)?)\s*pcs?\b/gi, "$1件"],
];

export function normalizeQuery(input: string): string {
  let s = input.normalize("NFKC");
  for (const [re, repl] of UNIT_MAP) s = s.replace(re, repl);
  s = s.replace(/舊庄/g, "舊裝").replace(/旧庄/g, "旧装");
  s = s.replace(/[()（）[\]【】{}「」『』,，.。!！?？:：;；'"“”‘’]/g, " ");
  s = s.replace(/[-–—_/\\]+/g, " ");
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  return s;
}

export function compact(input: string): string {
  return normalizeQuery(input).replace(/\s+/g, "");
}

function latinTokens(s: string): string[] {
  return s.match(/[a-z0-9]+/g) ?? [];
}

function cjkRuns(s: string): string[] {
  return s.match(/[\u4e00-\u9fff]+/g) ?? [];
}

const SIZE_WORD_RE =
  /\d+(?:\.\d+)?\s*(?:公斤|千克|克|毫升|公升|升|片|件|盒|包|磅|kg|g|ml|l)/gi;
const PACK_WORD_RE = /[x×]\s*\d+/gi;

export function stripSizeTokens(input: string): string {
  return normalizeQuery(input)
    .replace(SIZE_WORD_RE, " ")
    .replace(PACK_WORD_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cjkOnly(s: string): string {
  return (s.match(/[\u4e00-\u9fff]/g) ?? []).join("");
}

function stripUnitWords(s: string): string {
  return s.replace(/公斤|千克|毫升|公升|克|升|片|件|盒|包|磅/g, "");
}

function stripFiller(s: string): string {
  return s.replace(/[牌的之]/g, "");
}

function bigrams(s: string): string[] {
  if (s.length <= 1) return s ? [s] : [];
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function dice(a: string[], b: Set<string>): number {
  if (a.length === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const x of a) if (b.has(x)) hit += 1;
  return (2 * hit) / (a.length + b.size);
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Substring match that will not treat 5公斤 as part of 15公斤, or x8 as part of x12. */
function hasToken(hay: string, token: string): boolean {
  if (!token || !hay) return false;
  if (!/\d/.test(token)) return hay.includes(token);
  return new RegExp(`(^|[^0-9])${escapeRe(token)}(?![0-9])`).test(hay);
}

function orderedSpan(query: string, hay: string): number | null {
  if (!query) return null;
  let i = 0;
  let start = -1;
  let last = -1;
  for (const ch of query) {
    const found = hay.indexOf(ch, i);
    if (found < 0) return null;
    if (start < 0) start = found;
    last = found;
    i = found + 1;
  }
  return last - start + 1;
}

function charCoverage(query: string, hay: string): number {
  if (!query) return 0;
  const set = new Set(hay);
  let hit = 0;
  for (const ch of query) if (set.has(ch)) hit += 1;
  return hit / query.length;
}

export function scoreProduct(query: string, product: ProductView): number {
  const q = normalizeQuery(query);
  if (!q) return 0;

  const qCompact = q.replace(/\s+/g, "");
  const qName = compact(stripSizeTokens(query));
  const name = compact(`${product.brand} ${product.name}`);
  const nameEn = compact(`${product.brandEn} ${product.nameEn}`);
  const cat = compact(product.category);
  const hay = `${name} ${nameEn}`;
  const nameCore = stripFiller(name);
  const qCore = stripFiller(qName || qCompact);
  const brand = compact(product.brand);
  const brandCore = stripFiller(brand);
  const brandEn = compact(product.brandEn);
  const qCjk = stripUnitWords(cjkOnly(qCore));
  const catParts = product.category
    .split("/")
    .map((part) => compact(part))
    .filter(Boolean);

  if (name === qCompact || nameEn === qCompact || nameCore === qCore) return 100;
  if (qName.length >= 2 && (name === qName || nameCore === qCore)) return 96;

  let score = 0;
  let contiguous = false;

  if (qCore.length >= 2 && hasToken(nameCore, qCore)) {
    score += 52 + Math.min(18, qCore.length);
    contiguous = true;
  } else if (qCompact.length >= 2 && hasToken(name, qCompact)) {
    score += 52 + Math.min(18, qCompact.length);
    contiguous = true;
  } else if (qCompact.length >= 2 && hasToken(nameEn, qCompact)) {
    score += 46 + Math.min(14, qCompact.length);
    contiguous = true;
  }

  // "金象米" ⊂ "金象牌頂上茉莉香米"：字齊、順序啱，中間可以隔字。
  if (!contiguous && qCjk.length >= 2) {
    const span = orderedSpan(qCjk, nameCore);
    if (span != null) {
      const compactness = qCjk.length / span;
      if (qCjk.length > 2 || compactness >= 1) {
        score += 24 + compactness * 28;
      }
    } else {
      const coverage = charCoverage(qCjk, nameCore);
      if (coverage >= 0.7) score += coverage * 16;
    }
  }

  if (qCompact.length >= 2 && brandCore.length >= 2 && qCore.startsWith(brandCore)) {
    score += 16;
    const rest = qCore.slice(brandCore.length);
    if (rest) {
      if (hasToken(nameCore, rest) || hasToken(name, rest) || hasToken(cat, rest)) {
        score += 24;
      } else if (orderedSpan(cjkOnly(rest), nameCore) != null) {
        score += 16;
      }
    }
  } else if (
    qCompact.length >= 2 &&
    brand &&
    (hasToken(qCompact, brand) || hasToken(brand, qCompact) || hasToken(qCore, brandCore))
  ) {
    score += 16;
  } else if (qCompact.length >= 3 && brandEn.length >= 3 && qCompact.includes(brandEn)) {
    score += 12;
  } else if (qCjk.length >= 2 && brandCore.length >= 2 && brandCore.startsWith(qCjk.slice(0, 2))) {
    score += 10;
  }

  if (qCjk.length >= 1 && catParts.some((part) => part === qCjk || part === qCore)) {
    score += 20;
  } else if (qCjk.length >= 1 && catParts.some((part) => part.includes(qCjk))) {
    score += qCjk.length === 1 ? 6 : 10;
  }

  if (qCompact.length === 1) {
    if (name.includes(qCompact) || nameCore.includes(qCompact)) score += 12;
    const productName = compact(product.name);
    if (
      productName.endsWith(qCompact) ||
      productName.includes(`香${qCompact}`) ||
      productName.includes(`白${qCompact}`)
    ) {
      score += 6;
    }
  }

  const qBi: string[] = [];
  for (const run of cjkRuns(qName || q)) {
    if (run.length >= 2) qBi.push(...bigrams(stripFiller(run)));
  }
  if (qBi.length === 0 && qCjk.length >= 2) qBi.push(...bigrams(qCjk));
  const nBi = new Set(bigrams(nameCore.length >= 2 ? nameCore : name));
  score += dice(unique(qBi), nBi) * 28;

  const qLatin = latinTokens(qName || q);
  if (qLatin.length) {
    const hayLatin = new Set(latinTokens(hay));
    const hit = qLatin.filter((t) => hayLatin.has(t) || [...hayLatin].some((h) => h.includes(t)));
    score += (hit.length / qLatin.length) * 16;
  }

  const coreHit =
    contiguous ||
    score >= 40 ||
    (qCjk.length >= 2 && (nameCore.includes(qCjk) || catParts.some((part) => part.includes(qCjk))));

  const sizes = q.match(/\d+(?:\.\d+)?(?:公斤|克|毫升|升|片|件|盒|包)/g) ?? [];
  const sizeNums = new Set(
    sizes.map((size) => size.match(/\d+(?:\.\d+)?/)?.[0]).filter((n): n is string => Boolean(n)),
  );
  if (sizes.length) {
    let hit = false;
    for (const size of sizes) {
      if (hasToken(name, size) || hasToken(nameEn, size.replace("毫升", "ml").replace("公斤", "kg"))) {
        score += coreHit ? 14 : 2;
        hit = true;
      }
    }
    if (!hit && coreHit) score -= 8;
  }

  const pack = q.match(/x\s*(\d+)/i);
  if (pack?.[1]) {
    const n = pack[1];
    if (hasToken(name, `x${n}`) || hasToken(name, `x ${n}`) || hasToken(nameEn, `x${n}`)) {
      score += coreHit ? 10 : 2;
    } else if (coreHit) {
      score -= 8;
    }
  }

  const qNums = qCompact.match(/\d+(?:\.\d+)?/g) ?? [];
  for (const n of qNums) {
    if (sizeNums.has(n)) continue;
    if (hasToken(name, n) || hasToken(nameEn, n)) score += 4;
    else if (coreHit) score -= 6;
  }

  const modifiers = ["零系", "zero", "檸檬", "無糖", "diet", "light", "低糖", "有機", "低脂", "全脂", "素食"];
  for (const mod of modifiers) {
    if (hay.includes(mod) && !qCompact.includes(mod) && !qCore.includes(mod)) score -= 8;
  }

  const flavors = ["梳打", "忌廉", "湯力", "薑汁"];
  for (const flavor of flavors) {
    const inQuery = qCompact.includes(flavor) || qCore.includes(flavor);
    const inName = hay.includes(flavor);
    if (inQuery && !inName) score -= 28;
    else if (!inQuery && inName) score -= 14;
  }

  score += typeAdjustment(qCore, hay, catParts);

  if (score >= 40) {
    score += Math.max(0, 8 - Math.log2(Math.max(name.length, 4)));
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Short grocery words are often stems of a different product
 * (米 vs 米粉, 油 vs 蠔油). Longest matching type wins.
 */
const TYPE_GROUPS: Array<{ keys: string[]; extra: string[]; exclude: string[] }> = [
  {
    keys: ["綠茶", "紅茶", "茉莉花茶"],
    extra: ["茶類", "檸檬茶", "蜂蜜綠茶", "蘋果綠茶"],
    exclude: ["洗手", "梘液", "皂液", "沐浴露", "茶包"],
  },
  {
    keys: ["米"],
    extra: ["香米", "白米", "絲苗", "糙米", "珍珠米", "茉莉香"],
    exclude: ["米粉", "米線", "米餅", "米通", "米紙", "粘米粉", "糯米粉", "玉米", "粟米", "薏米", "花生米", "炒米"],
  },
  {
    keys: ["米粉", "米線"],
    extra: ["炒米粉", "河粉", "銀絲米粉"],
    exclude: ["香米", "白米", "粘米粉", "糯米粉", "米餅", "玉米", "粟米"],
  },
  {
    keys: ["粘米粉", "糯米粉"],
    extra: ["水磨"],
    exclude: ["銀絲米粉", "炒米粉", "米線"],
  },
  {
    keys: ["油"],
    extra: ["食油", "花生油", "菜油", "粟米油", "橄欖油", "芥花油", "葵花籽油"],
    exclude: ["醬油", "蠔油", "麻油", "芝麻油", "辣椒油", "活絡油", "藥油", "蝦油"],
  },
  {
    keys: ["奶"],
    extra: ["鮮奶", "牛奶", "純奶"],
    exclude: ["奶粉", "豆奶", "椰奶", "煉奶", "淡奶", "酸奶", "維他奶"],
  },
  {
    keys: ["麵"],
    extra: ["即食麵", "公仔麵", "拉麵", "意粉", "麵條", "幼麵"],
    exclude: ["麵包", "麵粉", "麵豉"],
  },
  {
    keys: ["麵包"],
    extra: ["方包", "吐司"],
    exclude: ["麵粉", "預拌粉", "拉麵", "即食麵"],
  },
  {
    keys: ["糖"],
    extra: ["白砂糖", "冰糖", "蔗糖"],
    exclude: ["糖果", "糖霜", "葡萄糖", "口香糖"],
  },
];

function resolveTypeGroup(qCore: string): (typeof TYPE_GROUPS)[number] | null {
  let best: (typeof TYPE_GROUPS)[number] | null = null;
  let bestLen = 0;
  for (const group of TYPE_GROUPS) {
    for (const key of group.keys) {
      if ((qCore === key || qCore.endsWith(key)) && key.length > bestLen) {
        best = group;
        bestLen = key.length;
      }
    }
    for (const extra of group.extra) {
      if (qCore.includes(extra) && extra.length > bestLen) {
        best = group;
        bestLen = extra.length;
      }
    }
  }
  return best;
}

function typeAdjustment(qCore: string, hay: string, catParts: string[]): number {
  const group = resolveTypeGroup(qCore);
  if (!group) return 0;
  const blob = `${hay}${catParts.join("")}`;
  let adj = 0;
  if (group.exclude.some((token) => blob.includes(token))) adj -= 42;
  if (group.extra.some((token) => blob.includes(token))) adj += 10;
  if (group.keys.some((key) => catParts.some((part) => part === key))) adj += 8;
  return adj;
}

export function rankProducts(
  query: string,
  products: ProductView[],
  limit = 8,
): RankedMatch[] {
  const q = normalizeQuery(query);
  if (!q) return [];

  const minScore = compact(q).length <= 1 ? 22 : 16;
  const ranked: RankedMatch[] = [];
  for (const product of products) {
    const score = scoreProduct(query, product);
    if (score < minScore) continue;
    ranked.push({ product, score });
  }
  ranked.sort((a, b) => b.score - a.score || a.product.name.length - b.product.name.length);
  const named = ranked.filter((row) => hasCoreAffinity(query, row.product));
  return (named.length ? named : ranked).slice(0, limit);
}

function catLeaf(product: ProductView): string {
  const parts = product.category
    .split("/")
    .map((part) => compact(part))
    .filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function sameCatLeaf(a: ProductView, b: ProductView): boolean {
  const leaf = catLeaf(a);
  return leaf.length >= 2 && leaf === catLeaf(b);
}

function hasCoreAffinity(query: string, product: ProductView): boolean {
  const core = compact(stripSizeTokens(query));
  if (core.length < 2) return true;
  const qCjk = stripUnitWords(cjkOnly(stripFiller(core)));
  const name = compact(`${product.brand} ${product.name}`);
  const catParts = product.category
    .split("/")
    .map((part) => compact(part))
    .filter(Boolean);
  if (qCjk.length >= 2) {
    if (name.includes(qCjk) || catParts.some((part) => part === qCjk || part.includes(qCjk))) {
      return true;
    }
    const span = orderedSpan(qCjk, stripFiller(name));
    if (span != null && qCjk.length / span >= 0.5) return true;
  }
  const tokens = stripSizeTokens(query).split(" ").filter((t) => t.length >= 2);
  if (tokens.some((t) => name.includes(compact(t)))) return true;
  return false;
}

export function shouldAutoSelect(ranked: RankedMatch[]): boolean {
  const top = ranked[0];
  if (!top) return false;
  const second = ranked[1];
  if (second && sameFamily(top.product, second.product) && top.score - second.score < 12) {
    return false;
  }
  if (top.score >= 78) return true;
  if (top.score >= 58 && (!second || top.score - second.score >= 8)) return true;
  return false;
}

export function chooseMatch(
  query: string,
  ranked: RankedMatch[],
  catalog?: ProductView[],
): {
  product: ProductView | null;
  auto: boolean;
  reason: PickReason | null;
  family: ProductView[];
} {
  const top = ranked[0];
  if (!top) return { product: null, auto: false, reason: null, family: [] };

  const pool = catalog?.length ? catalog : ranked.map((row) => row.product);
  let family = uniqueProducts(pool.filter((product) => sameFamily(product, top.product)));
  const wanted = queryPack(query);
  const related = uniqueProducts(
    pool.filter(
      (product) =>
        sameFamily(product, top.product) ||
        (sameCatLeaf(product, top.product) && hasCoreAffinity(query, product)),
    ),
  );

  if (wanted) {
    const sizedFamily = family.filter((product) => packCompatible(product, wanted));
    if (sizedFamily.length === 1) {
      return { product: sizedFamily[0] ?? null, auto: true, reason: "query-size", family };
    }
    if (sizedFamily.length > 1) {
      const unitPick = cheapestUnitProduct(sizedFamily);
      return {
        product: unitPick ?? sizedFamily[0] ?? null,
        auto: true,
        reason: "query-size",
        family,
      };
    }
    const sizedCat = related.filter((product) => packCompatible(product, wanted));
    if (sizedCat.length > 0) {
      const unitPick = cheapestUnitProduct(sizedCat);
      return {
        product: unitPick ?? sizedCat[0] ?? null,
        auto: true,
        reason: "query-size",
        family: related,
      };
    }
    family = related.length > family.length ? related : family;
    const unitPick = cheapestUnitProduct(family) ?? family[0] ?? top.product;
    return { product: unitPick, auto: true, reason: "alt-size", family };
  }

  if (family.length > 1) {
    const unitPick = cheapestUnitProduct(family);
    if (unitPick) {
      return { product: unitPick, auto: true, reason: "best-unit", family };
    }
  }

  const auto = shouldAutoSelect(ranked);
  return {
    product: auto ? top.product : null,
    auto,
    reason: auto ? "best-match" : null,
    family,
  };
}

function uniqueProducts(products: ProductView[]): ProductView[] {
  const seen = new Set<string>();
  const out: ProductView[] = [];
  for (const product of products) {
    if (seen.has(product.code)) continue;
    seen.add(product.code);
    out.push(product);
  }
  return out;
}
