// AI／人の付箋の見た目で、発想タブの IdeaNode と整理タブの KanbanCard が共有する定数
// コンポーネント以外のエクスポートが混ざるファイルでは Fast Refresh が効かないため、定数のみをこのファイルに分ける
// band は左端の色帯で、人のほうを太くして色以外でも区別できるようにする
import { Bot, User } from "lucide-react";

export const AUTHOR_STYLE = {
  ai: { label: "AI", Icon: Bot, band: "border-l-4 border-l-ai", bandWidth: 4, badge: "bg-ai-soft text-ai-foreground" },
  human: { label: "人", Icon: User, band: "border-l-8 border-l-human", bandWidth: 8, badge: "bg-human-soft text-human-foreground" },
};
