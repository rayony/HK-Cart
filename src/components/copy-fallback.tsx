import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/copy";
import { toast } from "sonner";

export function ManualCopyDialog({
  text,
  onClose,
}: {
  text: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.focus();
    node.select();
  }, [text]);

  async function retry() {
    const ok = await copyToClipboard(text);
    if (ok) {
      toast.success("已複製完整格價結果");
      onClose();
      return;
    }
    ref.current?.select();
    toast.message("仍然複製唔到，試下 Ctrl/Cmd+C");
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-4 sm:place-items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="copy-fallback-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="copy-fallback-title" className="font-medium">
          手動複製
        </h2>
        <p className="mt-1 text-sm text-muted">
          瀏覽器唔俾自動複製（預覽框好常見）。文字已揀晒，撳複製或 Ctrl/Cmd+C。
        </p>
        <textarea
          ref={ref}
          readOnly
          value={text}
          className="mt-3 h-56 w-full resize-none rounded-md border border-line bg-bg p-3 text-sm leading-relaxed text-ink"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" onClick={() => void retry()}>
            複製
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            關閉
          </Button>
        </div>
      </div>
    </div>
  );
}
