# Tag Button for iPad

登録したタグをボタン（カード）で組み合わせてプロンプトを作り、コピーして Draw Things などに貼り付ける、iPad Safari 向けの Web アプリです。Chrome 拡張機能 [tag_button](https://github.com/azrakuc/tag_button) の iPad 版にあたります。

公開ページ：<https://azrakuc.github.io/ipad-tag-button/>

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

## プライバシーとセキュリティ

- 登録したデータは、この iPad の IndexedDB にだけ保存されます。どこにも送信しません（CSP で外部への通信を禁止しています）。
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

- ファイルを変更したら、[docs/sw.js](docs/sw.js) の `CACHE` の版（現在 `itb-v8`）を上げてください。上げないと、キャッシュ済みの古いファイルが使われ続けます。
- ファイルを追加したら、`sw.js` の `ASSETS` にも追加してください。

## 外部ライブラリ

- [SortableJS](https://github.com/SortableJS/Sortable) 1.15.6（MIT）：`vendor/Sortable.min.js`。npm の公式パッケージ（sortablejs@1.15.6）の `Sortable.min.js` と同じファイルです。
