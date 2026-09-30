# ブレストボード

WebMCP（`document.modelContext.registerTool`）でツールを公開する、ブレインストーミング用のボードアプリです。AI エージェントが `add_idea` / `get_board` / `group_ideas` を呼んでアイデアを出し、人が同じボードを操作しながらブレストできます。「発想」（マインドマップに着想を得た木構造）と「整理」（KJ法に着想を得たグループ表示）の2つの表示があります。ボードはブラウザの `localStorage`（キー: `brainstorm-board`）にだけ保存されます（サーバーには送りません）。

## 使い方

前提として、Chrome、Claude Code の CLI、Node.js が必要です。動作は2026年9月時点の Chrome 154 と chrome-devtools-mcp 1.10.1 で確かめました。

1. chrome-devtools-mcp を登録します。WebMCP のツール（`list_webmcp_tools` / `execute_webmcp_tool`）は実験的なカテゴリにあります。

```bash
claude mcp add chrome-devtools -- \
  npx chrome-devtools-mcp@latest \
  --categoryExperimentalWebmcp=true
```

2. Claude Code に「`Chrome を開いて`」と指示します。chrome-devtools-mcp が専用プロファイルで Chrome を起動します（聞き返されたら、そのまま次の手順へ進んでください）。
3. 起動したウィンドウのアドレス欄に、人が手で `chrome://flags` と入力し、`#enable-webmcp-testing` と `#devtools-webmcp-support` を Enabled にして Relaunch します（`chrome://` は AI のツールからは開けません）。
4. もう一度「`Chrome を開いて`」と指示すると、フラグが有効な状態で Chrome が起動し直します。

アプリは公開版（<https://ginshari.github.io/webmcp-brainstorm-board/>）か、手元の開発サーバーで開きます。

```bash
git clone https://github.com/ginshari/webmcp-brainstorm-board.git
cd webmcp-brainstorm-board
npm ci
npm run dev    # ターミナルに表示される Local の URL（既定: http://localhost:5173/）
```

`npm run dev` のターミナルは動かしたままにして、Claude Code は別のターミナルで起動してください。

5. Claude Code に「`chrome-devtools-mcp で（アプリの URL）を開いて`」と指示します。ヘッダーに「ブラウザ内蔵の WebMCP で、AI からツールを使えます」と出れば準備完了です。
6. 「ボードに書きながらブレストして」と指示すると、AI が `add_idea` を呼んで付箋が増えていきます。

### 注意点

- AI が操作する Chrome（chrome-devtools-mcp が起動する Chrome）は普段の Chrome と別プロファイルなので、フラグは手動で設定する必要があります（設定は専用プロファイルに残るので初回だけで済み、Relaunch するとウィンドウは閉じたままになります）。
- `list_webmcp_tools` が0件のときは、まず AI が操作する Chrome でアプリのページを開いているか確かめてください（ツールはページを開いているときだけ見えます）。
- ヘッダーに「ブラウザ内蔵の WebMCP が無効です（手動では操作できます）」と出る場合は、そのウィンドウにフラグが効いていません（人が操作することはできますが、AI からはツールが見えません）。
- ボードはブラウザ・プロファイル・URL（origin）ごとに別々です。AI が操作する Chrome で作ったボードは普段の Chrome では見えません。
- 公開版と手元の版の間でも共有されません（持ち運ぶにはヘッダーの「⋯」から JSON を書き出し・読み込みます）。
- この手順は chrome-devtools-mcp 1.10.1 で確かめています。挙動が違うときは、`@latest` を `@1.10.1` に置き換えて登録し直してください。

## 開発

```bash
npm run build    # 本番ビルド（dist/ に出力）
npm run preview  # ビルド結果をローカルで確認
npm run check    # 動作確認（node --test check.mjs）と oxlint
```

- `main` に push すると `.github/workflows/deploy.yml` がビルドして GitHub Pages に公開します（Pages のソースは「GitHub Actions」にしてください）。
- サブパスでも動きます（`vite.config.js` の `base: './'`）。公開するのは `dist/` です。
- 公開先の `ユーザー名.github.io` の下では、同じ origin の別ページからもこのボードの localStorage が読めます。

## 構成

- `src/tools.js` — WebMCP ツール定義（name / description / inputSchema / annotations / execute）
- `src/board.js` — ボードの状態管理（DOM に依存しない）
- `src/useBoardTools.js` — `use-webmcp-tool` 経由でツールを登録する React フック
- `src/modelContext.js` — `document.modelContext` / `navigator.modelContext` の検出
- `src/layout.js` — ノードの自動配置・「表示する深さ」の畳み込み
- `src/nodes.jsx` / `src/nodeTypes.js` — React Flow のカスタムノード
- `src/kanban.jsx` — 整理タブ（グループ表示）
- `src/App.jsx` — 画面全体
- `check.mjs` — 動作確認スクリプト

## License

MIT