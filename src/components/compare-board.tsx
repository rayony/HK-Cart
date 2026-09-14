import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  LoaderCircle,
  MapPin,
  Plus,
  Search,
  Store,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ManualCopyDialog } from "@/components/copy-fallback";
import { copyToClipboard } from "@/lib/copy";
import { buildCompare, formatCompareCopy, bestUnusedDeal, mixedStrategyHint, splitStrategyCopy, type CompareResult } from "@/lib/opw/compare";
import {
  cheapestPackProduct,
  cheapestUnitProduct,
  formatUnitRate,
  pickReasonLabel,
  productPack,
  sameFamily,
  shelfPrice,
  sortByShelfPrice,
  unitRate,
  unitRateFor,
  valueHint,
} from "@/lib/opw/pack";
import { dealPreview, productDealRates, unusedOfferHint } from "@/lib/opw/offers";
import { makeCustomProduct, parseMoney } from "@/lib/opw/custom";
import { STORE_ORDER, STORES, storeName } from "@/lib/opw/stores";
import type { MatchedLine, PickReason, ProductView, StoreId } from "@/lib/opw/types";
import { cn, formatHkd } from "@/lib/utils";
import { openGoogleSearch } from "@/lib/opw/external";

type Props = {
  items: MatchedLine[];
  picks: Record<string, string | null>;
  qty: Record<string, number>;
  skipped: Record<string, boolean>;
  enabledStores: StoreId[];
  refiningId: string | null;
  onPick: (id: string, code: string | null) => void;
  onQty: (id: string, qty: number) => void;
  onSkip: (id: string, skip: boolean) => void;
  onUnpick: (id: string) => void;
  onRefine: (id: string, query: string) => Promise<void>;
  onSearchMore: (id: string, query: string, round: number) => Promise<void>;
  onAddCustom: (id: string, product: ProductView) => void;
};

export function CompareBoard({
  items,
  picks,
  qty,
  skipped,
  enabledStores,
  refiningId,
  onPick,
  onQty,
  onSkip,
  onUnpick,
  onRefine,
  onSearchMore,
  onAddCustom,
}: Props) {
  const picked = useMemo(() => {
    const rows = [];
    for (const item of items) {
      if (skipped[item.id]) continue;
      const code = picks[item.id];
      const product =
        item.candidates.find((c) => c.code === code) ??
        (item.match?.code === code ? item.match : null);
      const count = qty[item.id] ?? item.qty;
      if (product) rows.push({ id: item.id, query: item.query, qty: count, product });
    }
    return rows;
  }, [items, picks, qty, skipped]);

  const result = useMemo(
    () => (picked.length ? buildCompare(picked, enabledStores) : null),
    [picked, enabledStores],
  );

  const pending = items.filter((item) => !picks[item.id] && !skipped[item.id]);
  const skippedItems = items.filter((item) => skipped[item.id]);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);

  async function copyResults() {
    if (!result) {
      toast.error("未有可複製嘅格價結果");
      return;
    }
    const blob = formatCompareCopy(result, {
      pending: pending.map((item) => item.query),
      skipped: skippedItems.map((item) => item.query),
    });
    const ok = await copyToClipboard(blob);
    if (ok) {
      toast.success("已複製完整格價結果");
      return;
    }
    setCopyFallback(blob);
    toast.message("瀏覽器唔俾自動複製，可以喺彈出框手動複製");
  }

  return (
    <div className="flex flex-col gap-5">
      {result ? (
        <div className="flex flex-col gap-3">
          <Summary result={result} onApplyQty={onQty} />
          <Button variant="outline" className="h-11 w-full sm:w-auto sm:self-start" onClick={() => void copyResults()}>
            <Copy className="size-4" />
            複製清單
          </Button>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <section className="rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-display text-lg font-semibold">確認一下呢幾件</h3>
            <span className="text-xs text-faint">{pending.length} 件</span>
          </div>
          <p className="mt-1 text-sm text-muted">
            唔肯定就喺消委會貨表揀。搵唔到會自動再搜 HKTVmall／惠康／Price.com.hk。
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {pending.map((item) => (
              <RefineItem
                key={item.id}
                item={item}
                qty={qty[item.id] ?? item.qty}
                autoFocus={refiningId === item.id}
                onPick={(code) => onPick(item.id, code)}
                onQty={(n) => onQty(item.id, n)}
                onSkip={() => onSkip(item.id, true)}
                onRefine={(query) => onRefine(item.id, query)}
                onSearchMore={(query) => onSearchMore(item.id, query, (item.moreRound ?? 0) + 1)}
                onAddCustom={(product) => onAddCustom(item.id, product)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {skippedItems.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>已跳過</span>
          {skippedItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSkip(item.id, false)}
              className="h-11 rounded-full border border-line bg-surface px-3 hover:bg-surface-2"
            >
              {item.query}
              <span className="ml-2 text-xs text-accent">還原</span>
            </button>
          ))}
        </div>
      ) : null}

      {result ? (
        <Tabs defaultValue="items">
          <TabsList>
            <TabsTrigger value="items">逐件最平</TabsTrigger>
            <TabsTrigger value="stores">按超市</TabsTrigger>
            <TabsTrigger value="split">分店買</TabsTrigger>
          </TabsList>
          <TabsContent value="items">
            <div className="flex flex-col gap-3">
              {result.items.map((item, index) => (
                <ItemCard
                  key={item.id}
                  plan={item}
                  line={items.find((i) => i.id === item.id)}
                  candidates={items.find((i) => i.id === item.id)?.candidates ?? []}
                  qty={qty[item.id] ?? item.qty}
                  onQty={(n) => onQty(item.id, n)}
                  onPick={(code) => onPick(item.id, code)}
                  onUnpick={() => onUnpick(item.id)}
                  delay={index}
                />
              ))}
            </div>
          </TabsContent>
          <TabsContent value="stores">
            <StoreTable result={result} />
          </TabsContent>
          <TabsContent value="split">
            <SplitPanel result={result} />
          </TabsContent>
        </Tabs>
      ) : pending.length === 0 && skippedItems.length > 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface/70 p-6 text-sm text-muted">
          清單入面嘅貨都跳過咗。還原一件，或者改左邊再格價。
        </p>
      ) : null}
      {copyFallback ? (
        <ManualCopyDialog text={copyFallback} onClose={() => setCopyFallback(null)} />
      ) : null}
    </div>
  );
}

function Summary({
  result,
  onApplyQty,
}: {
  result: CompareResult;
  onApplyQty: (id: string, qty: number) => void;
}) {
  const splitCopy = splitStrategyCopy(result);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="一間買晒"
          value={result.cheapestComplete ? formatHkd(result.cheapestComplete.total) : "冇一間齊貨"}
          hint={
            result.cheapestComplete
              ? result.cheapestComplete.storeLabel
              : result.cheapestAny
                ? `最多貨：${result.cheapestAny.storeLabel} ${result.cheapestAny.found} 件`
                : "試下放寬超市篩選"
          }
          featured
        />
        <StatCard
          label="逐件揀最平"
          value={formatHkd(result.mixed.total)}
          hint={mixedStrategyHint(result)}
        />
        <StatCard
          label="分兩間買"
          value={splitCopy.value}
          hint={splitCopy.hint}
        />
      </div>
      {result.tips.length > 0 ? <DealTips tips={result.tips} onApplyQty={onApplyQty} /> : null}
    </div>
  );
}

function DealTips({
  tips,
  onApplyQty,
}: {
  tips: CompareResult["tips"];
  onApplyQty: (id: string, qty: number) => void;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
      <h3 className="font-medium">你可能想知 · 買多D慳多D</h3>
      <p className="mt-1 text-xs text-faint">件數加到用得優惠之後，最平舖可能會轉。</p>
      <ul className="mt-3 flex flex-col gap-3">
        {tips.map((tip) => (
          <li key={tip.id} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug">{tip.name}</p>
              <p className="mt-1 text-sm text-muted">
                {tip.offer} · 買{tip.dealQty}件 {tip.toLabel} {formatHkd(tip.dealTotal)}
                （每件 {formatHkd(tip.unitEffective)}
                {tip.toRate ? ` · ${formatUnitRate(tip.toRate)}` : ""}）
                {tip.saveVsShelf > 0.05 ? `，慳 ${formatHkd(tip.saveVsShelf)}` : ""}
              </p>
              {tip.fromRate && tip.toRate && tip.toRate.per + 0.05 < tip.fromRate.per ? (
                <p className="mt-1 text-sm text-accent">
                  每{tip.toRate.base}由 {formatUnitRate(tip.fromRate)} 降至 {formatUnitRate(tip.toRate)}
                </p>
              ) : null}
              {tip.shopChanges ? (
                <p className="mt-1 text-sm text-accent">
                  最平舖由 {tip.fromLabel} 改去 {tip.toLabel}
                  {tip.saveVsStay > 0.05
                    ? `，相對原舖買${tip.dealQty}件再慳 ${formatHkd(tip.saveVsStay)}`
                    : ""}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">仍然係 {tip.toLabel} 最平</p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => onApplyQty(tip.id, tip.dealQty)}
            >
              加到 ×{tip.dealQty}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatCard({
  label,
  value,
  hint,
  featured,
}: {
  label: string;
  value: string;
  hint: string;
  featured?: boolean;
}) {
  return (
    <article
      className={cn(
        "rounded-xl border p-4 shadow-[var(--shadow-card)]",
        featured ? "border-accent/30 bg-accent text-accent-fg" : "border-line bg-surface",
      )}
    >
      <p className={cn("text-xs font-medium tracking-wide", featured ? "text-accent-fg/80" : "text-muted")}>
        {label}
      </p>
      <p className="mt-2 font-display text-2xl font-semibold tabular leading-tight">{value}</p>
      <p className={cn("mt-1 text-sm", featured ? "text-accent-fg/80" : "text-muted")}>{hint}</p>
    </article>
  );
}

function RefineItem({
  item,
  qty,
  autoFocus,
  onPick,
  onQty,
  onSkip,
  onRefine,
  onSearchMore,
  onAddCustom,
}: {
  item: MatchedLine;
  qty: number;
  autoFocus: boolean;
  onPick: (code: string) => void;
  onQty: (n: number) => void;
  onSkip: () => void;
  onRefine: (query: string) => Promise<void>;
  onSearchMore: (query: string) => Promise<void>;
  onAddCustom: (product: ProductView) => void;
}) {
  const [query, setQuery] = useState(item.query);
  const [searching, setSearching] = useState(false);
  const [searchingMore, setSearchingMore] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const catalog = item.candidates.filter((c) => !c.source || c.source === "opw");
  const extraGroups = [
    { key: "hktv" as const, label: "HKTVmall 即時搜尋", items: item.candidates.filter((c) => c.source === "hktv") },
    { key: "wellcome" as const, label: "惠康網上", items: item.candidates.filter((c) => c.source === "wellcome") },
    { key: "pricehk" as const, label: "Price.com.hk", items: item.candidates.filter((c) => c.source === "pricehk") },
    {
      key: "marketplace" as const,
      label: "Market Place",
      items: item.candidates.filter((c) => c.source === "marketplace"),
    },
  ];
  const extraProducts = sortByShelfPrice(extraGroups.flatMap((group) => group.items));
  const extraCount = extraProducts.length;
  const visibleEmptyGroups = extraGroups.filter((group) => {
    if (group.items.length > 0) return false;
    if (!item.moreSearched) return false;
    if (group.key === "pricehk") return true;
    return (item.moreSources ?? []).some((s) => s.id === group.key);
  });
  const exhausted = (item.moreRound ?? 0) >= 2;
  const autoMore = useRef(false);

  useEffect(() => {
    autoMore.current = false;
  }, [item.id, item.query]);

  useEffect(() => {
    setQuery(item.query);
  }, [item.query]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  async function search() {
    const next = query.trim();
    if (!next) return;
    setSearching(true);
    try {
      await onRefine(next);
    } finally {
      setSearching(false);
    }
  }

  async function searchMore() {
    const next = query.trim() || item.query;
    if (!next) return;
    setSearchingMore(true);
    try {
      await onSearchMore(next);
    } finally {
      setSearchingMore(false);
    }
  }

  useEffect(() => {
    if (autoMore.current) return;
    if (catalog.length > 0 || item.moreSearched || searchingMore) return;
    autoMore.current = true;
    void searchMore();
  }, [catalog.length, item.moreSearched, searchingMore, item.id, item.query]);

  return (
    <li className="rounded-lg border border-line bg-bg p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs text-faint">原本：{item.query}</p>
        <QtyStepper value={qty} onChange={onQty} />
      </div>

      <form
        className="mt-2 flex min-w-0 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="改品牌、型號、容量再搵"
          aria-label={`${item.query} 搜尋關鍵字`}
          className="min-w-0 flex-1 bg-surface"
        />
        <Button type="submit" variant="invert" className="shrink-0" disabled={searching || !query.trim()}>
          {searching ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
          再搵
        </Button>
      </form>

      {catalog.length > 0 ? (
        <>
          <p className="mt-3 text-xs text-faint">消委會貨表 — 由平至貴</p>
          <CandidateList products={sortByShelfPrice(catalog)} onPick={onPick} />
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">
          {searchingMore ? "消委會冇呢件，而家幫你搜 HKTVmall／惠康／Price.com.hk…" : "消委會超市格價冇呢件。可以搜其他來源。"}
        </p>
      )}

      {extraProducts.length > 0 ? (
        <>
          <p className="mt-3 text-xs text-faint">其他來源 — 由平至貴</p>
          <CandidateList products={extraProducts} onPick={onPick} />
        </>
      ) : null}

      {visibleEmptyGroups.map((group) => {
        const hit = (item.moreSources ?? []).find((s) => s.id === group.key);
        return (
          <div key={group.key}>
            <p className="mt-3 text-xs text-faint">{group.label}</p>
            <SourceEmpty
              label={group.label}
              url={hit?.url ?? sourceFallbackUrl(group.key, query.trim() || item.query, item.external)}
              blocked={hit?.blocked}
              query={query.trim() || item.query}
            />
          </div>
        );
      })}

      {item.moreSearched && extraCount === 0 ? (
        <p className="mt-3 text-sm text-muted">
          網上舖都搵唔到接近嘅貨。用 Price.com.hk／百佳／Google 再睇。
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {exhausted ? null : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void searchMore()}
            disabled={searchingMore}
          >
            {searchingMore ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
            {searchingMore
              ? "搜緊其他來源…"
              : item.moreRound && item.moreRound >= 1
                ? extraCount === 0
                  ? "仍然冇？再搜多啲"
                  : "要唔要再搜多啲？"
                : "仍然搵唔到？搜多啲來源"}
          </Button>
        )}
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex h-11 items-center text-sm text-muted hover:text-ink"
        >
          跳過呢件
        </button>
        <GoogleButton query={query.trim() || item.query} name={`google-${item.id}`} />
      </div>

      {exhausted ? (
        <p className="mt-3 rounded-lg border border-line bg-surface px-3 py-3 text-sm text-muted">
          已經搜晒而家接得到嘅來源（HKTVmall、惠康、Market Place、Price.com.hk）。冇再多自動來源，可以自己填價錢，或者開百佳／Google。
        </p>
      ) : null}

      <ManualQuote
        query={query.trim() || item.query}
        url={item.external.priceHkUrl}
        onAdd={onAddCustom}
      />

      <div className="mt-1 flex flex-wrap items-center gap-x-3">
        <Outbound href={item.external.opwSearchUrl}>格價資訊通</Outbound>
        <Outbound href={item.external.priceHkUrl}>Price.com.hk</Outbound>
        {item.moreSearched ? (
          <>
            <Outbound href={item.external.pnsSearchUrl}>百佳</Outbound>
            <Outbound href={item.external.wellcomeSearchUrl}>惠康</Outbound>
            <Outbound href={item.external.marketplaceSearchUrl}>Market Place</Outbound>
            <Outbound href={item.external.hktvSearchUrl}>HKTVmall</Outbound>
            <Outbound href={item.external.googleSearchUrl}>Google</Outbound>
          </>
        ) : null}
      </div>
    </li>
  );
}

function sourceBadge(source: NonNullable<ProductView["source"]>): string {
  if (source === "hktv") return "HKTVmall";
  if (source === "wellcome") return "惠康";
  if (source === "marketplace") return "Market Place";
  if (source === "pricehk") return "Price.com.hk";
  if (source === "custom") return "自己填";
  return "消委會";
}

function sourceFallbackUrl(
  key: "hktv" | "wellcome" | "marketplace" | "pricehk",
  query: string,
  links: MatchedLine["external"],
): string {
  if (key === "hktv") return links.hktvSearchUrl;
  if (key === "wellcome") return links.wellcomeSearchUrl;
  if (key === "marketplace") return links.marketplaceSearchUrl;
  return links.priceHkUrl;
}

function SourceEmpty({
  label,
  url,
  blocked,
  query,
}: {
  label: string;
  url: string;
  blocked?: boolean;
  query: string;
}) {
  return (
    <div className="mt-1 rounded-lg border border-dashed border-line bg-surface px-3 py-3">
      <p className="text-sm text-muted">
        {blocked ? "網站擋咗自動抽價，入去睇有冇平啲。" : "呢度冇接近結果。"}
      </p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-flex h-11 items-center gap-1 text-sm text-ink hover:text-accent"
      >
        去 {label} 搜「{query}」
        <ArrowUpRight className="size-3.5" />
      </a>
    </div>
  );
}

function BestStamp() {
  return (
    <span
      aria-hidden
      className="grid h-8 min-w-8 shrink-0 place-items-center rounded-sm border-2 border-accent px-1 font-display text-[11px] font-semibold leading-none text-accent"
    >
      最抵
    </span>
  );
}

const MANUAL_STORES: StoreId[] = [...STORE_ORDER, "HKTV", "PRICEHK", "OTHER"];

function ManualQuote({
  query,
  url,
  onAdd,
}: {
  query: string;
  url: string;
  onAdd: (product: ProductView) => void;
}) {
  const [name, setName] = useState(query);
  const [price, setPrice] = useState("");
  const [store, setStore] = useState<StoreId>("PRICEHK");
  const [shop, setShop] = useState("");
  const [link, setLink] = useState("");

  useEffect(() => {
    setName(query);
  }, [query]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const unitPrice = parseMoney(price);
    const label = name.trim() || query;
    if (!label) return;
    if (unitPrice == null) {
      toast.error("填個有效價錢，例如 12.9");
      return;
    }
    if (store === "OTHER" && !shop.trim()) {
      toast.error("填下舖名，例如 759 阿信屋");
      return;
    }
    onAdd(
      makeCustomProduct({
        name: label,
        price: unitPrice,
        store,
        shop: store === "OTHER" ? shop : undefined,
        url: link.trim() || url,
        query,
      }),
    );
    toast.success("已加入清單，可以繼續格其餘貨");
    setPrice("");
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-lg border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">搵到？填返入嚟繼續格</p>
          <p className="mt-1 text-xs text-faint">
            Price.com／百佳見到嘅價，填貨名、價錢、實際買嘅舖。清單冇嘅舖可以揀「其他」再寫名。
          </p>
        </div>
        <BestStamp />
      </div>
      <label className="mt-3 block">
        <span className="sr-only">貨名</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="貨名" />
      </label>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-2">
        <label className="relative block">
          <span className="sr-only">價錢</span>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 grid w-8 place-items-center text-sm font-medium text-muted"
          >
            $
          </span>
          <Input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="12.9"
            aria-label="價錢"
            className="pl-8"
          />
        </label>
        <label>
          <span className="sr-only">邊度買</span>
          <select
            value={store}
            onChange={(e) => setStore(e.target.value as StoreId)}
            aria-label="邊度買"
            className="flex h-11 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {MANUAL_STORES.map((id) => (
              <option key={id} value={id}>
                {id === "OTHER" ? "其他／自訂舖" : STORES[id].name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {store === "OTHER" ? (
        <label className="mt-2 block">
          <span className="sr-only">自訂舖名</span>
          <Input
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            placeholder="舖名，例如 759、Donki、友和"
          />
        </label>
      ) : null}
      <label className="mt-2 block">
        <span className="sr-only">連結（可留空）</span>
        <Input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="貨品連結（可留空）"
        />
      </label>
      <Button type="submit" className="mt-3 h-11 w-full" disabled={!parseMoney(price) || (store === "OTHER" && !shop.trim())}>
        <Plus className="size-4" />
        加入清單
      </Button>
    </form>
  );
}

function GoogleButton({ query, name }: { query: string; name: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => openGoogleSearch(query, name)}
    >
      Google
      <ArrowUpRight className="size-3.5" />
    </Button>
  );
}

function Outbound({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-11 items-center text-sm text-muted hover:text-ink"
    >
      {children}
      <ArrowUpRight className="ml-1 size-3.5" />
    </a>
  );
}

function CandidateList({
  products,
  onPick,
}: {
  products: ProductView[];
  onPick: (code: string) => void;
}) {
  const sorted = sortByShelfPrice(products);
  const bestUnit = cheapestUnitProduct(sorted);
  const bestPack = cheapestPackProduct(sorted);
  const cheapestCode =
    sorted[0] && Number.isFinite(shelfPrice(sorted[0])) ? sorted[0].code : null;
  return (
    <ul className="mt-3 divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
      {sorted.map((c) => {
        const cheapest = shelfPrice(c);
        const cheapestStore = c.prices.find((p) => p.unitPrice === cheapest);
        const rate = unitRate(c);
        const pack = productPack(c);
        const isCheapest = cheapestCode === c.code;
        return (
          <li key={c.code}>
            <button
              type="button"
              onClick={() => onPick(c.code)}
              className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-surface-2"
            >
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-line" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-snug">
                  {c.brand} {c.name}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  {c.source && c.source !== "opw" ? (
                    <Badge variant="outline">{sourceBadge(c.source)}</Badge>
                  ) : null}
                  {pack.label ? <span>{pack.label}</span> : null}
                  <span>
                    {c.source && c.source !== "opw" ? "網上價" : `${c.prices.length} 間舖`}
                  </span>
                  {bestUnit?.code === c.code ? (
                    <Badge variant="good">每{rate?.base ?? "單位"}最抵</Badge>
                  ) : null}
                  {bestPack?.code === c.code && bestPack.code !== bestUnit?.code ? (
                    <Badge variant="outline">件價最平</Badge>
                  ) : null}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="flex items-center justify-end gap-1.5">
                  {isCheapest ? <BestStamp /> : null}
                  <span className="font-medium tabular">{formatHkd(cheapest)}</span>
                </span>
                <span className="text-xs text-muted">
                  {rate
                    ? formatUnitRate(rate)
                    : cheapestStore
                      ? storeName(cheapestStore.store, cheapestStore.shop)
                      : "起"}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ItemCard({
  plan,
  line,
  candidates,
  qty,
  onQty,
  onPick,
  onUnpick,
  delay,
}: {
  plan: CompareResult["items"][number];
  line?: MatchedLine;
  candidates: ProductView[];
  qty: number;
  onQty: (n: number) => void;
  onPick: (code: string) => void;
  onUnpick: () => void;
  delay: number;
}) {
  const [open, setOpen] = useState(false);
  const max = plan.quotes.reduce((m, q) => Math.max(m, q.total), 0);
  const p = plan.product;
  const family = candidates.filter((c) => sameFamily(c, p));
  const others = candidates.filter((c) => !sameFamily(c, p));
  const pack = productPack(p);
  const rate = unitRate(p);
  const userChanged = Boolean(line && line.match && line.match.code !== p.code);
  const reason: PickReason | "user" | null = userChanged ? "user" : (line?.pickReason ?? null);
  const reasonText = pickReasonLabel(reason, pack.label || p.name, rate?.base ?? null);
  const extra = valueHint(p, family.length > 1 ? family : candidates);
  const tip = bestUnusedDeal(plan);
  const stayAtDeal = tip && plan.cheapest
    ? plan.cheapest.unitPrice * tip.dealQty
    : null;
  const productLinkLabel =
    p.source === "hktv"
      ? "HKTVmall 貨品頁"
      : p.source === "wellcome"
        ? "惠康貨品頁"
        : p.source === "marketplace"
          ? "Market Place 貨品頁"
          : p.source === "pricehk"
            ? "Price.com.hk 貨品頁"
            : p.source === "custom"
              ? "參考連結"
              : "消委會貨品頁";
  return (
    <article
      className="rise-in rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]"
      style={{ animationDelay: `${delay * 40}ms` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-faint">{plan.query}</p>
          <h3 className="mt-0.5 font-medium leading-snug">
            {p.brand} {p.name}
          </h3>
          {reasonText ? (
            <p className="mt-1 text-sm text-muted">{reasonText}</p>
          ) : (
            <p className="mt-1 text-xs text-muted">{p.category}</p>
          )}
          {extra ? <p className="mt-1 text-sm text-muted">{extra}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <QtyStepper value={qty} onChange={onQty} />
          {plan.cheapest ? (
            <Badge variant="accent" className="tabular">
              {plan.cheapest.storeLabel} {formatHkd(plan.cheapest.total)}
            </Badge>
          ) : (
            <Badge variant="warn">篩選後冇價</Badge>
          )}
        </div>
      </div>

      {family.length > 1 ? (
        <SizeChips products={family} selected={p.code} qty={qty} onPick={onPick} />
      ) : null}

      {tip ? (
        <div className="mt-3 rounded-lg border border-accent/25 bg-surface-2 px-3 py-3">
          <p className="text-sm font-medium text-ink">買多D慳多D</p>
          <p className="mt-1 text-sm text-muted">
            {tip.toLabel}買{tip.dealQty}件 {formatHkd(tip.dealTotal)}（每件 {formatHkd(tip.unitEffective)}
            {tip.toRate ? ` · ${formatUnitRate(tip.toRate)}` : ""}）
            {tip.saveVsShelf > 0.05 ? `，慳 ${formatHkd(tip.saveVsShelf)}` : ""}
            {tip.shopChanges
              ? `。最平舖由 ${tip.fromLabel} 改去 ${tip.toLabel}`
              : `。仍然係 ${tip.toLabel} 最平`}
          </p>
          {tip.fromRate && tip.toRate && tip.toRate.per + 0.05 < tip.fromRate.per ? (
            <p className="mt-1 text-sm text-accent">
              每{tip.toRate.base}由 {formatUnitRate(tip.fromRate)} 降至 {formatUnitRate(tip.toRate)}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => onQty(tip.dealQty)}
          >
            加到 ×{tip.dealQty}
          </Button>
        </div>
      ) : null}

      <ul className="mt-4 flex flex-col gap-2">
        {plan.quotes.map((quote) => {
          const cheapest = plan.cheapest?.store === quote.store;
          const width = max > 0 ? Math.max(8, (quote.total / max) * 100) : 8;
          const preview = dealPreview(quote.unitPrice, plan.qty, quote.offer);
          const previewRate = preview ? unitRateFor(p, preview.total, preview.qty) : null;
          const appliedRate = quote.applied ? unitRateFor(p, quote.total, plan.qty) : null;
          const beatsCurrent =
            preview != null &&
            stayAtDeal != null &&
            preview.total + 0.05 < stayAtDeal;
          const isBestDeal = Boolean(tip && preview && quote.store === tip.toStore);
          return (
            <li key={quote.store}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className={cn(cheapest ? "font-medium text-accent" : "text-muted")}>
                  {quote.storeLabel}
                </span>
                <span className="tabular text-ink">
                  {formatHkd(quote.total)}
                  {quote.applied ? <span className="ml-2 text-xs text-good">計埋優惠</span> : null}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={cn("h-full rounded-full", cheapest ? "bg-accent" : "bg-ink/25")}
                  style={{ width: `${width}%` }}
                />
              </div>
              {quote.applied && quote.offer ? (
                <p className="mt-1 text-xs text-good">
                  已計：{quote.offer}
                  {appliedRate ? ` · ${formatUnitRate(appliedRate)}` : ""}
                </p>
              ) : preview ? (
                <p className={cn("mt-1 text-xs", isBestDeal || beatsCurrent ? "text-good" : "text-muted")}>
                  {isBestDeal ? "買多D慳多D · " : "買多D · "}
                  買{preview.qty}件 {formatHkd(preview.total)}（每件 {formatHkd(preview.unitEffective)}
                  {previewRate ? ` · ${formatUnitRate(previewRate)}` : ""}
                  ）
                  {isBestDeal && tip?.shopChanges
                    ? ` · 平過而家${tip.fromLabel}買${preview.qty}件`
                    : preview.saveVsShelf > 0.05
                      ? ` · 慳 ${formatHkd(preview.saveVsShelf)}`
                      : ""}
                </p>
              ) : quote.offer ? (
                <p className="mt-1 text-xs text-muted">
                  {unusedOfferHint(quote.unitPrice, plan.qty, quote.offer) ?? quote.offer}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={p.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center gap-1 text-sm text-muted hover:text-ink"
        >
          {productLinkLabel}
          <ArrowUpRight className="size-3.5" />
        </a>
        {others.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            其他口味／型號
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onUnpick}>
          改搜尋
        </Button>
        <GoogleButton query={plan.query} name={`google-${plan.id}`} />
      </div>

      {open ? (
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
          {others.map((c) => {
            const active = c.code === p.code;
            const otherRate = unitRate(c);
            return (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => onPick(c.code)}
                  className="flex w-full items-start gap-2 px-3 py-3 text-left text-sm hover:bg-surface-2"
                >
                  <span className="mt-0.5 size-4 shrink-0 text-accent">
                    {active ? <Check className="size-4" /> : null}
                  </span>
                  <span>
                    <span className="font-medium">
                      {c.brand} {c.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {c.prices.length} 間舖有貨 · 最低 {formatHkd(shelfPrice(c))}
                      {otherRate ? ` · ${formatUnitRate(otherRate)}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
}

function SizeChips({
  products,
  selected,
  qty,
  onPick,
}: {
  products: ProductView[];
  selected: string;
  qty: number;
  onPick: (code: string) => void;
}) {
  const bestUnit = cheapestUnitProduct(products);
  const bestPack = cheapestPackProduct(products);
  const sorted = [...products].sort((a, b) => {
    const pa = productPack(a);
    const pb = productPack(b);
    return (pa.ml ?? pa.g ?? 0) - (pb.ml ?? pb.g ?? 0);
  });
  return (
    <div className="mt-3">
      <p className="text-xs text-muted">換容量</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {sorted.map((product) => {
          const pack = productPack(product);
          const deals = productDealRates(product, qty);
          const rate = deals?.rate ?? unitRate(product);
          const active = product.code === selected;
          const unitBest = bestUnit?.code === product.code;
          const packBest = bestPack?.code === product.code && bestPack.code !== bestUnit?.code;
          return (
            <button
              key={product.code}
              type="button"
              onClick={() => onPick(product.code)}
              className={cn(
                "inline-flex min-h-11 min-w-20 flex-col justify-center rounded-lg border px-3 py-2 text-left",
                active ? "border-ink bg-ink text-accent-fg" : "border-line bg-bg text-ink hover:bg-surface-2",
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium leading-tight">
                {pack.label || product.name}
                {unitBest ? (
                  <span className={cn("text-[10px] font-medium", active ? "text-accent-fg/75" : "text-good")}>
                    最抵
                  </span>
                ) : null}
                {packBest ? (
                  <span className={cn("text-[10px] font-medium", active ? "text-accent-fg/75" : "text-muted")}>
                    最平件
                  </span>
                ) : null}
              </span>
              <span className={cn("mt-0.5 text-xs tabular", active ? "text-accent-fg/75" : "text-muted")}>
                {formatHkd(deals?.packPrice ?? shelfPrice(product))}
                {rate ? ` · ${formatUnitRate(rate)}` : ""}
              </span>
              {deals?.deal?.rate ? (
                <span className={cn("mt-0.5 text-[11px] tabular", active ? "text-accent-fg" : "text-good")}>
                  買{deals.deal.qty}件 {formatUnitRate(deals.deal.rate)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StoreTable({ result }: { result: CompareResult }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
      <ul className="divide-y divide-line">
        {result.stores.map((basket) => (
          <li
            key={basket.store}
            className="flex flex-col gap-1 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="flex items-center gap-2 font-medium">
                <Store className="size-4 text-muted" />
                {basket.storeLabel}
                {basket.complete ? (
                  <Badge variant="good">齊貨</Badge>
                ) : (
                  <Badge variant="outline">缺 {basket.missing.length}</Badge>
                )}
              </p>
              {!basket.complete ? (
                <p className="mt-1 text-xs text-muted">
                  缺：{basket.missing.map((m) => m.name).join("、") || "—"}
                </p>
              ) : basket.offerHits > 0 ? (
                <p className="mt-1 text-xs text-good">{basket.offerHits} 件計埋優惠</p>
              ) : null}
            </div>
            <p className="font-display text-xl font-semibold tabular">
              {basket.found > 0 ? formatHkd(basket.total) : "—"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SplitPanel({ result }: { result: CompareResult }) {
  if (!result.split) {
    const splitCopy = splitStrategyCopy(result);
    return (
      <div className="rounded-xl border border-line bg-surface p-6 text-sm text-muted shadow-[var(--shadow-card)]">
        {splitCopy.value} — {splitCopy.hint}。慳少過 $5 就當唔值得行多一間。
      </div>
    );
  }
  const groups = result.split.stores.map((store) => ({
    store,
    items: result.split!.assignments.filter((a) => a.store === store),
  }));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {groups.map((group) => (
        <section
          key={group.store}
          className="rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]"
        >
          <h3 className="flex items-center gap-2 font-medium">
            <MapPin className="size-4 text-accent" />
            {storeName(group.store)}
          </h3>
          <p className="mt-1 font-display text-xl font-semibold tabular">
            {formatHkd(group.items.reduce((s, i) => s + i.total, 0))}
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {group.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="text-muted">{item.name}</span>
                <span className="tabular">{formatHkd(item.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function QtyStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="inline-flex h-11 items-center rounded-md border border-line bg-bg">
      <button
        type="button"
        className="grid size-11 place-items-center text-lg text-muted"
        onClick={() => onChange(Math.max(1, value - 1))}
        aria-label="減少數量"
      >
        −
      </button>
      <span className="min-w-6 text-center text-sm tabular">{value}</span>
      <button
        type="button"
        className="grid size-11 place-items-center text-lg text-muted"
        onClick={() => onChange(Math.min(99, value + 1))}
        aria-label="增加數量"
      >
        +
      </button>
    </div>
  );
}
