// ボード状態の管理
// DOM に依存しない（Node からも import できる）
// 状態の保存先は呼び出し側が渡す storage（localStorage 互換: getItem/setItem）

const STORAGE_KEY = "brainstorm-board";
const AUTHORS = new Set(["ai", "human"]);

function emptyState() {
  return { ideas: [], groups: [], nextOrder: 1, unclassifiedOrder: [] };
}

// author の欠損や不正値は "ai" 扱いにする（既定は AI が書いたもの）
function normalizeAuthor(author) {
  return AUTHORS.has(author) ? author : "ai";
}

// パース済みの JSON を検証して正規化した状態を返す
// 書き出し形式（format 付き）でも素の board でも受け付ける
// 形が不正なら理由付きの Error を投げる
// loadBoard と人用の読み込みボタンが共有する
export function parseBoard(obj) {
  if (!obj || typeof obj !== "object") {
    throw new Error("board の形式が不正です");
  }
  const hasFormat = "format" in obj;
  if (hasFormat && obj.format !== "brainstorm-board") {
    throw new Error(`未対応の format です: ${obj.format}`);
  }
  const board = hasFormat ? obj.board : obj;
  // 型まで検証する: "合法なJSONだが形が違う"（例: ideas/groups が配列でない）は
  // 後段の .map/.push でクラッシュするため、ここで弾く
  if (!board || typeof board !== "object" || !Array.isArray(board.ideas) || !Array.isArray(board.groups)) {
    throw new Error("board の形式が不正です");
  }
  return {
    ideas: board.ideas.map((idea) => ({
      ...idea,
      author: normalizeAuthor(idea?.author),
      // 壊れた値（真偽値以外）は「人が編集していない」扱いにする
      editedByHuman: idea?.editedByHuman === true,
    })),
    groups: board.groups,
    nextOrder: typeof board.nextOrder === "number" ? board.nextOrder : 1,
// 整理タブの「未分類」列の並び順（保存が無ければ空配列）
// 実在しない id などの不整合は unclassifiedIds() 側で吸収する
    unclassifiedOrder: Array.isArray(board.unclassifiedOrder)
      ? board.unclassifiedOrder.filter((id) => typeof id === "string")
      : [],
  };
}

// 今の状態を書き出し用にラップする（書き出しボタンが使う純粋関数）
export function exportBoard(state, now = new Date()) {
  return {
    format: "brainstorm-board",
    version: 1,
    exportedAt: now.toISOString(),
    board: state,
  };
}

export function loadBoard(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return emptyState();
  try {
    return parseBoard(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

export function saveBoard(storage, state) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let idCounter = 0;
function makeId(prefix) {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export function addIdea(state, { text, parentId, author }) {
  if (typeof text !== "string" || text.trim() === "") {
    throw new Error("text は空でない文字列が必要です");
  }
  if (parentId != null && !state.ideas.some((idea) => idea.id === parentId)) {
    throw new Error(`parentId が見つかりません: ${parentId}。get_board で今ある id を確かめてください`);
  }
  const idea = {
    id: makeId("idea"),
    text: text.trim(),
    parentId: parentId ?? null,
    author: normalizeAuthor(author),
    order: state.nextOrder,
  };
  state.ideas.push(idea);
  state.nextOrder += 1;
  return idea;
}

export function updateIdeaText(state, { id, text }) {
  if (typeof text !== "string" || text.trim() === "") {
    throw new Error("text は空でない文字列が必要です");
  }
  const idea = state.ideas.find((i) => i.id === id);
  if (!idea) {
    throw new Error(`id が見つかりません: ${id}`);
  }
  const trimmed = text.trim();
  const changed = trimmed !== idea.text;
  idea.text = trimmed;
  // AI が書いた付箋を人が直したら author はそのままに editedByHuman だけ立てる
  // 本文が変わっていないときは立てない
  if (idea.author === "ai" && changed) idea.editedByHuman = true;
  return idea;
}

// 付箋を1つ削除する
// 子は削除された付箋の親につなぎ直す
// グループからも外し、空になったグループは消す
export function deleteIdea(state, { id }) {
  const idea = state.ideas.find((i) => i.id === id);
  if (!idea) {
    throw new Error(`id が見つかりません: ${id}`);
  }
  for (const other of state.ideas) {
    if (other.parentId === id) other.parentId = idea.parentId;
  }
  state.ideas = state.ideas.filter((i) => i.id !== id);
  for (const group of state.groups) {
    group.ideaIds = group.ideaIds.filter((ideaId) => ideaId !== id);
  }
  state.groups = state.groups.filter((group) => group.ideaIds.length > 0);
  state.unclassifiedOrder = (state.unclassifiedOrder ?? []).filter((ideaId) => ideaId !== id);
  return idea;
}

// ヘッダー「⋯」メニューの「リセット」は丸ごと空にするだけ
// 取り消しは App.jsx の undo に任せる
export function clearBoard(state) {
  state.ideas = [];
  state.groups = [];
  state.unclassifiedOrder = [];
}

export function getBoardSummary(state) {
  return {
    ideas: state.ideas.map((idea) => ({
      id: idea.id,
      order: idea.order,
      text: idea.text,
      parentId: idea.parentId,
      author: idea.author,
    })),
    groups: state.groups.map((group) => ({
      id: group.id,
      label: group.label,
      ideaIds: group.ideaIds,
    })),
  };
}

// 付箋を今のグループ（入っていれば）から外す内部処理
// 付箋は1つのグループにしか入れない前提を守るため、グループ操作はすべてここを通す
// 空になったグループは消す（deleteIdea と同じ扱い）
function removeFromCurrentGroup(state, ideaId) {
  for (const group of state.groups) {
    const idx = group.ideaIds.indexOf(ideaId);
    if (idx !== -1) group.ideaIds.splice(idx, 1);
  }
  state.groups = state.groups.filter((group) => group.ideaIds.length > 0);
// グループに入った付箋は未分類から外す（戻す側は unclassifiedIds() で改めて並び順に加える）
  state.unclassifiedOrder = (state.unclassifiedOrder ?? []).filter((id) => id !== ideaId);
}

// 配列の中で id を beforeId の直前へ移す（beforeId が無ければ末尾、未登録なら挿入）
function moveInList(list, id, beforeId) {
  const idx = list.indexOf(id);
  if (idx !== -1) list.splice(idx, 1);
  const insertAt = beforeId != null ? list.indexOf(beforeId) : -1;
  if (insertAt === -1) list.push(id);
  else list.splice(insertAt, 0, id);
}

// 「未分類」列の付箋 id を並び順で返す
// 保存された並び（unclassifiedOrder）を尊重し、無いものは発言順（order）で末尾に補う
// 実在しない id は除く（掃除漏れがあっても壊れない）
function unclassifiedIds(state) {
  const grouped = new Set(state.groups.flatMap((g) => g.ideaIds));
  const isUnclassified = (id) => state.ideas.some((i) => i.id === id) && !grouped.has(id);
  const saved = (state.unclassifiedOrder ?? []).filter(isUnclassified);
  const savedSet = new Set(saved);
  const missing = state.ideas
    .filter((i) => !grouped.has(i.id) && !savedSet.has(i.id))
    .sort((a, b) => a.order - b.order)
    .map((i) => i.id);
  return [...saved, ...missing];
}

// 新しいグループを作る
// 既に別のグループに入っている付箋は移す
// 付箋は1つのグループにしか入れない AI の group_ideas もこの関数を使う
export function groupIdeas(state, { ids, label }) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("ids は空でない配列が必要です");
  }
  if (typeof label !== "string" || label.trim() === "") {
    throw new Error("label は空でない文字列が必要です");
  }
  const missing = ids.filter((id) => !state.ideas.some((idea) => idea.id === id));
  if (missing.length > 0) {
    throw new Error(`ids に存在しないアイデアがあります: ${missing.join(", ")}。get_board で今ある id を確かめてください`);
  }
  for (const id of ids) removeFromCurrentGroup(state, id);
  const group = { id: makeId("group"), label: label.trim(), ideaIds: [...ids] };
  state.groups.push(group);
  return group;
}

// グループの見出しを変更する（人用UI、AI 用ツールは増やさない）
export function renameGroup(state, { id, label }) {
  if (typeof label !== "string" || label.trim() === "") {
    throw new Error("label は空でない文字列が必要です");
  }
  const group = state.groups.find((g) => g.id === id);
  if (!group) {
    throw new Error(`id が見つかりません: ${id}`);
  }
  group.label = label.trim();
  return group;
}

// 付箋を1枚、既存のグループへ移す（列へドラッグ、または「⋯」メニュー）
// 元のグループからは外す（空になれば消える）
// beforeId を指定するとそのグループ内で直前に挿す（省略時は末尾）
export function moveIdeaToGroup(state, { ideaId, groupId, beforeId = null }) {
  if (!state.ideas.some((idea) => idea.id === ideaId)) {
    throw new Error(`id が見つかりません: ${ideaId}`);
  }
  const group = state.groups.find((g) => g.id === groupId);
  if (!group) {
    throw new Error(`id が見つかりません: ${groupId}`);
  }
  if (group.ideaIds.includes(ideaId)) return group; // 既にそのグループに入っている
  removeFromCurrentGroup(state, ideaId);
  moveInList(group.ideaIds, ideaId, beforeId);
  return group;
}

// 付箋を1枚、今のグループから外す（「未分類」へドラッグ、または「⋯」メニュー）
// どのグループにも属していなければ何もしない
// 空になったグループは消える
// beforeId を指定すると未分類列の中で直前に挿す（省略時は末尾）
export function removeIdeaFromGroup(state, { ideaId, beforeId = null }) {
  if (!state.ideas.some((idea) => idea.id === ideaId)) {
    throw new Error(`id が見つかりません: ${ideaId}`);
  }
  removeFromCurrentGroup(state, ideaId);
  const ids = unclassifiedIds(state);
  moveInList(ids, ideaId, beforeId);
  state.unclassifiedOrder = ids;
}

// 同じ列の中で並び替える（ドラッグ、または「⋯」メニューの「上へ／下へ」）
// groupId が null なら未分類列、そうでなければそのグループ内で beforeId の直前へ移す（省略時は末尾）
// 列をまたぐ移動は moveIdeaToGroup / removeIdeaFromGroup を使うこと
export function reorderIdea(state, { ideaId, groupId, beforeId = null }) {
  if (!state.ideas.some((idea) => idea.id === ideaId)) {
    throw new Error(`id が見つかりません: ${ideaId}`);
  }
  if (groupId == null) {
    const ids = unclassifiedIds(state);
    if (!ids.includes(ideaId)) throw new Error(`未分類ではありません: ${ideaId}`);
    moveInList(ids, ideaId, beforeId);
    state.unclassifiedOrder = ids;
  } else {
    const group = state.groups.find((g) => g.id === groupId);
    if (!group) throw new Error(`id が見つかりません: ${groupId}`);
    if (!group.ideaIds.includes(ideaId)) throw new Error(`グループに属していません: ${ideaId}`);
    moveInList(group.ideaIds, ideaId, beforeId);
  }
}

// 整理タブの「未分類」列に並べる付箋を表示順で返す
export function getUnclassifiedIdeas(state) {
  const byId = new Map(state.ideas.map((idea) => [idea.id, idea]));
  return unclassifiedIds(state)
    .map((id) => byId.get(id))
    .filter(Boolean);
}

// ツリー表示用: parentId でネストした配列に組み立てる（発言順 = order）
export function buildTree(state) {
  const byParent = new Map();
  for (const idea of state.ideas) {
    const key = idea.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(idea);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.order - b.order);

  function attach(idea) {
    return { ...idea, children: (byParent.get(idea.id) ?? []).map(attach) };
  }
  return (byParent.get(null) ?? []).map(attach);
}
