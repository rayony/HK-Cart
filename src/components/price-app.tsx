import { Copy, FileSpreadsheet, History, LoaderCircle, Search, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast, Toaster } from "sonner";
import { CompareBoard } from "@/components/compare-board";
import { ManualCopyDialog } from "@/components/copy-fallback";
import { copyToClipboard } from "@/lib/copy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { externalLinks } from "@/lib/opw/external";
import { getCatalogMeta, matchShoppingList, searchMoreSources, suggestProducts } from "@/lib/opw/functions";
import { parseShoppingList } from "@/lib/opw/parse-list";
import { buildTemplateXlsx, fileToShoppingText } from "@/lib/opw/excel";
import { STORE_ORDER, STORES } from "@/lib/opw/stores";
import { buildCompare, formatCompareCopy } from "@/lib/opw/compare";
import type { CatalogMeta, MatchedLine, StoreId } from "@/lib/opw/types";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "gaakgaai-list-v1";
const LAST_KEY = "gaakgaai-last-v1";

export function PriceApp() {
  const [text, setText] = useState("");
  const [lastText, setLastText] = useState("");
  const [enabled, setEnabled] = useState<StoreId[]>([...STORE_ORDER]);
  const [meta, setMeta] = useState<CatalogMeta | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<MatchedLine[] | null>(null);
  const [picks, setPicks] = useState<Record<string, string | null>>({});
  const [qty, setQty] = useState<Record<string, number>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [refiningId, setRefiningId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { text?: string; enabled?: StoreId[] };
        if (parsed.text) setText(parsed.text);
        if (parsed.enabled?.length) setEnabled(parsed.enabled);
      }
      const last = localStorage.getItem(LAST_KEY);
      if (last) {
        const parsedLast = JSON.parse(last) as { text?: string };
        if (parsedLast.text) setLastText(parsedLast.text);
      }
    } catch {
      /* ignore */
    }
    let cancelled = false;
    let tries = 0;
    const poll = async () => {
      try {
        const next = await getCatalogMeta();
        if (cancelled) return;
        if (next.ready) {
          setMeta(next);
          setCatalogStatus("ready");
          return;
        }
        setCatalogStatus("loading");
        tries += 1;
        if (tries > 40) {
          setCatalogStatus("error");
          setMeta({ count: 0, updatedAt: null, ready: false });
          return;
        }
        window.setTimeout(() => {
          void poll();
        }, 800);
      } catch {
        if (cancelled) return;
        setCatalogStatus("error");
        setMeta({ count: 0, updatedAt: null, ready: false });
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ text, enabled }));
    } catch {
      /* ignore */
    }
  }, [text, enabled]);

  useEffect(() => {
    setConfirmClear(false);
  }, [text]);

  const parsedCount = useMemo(() => parseShoppingList(text).length, [text]);

  const compareStores = useMemo(() => {
    const next = new Set(enabled);
    if (!items) return [...next];
    for (const item of items) {
      const code = picks[item.id];
      if (!code || skipped[item.id]) continue;
      const product =
        item.candidates.find((c) => c.code === code) ??
        (item.match?.code === code ? item.match : null);
      if (product?.prices.some((p) => p.store === "HKTV")) next.add("HKTV");
      if (product?.prices.some((p) => p.store === "PRICEHK")) next.add("PRICEHK");
      if (product?.prices.some((p) => p.store === "OTHER")) next.add("OTHER");
    }
    return [...next];
  }, [enabled, items, picks, skipped]);

  const catalogLoading = catalogStatus === "loading";

  async function compare() {
    const lines = parseShoppingList(text);
    if (lines.length === 0) {
      toast.error("先貼張購物清單");
      return;
    }
    if (catalogLoading) {
      toast.message("消委會貨品庫載入中，請等陣再格價");
      return;
    }
    setLoading(true);
    try {
      const result = await matchShoppingList({ data: { lines, useAi: true } });
      setItems(result.items);
      const nextPicks: Record<string, string | null> = {};
      const nextQty: Record<string, number> = {};
      for (const item of result.items) {
        nextPicks[item.id] = item.match?.code ?? null;
        nextQty[item.id] = item.qty;
      }
      setPicks(nextPicks);
      setQty(nextQty);
      setSkipped({});
      setRefiningId(null);
      try {
        localStorage.setItem(LAST_KEY, JSON.stringify({ text, enabled, at: Date.now() }));
        setLastText(text);
      } catch {
        /* ignore */
      }
      if (result.items.every((i) => !i.match) && result.items.every((i) => i.candidates.length === 0)) {
        toast.message("清單貨品唔喺超市格價範圍，試下 Price.com.hk");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "格價失敗，陣間再試");
    } finally {
      setLoading(false);
    }
  }

  function toggleStore(id: StoreId) {
    setEnabled((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter((s) => s !== id);
      }
      return STORE_ORDER.filter((s) => s === id || prev.includes(s));
    });
  }

  async function refineItem(id: string, query: string) {
    const next = query.trim();
    if (!next) return;
    const current = items?.find((item) => item.id === id);
    const ranked = await suggestProducts({ data: { q: next } });
    if (current && current.query !== next) {
      setText((text) =>
        text.includes(current.query) ? text.replace(current.query, next) : text,
      );
    }
    setItems((prev) => {
      if (!prev) return prev;
      return prev.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          query: next,
          match: null,
          autoSelected: false,
          pickReason: null,
          confidence: ranked[0]?.score ?? 0,
          candidates: ranked.map((row) => row.product),
          moreSearched: false,
          moreRound: 0,
          external: externalLinks(next),
        };
      });
    });
    setPicks((prev) => ({ ...prev, [id]: null }));
  }

  async function searchMoreItem(id: string, query: string, round = 1) {
    const next = query.trim();
    if (!next) return;
    const nextRound = Math.min(2, Math.max(1, round));
    try {
      const result = await searchMoreSources({ data: { q: next, round: nextRound } });
      setItems((prev) => {
        if (!prev) return prev;
        return prev.map((item) => {
          if (item.id !== id) return item;
          const catalog = item.candidates.filter((c) => !c.source || c.source === "opw");
          const seen = new Set(item.candidates.map((c) => c.code));
          const extra = result.products.filter((c) => !seen.has(c.code));
          return {
            ...item,
            query: next,
            moreSearched: true,
            moreRound: result.round,
            moreSources: result.sources,
            candidates: [...catalog, ...item.candidates.filter((c) => c.source && c.source !== "opw"), ...extra],
            external: result.links,
          };
        });
      });
      if (result.products.length === 0 && nextRound <= 1) {
        toast.message("網上舖暫時冇結果，用下面 Price.com.hk／百佳／Google 再睇");
      }
    } catch {
      toast.error("其他來源暫時搜唔到，試下直接開百佳／HKTVmall");
      setItems((prev) => {
        if (!prev) return prev;
        return prev.map((item) =>
          item.id === id
            ? { ...item, moreSearched: true, moreRound: nextRound, external: externalLinks(next) }
            : item,
        );
      });
    }
  }

  async function copySummary() {
    if (!items) return;
    const picked = [];
    const pending: string[] = [];
    const skippedLines: string[] = [];
    for (const item of items) {
      if (skipped[item.id]) {
        skippedLines.push(item.query);
        continue;
      }
      const code = picks[item.id];
      const product =
        item.candidates.find((c) => c.code === code) ??
        (item.match?.code === code ? item.match : null);
      const n = qty[item.id] ?? item.qty;
      if (product) picked.push({ id: item.id, query: item.query, qty: n, product });
      else pending.push(item.query);
    }
    const result = picked.length ? buildCompare(picked, compareStores) : null;
    const blob = result
      ? formatCompareCopy(result, { pending, skipped: skippedLines })
      : ["格價籃", ...pending.map((q) => `${q} — 未揀`), ...skippedLines.map((q) => `${q} — 跳過`)].join("\n");
    const ok = await copyToClipboard(blob);
    if (ok) {
      toast.success("已複製完整格價結果");
      return;
    }
    setCopyFallback(blob);
    toast.message("瀏覽器唔俾自動複製，可以喺彈出框手動複製");
  }

  const canClear = text.trim().length > 0 || items != null;

  function clearAll() {
    if (!canClear) return;
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setText("");
    setItems(null);
    setPicks({});
    setQty({});
    setSkipped({});
    setRefiningId(null);
    setConfirmClear(false);
  }

  async function downloadTemplate() {
    try {
      const blob = await buildTemplateXlsx();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "格價籃清單範本.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("範本下載失敗");
    }
  }

  async function onPickFile(file: File | null) {
    if (!file) return;
    try {
      const next = await fileToShoppingText(file);
      if (!next.trim()) {
        toast.error("檔案入面冇貨品列");
        return;
      }
      setText(next);
      setItems(null);
      setSkipped({});
      setRefiningId(null);
      toast.success(`已讀取 ${parseShoppingList(next).length} 項`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "讀唔到呢個 Excel");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <Toaster
        position="bottom-center"
        theme="light"
        toastOptions={{ className: "font-sans" }}
      />
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-accent">
            HONG KONG PRICE BASKET
          </p>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              格價籃
            </h1>
            <span
              aria-hidden
              className="grid size-10 place-items-center rounded-sm border-2 border-accent font-display text-lg font-semibold text-accent"
            >
              平
            </span>
          </div>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-muted">
            貼張 shopping list——品牌型號定模糊關鍵字都得。用消費者委員會「格價資訊通」對晒超市價，再分組話你知邊度最平。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Badge variant="surface">
            {catalogLoading ? (
              <span className="inline-flex items-center gap-1.5">
                <LoaderCircle className="size-3.5 animate-spin" />
                載入貨品庫
              </span>
            ) : meta?.count ? (
              `${meta.count.toLocaleString("zh-HK")} 件貨`
            ) : (
              "貨品庫未載入"
            )}
          </Badge>
          <Badge variant="outline">每日更新</Badge>
        </div>
      </header>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <section className="rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5 lg:sticky lg:top-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">購物清單</h2>
            <span className="text-xs text-faint">{parsedCount} 項</span>
          </div>
          <p className="mt-1 text-sm text-muted">一行一件。數量可以寫 x2 或者 2 件。亦可以上載 Excel。</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {lastText && lastText !== text ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setText(lastText);
                  setItems(null);
                  setSkipped({});
                  setRefiningId(null);
                }}
              >
                <History className="size-4" />
                載入上次
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={() => void downloadTemplate()}>
              <FileSpreadsheet className="size-4" />
              下載範本
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" />
              上載 Excel
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <label className="mt-4 block">
            <span className="sr-only">購物清單</span>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"金象牌香米 5kg\n可口可樂 330毫升 x8\n黃道益"}
              className="min-h-52 font-sans"
            />
          </label>

          <div className="mt-4">
            <p className="text-xs font-medium text-muted">比較邊幾間</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {STORE_ORDER.map((id) => {
                const on = enabled.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleStore(id)}
                    className={cn(
                      "h-11 rounded-full border px-3 text-sm",
                      on
                        ? "border-ink/20 bg-surface-2 text-ink"
                        : "border-line bg-bg text-faint",
                    )}
                  >
                    {STORES[id].short}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Button
              className="h-16 flex-1 text-base [&_svg]:size-5"
              size="lg"
              onClick={() => void compare()}
              disabled={loading || catalogLoading}
            >
              {loading || catalogLoading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              {catalogLoading ? "載入貨品庫…" : loading ? "對緊價…" : "格價"}
            </Button>
            {items ? (
              <Button variant="outline" size="lg" onClick={copySummary}>
                <Copy className="size-4" />
                複製
              </Button>
            ) : null}
            {canClear ? (
              <Button
                variant={confirmClear ? "invert" : "outline"}
                size="lg"
                onClick={clearAll}
              >
                <Trash2 className="size-4" />
                {confirmClear ? "確定清空？" : "清空"}
              </Button>
            ) : null}
          </div>
          {catalogLoading ? (
            <p className="mt-3 text-sm text-muted">
              消費者委員會貨品庫載入中，載入完先可以格價。
            </p>
          ) : catalogStatus === "error" ? (
            <p className="mt-3 text-sm text-muted">貨品庫載入失敗，仍然可以試下格價。</p>
          ) : null}
        </section>

        <section className="min-w-0">
          {catalogLoading && !items ? (
            <CatalogLoading />
          ) : loading ? (
            <LoadingState />
          ) : items ? (
            <CompareBoard
              items={items}
              picks={picks}
              qty={qty}
              skipped={skipped}
              enabledStores={compareStores}
              refiningId={refiningId}
              onPick={(id, code) => {
                setPicks((prev) => ({ ...prev, [id]: code }));
                setSkipped((prev) => ({ ...prev, [id]: false }));
              }}
              onQty={(id, n) => setQty((prev) => ({ ...prev, [id]: n }))}
              onSkip={(id, skip) => {
                setSkipped((prev) => ({ ...prev, [id]: skip }));
                if (skip) setPicks((prev) => ({ ...prev, [id]: null }));
              }}
              onUnpick={(id) => {
                setPicks((prev) => ({ ...prev, [id]: null }));
                setRefiningId(id);
              }}
              onRefine={refineItem}
              onSearchMore={searchMoreItem}
              onAddCustom={(id, product) => {
                setItems((prev) => {
                  if (!prev) return prev;
                  return prev.map((item) =>
                    item.id === id
                      ? { ...item, candidates: [...item.candidates, product] }
                      : item,
                  );
                });
                setPicks((prev) => ({ ...prev, [id]: product.code }));
                setSkipped((prev) => ({ ...prev, [id]: false }));
              }}
            />
          ) : (
            <EmptyGuide />
          )}
        </section>
      </div>

      <footer className="mt-12 border-t border-line pt-6 text-xs leading-relaxed text-faint">
        價格同優惠來自消費者委員會
        <a
          className="mx-1 text-muted underline decoration-line underline-offset-2 hover:text-ink"
          href="https://online-price-watch.consumer.org.hk/opw/"
          target="_blank"
          rel="noreferrer"
        >
          格價資訊通
        </a>
        開放數據，每日更新，實際以店舖為準。HKTVmall／惠康價錢喺你搜其他來源先即時抽。Price.com.hk 同百佳擋自動抽價，搵到可以自己填返入清單繼續格。
        {meta?.updatedAt ? ` 資料時間：${formatStamp(meta.updatedAt)}。` : null}
      </footer>
      {copyFallback ? (
        <ManualCopyDialog text={copyFallback} onClose={() => setCopyFallback(null)} />
      ) : null}
    </div>
  );
}

function CatalogLoading() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-surface/70 px-6 py-16 text-center">
      <LoaderCircle className="size-6 animate-spin text-accent" />
      <p className="font-medium">載入消委會貨品庫</p>
      <p className="max-w-sm text-sm text-muted">
        第一次要下載格價資訊通資料，大概十秒內。載入完「格價」掣就可以撳。
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <Skeleton className="h-11 rounded-lg" />
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}

function EmptyGuide() {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface/70 p-6 sm:p-8">
      <h2 className="font-display text-2xl font-semibold">點樣睇結果</h2>
      <ol className="mt-5 grid gap-4 sm:grid-cols-3">
        <GuideStep
          n="01"
          title="一間買晒"
          body="邊間超市可以買齊，總價最低。適合懶得行街。"
        />
        <GuideStep
          n="02"
          title="逐件最平"
          body="每件貨各自去最平嗰間。會話你知要行幾間、慳幾多。"
        />
        <GuideStep
          n="03"
          title="分兩間買"
          body="如果行多一間真係平過 $5，會自動分組。慳少過就當唔值得。"
        />
      </ol>
      <p className="mt-6 text-sm text-muted">
        試下左邊示範清單，或者貼你自己嗰張。模糊啲都得，例如「金象米」「黃道益」。冇寫容量就會預設揀每升／每公斤最抵嗰款，你可以喺結果換。
      </p>
    </div>
  );
}

function GuideStep({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="rounded-lg bg-bg p-4">
      <p className="font-display text-sm text-accent">{n}</p>
      <h3 className="mt-1 font-medium">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
    </li>
  );
}

function formatStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-HK", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

