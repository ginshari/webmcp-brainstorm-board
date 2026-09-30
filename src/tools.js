// WebMCP ツール定義
// name / description / inputSchema / annotations / execute をここにまとめる

import { loadBoard, saveBoard, addIdea, getBoardSummary, groupIdeas } from "./board.js";

export function createTools(storage, onChange) {
  const notify = onChange ?? (() => {});
  return [
    {
      name: "add_idea",
      description:
        "ブレストのボードにアイデアを1つ書き込む。会話で新しいアイデアや論点が出たら呼ぶ。" +
        "最初のお題は parentId なしで書く。それ以外は必ず、元になったアイデアの id を parentId に指定する。" +
        "新しい話題になったら、その話題の元のアイデアの下に書き、前の話題に戻ったらそちらに続けて書く。",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "アイデアの内容",
          },
          parentId: {
            type: "string",
            description:
              "元になったアイデアの id（get_board で確認する）。最初のお題だけ省略する",
          },
        },
        required: ["text"],
      },
      execute: ({ text, parentId }) => {
        const state = loadBoard(storage);
        let idea;
        try {
          idea = addIdea(state, {
            text,
            parentId,
            author: "ai",
          });
        } catch (e) {
          return { error: e.message };
        }
        saveBoard(storage, state);
        notify();
        return idea;
      },
    },
    {
      name: "get_board",
      description:
        "ボードの現在の状態（アイデアの id・親子関係・発言順の番号・書いたのが人か AI か・グループ）を返す。" +
        "人が画面で書き足したり消したりした分も含む。どこに続けて書くか決めるときや、話を振り返るときに使う。",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => {
        const state = loadBoard(storage);
        return getBoardSummary(state);
      },
    },
    {
      name: "group_ideas",
      description:
        "似ているアイデアを KJ法（親和図法）の要領で1つのグループにまとめ、中身を表す見出しを付ける。" +
        "発散が一段落したときや、ユーザーが整理を求めたときに使う。元のアイデアが違っても、内容が近ければ同じグループにしてよい。",
      inputSchema: {
        type: "object",
        properties: {
          ids: { type: "array", items: { type: "string" }, description: "グループにするアイデアの id" },
          label: { type: "string", description: "グループの名前" },
        },
        required: ["ids", "label"],
      },
      execute: ({ ids, label }) => {
        const state = loadBoard(storage);
        let group;
        try {
          group = groupIdeas(state, { ids, label });
        } catch (e) {
          return { error: e.message };
        }
        saveBoard(storage, state);
        notify();
        return group;
      },
    },
  ];
}

// modelContext（document.modelContext ?? navigator.modelContext）に全ツールを登録する
export async function registerTools(modelContext, storage, onChange) {
  for (const tool of createTools(storage, onChange)) {
    await modelContext.registerTool(tool);
  }
}
