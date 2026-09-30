// document.modelContext / navigator.modelContext があるかどうかを見て、画面表示用の状態を返す
// 戻り値: "native" | "unsupported"

export async function ensureModelContext() {
  if (typeof document === "undefined") return "unsupported";
  if (document.modelContext) return "native";
  if (navigator.modelContext) {
    // use-webmcp-tool は document.modelContext しか見ないので、navigator にしか無い版（Chrome 151 以前）は別名を付ける
    Object.defineProperty(document, "modelContext", { value: navigator.modelContext, configurable: true });
    return "native";
  }
  return "unsupported";
}
