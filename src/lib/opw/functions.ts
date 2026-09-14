import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { aiPickMatches } from "./ai-match.server";
import { getCatalog, peekCatalog, warmCatalog } from "./catalog.server";
import { externalLinks } from "./external";
import { chooseMatch, rankProducts } from "./match";
import { searchMoreShops } from "./more-sources.server";
import type { MatchedLine, ProductView } from "./types";

const lineSchema = z.object({
  id: z.string().min(1).max(80),
  query: z.string().min(1).max(200),
  qty: z.number().int().min(1).max(99),
});

export const getCatalogMeta = createServerFn({ method: "GET" }).handler(
  async () => {
    const cached = peekCatalog();
    if (cached) {
      return {
        count: cached.products.length,
        updatedAt: cached.updatedAt,
        ready: true,
      };
    }
    warmCatalog();
    return { count: 0, updatedAt: null, ready: false };
  },
);

export const suggestProducts = createServerFn({ method: "POST" })
  .validator(z.object({ q: z.string().min(1).max(80) }))
  .handler(async ({ data }) => {
    const catalog = await getCatalog();
    return rankProducts(data.q, catalog.products, 10).map((row) => ({
      score: Math.round(row.score),
      product: row.product,
    }));
  });

export const searchMoreSources = createServerFn({ method: "POST" })
  .validator(
    z.object({
      q: z.string().min(1).max(80),
      round: z.number().int().min(1).max(2).optional(),
    }),
  )
  .handler(async ({ data }) => {
    let products: ProductView[] = [];
    let sources: MatchedLine["moreSources"] = [];
    try {
      const result = await searchMoreShops(data.q, data.round ?? 1);
      products = result.products;
      sources = result.sources;
    } catch {
      products = [];
    }
    return {
      products,
      sources,
      round: data.round ?? 1,
      links: externalLinks(data.q),
    };
  });

export const matchShoppingList = createServerFn({ method: "POST" })
  .validator(
    z.object({
      lines: z.array(lineSchema).min(1).max(40),
      useAi: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const catalog = await getCatalog();
    const items: MatchedLine[] = data.lines.map((line) => {
      const ranked = rankProducts(line.query, catalog.products, 12);
      const chosen = chooseMatch(line.query, ranked, catalog.products);
      const candidateMap = new Map<string, ProductView>();
      for (const row of ranked) candidateMap.set(row.product.code, row.product);
      for (const product of chosen.family) candidateMap.set(product.code, product);
      return {
        id: line.id,
        query: line.query,
        qty: line.qty,
        confidence: ranked[0]?.score ?? 0,
        autoSelected: chosen.auto,
        pickReason: chosen.reason,
        match: chosen.product,
        candidates: [...candidateMap.values()],
        moreSearched: false,
        moreRound: 0,
        external: externalLinks(line.query),
      };
    });

    const needsAi = data.useAi !== false && items.some((item) => !item.match);
    if (needsAi) {
      const unresolved = items.filter(
        (item) => !item.match && item.candidates.length > 0 && item.pickReason == null,
      );
      if (unresolved.length > 0) {
        try {
          const picks = await aiPickMatches(
            unresolved.map((item) => ({
              id: item.id,
              query: item.query,
              candidates: item.candidates,
            })),
          );
          const byId = new Map(picks.map((p) => [p.id, p.code]));
          for (const item of items) {
            if (item.match) continue;
            const code = byId.get(item.id);
            if (!code) continue;
            const found = item.candidates.find((c) => c.code === code);
            if (found) {
              item.match = found;
              item.autoSelected = true;
              item.pickReason = "best-match";
              item.confidence = Math.max(item.confidence, 70);
            }
          }
        } catch {
          // Local candidates still shown if the model is slow or unavailable.
        }
      }
    }

    return {
      updatedAt: catalog.updatedAt,
      catalogCount: catalog.products.length,
      items,
    };
  });

export type MatchShoppingListResult = {
  updatedAt: string | null;
  catalogCount: number;
  items: MatchedLine[];
};

export type { ProductView, MatchedLine };
