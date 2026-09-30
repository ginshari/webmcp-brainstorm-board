// React Flow の type -> コンポーネントの対応表
// 定数のみのため nodes.jsx とは別ファイルにする（Fast Refresh 対応）
import { IdeaNode } from "./nodes.jsx";

export const nodeTypes = { idea: IdeaNode };
