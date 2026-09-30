// tools.js と board.js の動作確認（node:test）
// `npm run check` が呼ぶ

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTools, registerTools } from "./src/tools.js";
import {
  loadBoard,
  saveBoard,
  addIdea,
  updateIdeaText,
  deleteIdea,
  groupIdeas,
  renameGroup,
  moveIdeaToGroup,
  removeIdeaFromGroup,
  reorderIdea,
  getUnclassifiedIdeas,
  clearBoard,
  parseBoard,
  exportBoard,
} from "./src/board.js";
import { layoutIdeas, collapseIdsAtDepth } from "./src/layout.js";
import { ensureModelContext } from "./src/modelContext.js";

function makeStorageMock() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  };
}

function makeModelContextMock() {
  const registered = new Map();
  return {
    registerTool: (tool) => Promise.resolve().then(() => registered.set(tool.name, tool)),
    get: (name) => registered.get(name),
  };
}

function makeFailingModelContextMock() {
  return {
    registerTool: () => Promise.reject(new Error("registerTool 失敗（モック）")),
  };
}

function byName(tools, name) {
  const tool = tools.find((t) => t.name === name);
  assert.ok(tool, `${name} が定義されていること`);
  return tool;
}

test("registerTools が modelContext.registerTool を呼ぶ（Promise を返すモックでも通る）", async () => {
  const storage = makeStorageMock();
  const modelContext = makeModelContextMock();
  await registerTools(modelContext, storage);
  assert.ok(modelContext.get("add_idea"), "registerTool 経由で add_idea が登録される");
  assert.ok(modelContext.get("get_board"), "registerTool 経由で get_board が登録される");
  assert.ok(modelContext.get("group_ideas"), "registerTool 経由で group_ideas が登録される");
});

test("registerTool が失敗したら registerTools も reject する", async () => {
  const storage = makeStorageMock();
  const modelContext = makeFailingModelContextMock();
  await assert.rejects(() => registerTools(modelContext, storage), /registerTool 失敗/);
});

test("add → get → group の流れ", async () => {
  const storage = makeStorageMock();
  const tools = createTools(storage);
  const addIdea = byName(tools, "add_idea");
  const getBoard = byName(tools, "get_board");
  const groupIdeas = byName(tools, "group_ideas");

  const root = addIdea.execute({ text: "ルートのアイデア" });
  assert.equal(root.order, 1);
  assert.equal(root.parentId, null);

  const child = addIdea.execute({ text: "枝のアイデア", parentId: root.id });
  assert.equal(child.order, 2);
  assert.equal(child.parentId, root.id);

  const summary = getBoard.execute();
  assert.equal(summary.ideas.length, 2);
  assert.deepEqual(summary.ideas.map((i) => i.order), [1, 2]);

  const group = groupIdeas.execute({ ids: [root.id, child.id], label: "まとめ" });
  assert.equal(group.label, "まとめ");
  assert.deepEqual(group.ideaIds, [root.id, child.id]);

  const summary2 = getBoard.execute();
  assert.equal(summary2.groups.length, 1);
  assert.equal(summary2.groups[0].label, "まとめ");

  // 保存されていること（新しい tools インスタンスでも読める）
  const tools2 = createTools(storage);
  const summary3 = byName(tools2, "get_board").execute();
  assert.equal(summary3.ideas.length, 2);
});

test("group_ideas: 1枚の付箋が入るグループは1つだけ。別グループにいる付箋は移る", async () => {
  const storage = makeStorageMock();
  const tools = createTools(storage);
  const addIdea = byName(tools, "add_idea");
  const groupIdeas = byName(tools, "group_ideas");

  const a = addIdea.execute({ text: "A" });
  const b = addIdea.execute({ text: "B" });
  const c = addIdea.execute({ text: "C" });

  const groupA = groupIdeas.execute({ ids: [a.id, b.id], label: "グループA" });
  assert.deepEqual(groupA.ideaIds, [a.id, b.id]);

  // b はすでに「グループA」にいる
  // b と c で新しく「グループB」を作ると、b はそちらへ移る
  const groupB = groupIdeas.execute({ ids: [b.id, c.id], label: "グループB" });
  assert.deepEqual(groupB.ideaIds, [b.id, c.id]);

  const summary = byName(tools, "get_board").execute();
  const found = (label) => summary.groups.find((g) => g.label === label);
  assert.deepEqual(found("グループA").ideaIds, [a.id], "b が抜けて a だけ残る");
  assert.deepEqual(found("グループB").ideaIds, [b.id, c.id]);
});

test("不正な parentId / ids はエラーを返す", async () => {
  const storage = makeStorageMock();
  const tools = createTools(storage);
  const addIdea = byName(tools, "add_idea");
  const groupIdeas = byName(tools, "group_ideas");

  assert.match(addIdea.execute({ text: "孤児", parentId: "存在しないid" }).error, /parentId.*get_board/);
  assert.match(addIdea.execute({ text: "" }).error, /text/);

  const idea = addIdea.execute({ text: "実在アイデア" });
  assert.match(
    groupIdeas.execute({ ids: [idea.id, "存在しないid"], label: "グループ" }).error,
    /ids.*get_board/,
  );
  assert.match(groupIdeas.execute({ ids: [], label: "グループ" }).error, /ids/);
});

test("layoutIdeas: 畳んだ付箋の子孫はレイアウトから除かれ、件数も分かる", () => {
  const state = { ideas: [], groups: [], nextOrder: 1 };
  const root = addIdea(state, { text: "ルート" });
  const middle = addIdea(state, { text: "中間", parentId: root.id });
  addIdea(state, { text: "葉1", parentId: middle.id });
  addIdea(state, { text: "葉2", parentId: middle.id });
  addIdea(state, { text: "別枝（子なし）" });

  const openPositions = layoutIdeas(state, new Map());
  assert.equal(openPositions.length, 5, "畳んでいなければ全件並ぶ");
  const middleOpen = openPositions.find((p) => p.id === middle.id);
  assert.equal(middleOpen.hasChildren, true, "子を持つ付箋は hasChildren が true");
  assert.equal(middleOpen.collapsed, false, "collapsedIds に無ければ畳んでいない扱い");
  assert.equal(middleOpen.descendantCount, 2, "子孫の数（葉1・葉2）を数える");
  const leafPos = openPositions.find((p) => p.text === "別枝（子なし）");
  assert.equal(leafPos.hasChildren, false, "子が無ければ hasChildren は false");

  const collapsedPositions = layoutIdeas(state, new Map(), new Set([middle.id]));
  assert.equal(collapsedPositions.length, 3, "畳んだ中間の子孫2件がレイアウトから消え、中間自身と他2件だけ残る");
  assert.ok(!collapsedPositions.some((p) => p.text.startsWith("葉")), "畳んだ子孫は含まれない");
  const middleCollapsed = collapsedPositions.find((p) => p.id === middle.id);
  assert.equal(middleCollapsed.collapsed, true, "畳んだ付箋自身は collapsed: true で残る");
});

test("collapseIdsAtDepth: 「表示する深さ」設定で畳む対象（境目の付箋）が正しい", () => {
  const state = { ideas: [], groups: [], nextOrder: 1 };
  const root = addIdea(state, { text: "根" }); // depth 0
  const branch = addIdea(state, { text: "枝", parentId: root.id }); // depth 1
  const leaf = addIdea(state, { text: "葉", parentId: branch.id }); // depth 2
  addIdea(state, { text: "根2（子なし）" }); // depth 0, 子なし

  assert.deepEqual(collapseIdsAtDepth(state, 1), new Set([root.id]), "深さ1: 根（子を持つ）だけ畳む");
  assert.deepEqual(collapseIdsAtDepth(state, 2), new Set([branch.id]), "深さ2: 根は開き、枝を畳む");
  assert.deepEqual(collapseIdsAtDepth(state, 3), new Set(), "深さ3: 葉に子が無いので何も畳まない（全部開く）");
  assert.deepEqual(collapseIdsAtDepth(state, Infinity), new Set(), "「すべて」は何も畳まない");
  assert.equal(leaf.parentId, branch.id); // 変数を使っておく（lint 対策も兼ねる）
});

test("loadBoard: 空/壊れたJSON/形の違うJSONでも落ちない", () => {
  const emptyLike = { ideas: [], groups: [], nextOrder: 1, unclassifiedOrder: [] };
  assert.deepEqual(loadBoard(makeStorageMock()), emptyLike, "キーが無ければ空の状態");
  assert.deepEqual(loadBoard({ getItem: () => "{not json" }), emptyLike, "壊れたJSONは空の状態にフォールバック");
  assert.deepEqual(loadBoard({ getItem: () => "null" }), emptyLike, "JSON null も空の状態にフォールバック");
  assert.deepEqual(
    loadBoard({ getItem: () => '{"ideas":"x","groups":1,"nextOrder":"a"}' }),
    emptyLike,
    "型が配列/数値でないフィールドは空の状態にフォールバック（クラッシュしない）",
  );
});

test("author: 既定値は ai、human を指定すればそのまま保持される", () => {
  const state = { ideas: [], groups: [], nextOrder: 1 };
  const aiIdea = addIdea(state, { text: "AIのアイデア" });
  assert.equal(aiIdea.author, "ai", "author を渡さなければ ai 扱い");
  const humanIdea = addIdea(state, { text: "人のアイデア", author: "human" });
  assert.equal(humanIdea.author, "human");
  const bogusIdea = addIdea(state, { text: "不正な値", author: "robot" });
  assert.equal(bogusIdea.author, "ai", "author に不正な値を渡しても ai 扱い");
});

test("updateIdeaText: 空白を詰め、空文字・存在しない id は拒否する", () => {
  const state = { ideas: [], groups: [], nextOrder: 1 };
  const idea = addIdea(state, { text: "元の文" });
  const updated = updateIdeaText(state, { id: idea.id, text: " 直した文 " });
  assert.equal(updated.text, "直した文", "前後の空白は詰める");
  assert.equal(state.ideas[0].text, "直した文");
  assert.throws(() => updateIdeaText(state, { id: idea.id, text: "" }), /text/, "空文字は拒否する");
  assert.throws(() => updateIdeaText(state, { id: "存在しないid", text: "x" }), /id/, "存在しない id は拒否する");
});

test("updateIdeaText: AI の付箋を書き換えると editedByHuman が立つ。人の付箋には立てない", () => {
  const state = { ideas: [], groups: [], nextOrder: 1 };
  const aiIdea = addIdea(state, { text: "AI原文" }); // author 未指定は既定で ai
  updateIdeaText(state, { id: aiIdea.id, text: "人が書き換えた" });
  assert.equal(state.ideas[0].editedByHuman, true, "AI の付箋を書き換えると editedByHuman が立つ");

  const humanIdea = addIdea(state, { text: "人の原文", author: "human" });
  updateIdeaText(state, { id: humanIdea.id, text: "人が書き直した" });
  assert.notEqual(state.ideas[1].editedByHuman, true, "人の付箋には editedByHuman を立てない");
});

test("updateIdeaText: 本文が実際に変わらなければ editedByHuman を立てない", () => {
  const state = { ideas: [], groups: [], nextOrder: 1 };
  const aiIdea = addIdea(state, { text: "同じ文" });
  updateIdeaText(state, { id: aiIdea.id, text: "同じ文" });
  assert.notEqual(state.ideas[0].editedByHuman, true, "同じ内容で確定しても editedByHuman は立たない");
  updateIdeaText(state, { id: aiIdea.id, text: "  同じ文  " });
  assert.notEqual(state.ideas[0].editedByHuman, true, "前後の空白だけの差は変化とみなさない");
  updateIdeaText(state, { id: aiIdea.id, text: "違う文" });
  assert.equal(state.ideas[0].editedByHuman, true, "実際に変わったときは立つ");
});

test("renameGroup / removeIdeaFromGroup（列見出し変更・「未分類」へのドラッグ／⋯メニュー）", () => {
  const state = { ideas: [], groups: [], nextOrder: 1 };
  const a = addIdea(state, { text: "A" });
  const b = addIdea(state, { text: "B" });
  const group = groupIdeas(state, { ids: [a.id, b.id], label: "元の見出し" });

  renameGroup(state, { id: group.id, label: "新しい見出し" });
  assert.equal(state.groups[0].label, "新しい見出し");
  assert.throws(() => renameGroup(state, { id: "存在しないid", label: "x" }), /id/);
  assert.throws(() => renameGroup(state, { id: group.id, label: "" }), /label/);

  removeIdeaFromGroup(state, { ideaId: a.id });
  assert.deepEqual(state.groups[0].ideaIds, [b.id], "外した付箋だけグループから消える");
  removeIdeaFromGroup(state, { ideaId: b.id });
  assert.equal(state.groups.length, 0, "最後の1件を外すとグループごと消える");
  // すでにどのグループにも属していない付箋を指定してもエラーにならない（かんばんの「未分類」は既に未分類なので何もしない）
  removeIdeaFromGroup(state, { ideaId: a.id });
  assert.throws(() => removeIdeaFromGroup(state, { ideaId: "存在しないid" }), /id/, "付箋自体が無ければエラー");
});

test("moveIdeaToGroup: 1枚の付箋が入るグループは1つだけ。別のグループにいた場合はそこから外れる", () => {
  const state = { ideas: [], groups: [], nextOrder: 1 };
  const a = addIdea(state, { text: "A" });
  const b = addIdea(state, { text: "B" });
  groupIdeas(state, { ids: [a.id], label: "X" });
  const groupY = groupIdeas(state, { ids: [b.id], label: "Y" });

  moveIdeaToGroup(state, { ideaId: a.id, groupId: groupY.id });
  assert.equal(state.groups.length, 1, "Xはaが抜けて空になり消える");
  assert.deepEqual(state.groups[0].ideaIds, [b.id, a.id], "Yにaが加わる");

  // 既にそのグループに入っている場合は何もしない（no-op）
  moveIdeaToGroup(state, { ideaId: a.id, groupId: groupY.id });
  assert.deepEqual(state.groups[0].ideaIds, [b.id, a.id]);

  assert.throws(() => moveIdeaToGroup(state, { ideaId: "存在しないid", groupId: groupY.id }), /id/);
  assert.throws(() => moveIdeaToGroup(state, { ideaId: a.id, groupId: "存在しないid" }), /id/);

  // 未分類（どのグループにも属さない）の付箋も、既存グループへ移せる
  const c = addIdea(state, { text: "C" });
  moveIdeaToGroup(state, { ideaId: c.id, groupId: groupY.id });
  assert.deepEqual(state.groups[0].ideaIds, [b.id, a.id, c.id]);
});

test("deleteIdea: 子は親につなぎ直され、グループからも外れ、空になったグループは消える", () => {
  const state = { ideas: [], groups: [], nextOrder: 1 };
  const root = addIdea(state, { text: "ルート" });
  const middle = addIdea(state, { text: "中間", parentId: root.id });
  const leaf = addIdea(state, { text: "葉", parentId: middle.id });
  const other = addIdea(state, { text: "別枝" });
  groupIdeas(state, { ids: [middle.id, other.id], label: "混在グループ" });
  groupIdeas(state, { ids: [middle.id], label: "中間だけのグループ" });

  const deleted = deleteIdea(state, { id: middle.id });
  assert.equal(deleted.id, middle.id);
  assert.equal(state.ideas.find((i) => i.id === leaf.id).parentId, root.id, "子は削除された付箋の親につなぎ直される");
  assert.ok(!state.ideas.some((i) => i.id === middle.id), "削除された付箋自体は残らない");
  assert.equal(state.groups.length, 1, "空になったグループ（中間だけのグループ）は消える");
  assert.deepEqual(state.groups[0].ideaIds, [other.id], "混在グループからは外れるが、他のメンバーは残る");

  assert.throws(() => deleteIdea(state, { id: "存在しないid" }), /id/);
});

test("loadBoard: author の検証（既存データ = author なし、不正値も ai に正規化）", () => {
  const raw = JSON.stringify({
    ideas: [
      { id: "idea-1", text: "旧データ", parentId: null, order: 1 },
      { id: "idea-2", text: "不正な値", parentId: null, order: 2, author: "robot" },
      { id: "idea-3", text: "人", parentId: null, order: 3, author: "human" },
    ],
    groups: [],
    nextOrder: 4,
  });
  const state = loadBoard({ getItem: () => raw });
  assert.equal(state.ideas[0].author, "ai", "author が無い既存データは ai 扱い");
  assert.equal(state.ideas[1].author, "ai", "不正な author は ai 扱い");
  assert.equal(state.ideas[2].author, "human", "human はそのまま保持される");
});

test("loadBoard: editedByHuman は真偽値だけ通す（壊れた値・欠損は false 扱い）", () => {
  const raw = JSON.stringify({
    ideas: [
      { id: "idea-1", text: "x", parentId: null, order: 1, author: "ai", editedByHuman: true },
      { id: "idea-2", text: "y", parentId: null, order: 2, author: "ai", editedByHuman: "yes" },
      { id: "idea-3", text: "z", parentId: null, order: 3, author: "ai" },
    ],
    groups: [],
    nextOrder: 4,
  });
  const state = loadBoard({ getItem: () => raw });
  assert.equal(state.ideas[0].editedByHuman, true, "true はそのまま保持される");
  assert.equal(state.ideas[1].editedByHuman, false, "真偽値でない値は false 扱い");
  assert.equal(state.ideas[2].editedByHuman, false, "欠損は false 扱い");
});

test("削除の取り消し: 削除前の状態を複製しておけば saveBoard で完全に復元できる", () => {
  // App.jsx の undo はこの土台（structuredClone → 削除 → 復元したければ saveBoard し直す）の上に乗っている
  const storage = makeStorageMock();
  const state = loadBoard(storage);
  const a = addIdea(state, { text: "A" });
  const b = addIdea(state, { text: "B", parentId: a.id });
  saveBoard(storage, state);

  const current = loadBoard(storage);
  const before = structuredClone(current);
  deleteIdea(current, { id: a.id });
  saveBoard(storage, current);
  assert.equal(loadBoard(storage).ideas.length, 1, "削除直後は1件になる");

  saveBoard(storage, before); // 元に戻す
  const restored = loadBoard(storage);
  assert.equal(restored.ideas.length, 2, "元に戻すと削除前の件数に戻る");
  assert.deepEqual(
    restored.ideas.map((i) => i.id).sort(),
    [a.id, b.id].sort(),
    "id も削除前と一致する",
  );
});

test("exportBoard: format/version/exportedAt でラップする（書き出しボタン用）", () => {
  const state = { ideas: [], groups: [], nextOrder: 1 };
  const idea = addIdea(state, { text: "エクスポート対象" });
  const now = new Date("2026-09-26T12:34:00Z");
  const exported = exportBoard(state, now);
  assert.equal(exported.format, "brainstorm-board");
  assert.equal(exported.version, 1);
  assert.equal(exported.exportedAt, "2026-09-26T12:34:00.000Z");
  assert.deepEqual(exported.board, state);
  assert.equal(exported.board.ideas[0].id, idea.id);
});

test("parseBoard: 正しいデータ（format 付き・素の board 両方）を受け付ける（読み込みボタン用）", () => {
  const state = { ideas: [], groups: [], nextOrder: 1 };
  addIdea(state, { text: "元アイデア", author: "human" });
  const exported = exportBoard(state, new Date());

  const parsedWithFormat = parseBoard(exported);
  assert.equal(parsedWithFormat.ideas.length, 1);
  assert.equal(parsedWithFormat.ideas[0].author, "human");

  // format なしの素の board オブジェクト（他所で作った board.json 相当）もそのまま受け付ける
  const parsedBare = parseBoard(state);
  assert.equal(parsedBare.ideas.length, 1);
  assert.equal(parsedBare.nextOrder, state.nextOrder);
});

test("parseBoard: 壊れたデータ／未対応 format は理由付きで拒否する", () => {
  assert.throws(() => parseBoard(null), /board の形式/);
  assert.throws(() => parseBoard("文字列"), /board の形式/);
  assert.throws(() => parseBoard({ ideas: "x", groups: [], nextOrder: 1 }), /board の形式/, "ideas が配列でない");
  assert.throws(() => parseBoard({ ideas: [], groups: 1, nextOrder: 1 }), /board の形式/, "groups が配列でない");
  assert.throws(
    () => parseBoard({ format: "other-format", board: { ideas: [], groups: [] } }),
    /未対応の format/,
  );
});

test("clearBoard: 付箋・グループを丸ごと消す（ヘッダー「⋯」の「すべて消す」）", () => {
  const state = { ideas: [], groups: [], nextOrder: 1 };
  const a = addIdea(state, { text: "A" });
  addIdea(state, { text: "B" });
  groupIdeas(state, { ids: [a.id], label: "グループ" });
  clearBoard(state);
  assert.deepEqual(state.ideas, []);
  assert.deepEqual(state.groups, []);
  assert.deepEqual(state.unclassifiedOrder, []);
});

test("getUnclassifiedIdeas / reorderIdea: 未分類列・グループ内の並び替え", () => {
  const state = { ideas: [], groups: [], nextOrder: 1 };
  const a = addIdea(state, { text: "A" });
  const b = addIdea(state, { text: "B" });
  const c = addIdea(state, { text: "C" });

  // 未分類は保存順が無ければ発言順（order）のまま
  assert.deepEqual(getUnclassifiedIdeas(state).map((i) => i.id), [a.id, b.id, c.id]);

  // c を a の直前へ（末尾から先頭付近へ移動）
  reorderIdea(state, { ideaId: c.id, groupId: null, beforeId: a.id });
  assert.deepEqual(getUnclassifiedIdeas(state).map((i) => i.id), [c.id, a.id, b.id]);

  // beforeId 省略（末尾へ）
  reorderIdea(state, { ideaId: c.id, groupId: null, beforeId: null });
  assert.deepEqual(getUnclassifiedIdeas(state).map((i) => i.id), [a.id, b.id, c.id]);

  // グループ内の並び替え
  const group = groupIdeas(state, { ids: [a.id, b.id, c.id], label: "G" });
  reorderIdea(state, { ideaId: c.id, groupId: group.id, beforeId: a.id });
  assert.deepEqual(group.ideaIds, [c.id, a.id, b.id]);

  // 属していない列を指定するとエラー
  assert.throws(() => reorderIdea(state, { ideaId: a.id, groupId: null, beforeId: null }), /未分類ではありません/);
  assert.throws(() => reorderIdea(state, { ideaId: "存在しないid", groupId: group.id }), /id/);
  assert.throws(() => reorderIdea(state, { ideaId: c.id, groupId: "存在しないid" }), /id/);
});

test("moveIdeaToGroup / removeIdeaFromGroup の beforeId: 列をまたぐ移動でも挿入位置を指定できる", () => {
  const state = { ideas: [], groups: [], nextOrder: 1 };
  const a = addIdea(state, { text: "A" });
  const b = addIdea(state, { text: "B" });
  const c = addIdea(state, { text: "C" });
  const group = groupIdeas(state, { ids: [a.id, b.id], label: "G" });

  // 未分類の c をグループの a・b の間へ
  moveIdeaToGroup(state, { ideaId: c.id, groupId: group.id, beforeId: b.id });
  assert.deepEqual(group.ideaIds, [a.id, c.id, b.id]);

  // グループから外すと未分類に戻る（a・b はまだグループに残っているので未分類は c だけ）
  removeIdeaFromGroup(state, { ideaId: c.id });
  assert.deepEqual(getUnclassifiedIdeas(state).map((i) => i.id), [c.id]);

  // 別の付箋を外すときの beforeId は、その時点の未分類列の中での挿入位置
  removeIdeaFromGroup(state, { ideaId: a.id, beforeId: c.id });
  assert.deepEqual(getUnclassifiedIdeas(state).map((i) => i.id), [a.id, c.id]);
});

test("未分類の並び順（unclassifiedOrder）は古いJSON（フィールドが無い）でも壊れない", () => {
  const raw = JSON.stringify({
    ideas: [
      { id: "idea-1", text: "旧A", parentId: null, order: 1, author: "ai" },
      { id: "idea-2", text: "旧B", parentId: null, order: 2, author: "ai" },
    ],
    groups: [],
    nextOrder: 3,
    // unclassifiedOrder フィールド自体が無い
  });
  const state = loadBoard({ getItem: () => raw });
  assert.deepEqual(state.unclassifiedOrder, [], "無ければ空配列に正規化される");
  assert.deepEqual(
    getUnclassifiedIdeas(state).map((i) => i.id),
    ["idea-1", "idea-2"],
    "保存順が無くても発言順（order）で表示できる",
  );
  // この状態からでも並び替えが正しく効く
  reorderIdea(state, { ideaId: "idea-2", groupId: null, beforeId: "idea-1" });
  assert.deepEqual(getUnclassifiedIdeas(state).map((i) => i.id), ["idea-2", "idea-1"]);
});

// ensureModelContext: document / navigator の有無で3通りを確かめる
test("ensureModelContext: document.modelContext があれば native", async () => {
  const saved = { document: globalThis.document, navigator: globalThis.navigator };
  try {
    globalThis.document = { modelContext: {} };
    Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
    assert.equal(await ensureModelContext(), "native");
  } finally {
    globalThis.document = saved.document;
    Object.defineProperty(globalThis, "navigator", { value: saved.navigator, configurable: true });
  }
});

test("ensureModelContext: navigator.modelContext だけなら native にして document へ別名を付ける", async () => {
  const saved = { document: globalThis.document, navigator: globalThis.navigator };
  try {
    const mc = {};
    globalThis.document = {};
    Object.defineProperty(globalThis, "navigator", { value: { modelContext: mc }, configurable: true });
    assert.equal(await ensureModelContext(), "native");
    assert.equal(globalThis.document.modelContext, mc, "document.modelContext が同じオブジェクトになる");
  } finally {
    globalThis.document = saved.document;
    Object.defineProperty(globalThis, "navigator", { value: saved.navigator, configurable: true });
  }
});

test("ensureModelContext: どちらも無ければ unsupported", async () => {
  const saved = { document: globalThis.document, navigator: globalThis.navigator };
  try {
    globalThis.document = {};
    Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
    assert.equal(await ensureModelContext(), "unsupported");
  } finally {
    globalThis.document = saved.document;
    Object.defineProperty(globalThis, "navigator", { value: saved.navigator, configurable: true });
  }
});
