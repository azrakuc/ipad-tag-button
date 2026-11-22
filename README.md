# Smart Tag Button

登録したタグをボタン（カード）で組み合わせてプロンプトを作り、コピーして Draw Things などに貼り付ける、iPad Safari 向けの Web アプリです。Chrome 拡張機能 [tag_button](https://github.com/azrakuc/tag_button) の iPad 版にあたります。

公開ページ：<https://azrakuc.github.io/smart-tag-button/>

## 使い方

1. iPad の Safari で上のページを開く。
2. 共有ボタン →「ホーム画面に追加」で追加し、ホーム画面のアイコンから開く（追加しないと、使わない期間が長いときに Safari にデータを消されることがあります）。
3. 「⚙ 管理」でカテゴリーとタグを登録する。元の拡張機能でエクスポートした JSON は「インポート」でそのまま読み込めます。
4. 作成画面でカードをタップするとタグが集まります。もう一度タップすると外れます。カードの長押しで内容を表示します。
5. 「コピー」を押して、Draw Things に貼り付ける。Split View で並べると便利です。

### プロンプトの切り出し（管理タブ）

長いプロンプトを貼り付けると、タグのチップに分かれます。使いたいチップをタップして名前を付け、「登録」を押すと、上のリストで選択中のグループにタグとして追加されます。登録済みのタグに含まれるチップは薄く表示されます。

### 画像からプロンプトを取り出す（画像タブ）

Draw Things / A1111・Forge / ComfyUI / NovelAI で生成した画像（PNG・JPEG・WebP）を選ぶ（または Split View からドロップする）と、プロンプトを取り出します。コピー、作業欄への追加、「管理で切り出す」ができます。画像は iPad の中で読むだけで、送信も保存もしません。写真アプリを経由すると情報が消えることがあるため、「ファイル」アプリに保存した元の画像を選んでください。

- 使い方は、アプリの「説明」タブにも載せています（支援についても）。
- 表示は日本語と英語に対応しています。画面上部の「English」／「日本語」のボタンで切り替えられます（最初は端末の言語に合わせ、選んだ言語は端末に保存します）。

## プライバシーとセキュリティ

- 登録したデータ（カテゴリー・タグ・サムネイル・設定）と、読み込んだ画像・プロンプトは、この端末の中だけで扱います。どこにも送信しません。
- 使われているかを知るため、アクセス解析 [GoatCounter](https://www.goatcounter.com/)（`azrakuc.goatcounter.com`）を使っています。送るのは「ページを開いた」という情報（ページの URL、参照元、画面の大きさ、ブラウザの種類など）だけで、Cookie は使いません。CSP で、通信先は自分のサイトと GoatCounter だけに限っています。
- 画面上部の「☕ Ko-fi」は、押したときだけ外部のサイト（Ko-fi）を開くリンクです。画像などは読み込まないので、ページを開いただけでは Ko-fi に通信しません。
- 自分の端末を数えたくないときは、<https://azrakuc.github.io/smart-tag-button/#toggle-goatcounter> を一度開いてください（その端末では数えなくなります）。
- GitHub に置かれるのはアプリのファイルだけです。**エクスポートした JSON をこのリポジトリにコミットしないでください。**
- 詳しくは [SPEC.md](SPEC.md) の「9. セキュリティ」を参照。

## 開発

アプリ本体は `docs/` にあります（GitHub Pages は `main` ブランチの `/docs` を公開します）。

ビルドは不要です。ローカルで試すときは、`docs/` フォルダで簡易サーバーを起動します。

```text
cd docs
python -m http.server 8000
```

`http://localhost:8000/` で開けます（Service Worker は localhost でも動きます）。

- `docs/` のファイルを変更したら、`npm run bump` を実行してください。[docs/sw.js](docs/sw.js) のキャッシュ版（現在 `itb-v24`）が上がります。上げないと、iPhone / iPad でキャッシュ済みの古いファイルが使われ続けます。
- ファイルを追加したら、`sw.js` の `ASSETS` にも追加してください。

### テスト

```text
npm install      # 初回だけ（Playwright）。ブラウザが無ければ npx playwright install chromium
npm test         # すべて（単体テスト ＋ 画面のテスト）
npm run test:unit
npm run test:e2e
```

- `tests/unit/`：ブラウザを使わないテスト（画像のメタデータ、タグの分割と重複判定、データの検証とマージ、ランダム、Service Worker の版の上げ忘れ）。
- `tests/e2e/`：Playwright で画面を操作するテスト（作成・管理・画像・英語表示・画面の幅・CSP・データの保護）。
- `docs/` を変えたのに `npm run bump` をしていないと、`tests/unit/sw.test.mjs` が失敗して知らせます。

## 外部ライブラリ

- [SortableJS](https://github.com/SortableJS/Sortable) 1.15.6（MIT）：`vendor/Sortable.min.js`。npm の公式パッケージ（sortablejs@1.15.6）の `Sortable.min.js` と同じファイルです。
