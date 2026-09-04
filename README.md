# Mikke Web (MVP)

自分の「選ぶ基準」を、行動からみっけよう。

行動を記録 → AIが振り返り質問を生成 → 回答から観点(Signal)を抽出 →
同じ観点が2回以上出たらEvidenceとしてまとめ → Insight(仮説)を生成 →
ユーザーが確認/否定、という一連の流れを実装したものです。

## 特徴

- **フロントエンドはサーバーなし。** GitHub Pages のような静的ホスティングに置くだけで動作します。
- AI呼び出しは、あなたが立てる**軽量プロキシ (Cloudflare Worker)** 経由で Gemini API を叩きます。Geminiの本物のAPIキーはWorker側だけに置かれ、ブラウザには一切渡りません。
- デモ利用者は共通の**アクセスコード**（あなたが決めるパスフレーズ）を入力するだけで使えます。コードは各自の `localStorage` に保存され、他へは送信されません。
- すべての行動データ（行動・振り返り・Insightなど）はブラウザの `localStorage` に保存されます。端末をまたいだ同期はありません。

## 配布用プロキシ (Cloudflare Worker) のデプロイ

Gemini APIキーをあなたの手元に置いたまま、他人にアプリを使わせるための仕組みです。無料枠で足ります。

```bash
cd worker
npm install -g wrangler   # 初回のみ
wrangler login
wrangler secret put GEMINI_API_KEY   # あなたのGemini APIキーを入力
wrangler secret put ACCESS_CODE      # デモ利用者に伝える合言葉を決めて入力
wrangler deploy
```

デプロイ後に表示される URL（例: `https://mikke-proxy.your-subdomain.workers.dev`）を
`src/config.ts` の `WORKER_URL` に貼り付けてください。

## ローカルで動かす

```bash
npm install
npm run dev
```

`http://localhost:5173` を開き、アクセスコード（上でWorkerに設定したもの）を入力してください。

## GitHub Pages への配布

このフォルダ (`mikke-web`) をそのまま **単独のGitHubリポジトリ** として push してください（`worker/` フォルダも含めて構いません。Cloudflareへは別途 `wrangler deploy` で配布するため、GitHub Pages上には公開されません）。

1. `src/config.ts` の `WORKER_URL` を、実際にデプロイしたWorkerのURLに変更する
2. `vite.config.ts` の `base: '/mikke-web/'` を、実際のリポジトリ名に合わせて変更する
   （リポジトリ名が `mikke-web` ならそのままでOK）
3. GitHub のリポジトリ設定 → Pages → Source を **GitHub Actions** に設定する
4. `master` ブランチに push すると `.github/workflows/deploy.yml` が自動でビルド・デプロイします
5. `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます
6. デモ利用者にはURLとアクセスコードを伝えてください

## スコープ（MVP）

含まれるもの: オンボーディング、事前アンケート、トピック設定、行動記録、AI振り返り質問、
Signal抽出、Evidence集約、Insight生成、Insight検証（当てはまる/少し当てはまる/わからない/違う）、
ホーム画面、事後アンケート。

含まれないもの（将来対応）: 心理質問紙、Insight履歴、進捗の可視化、通知、複数端末同期。
