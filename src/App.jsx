import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, Background, Controls, getViewportForBounds } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  loadBoard,
  saveBoard,
  addIdea as addIdeaToBoard,
  updateIdeaText,
  deleteIdea,
  groupIdeas as groupIdeasInBoard,
  renameGroup,
  moveIdeaToGroup,
  removeIdeaFromGroup,
  reorderIdea,
  getUnclassifiedIdeas,
  clearBoard,
  parseBoard,
  exportBoard,
} from "./board.js";
import { layoutIdeas, collapseIdsAtDepth, NODE_WIDTH } from "./layout.js";
import { nodeTypes } from "./nodeTypes.js";
import { KanbanBoard } from "./kanban.jsx";
import { useBoardTools } from "./useBoardTools.js";
import { ensureModelContext } from "./modelContext.js";
import { createTools } from "./tools.js";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.jsx";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover.jsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.jsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.jsx";
import { ChevronDown, CircleCheck, CircleHelp, MoreVertical, TriangleAlert } from "lucide-react";

const EDGE_STYLE = { stroke: "var(--color-edge)", strokeWidth: 2 };

function filenameTimestamp(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

const READABLE_MIN_ZOOM = 1.0;

const DEPTH_OPTIONS = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: Infinity, label: "すべて" },
];

const TUTORIAL_KEY = "brainstorm-tutorial-dismissed";

const STEP_ABOUT = {
  title: "このアプリについて",
  body: "AIと人が同じボードで一緒にブレインストーミングするデモです。付箋はマインドマップに着想を得た「発想」表示と、KJ法に着想を得た「整理」表示を切り替えて見られます。",
};
const STEP_CONNECT = {
  title: "AI から使えるようにする",
  body: "1. お使いの環境で WebMCP を有効にしてください。2026年9月時点の Chrome では、chrome://flags での設定が必要です。\n2. Chrome DevTools MCP サーバーをセットアップし、お使いの AI エージェントに追加してください。AI が操作する Chrome は普段の Chrome とは別のプロファイルなので、そちらでも同じ設定が必要です。\n3. AI エージェントに、このページを開くよう指示してください。",
};
const STEP_MANUAL = {
  title: "手動で操作する",
  body: "発想タブのヘッダーのフォームで付箋を追加できます。付箋をダブルクリックすると編集、× で削除します（Delete キーでも削除できます）。「整理」タブでは、付箋を列へドラッグしてグループに入れたり、外したり、新しいグループを作ったりできます。",
};
const STEP_VIEW = {
  title: "表示を切り替える",
  body: "「発想」タブは親子関係をツリー構造で、「整理」タブはグループごとの列で表示します。",
};

const TUTORIAL_STEPS = [STEP_ABOUT, STEP_CONNECT, STEP_MANUAL, STEP_VIEW];

function TutorialPanel({ step, onStep, onClose }) {
  const steps = TUTORIAL_STEPS;
  const current = steps[step];
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-bold">{current.title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="チュートリアルを閉じる"
          className="rounded text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          ×
        </button>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{current.body}</p>
      <div className="flex items-center justify-between">
        <div className="flex gap-1" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-foreground" : "bg-muted"}`} />
          ))}
        </div>
        <div className="flex gap-2 text-sm">
          <Button type="button" variant="ghost" size="sm" disabled={step === 0} onClick={() => onStep(step - 1)}>
            戻る
          </Button>
          {step < steps.length - 1 ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => onStep(step + 1)}>
              次へ
            </Button>
          ) : (
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              閉じる
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

// WebMCP の状態の表示
// 色だけに頼らず、アイコンの形（丸にチェック／三角に！）と文で区別する
const CONNECTION_STATUS = {
  native: { Icon: CircleCheck, text: "ブラウザ内蔵の WebMCP で、AI からツールを使えます", className: "text-muted-foreground" },
  unsupported: { Icon: TriangleAlert, text: "ブラウザ内蔵の WebMCP が無効です（手動では操作できます）", className: "text-foreground" },
};

export default function App() {
  const [mcMode, setMcMode] = useState("checking");
  const [view, setView] = useState("tree");
  const storage = window.localStorage;
  const [board, setBoard] = useState(() => loadBoard(storage));
  const notify = useCallback(() => setBoard(loadBoard(storage)), [storage]);

  const [selectedIds, setSelectedIds] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [addText, setAddText] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const [depthSetting, setDepthSetting] = useState(Infinity);
  const [centerRequestId, setCenterRequestId] = useState(null);
  const centerRequestRef = useRef(null);
  const toggleCollapse = useCallback((id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    centerRequestRef.current = id;
    setCenterRequestId(id);
  }, []);
  const applyDepth = useCallback(
    (depth) => {
      setDepthSetting(depth);
      setCollapsedIds(collapseIdsAtDepth(board, depth));
    },
    [board],
  );

  const [tutorialOpen, setTutorialOpen] = useState(() => {
    try {
      return storage.getItem(TUTORIAL_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const [tutorialStep, setTutorialStep] = useState(0);
  const dismissTutorial = useCallback(() => {
    setTutorialOpen(false);
    try {
      storage.setItem(TUTORIAL_KEY, "1");
    } catch {
      // 保存できなくても閉じる操作自体は成立させる
    }
  }, [storage]);
  const handleTutorialOpenChange = useCallback(
    (open) => {
      if (open) {
        setTutorialStep(0);
        setTutorialOpen(true);
      } else {
        dismissTutorial();
      }
    },
    [dismissTutorial],
  );

  const rfInstanceRef = useRef(null);
  const paneRef = useRef(null);

  const handleAddSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (!addText.trim()) return;
      const state = loadBoard(storage);
      // React Flow 内部の選択更新は即座でも、こちらの selectedIds への反映は
      // onSelectionChange 経由で1テンポ遅れることがある
      // 追加先の取り違えを防ぐため、送信時点の実際の選択を React Flow インスタンスから直接読む
      const liveSelected = rfInstanceRef.current?.getNodes().filter((n) => n.selected).map((n) => n.id) ?? selectedIds;
      const parentId = liveSelected.length === 1 ? liveSelected[0] : null;
      try {
        addIdeaToBoard(state, { text: addText, parentId, author: "human" });
      } catch {
        return;
      }
      saveBoard(storage, state);
      setAddText("");
      notify();
    },
    [storage, notify, selectedIds, addText],
  );

  const [undoSnapshot, setUndoSnapshot] = useState(null);
  const undoTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(undoTimerRef.current), []);

  const armUndo = useCallback((before, label) => {
    clearTimeout(undoTimerRef.current);
    setUndoSnapshot({ state: before, label });
    undoTimerRef.current = setTimeout(() => setUndoSnapshot(null), 5000);
  }, []);

  const handleDeleteIds = useCallback(
    (ids) => {
      if (ids.length === 0) return;
      const state = loadBoard(storage);
      const before = structuredClone(state);
      let deletedAny = false;
      for (const id of ids) {
        try {
          deleteIdea(state, { id });
          deletedAny = true;
        } catch {
          // 同じ操作で先に消えた付箋の id が重複していた場合などは無視する
        }
      }
      if (!deletedAny) return;
      saveBoard(storage, state);
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      setEditingId((prev) => (ids.includes(prev) ? null : prev));
      notify();
      armUndo(before, "削除しました");
    },
    [storage, notify, armUndo],
  );

  const undoDelete = useCallback(() => {
    if (!undoSnapshot) return;
    clearTimeout(undoTimerRef.current);
    saveBoard(storage, undoSnapshot.state);
    setUndoSnapshot(null);
    notify();
  }, [storage, notify, undoSnapshot]);

  const importInputRef = useRef(null);
  const [importError, setImportError] = useState(null);
  const [pendingImport, setPendingImport] = useState(null);

  const handleExport = useCallback(() => {
    const data = exportBoard(loadBoard(storage), new Date());
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `brainstorm-board-${filenameTimestamp(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [storage]);

  const applyImportedBoard = useCallback(
    (newState) => {
      const before = structuredClone(loadBoard(storage));
      saveBoard(storage, newState);
      setPendingImport(null);
      setImportError(null);
      notify();
      armUndo(before, "読み込みました");
    },
    [storage, notify, armUndo],
  );

  const handleImportFile = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // 同じファイルを選び直しても onChange が発火するようにする
      if (!file) return;
      let newState;
      try {
        newState = parseBoard(JSON.parse(await file.text()));
      } catch (err) {
        setImportError(`読み込めませんでした: ${err.message}`);
        return;
      }
      setImportError(null);
      const current = loadBoard(storage);
      if (current.ideas.length > 0) {
        setPendingImport(newState);
      } else {
        applyImportedBoard(newState);
      }
    },
    [storage, applyImportedBoard],
  );

  const commitEdit = useCallback(
    (id, text) => {
      setEditingId(null);
      if (!text.trim()) return; // 空にした場合は取消と同じ扱いにする
      const state = loadBoard(storage);
      try {
        updateIdeaText(state, { id, text });
      } catch {
        return;
      }
      saveBoard(storage, state);
      notify();
    },
    [storage, notify],
  );

  const handleRenameGroup = useCallback(
    (groupId, label) => {
      const state = loadBoard(storage);
      try {
        renameGroup(state, { id: groupId, label });
      } catch {
        return;
      }
      saveBoard(storage, state);
      notify();
    },
    [storage, notify],
  );

  const handleMove = useCallback(
    (ideaId, targetGroupId, beforeId) => {
      const state = loadBoard(storage);
      const currentGroup = state.groups.find((g) => g.ideaIds.includes(ideaId));
      const currentGroupId = currentGroup?.id ?? null;
      try {
        if (currentGroupId === targetGroupId) {
          reorderIdea(state, { ideaId, groupId: targetGroupId, beforeId });
        } else if (targetGroupId == null) {
          removeIdeaFromGroup(state, { ideaId, beforeId });
        } else {
          moveIdeaToGroup(state, { ideaId, groupId: targetGroupId, beforeId });
        }
      } catch {
        return;
      }
      saveBoard(storage, state);
      notify();
    },
    [storage, notify],
  );

  // ヘッダー「⋯」メニューの「リセット」確認は AlertDialog で行う（window.confirm はブラウザ自動操作をブロックするため使わない）
  // 結果は他の破壊的操作と同じ1段階 undo に乗る
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const handleClearAll = useCallback(() => {
    const state = loadBoard(storage);
    if (state.ideas.length === 0 && state.groups.length === 0) return;
    const before = structuredClone(state);
    clearBoard(state);
    saveBoard(storage, state);
    setSelectedIds([]);
    setEditingId(null);
    notify();
    armUndo(before, "リセットしました");
  }, [storage, notify, armUndo]);

  const handleCreateGroupWithIdea = useCallback(
    (ideaId, label) => {
      if (!ideaId || !label.trim()) return;
      const state = loadBoard(storage);
      try {
        groupIdeasInBoard(state, { ids: [ideaId], label });
      } catch {
        return;
      }
      saveBoard(storage, state);
      notify();
    },
    [storage, notify],
  );

  useEffect(() => {
    function onKeyDown(e) {
      const inEditable = e.target?.closest?.("input, textarea, [contenteditable]");
      if (e.key === "Delete") {
        if (editingId || inEditable) return;
        handleDeleteIds(selectedIds);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !inEditable && undoSnapshot) {
        e.preventDefault();
        undoDelete();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds, handleDeleteIds, editingId, undoSnapshot, undoDelete]);

  const handleSelectionChange = useCallback(({ nodes: selected }) => {
    setSelectedIds(selected.map((n) => n.id));
  }, []);

  const [heights, setHeights] = useState(() => new Map());
  const onNodesChange = useCallback((changes) => {
    // nodes は selectedIds から組み立てる制御モードなので、クリックでの選択（select の変更）もここで取り込む
    // （取り込まないと React Flow 側の選択が確定せず、シングルクリックで選択状態にならない）
    const selectChanges = changes.filter((c) => c.type === "select");
    if (selectChanges.length > 0) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const c of selectChanges) {
          if (c.selected) next.add(c.id);
          else next.delete(c.id);
        }
        return [...next];
      });
    }
    setHeights((prev) => {
      let next = prev;
      for (const change of changes) {
        if (change.type === "dimensions" && change.dimensions && change.dimensions.height) {
          if (prev.get(change.id) !== change.dimensions.height) {
            if (next === prev) next = new Map(prev);
            next.set(change.id, change.dimensions.height);
          }
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    ensureModelContext().then(setMcMode);
  }, []);

  useEffect(() => {
    window.addEventListener("storage", notify);
    return () => window.removeEventListener("storage", notify);
  }, [notify]);

  const { addIdea, getBoard, groupIdeas } = useBoardTools(storage, notify);
  const toolDefs = useMemo(() => createTools(storage, notify), [storage, notify]);

  const treeIdeas = useMemo(() => layoutIdeas(board, heights, collapsedIds), [board, heights, collapsedIds]);
  const unclassifiedIdeas = useMemo(() => getUnclassifiedIdeas(board), [board]);

  const addTarget = selectedIds.length === 1 ? board.ideas.find((i) => i.id === selectedIds[0]) : null;

  // React Flow は新しい node オブジェクトを渡されると実測サイズ（measured）を巻き戻してしまう
  // 既知の実測高さ（heights）がある付箋には毎回 measured を付け直し、この巻き戻りを防ぐ
  const measuredOf = useCallback((id) => (heights.has(id) ? { width: NODE_WIDTH, height: heights.get(id) } : undefined), [heights]);

  const nodes = useMemo(
    () =>
      treeIdeas.map((i) => ({
        id: i.id,
        type: "idea",
        position: { x: i.x, y: i.y },
        data: {
          order: i.order,
          text: i.text,
          author: i.author,
          editedByHuman: i.editedByHuman,
          isEditing: editingId === i.id,
          hasChildren: i.hasChildren,
          collapsed: i.collapsed,
          descendantCount: i.descendantCount,
          onStartEdit: () => setEditingId(i.id),
          onCommitEdit: (text) => commitEdit(i.id, text),
          onCancelEdit: () => setEditingId(null),
          onDelete: () => handleDeleteIds([i.id]),
          onToggleCollapse: () => toggleCollapse(i.id),
        },
        selected: selectedIds.includes(i.id),
        measured: measuredOf(i.id),
      })),
    [treeIdeas, editingId, commitEdit, handleDeleteIds, toggleCollapse, selectedIds, measuredOf],
  );

  const edges = useMemo(
    () =>
      treeIdeas
        .filter((i) => i.parentId)
        .map((i) => ({ id: `e-${i.parentId}-${i.id}`, source: i.parentId, target: i.id, type: "smoothstep", style: EDGE_STYLE })),
    [treeIdeas],
  );

  const connection = CONNECTION_STATUS[mcMode]; // "checking" の間は undefined（表示なし）
  const registeredCount = [addIdea, getBoard, groupIdeas].filter((s) => s.registered).length;

  const nodesRef = useRef(nodes);
  const boardRef = useRef(board);
  useEffect(() => {
    nodesRef.current = nodes;
    boardRef.current = board;
  }, [nodes, board]);

  // 現在表示中の全付箋の実測高さが揃うまでは fitView を呼ばない
  // 揃う前に呼ぶと、まだ測れていないノードを除いた一部だけに合わせてズームしてしまう
  const allMeasured = board.ideas.every((idea) => heights.has(idea.id));
  useEffect(() => {
    if (view !== "tree") return;
    // 編集中は fitView しない（編集欄のフォーカスを奪うため）
    if (editingId) return;
    if (!allMeasured) return;
    if (centerRequestRef.current) return;
    const raf = requestAnimationFrame(() => {
      const instance = rfInstanceRef.current;
      const pane = paneRef.current;
      const currentNodes = nodesRef.current;
      if (!instance || !pane || currentNodes.length === 0) return;
      const bounds = instance.getNodesBounds(currentNodes);
      const { width, height } = pane.getBoundingClientRect();
      const { zoom: naturalZoom } = getViewportForBounds(bounds, width, height, 0.01, 2, 0.2);
      if (naturalZoom >= READABLE_MIN_ZOOM) {
        instance.fitView({ padding: 0.2, minZoom: READABLE_MIN_ZOOM });
        return;
      }
      const currentIdeas = boardRef.current.ideas;
      const lastIdea = currentIdeas.reduce((a, b) => (a.order > b.order ? a : b), currentIdeas[0]);
      const lastNode = lastIdea && currentNodes.find((n) => n.id === lastIdea.id);
      if (lastNode) {
        // fitView に対象ノードを1件だけ渡すと、その小さな箱にぴったり合わせようとして
        // maxZoom（既定2倍）まで寄ってしまう
        // 読みたいのは「本文が読める倍率」であって
        // 「その付箋が画面いっぱいになる倍率」ではないので、setCenter で倍率を固定して中央に置く
        const w = lastNode.measured?.width ?? NODE_WIDTH;
        const h = lastNode.measured?.height ?? 60;
        instance.setCenter(lastNode.position.x + w / 2, lastNode.position.y + h / 2, { zoom: READABLE_MIN_ZOOM });
      } else {
        instance.fitView({ padding: 0.2, minZoom: READABLE_MIN_ZOOM });
      }
    });
    return () => cancelAnimationFrame(raf);
    // centerRequestId は意図的に依存配列に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, view, heights, editingId, allMeasured]);

  const CENTERED_NODE_TOP_MARGIN = 24;
  useEffect(() => {
    if (view !== "tree" || !centerRequestId) return;
    if (editingId) return;
    if (!allMeasured) return;
    const raf = requestAnimationFrame(() => {
      const instance = rfInstanceRef.current;
      const pane = paneRef.current;
      const node = nodesRef.current.find((n) => n.id === centerRequestId);
      centerRequestRef.current = null;
      setCenterRequestId(null);
      if (!instance || !pane || !node) return;
      const zoom = instance.getViewport().zoom;
      const width = node.measured?.width ?? NODE_WIDTH;
      const { width: paneWidth } = pane.getBoundingClientRect();
      const x = paneWidth / 2 - (node.position.x + width / 2) * zoom;
      const y = CENTERED_NODE_TOP_MARGIN - node.position.y * zoom;
      instance.setViewport({ x, y, zoom }, { duration: 250 });
    });
    return () => cancelAnimationFrame(raf);
  }, [centerRequestId, view, editingId, allMeasured]);

  return (
    <div className="flex h-screen w-screen flex-col">
      <header className="space-y-2 border-b border-border bg-muted/40 px-6 py-4">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-card-foreground shadow-sm">
          <h1 className="text-lg font-bold tracking-tight">ブレストボード</h1>
          <Popover open={toolsOpen} onOpenChange={setToolsOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="sm" aria-expanded={toolsOpen}>
                AI に公開しているツール（{toolDefs.length}）
                <ChevronDown className={`transition-transform ${toolsOpen ? "rotate-180" : ""}`} />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-96 text-xs">
              <p className="text-muted-foreground">登録済み: {registeredCount}/{toolDefs.length}</p>
              {toolDefs.map((tool) => (
                <div key={tool.name}>
                  <p className="font-mono font-bold">{tool.name}</p>
                  <p className="text-muted-foreground">{tool.description}</p>
                </div>
              ))}
            </PopoverContent>
          </Popover>
          {connection && (
            <span className={`flex items-center gap-1 text-xs ${connection.className}`}>
              <connection.Icon className="size-3.5 shrink-0" aria-hidden="true" />
              {connection.text}
            </span>
          )}
          <span className="flex-1" />
          <Popover open={tutorialOpen} onOpenChange={handleTutorialOpenChange}>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon-xs" aria-label="使い方を説明する">
                <CircleHelp />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <TutorialPanel step={tutorialStep} onStep={setTutorialStep} onClose={dismissTutorial} />
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-xs" aria-label="その他の操作">
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="whitespace-nowrap" onSelect={handleExport}>
                JSON を書き出す
              </DropdownMenuItem>
              <DropdownMenuItem className="whitespace-nowrap" onSelect={() => importInputRef.current?.click()}>
                JSON を読み込む
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setClearAllOpen(true)}>
                リセット
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>リセットしますか</AlertDialogTitle>
                <AlertDialogDescription>
                  付箋とグループをすべて消して空にします。消したあとも Ctrl+Z で1回だけ戻せます。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>やめる</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleClearAll}>
                  リセット
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <input
            ref={importInputRef}
            type="file"
            id="import-file"
            name="import-file"
            accept="application/json,.json"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>
        {importError && (
          <p role="alert" className="text-xs text-destructive">
            {importError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-card-foreground shadow-sm">
          <Tabs value={view} onValueChange={setView}>
            <TabsList aria-label="表示切り替え">
              <TabsTrigger value="tree">発想</TabsTrigger>
              <TabsTrigger value="group">整理</TabsTrigger>
            </TabsList>
          </Tabs>
          {view === "tree" && (
            <>
              <form onSubmit={handleAddSubmit} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  追加先: {addTarget ? `#${addTarget.order}（の子）` : "ルート"}
                </span>
                <Input
                  type="text"
                  name="add-idea-text"
                  value={addText}
                  onChange={(e) => setAddText(e.target.value)}
                  placeholder="付箋の内容"
                  className="w-56"
                />
                <Button type="submit" size="sm">
                  追加
                </Button>
              </form>
              <div role="group" aria-label="表示する深さ" className="ml-auto flex items-center gap-1">
                <span className="text-xs text-muted-foreground whitespace-nowrap">表示する深さ:</span>
                {DEPTH_OPTIONS.map((opt) => (
                  <Button
                    key={opt.label}
                    type="button"
                    size="sm"
                    variant={depthSetting === opt.value ? "default" : "outline"}
                    aria-pressed={depthSetting === opt.value}
                    onClick={() => applyDepth(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>

        {pendingImport && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2 text-sm text-card-foreground shadow-sm">
            <span>今のボードを置き換えます</span>
            <Button type="button" variant="outline" size="sm" onClick={() => applyImportedBoard(pendingImport)}>
              置き換える
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPendingImport(null)}>
              やめる
            </Button>
          </div>
        )}
      </header>
      <div className="min-h-0 flex-1">
        {view === "tree" ? (
          // クラス適用前に 0×0 と測られないよう、大きさを style で明示する
          <div ref={paneRef} className="h-full" style={{ width: "100%", height: "100%" }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              nodesDraggable
              fitView
              // 既定の minZoom は 0.5 で、盤面が育つと fitView がそれ以上ズームアウトできず
              // 一部のノードが常に画面外にはみ出したままになる
              minZoom={0.05}
              deleteKeyCode={null}
              onNodesChange={onNodesChange}
              onSelectionChange={handleSelectionChange}
              onInit={(instance) => {
                rfInstanceRef.current = instance;
              }}
            >
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
        ) : (
          <KanbanBoard
            board={board}
            unclassifiedIdeas={unclassifiedIdeas}
            editingId={editingId}
            onStartEdit={setEditingId}
            onCommitEdit={commitEdit}
            onCancelEdit={() => setEditingId(null)}
            onDeleteIdea={(id) => handleDeleteIds([id])}
            onMove={handleMove}
            onCreateGroupWithIdea={handleCreateGroupWithIdea}
            onRenameGroup={handleRenameGroup}
          />
        )}
      </div>
      {undoSnapshot && (
        <div className="fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-card px-4 py-2 text-sm text-card-foreground shadow-lg">
          <span>{undoSnapshot.label}</span>
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={undoDelete}>
            元に戻す
          </Button>
        </div>
      )}
    </div>
  );
}