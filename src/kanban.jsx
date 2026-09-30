// 整理タブ: かんばん型の列（React Flow を使わない DOM と HTML5 drag and drop）
// 左端「未分類」、グループごとの列、右端「＋ 新しいグループ」
// キーボード・スクリーンリーダー向けに「⋯」メニューにも同じ操作を用意する

import { useLayoutEffect, useRef, useState } from "react";
import { AUTHOR_STYLE } from "./authorStyle.js";
import { Button } from "@/components/ui/button.jsx";
import { Textarea } from "@/components/ui/textarea.jsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.jsx";
import { MoreHorizontal, Pencil, Plus } from "lucide-react";

const UNCLASSIFIED = "unclassified";

function IdeaCardMenu({
  idea,
  currentGroupId,
  groups,
  onMoveToGroup,
  onRemoveFromGroup,
  onRequestNewGroup,
  onMoveUp,
  onMoveDown,
  onDelete,
}) {
  const otherGroups = groups.filter((g) => g.id !== currentGroupId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-xs" className="nodrag" aria-label={`#${idea.order} のメニュー`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>グループへ移す</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {otherGroups.map((g) => (
              <DropdownMenuItem key={g.id} onSelect={() => onMoveToGroup(idea.id, g.id)}>
                {g.label}
              </DropdownMenuItem>
            ))}
            {otherGroups.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={() => onRequestNewGroup(idea.id)}>
              <Plus /> 新しいグループ
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {currentGroupId && <DropdownMenuItem onSelect={() => onRemoveFromGroup(idea.id)}>グループから外す</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!onMoveUp} onSelect={() => onMoveUp?.()}>
          上へ
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!onMoveDown} onSelect={() => onMoveDown?.()}>
          下へ
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(idea.id)}>
          削除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function KanbanCard({
  idea,
  currentGroupId,
  groups,
  isEditing,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onMoveToGroup,
  onRemoveFromGroup,
  onRequestNewGroup,
  onMoveUp,
  onMoveDown,
  onDelete,
}) {
  const areaRef = useRef(null);
  useLayoutEffect(() => {
    if (!isEditing) return;
    areaRef.current?.focus();
  }, [isEditing]);

  const style = AUTHOR_STYLE[idea.author] ?? AUTHOR_STYLE.ai;

  return (
    <div
      draggable={!isEditing}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", idea.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-card-foreground shadow-sm ${style.band} ${isEditing ? "" : "cursor-grab active:cursor-grabbing"}`}
      onDoubleClick={(e) => {
        if (e.target.closest("button, input, textarea")) return;
        if (!isEditing) onStartEdit(idea.id);
      }}
    >
      <div className="mb-1 flex min-h-6 items-center gap-1.5">
        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold ${style.badge}`}>
          <style.Icon className="size-3" aria-hidden="true" />
          {style.label}
        </span>
        {idea.editedByHuman && <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">人が編集</span>}
        <span className="flex-1" />
        <IdeaCardMenu
          idea={idea}
          currentGroupId={currentGroupId}
          groups={groups}
          onMoveToGroup={onMoveToGroup}
          onRemoveFromGroup={onRemoveFromGroup}
          onRequestNewGroup={onRequestNewGroup}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onDelete={onDelete}
        />
      </div>
      {isEditing ? (
        <Textarea
          ref={areaRef}
          name="idea-text"
          autoFocus
          defaultValue={idea.text}
          rows={1}
          className="w-full resize-none px-1 py-0.5 text-sm"
          onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onCommitEdit(idea.id, e.currentTarget.value);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancelEdit();
            }
          }}
          onBlur={(e) => onCommitEdit(idea.id, e.currentTarget.value)}
        />
      ) : (
        <div className="whitespace-pre-wrap">
          <span className="mr-1 align-top font-mono text-xs text-muted-foreground">#{idea.order}</span>
          {idea.text}
        </div>
      )}
    </div>
  );
}

// 列見出し
// 実在するグループだけ ✎ で名前を変えられ、色（緑系）が付く
// 「未分類」は無色・変更不可
function ColumnHeader({ label, editable, onRename }) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);
  useLayoutEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit(e) {
    setEditing(false);
    const value = e.currentTarget.value.trim();
    if (value && value !== label) onRename(value);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        name="group-label"
        defaultValue={label}
        className="w-full rounded border border-input bg-background px-1 py-0.5 text-sm font-bold"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(e);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        onBlur={commit}
      />
    );
  }
  return (
    <div className="flex items-center justify-between gap-1">
      <span className="break-words font-bold">{label}</span>
      {editable && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="shrink-0"
          onClick={() => setEditing(true)}
          aria-label={`「${label}」の名前を変える`}
        >
          <Pencil />
        </Button>
      )}
    </div>
  );
}

// カードの間に挟む挿入位置の目印線
function InsertionLine() {
  return <div className="-my-1 h-0.5 rounded-full bg-primary" aria-hidden="true" />;
}

// 1列分（「未分類」または実在するグループ）
// ドロップされたら onMove(ideaId, このグループ, beforeId) を呼ぶ
// beforeId はドロップ位置の直前の付箋id（末尾なら null）
// ドラッグオーバーの上下半分で判定する
function Column({ id, label, isRealGroup, ideas, groups, editingId, onRename, onMove, cardHandlers }) {
  const [dragOver, setDragOver] = useState(false);
  const [overIndex, setOverIndex] = useState(null); // この番号の直前に挿す null は末尾
  const targetGroupId = isRealGroup ? id : null;
  const headerClass = isRealGroup ? "bg-group-soft text-group-foreground" : "bg-muted";
  const panelClass = isRealGroup ? "border-group/40" : "border-border";

  function handleItemDragOver(e, idx) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const isAfter = e.clientY - rect.top > rect.height / 2;
    setOverIndex(isAfter ? idx + 1 : idx);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const ideaId = e.dataTransfer.getData("text/plain");
    setOverIndex(null);
    if (!ideaId) return;
    const beforeId = overIndex != null && overIndex < ideas.length ? ideas[overIndex].id : null;
    onMove(ideaId, targetGroupId, beforeId);
  }

  return (
    <div
      className={`flex h-full w-64 shrink-0 flex-col rounded-lg border-2 bg-card shadow-sm ${panelClass} ${dragOver ? "ring-2 ring-primary" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
        setOverIndex(ideas.length); // 付箋の外側（余白）に来たら末尾扱い
      }}
      onDragLeave={() => {
        setDragOver(false);
        setOverIndex(null);
      }}
      onDrop={handleDrop}
    >
      <div className={`rounded-t-md px-2 py-1.5 text-xs ${headerClass}`}>
        <ColumnHeader label={label} editable={isRealGroup} onRename={onRename} />
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {ideas.map((idea, idx) => (
          <div key={idea.id} className="space-y-2">
            {dragOver && overIndex === idx && <InsertionLine />}
            <div onDragOver={(e) => handleItemDragOver(e, idx)}>
              <KanbanCard
                idea={idea}
                currentGroupId={targetGroupId}
                groups={groups}
                isEditing={editingId === idea.id}
                onMoveUp={idx > 0 ? () => onMove(idea.id, targetGroupId, ideas[idx - 1].id) : undefined}
                onMoveDown={idx < ideas.length - 1 ? () => onMove(idea.id, targetGroupId, ideas[idx + 2]?.id ?? null) : undefined}
                {...cardHandlers}
              />
            </div>
          </div>
        ))}
        {dragOver && overIndex === ideas.length && <InsertionLine />}
      </div>
    </div>
  );
}

// 「＋ 新しいグループ」列にドロップすると見出し入力欄が出る（Enter で作成、Esc で取り消し）
// 「⋯」メニューの「新しいグループ」もここに合流する（キーボードだけで作る手段）
function NewGroupColumn({ pendingIdeaId, onDropIdea, onSubmit, onCancel }) {
  const [label, setLabel] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
// 「⋯」メニューから来たときは、メニューが閉じるまで aria-hidden の間のフォーカス移動が
// アクセシビリティ警告になるため、少し待ってから奪う
  useLayoutEffect(() => {
    if (!pendingIdeaId) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, [pendingIdeaId]);

  return (
    <div
      className={`flex h-full w-64 shrink-0 flex-col rounded-lg border-2 border-dashed bg-card/50 shadow-sm ${dragOver ? "border-primary ring-2 ring-primary" : "border-border"}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const ideaId = e.dataTransfer.getData("text/plain");
        if (ideaId) onDropIdea(ideaId);
      }}
    >
      {pendingIdeaId ? (
        <form
          className="p-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim()) return;
            onSubmit(label);
            setLabel("");
          }}
        >
          <input
            ref={inputRef}
            name="new-group-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="グループの見出し"
            className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setLabel("");
                onCancel();
              }
            }}
          />
        </form>
      ) : (
        <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
          <Plus className="mr-1 size-4" aria-hidden="true" />
          新しいグループ
        </div>
      )}
    </div>
  );
}

export function KanbanBoard({
  board,
  unclassifiedIdeas,
  editingId,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onDeleteIdea,
  onMove,
  onCreateGroupWithIdea,
  onRenameGroup,
}) {
  const [pendingNewGroupIdeaId, setPendingNewGroupIdeaId] = useState(null);

  const byId = new Map(board.ideas.map((idea) => [idea.id, idea]));

  const cardHandlers = {
    onStartEdit,
    onCommitEdit,
    onCancelEdit,
    onMoveToGroup: (ideaId, groupId) => onMove(ideaId, groupId, null),
    onRemoveFromGroup: (ideaId) => onMove(ideaId, null, null),
    onRequestNewGroup: (ideaId) => setPendingNewGroupIdeaId(ideaId),
    onDelete: onDeleteIdea,
  };

  const columns = [
    { id: UNCLASSIFIED, label: "未分類", isRealGroup: false, ideas: unclassifiedIdeas },
    ...board.groups.map((g) => ({
      id: g.id,
      label: g.label,
      isRealGroup: true,
      ideas: g.ideaIds.map((id) => byId.get(id)).filter(Boolean),
    })),
  ];

  return (
    <div className="flex h-full gap-4 overflow-x-auto p-4">
      {columns.map((col) => (
        <Column
          key={col.id}
          id={col.id}
          label={col.label}
          isRealGroup={col.isRealGroup}
          ideas={col.ideas}
          groups={board.groups}
          editingId={editingId}
          onRename={col.isRealGroup ? (label) => onRenameGroup(col.id, label) : undefined}
          onMove={onMove}
          cardHandlers={cardHandlers}
        />
      ))}
      <NewGroupColumn
        pendingIdeaId={pendingNewGroupIdeaId}
        onDropIdea={(ideaId) => setPendingNewGroupIdeaId(ideaId)}
        onSubmit={(label) => {
          onCreateGroupWithIdea(pendingNewGroupIdeaId, label);
          setPendingNewGroupIdeaId(null);
        }}
        onCancel={() => setPendingNewGroupIdeaId(null)}
      />
    </div>
  );
}
