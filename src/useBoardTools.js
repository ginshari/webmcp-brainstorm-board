// tools.js のツール定義を use-webmcp-tool 経由で登録する
// ツールは3つで固定なので、フックはループではなく1つずつ呼ぶ（React のフック規則）

import { useMemo } from "react";
import { useWebMCP } from "use-webmcp-tool";
import { createTools } from "./tools.js";

export function useBoardTools(storage, onChange) {
  const tools = useMemo(
    () => createTools(storage, onChange),
    [storage, onChange],
  );
  const byName = (n) => tools.find((t) => t.name === n);

  const addIdea = useWebMCP(byName("add_idea"));
  const getBoard = useWebMCP(byName("get_board"));
  const groupIdeas = useWebMCP(byName("group_ideas"));

  return { addIdea, getBoard, groupIdeas };
}
