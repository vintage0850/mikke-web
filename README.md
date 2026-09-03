# Mikke Web (MVP)

自分の「選ぶ基準」を、行動からみっけよう。

行動を記録 → AIが振り返り質問を生成 → 回答から観点(Signal)を抽出 →
同じ観点が2回以上出たらEvidenceとしてまとめ → Insight(仮説)を生成 →
ユーザーが確認/否定、という一連の流れを実装したものです。

## 特徴

- **サーバーなし。完全にブラウザだけで動きます。** GitHub Pages のような静的ホスティングに置くだけで動作します。
- AI呼び出しは Google Gemini API を**ブラウザから直接**叩きます。ユーザーが自分の Gemini APIキーを入力し、`localStorage` に保存します（他のどこにも送信されません）。
- すべてのデータ（行動・振り返り・Insightなど）は `localStorage` に保存されます。ブラウザ/端末をまたいだ同期はありません。

## ローカルで動かす

```bash
npm install
npm run dev
```

`http://localhost:5173` を開き、Gemini APIキー（[Google AI Studio](https://aistudio.google.com/apikey) で無料発行）を入力してください。

## GitHub Pages への配布

このフォルダ (`mikke-web`) をそのまま **単独のGitHubリポジトリ** として push してください。

1. `vite.config.ts` の `base: '/mikke-web/'` を、実際のリポジトリ名に合わせて変更する
   （リポジトリ名が `mikke-web` ならそのままでOK）
2. GitHub のリポジトリ設定 → Pages → Source を **GitHub Actions** に設定する
3. `main` ブランチに push すると `.github/workflows/deploy.yml` が自動でビルド・デプロイします
4. `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます

## スコープ（MVP）

含まれるもの: オンボーディング、事前アンケート、トピック設定、行動記録、AI振り返り質問、
Signal抽出、Evidence集約、Insight生成、Insight検証（当てはまる/少し当てはまる/わからない/違う）、
ホーム画面、事後アンケート。

含まれないもの（将来対応）: 心理質問紙、Insight履歴、進捗の可視化、通知、複数端末同期。
