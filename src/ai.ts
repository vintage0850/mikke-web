import type { ActionCategory } from "./types";

const MODEL = "gemini-2.0-flash";
const ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const CATEGORIES: ActionCategory[] = [
  "COMPARE",
  "RESEARCH",
  "ANALYZE",
  "ASK",
  "TRY",
  "CREATE",
  "IMPROVE",
  "DECIDE",
  "AVOID",
  "REFLECT",
];

class AIError extends Error {}

async function callGemini(
  apiKey: string,
  prompt: string,
  schema: object,
): Promise<any> {
  const url = `${ENDPOINT_BASE}/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.4,
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AIError(`Gemini API error (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new AIError("Gemini API returned no content.");
  try {
    return JSON.parse(text);
  } catch {
    throw new AIError("Gemini API returned invalid JSON.");
  }
}

export interface ClassifyResult {
  primaryCategory: ActionCategory;
  secondaryCategory: ActionCategory | null;
  reflectionQuestion: string;
}

export async function classifyActionAndAskReflection(
  apiKey: string,
  topic: string,
  action: { description: string; reason: string; result: string },
  existingTags: string[],
): Promise<ClassifyResult> {
  const prompt = `あなたは高校生向けの自己理解アプリ「Mikke」のAIです。
ユーザーが最近迷っているトピック: 「${topic}」

ユーザーが記録した行動:
- 何をしたか: ${action.description}
- なぜそう思ったか: ${action.reason || "(未回答)"}
- やってみてどうだったか: ${action.result || "(未回答)"}

タスク1: この行動を次のカテゴリから分類してください（primary必須、secondaryは該当あれば）:
${CATEGORIES.join(", ")}

タスク2: この行動を振り返る短い質問を1つだけ日本語で生成してください。
制約:
- 一度に1つの質問のみ
- セラピー的・説教的な言い方をしない
- 診断的な言い方をしない（「あなたは〇〇な人です」等は禁止）
- 抽象的な内省ではなく、具体的な質問にする
- 高校生が自然に使う言葉で、短く
- 参考: 「比べるとき、一番気になった違いは何でしたか？」「その情報を見て『これは違う』と思ったポイントはありましたか？」

既に見つかっている観点タグ（参考、再利用してよい）: ${existingTags.join(", ") || "なし"}`;

  const schema = {
    type: "object",
    properties: {
      primaryCategory: { type: "string", enum: CATEGORIES },
      secondaryCategory: { type: "string", enum: [...CATEGORIES, "NONE"] },
      reflectionQuestion: { type: "string" },
    },
    required: ["primaryCategory", "secondaryCategory", "reflectionQuestion"],
  };

  const result = await callGemini(apiKey, prompt, schema);
  return {
    primaryCategory: result.primaryCategory,
    secondaryCategory:
      result.secondaryCategory === "NONE" ? null : result.secondaryCategory,
    reflectionQuestion: result.reflectionQuestion,
  };
}

export interface SignalResult {
  tag: string;
  description: string;
}

export async function extractSignal(
  apiKey: string,
  topic: string,
  action: { description: string; reason: string; result: string },
  reflection: { question: string; answer: string },
  existingTags: string[],
): Promise<SignalResult> {
  const prompt = `あなたは高校生向けの自己理解アプリ「Mikke」のAIです。
トピック: 「${topic}」

行動: ${action.description}
理由: ${action.reason || "(未回答)"}
結果: ${action.result || "(未回答)"}

振り返り質問: ${reflection.question}
振り返り回答: ${reflection.answer}

この行動と振り返り回答から、ユーザーが選ぶときに重視していそうな「観点」を1つだけ抽出してください。
- tag: 短い英語の snake_case キー（例: continuity, atmosphere_fit, cost_efficiency, peer_opinion）。
  既存タグと意味が同じならその既存タグを再利用してください: ${existingTags.join(", ") || "なし"}
- description: その観点を日本語1文で具体的に説明（例: "学校選びで、授業内容より学生の雰囲気を気にしている"）

ユーザーの発言から読み取れないことは創作しないでください。弱い手がかりでも、最も近いものを1つ選んでください。`;

  const schema = {
    type: "object",
    properties: {
      tag: { type: "string" },
      description: { type: "string" },
    },
    required: ["tag", "description"],
  };

  return await callGemini(apiKey, prompt, schema);
}

export interface InsightResult {
  statement: string;
  confidence: number;
}

export async function generateInsight(
  apiKey: string,
  topic: string,
  tag: string,
  evidenceDescriptions: string[],
): Promise<InsightResult> {
  const prompt = `あなたは高校生向けの自己理解アプリ「Mikke」のAIです。
トピック: 「${topic}」

ユーザーの複数の行動から、繰り返し観察された観点（タグ: ${tag}）:
${evidenceDescriptions.map((d, i) => `${i + 1}. ${d}`).join("\n")}

これらの具体的な証拠だけをもとに、ユーザーの「選ぶときの基準」についての仮説（Insight）を1文で生成してください。

絶対に守るルール:
- 断定しない。必ず「〜かもしれません」「〜のようにも見えます」のような仮説の言い方にする
- 心理診断的なラベルを使わない
- 「あなたは〇〇な人です」という言い方は禁止
- 一般論・当たり障りのない表現（例:「自分らしさを大切にしている」）は禁止。具体的な行動に基づいた、将来の選択に使えるレベルの具体性にする
- 上に挙げた具体的な証拠のみを根拠にする。証拠にないことを推測で足さない

confidence は 0.5〜0.9 の範囲で、証拠の数と一貫性に応じて設定してください。`;

  const schema = {
    type: "object",
    properties: {
      statement: { type: "string" },
      confidence: { type: "number" },
    },
    required: ["statement", "confidence"],
  };

  return await callGemini(apiKey, prompt, schema);
}
