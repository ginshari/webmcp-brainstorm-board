// React Flow のカスタムノード（発想タブのツリー表示専用、整理タブは kanban.jsx）
// ハンドルは見えないが要素は残す（React Flow がエッジ接続点に使い、消すと描画がずれる）

import { useLayoutEffect, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import { Button } from "@/components/ui/button.jsx";
import { Textarea } from "@/components/ui/textarea.jsx";
import { X } from "lucide-react";
import { AUTHOR_STYLE } from "./authorStyle.js";

export function IdeaNode({ data, selected }) {
  const areaRef = useRef(null);
// 編集モードに入ったら編集欄へフォーカス（ダブルクリック直後は React Flow と競合するため1フレーム後に取り直す）
  useLayoutEffect(() => {
    if (!data.isEditing) return;
    areaRef.current?.focus();
    const raf = requestAnimationFrame(() => areaRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [data.isEditing]);

  const style = AUTHOR_STYLE[data.author] ?? AUTHOR_STYLE.ai;
  const ringClass = selected ? "ring-2 ring-foreground/70" : "";

  return (
    <div
      className={`group relative w-[200px] rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-card-foreground shadow-sm ${style.band} ${ringClass}`}
      // テキスト以外（削除ボタン）をダブルクリックしても編集に入らないようにする
      onDoubleClick={(e) => {
        if (e.target.closest("button, input, textarea")) return;
        if (!data.isEditing) data.onStartEdit?.();
      }}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="opacity-0" style={{ left: -style.bandWidth }} />
      {/* 上部の行は常に同じ並び・同じ高さで出す: [書いた人] ... [削除] */}
      <div className="mb-1 flex min-h-6 flex-wrap items-center gap-1.5">
        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold ${style.badge}`}>
          <style.Icon className="size-3" aria-hidden="true" />
          {style.label}
        </span>
        {data.editedByHuman && <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">人が編集</span>}
        <span className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="nodrag"
          onClick={(e) => {
            e.stopPropagation();
            data.onDelete?.();
          }}
          aria-label="この付箋を削除"
        >
          <X />
        </Button>
      </div>
      {data.isEditing ? (
        <Textarea
          ref={areaRef}
          name="idea-text"
          autoFocus
          defaultValue={data.text}
          rows={1}
          className="nodrag nowheel min-h-0 w-full resize-none px-1 py-0.5 text-sm"
          onClick={(e) => e.stopPropagation()}
          onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
          onKeyDown={(e) => {
// 編集欄のキー操作は選択・削除ショートカットに伝えない（編集欄内で完結させる）
            e.stopPropagation();
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              data.onCommitEdit?.(e.currentTarget.value);
            } else if (e.key === "Escape") {
              e.preventDefault();
              data.onCancelEdit?.();
            }
          }}
          onBlur={(e) => data.onCommitEdit?.(e.currentTarget.value)}
        />
      ) : (
        <div className="whitespace-pre-wrap">
          <span className="mr-1 align-top font-mono text-xs text-muted-foreground">#{data.order}</span>
          {data.text}
        </div>
      )}
      {/* 枝の付け根の丸ボタン: 子を持つ付箋の右端に重ねる（開いていれば「−」、畳んでいれば「+N」）
          nodrag と e.stopPropagation でドラッグ・編集ダブルクリックと干渉しないようにする */}
      {data.hasChildren && (
        <button
          type="button"
          className="nodrag absolute top-1/2 -right-3 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-foreground shadow-sm hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={(e) => {
            e.stopPropagation();
            data.onToggleCollapse?.();
          }}
          aria-label={data.collapsed ? `畳んだ${data.descendantCount}件を開く` : "子を畳む"}
        >
          {data.collapsed ? `+${data.descendantCount}` : "−"}
        </button>
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} className="opacity-0" />
    </div>
  );
}
