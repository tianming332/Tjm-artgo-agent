<div align="center">

<img src="docs/images/artgo-logo.png" alt="Art GO" width="160" />

# Art GO Agent

**手元の AI コーディングアシスタントを、グラフィックデザイナーに。本物のレイヤーエディタで一層ずつ組み立て、編集可能な PSD を納品します。**

[English](README.md) · [简体中文](README.zh-CN.md) · 日本語

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Agents](https://img.shields.io/badge/Claude%20Code%20%7C%20Codex%20%7C%20Cursor%20%7C%20Copilot%20%7C%20Windsurf%20%7C%20Gemini%20CLI-supported-8A2BE2)
![Engine](https://img.shields.io/badge/engine-Rust%20%E2%86%92%20WASM-orange)

</div>

---

## ✨ 概要

多くの AI デザインツールが返すのは、統合済みの 1 枚の画像です。Art GO Agent は **エージェントのための制作ツール** です。依頼を受けた AI コーディングアシスタントが、人と同じツールでデザインを **一層ずつ** 組み立てます。使うツールは文字、シェイプ、選択範囲、マスク、調整レイヤー、フィルター、レイヤースタイルです。各ステップはレイヤーと履歴に残り、最後に編集可能な PSD と PNG が手元に残ります。

判断にはアシスタント自身のモデルを使うため、**追加の LLM キーは不要です**。キーが必要なのは画像素材を生成するときだけです。キーがなくても、手持ちの素材だけでデザインを完成できます。

## 🧭 しくみ

```
あなた ──依頼──▶ AI コーディングアシスタント（AGENTS.md を読む）
                     │  artgo start / artgo call / artgo finish
                     ▼
                 artgo ランタイム（ローカル・バックグラウンド）──▶ ヘッドレス Chrome 上の TJM エディタ
                     ▼
                 projects/<名前>/  依頼 · チェックポイント · プレビュー · document.psd · final.png
```

- **ワークフローの強制**：アシスタントは手順を飛ばせず、違反する呼び出しは拒否されます。
  - 編集の前に、依頼の分析・素材の確認・Skill の選択が必要です。
  - 読み込んだ Skill によって、使えるツールが限定されます。
  - 削除などの操作はユーザーの確認待ちになります。
  - 納品前に、最終キャンバス全体のプレビューを確認する必要があります。
- **結果が見える**：プレビューは実際のレンダリング結果で、PNG として保存されます。`artgo progress` で読み取り専用の進捗ページ、`artgo up --headed` でエディタ画面を表示できます。
- **参考**：[OpenMontage](https://github.com/calesthio/OpenMontage) の「コーディングアシスタント自身がオーケストレーター」という構成（AGENTS.md、パイプラインガイド、Skill、プロジェクトのチェックポイント）を参考にしています。OpenMontage のコードは使っていません。

## 🖼 エディタと作例

`artgo up --headed` で同じエディタを表示できます。以下はエージェントの作例です。

<img src="docs/images/ui-editor.png" alt="エディタ" width="860" />

| | | |
| :---: | :---: | :---: |
| <img src="docs/images/work-character-sheet.png" alt="キャラクター設定画" width="280" /><br><sub>キャラクター設定画</sub> | <img src="docs/images/work-product-photo.jpg" alt="商品広告写真" width="280" /><br><sub>商品広告写真</sub> | <img src="docs/images/work-brand-vis.png" alt="ブランドビジュアル" width="280" /><br><sub>ブランドビジュアル</sub> |

## 🚀 クイックスタート

Node 20 以上と Google Chrome が必要です。

```bash
git clone https://github.com/<you>/artgo-agent.git
cd artgo-agent
npm ci
```

このフォルダでアシスタントを開き、依頼するだけです。例：

> ~/Downloads/product.png を使って 1080×1350 の新商品ポスターを作って。タイトル「春の新作」、サブタイトル「全品 20% オフ」。

キーなしで試すときは `artgo up --mock` で起動します。画像生成だけがモックに置き換わり、それ以外の流れは同じです。画像生成に使うキーは、チャットに貼らずにご自身でターミナルから登録してください。

```bash
echo "$GEMINI_API_KEY" | node bin/artgo.mjs key add gemini     # openai / glm / qwen / doubao も可
```

キー、素材ライブラリ、設定はローカルの `.artgo/chrome/` にだけ保存されます。リクエストは各社の公式 API に直接送られ、中継サーバーは経由しません。API 料金はご自身のアカウントに請求されます。

## 🧩 できること

- ポスター／バナー：`pipelines/poster.md`
- フィードバックに沿った修正：`pipelines/revise.md`
- 文字エフェクト（12 種のプリセット、ワープ、立体文字）：`pipelines/text-effects.md`
- 選択範囲内の補正・切り抜き・削除・生成置換：`pipelines/region-edit.md`
- 1 枚の画像を編集可能なレイヤーに分解：`pipelines/decompose.md`

`node bin/artgo.mjs help` でコマンド一覧を表示します。`skills/` に Markdown を置くと独自の Skill を追加できます（形式は [`skills/README.md`](skills/README.md)）。

## 🧪 開発

```bash
npm test && npm run typecheck && npm run smoke:agent
```

ランタイムは `127.0.0.1` だけで待ち受けます。起動のたびにランダムなトークンを発行し、トークンのないリクエストは拒否します。

## 📄 ライセンスと商標

- **コード**：[Apache License 2.0](LICENSE)、Copyright 2026 TJM。
  - 商用を含め、無償で利用・改変・再配布できます。
  - LICENSE と [NOTICE](NOTICE) を残し、変更したファイルを明記してください。
  - 無保証です。
- **商標**：TJM の名称、`public/brand/` のロゴ、小文字の「tjm」ロゴタイプ、Art GO の名称とロゴ（`docs/images/artgo-logo.png`）はライセンスの対象外です（第 6 条）。フォークする場合は差し替えてください。
- **サードパーティ**：PhotoCraft（MIT または Apache-2.0）、vgpu、vgpu-optimized-black-hole、ag-psd、React、zustand、sql.js（MIT）。全文は [`third_party/`](third_party) にあります。
- **デザイン Skill の参考元**：一部の内蔵 Skill は MIT／Apache-2.0 プロジェクトの考え方を書き直したものです。[`third_party/design-skill-sources.md`](third_party/design-skill-sources.md) を参照。
- **フォント**：SIL Open Font License 1.1。
  - 作品での利用（商用・書き出しファイルへの埋め込みを含む）は自由です。
  - フォント単体の販売はできません。
- **作品と AI 生成物**：
  - 作品の権利はあなたに帰属します。
  - AI 生成物には、利用したサービスの規約も適用されます。
  - 取り込んだ素材の権利は、ご自身で確認してください。
