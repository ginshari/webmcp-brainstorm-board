// 発想タブのノードの自動配置
// AI には位置を渡させず、深さ(x)と見た順(y)だけで並べる
// dagre 等は使わない単純実装（整理タブは React Flow を使わないのでここには無い）

import { buildTree } from "./board.js";

const COL_WIDTH = 260;
export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 60; // フォールバック値（テキストが無い/短い場合の最小高さとして使う）
const ROW_GAP = 30; // マインドマップでノード同士の間に必ず空ける余白

// ノード内の文字幅の概算（全角14px・半角8px）
// フォントが変われば要調整
const CHAR_WIDTH_WIDE = 14;
const CHAR_WIDTH_NARROW = 8;
const NODE_CONTENT_WIDTH = NODE_WIDTH - 24; // px-3 (左右12pxずつ) を引いた実効幅
const LINE_HEIGHT_MAIN = 20; // text-sm の行高さ
const NODE_PADDING_Y = 16; // py-2 (上下8pxずつ)

function estimatedTextWidth(text) {
  let width = 0;
  for (const ch of text) width += ch.charCodeAt(0) > 0x2000 ? CHAR_WIDTH_WIDE : CHAR_WIDTH_NARROW;
  return width;
}

function lineCount(text, containerWidth) {
  return Math.max(1, Math.ceil(estimatedTextWidth(text) / containerWidth));
}

// ノードの推定高さ
// 文字数概算はフォント・折り返しでずれるので、実測（heights）があればそちらを優先する
export function estimateNodeHeight(idea) {
  const mainLines = lineCount(`#${idea.order} ${idea.text}`, NODE_CONTENT_WIDTH);
  return Math.max(NODE_HEIGHT, NODE_PADDING_Y + mainLines * LINE_HEIGHT_MAIN);
}

function heightOf(idea, heights) {
  return heights?.get(idea.id) ?? estimateNodeHeight(idea);
}

// node 配下の子孫の数を数える（畳んだときの件数表示用）
function countDescendants(node) {
  let count = node.children.length;
  for (const child of node.children) count += countDescendants(child);
  return count;
}

// collapsedIds: 畳んだ付箋の id（画面だけの状態でボードには保存しない）
// 畳んだ付箋の子孫はレイアウト計算から除いて余白を詰める
export function layoutIdeas(state, heights, collapsedIds = new Set()) {
  const tree = buildTree(state);
  const positioned = [];
  let y = 0;

  function visit(node, depth) {
    const hasChildren = node.children.length > 0;
    const collapsed = hasChildren && collapsedIds.has(node.id);
    positioned.push({
      id: node.id,
      order: node.order,
      text: node.text,
      parentId: node.parentId,
      author: node.author,
      editedByHuman: node.editedByHuman,
      hasChildren,
      collapsed,
      descendantCount: hasChildren ? countDescendants(node) : 0,
      x: depth * COL_WIDTH,
      y,
    });
    y += heightOf(node, heights) + ROW_GAP;
    if (!collapsed) {
      for (const child of node.children) visit(child, depth + 1);
    }
  }
  for (const root of tree) visit(root, 0);

  return positioned;
}

// ヘッダーの「表示する深さ」用
// depth 段目まで開き、その境目（depth-1 段目）の子を畳む
// depth が数値でなければ「すべて」＝何も畳まない
// 戻り値はそのまま collapsedIds に渡せる
export function collapseIdsAtDepth(state, depth) {
  const ids = new Set();
  if (!Number.isFinite(depth)) return ids; // 「すべて」
  const boundary = Math.max(0, Math.floor(depth) - 1);
  const tree = buildTree(state);

  function visit(node, d) {
    if (d === boundary && node.children.length > 0) {
      ids.add(node.id);
      return; // 畳んだのでこの下は見ない
    }
    for (const child of node.children) visit(child, d + 1);
  }
  for (const root of tree) visit(root, 0);

  return ids;
}
