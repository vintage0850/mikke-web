import { useEffect, useState } from "react";
import type {
  ActionRecord,
  Insight,
  Likert,
  MikkeState,
  Reflection,
} from "./types";
import { loadState, saveState, newId } from "./storage";
import { classifyActionAndAskReflection, extractSignal, generateInsight } from "./ai";
import "./App.css";

type Screen =
  | "onboarding"
  | "apiKey"
  | "before"
  | "topic"
  | "action"
  | "reflection"
  | "insight"
  | "home"
  | "after";

const MIN_SIGNALS_FOR_EVIDENCE = 2;

export default function App() {
  const [state, setState] = useState<MikkeState>(() => loadState());
  const [screen, setScreen] = useState<Screen>("onboarding");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // pending items while walking the action -> reflection -> insight pipeline
  const [pendingAction, setPendingAction] = useState<ActionRecord | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string>("");
  const [pendingInsight, setPendingInsight] = useState<Insight | null>(null);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    if (state.onboardingDone && screen === "onboarding") {
      setScreen(state.apiKey ? (state.topic ? "home" : "before") : "apiKey");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(patch: Partial<MikkeState>) {
    setState((s) => ({ ...s, ...patch }));
  }

  // ---------- Onboarding ----------
  if (screen === "onboarding") {
    return (
      <Shell>
        <h1>自分の「選ぶ基準」を、行動からみっけよう。</h1>
        <p>
          Mikkeは、あなたの行動を振り返りながら、
          自分でも気づいていなかった「大事にしていること」を見つけるサービスです。
        </p>
        <button
          onClick={() => {
            update({ onboardingDone: true });
            setScreen("apiKey");
          }}
        >
          はじめる
        </button>
      </Shell>
    );
  }

  // ---------- API key setup ----------
  if (screen === "apiKey") {
    return (
      <Shell>
        <h2>Gemini APIキーを入力してください</h2>
        <p className="hint">
          このアプリはサーバーを持たないため、あなた専用のAPIキーをブラウザ内だけに保存して使います。
          Google AI Studio (aistudio.google.com) で無料で発行できます。
        </p>
        <ApiKeyForm
          onSubmit={(key) => {
            update({ apiKey: key });
            setScreen("before");
          }}
        />
      </Shell>
    );
  }

  // ---------- Before questionnaire ----------
  if (screen === "before") {
    return (
      <Shell>
        <h2>はじめる前に、3つ質問です</h2>
        <LikertForm
          questions={[
            "自分が何かを選ぶとき、何を大事にしているか説明できますか？",
            "進路や将来について迷ったとき、自分なりの判断基準がありますか？",
            "情報を調べても、決めきれないことがありますか？",
          ]}
          onSubmit={([b1, b2, b3]) => {
            update({
              before: { b1, b2, b3, answeredAt: new Date().toISOString() },
            });
            setScreen("topic");
          }}
        />
      </Shell>
    );
  }

  // ---------- Topic setup ----------
  if (screen === "topic" && !state.topic) {
    return (
      <Shell>
        <h2>最近、迷っていること・考えていることは？</h2>
        <TopicForm
          onSubmit={(topic, reason) => {
            update({
              topic: { id: newId(), topic, reason, createdAt: new Date().toISOString() },
            });
            setScreen("action");
          }}
        />
      </Shell>
    );
  }

  // ---------- Action input ----------
  if (screen === "action") {
    return (
      <Shell>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <h2>何をしましたか？</h2>
        <ActionForm
          busy={busy}
          onSubmit={async (description, reason, result) => {
            if (!state.apiKey || !state.topic) return;
            setBusy(true);
            setError(null);
            try {
              const existingTags = Array.from(new Set(state.signals.map((s) => s.tag)));
              const classified = await classifyActionAndAskReflection(
                state.apiKey,
                state.topic.topic,
                { description, reason, result },
                existingTags,
              );
              const action: ActionRecord = {
                id: newId(),
                topicId: state.topic.id,
                description,
                reason,
                result,
                primaryCategory: classified.primaryCategory,
                secondaryCategory: classified.secondaryCategory,
                createdAt: new Date().toISOString(),
              };
              update({ actions: [...state.actions, action] });
              setPendingAction(action);
              setPendingQuestion(classified.reflectionQuestion);
              setScreen("reflection");
            } catch (e) {
              setError(e instanceof Error ? e.message : "行動の分析に失敗しました。");
            } finally {
              setBusy(false);
            }
          }}
        />
        {state.actions.length > 0 && (
          <button className="ghost" onClick={() => setScreen("home")}>
            ホームに戻る
          </button>
        )}
      </Shell>
    );
  }

  // ---------- Reflection ----------
  if (screen === "reflection" && pendingAction) {
    return (
      <Shell>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <h2>{pendingQuestion}</h2>
        <ReflectionForm
          busy={busy}
          onSubmit={async (answer) => {
            if (!state.apiKey || !state.topic) return;
            setBusy(true);
            setError(null);
            try {
              const reflection: Reflection = {
                id: newId(),
                actionId: pendingAction.id,
                question: pendingQuestion,
                answer,
                createdAt: new Date().toISOString(),
              };

              const existingTags = Array.from(new Set(state.signals.map((s) => s.tag)));
              const sig = await extractSignal(
                state.apiKey,
                state.topic.topic,
                pendingAction,
                { question: pendingQuestion, answer },
                existingTags,
              );

              const signal = {
                id: newId(),
                actionId: pendingAction.id,
                reflectionId: reflection.id,
                tag: sig.tag,
                description: sig.description,
                sourceText: answer,
                createdAt: new Date().toISOString(),
              };

              const nextSignals = [...state.signals, signal];
              const matchingSignals = nextSignals.filter((s) => s.tag === signal.tag);

              let nextEvidence = state.evidence;
              let nextInsights = state.insights;
              let insightToShow: Insight | null = null;

              if (
                matchingSignals.length >= MIN_SIGNALS_FOR_EVIDENCE &&
                !state.rejectedInsightTags.includes(signal.tag) &&
                !state.insights.some((i) => i.status === "ACTIVE" && evidenceTagOf(i, state) === signal.tag)
              ) {
                const evidenceId = newId();
                const evidence = {
                  id: evidenceId,
                  tag: signal.tag,
                  signalIds: matchingSignals.map((s) => s.id),
                  summary: matchingSignals.map((s) => s.description).join(" / "),
                  createdAt: new Date().toISOString(),
                };
                nextEvidence = [...state.evidence, evidence];

                const gen = await generateInsight(
                  state.apiKey,
                  state.topic.topic,
                  signal.tag,
                  matchingSignals.map((s) => s.description),
                );

                const insight: Insight = {
                  id: newId(),
                  statement: gen.statement,
                  evidenceIds: [evidenceId],
                  confidence: gen.confidence,
                  status: "ACTIVE",
                  userValidation: null,
                  createdAt: new Date().toISOString(),
                };
                nextInsights = [...state.insights, insight];
                insightToShow = insight;
              }

              update({
                reflections: [...state.reflections, reflection],
                signals: nextSignals,
                evidence: nextEvidence,
                insights: nextInsights,
              });

              setPendingAction(null);
              setPendingQuestion("");

              if (insightToShow) {
                setPendingInsight(insightToShow);
                setScreen("insight");
              } else {
                setScreen("home");
              }
            } catch (e) {
              setError(e instanceof Error ? e.message : "振り返りの処理に失敗しました。");
            } finally {
              setBusy(false);
            }
          }}
        />
      </Shell>
    );
  }

  // ---------- Insight ----------
  if (screen === "insight" && pendingInsight) {
    const insight = pendingInsight;
    const evidence = state.evidence.find((e) => insight.evidenceIds.includes(e.id));
    return (
      <Shell>
        <h2 className="label">みっけたかも</h2>
        <p className="insight-statement">{insight.statement}</p>

        <h3 className="label">そう考えた理由</h3>
        <ul>
          {evidence?.signalIds.map((sid) => {
            const sig = state.signals.find((s) => s.id === sid);
            return sig ? <li key={sid}>{sig.description}</li> : null;
          })}
        </ul>

        <h3 className="label">確からしさ</h3>
        <p>{Math.round(insight.confidence * 100)}%</p>

        <div className="validation-buttons">
          {(
            [
              ["ACCURATE", "当てはまる"],
              ["PARTLY_ACCURATE", "少し当てはまる"],
              ["UNSURE", "わからない"],
              ["INACCURATE", "違う"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => {
                const updatedInsights = state.insights.map((i) =>
                  i.id === insight.id
                    ? { ...i, userValidation: value, status: value === "INACCURATE" ? ("REJECTED" as const) : i.status }
                    : i,
                );
                const rejectedTags =
                  value === "INACCURATE" && evidence
                    ? [...state.rejectedInsightTags, evidence.tag]
                    : state.rejectedInsightTags;
                update({ insights: updatedInsights, rejectedInsightTags: rejectedTags });
                setPendingInsight(null);
                setScreen("home");
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </Shell>
    );
  }

  // ---------- Home ----------
  if (screen === "home") {
    const activeInsight = [...state.insights].reverse().find((i) => i.status === "ACTIVE");
    return (
      <Shell>
        <h1>ホーム</h1>
        {activeInsight ? (
          <>
            <h2 className="label">今、見えていること</h2>
            <p className="insight-statement">{activeInsight.statement}</p>
            {activeInsight.userValidation === null && (
              <button
                onClick={() => {
                  setPendingInsight(activeInsight);
                  setScreen("insight");
                }}
              >
                この気づきを確認する
              </button>
            )}
          </>
        ) : (
          <p>まだ気づきは見つかっていません。行動を記録してみましょう。</p>
        )}

        <h2 className="label">最近の行動</h2>
        {state.actions.length === 0 ? (
          <p>まだ行動が記録されていません。</p>
        ) : (
          <ul>
            {[...state.actions].reverse().slice(0, 5).map((a) => (
              <li key={a.id}>{a.description}</li>
            ))}
          </ul>
        )}

        <div className="home-actions">
          <button onClick={() => setScreen("action")}>行動を記録する</button>
          {state.insights.length > 0 && (
            <button className="ghost" onClick={() => setScreen("after")}>
              振り返りアンケートに答える
            </button>
          )}
        </div>
      </Shell>
    );
  }

  // ---------- After questionnaire ----------
  if (screen === "after") {
    if (state.after) {
      return (
        <Shell>
          <h2>ありがとうございました</h2>
          <p>アンケートは回答済みです。引き続き行動を記録できます。</p>
          <button onClick={() => setScreen("home")}>ホームに戻る</button>
        </Shell>
      );
    }
    return (
      <Shell>
        <h2>最後に、4つ質問です</h2>
        <LikertForm
          questions={[
            "Mikkeを使う前より、自分が何を大事にしているか説明しやすくなりましたか？",
            "自分の判断基準について、新しい気づきがありましたか？",
            "表示された気づきは、自分の実際の行動に基づいていると感じましたか？",
            "今後、何かに迷ったときにこの気づきを使えそうですか？",
          ]}
          onSubmit={([a1, a2, a3, a4]) => setScreen2WithFreeText(a1, a2, a3, a4)}
        />
      </Shell>
    );
  }

  return <Shell>読み込み中...</Shell>;

  function setScreen2WithFreeText(a1: Likert, a2: Likert, a3: Likert, a4: Likert) {
    const freeText = window.prompt("Mikkeを使って気づいたことがあれば教えてください。（空欄でも可）") ?? "";
    update({
      after: { a1, a2, a3, a4, freeText, answeredAt: new Date().toISOString() },
    });
    setScreen("home");
  }
}

function evidenceTagOf(insight: Insight, state: MikkeState): string | undefined {
  const ev = state.evidence.find((e) => insight.evidenceIds.includes(e.id));
  return ev?.tag;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <div className="card">{children}</div>
    </div>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="error-banner">
      <span>{message}</span>
      <button onClick={onDismiss}>閉じる</button>
    </div>
  );
}

function ApiKeyForm({ onSubmit }: { onSubmit: (key: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <input
        type="password"
        placeholder="Gemini API Key"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit">保存して進む</button>
    </form>
  );
}

function LikertForm({
  questions,
  onSubmit,
}: {
  questions: string[];
  onSubmit: (answers: Likert[]) => void;
}) {
  const [answers, setAnswers] = useState<(Likert | null)[]>(questions.map(() => null));
  const allAnswered = answers.every((a) => a !== null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (allAnswered) onSubmit(answers as Likert[]);
      }}
    >
      {questions.map((q, idx) => (
        <div className="likert-question" key={idx}>
          <p>{q}</p>
          <div className="likert-scale">
            {([1, 2, 3, 4, 5] as Likert[]).map((v) => (
              <label key={v}>
                <input
                  type="radio"
                  name={`q${idx}`}
                  checked={answers[idx] === v}
                  onChange={() =>
                    setAnswers((prev) => prev.map((a, i) => (i === idx ? v : a)))
                  }
                />
                {v}
              </label>
            ))}
          </div>
        </div>
      ))}
      <button type="submit" disabled={!allAnswered}>
        次へ
      </button>
    </form>
  );
}

function TopicForm({ onSubmit }: { onSubmit: (topic: string, reason: string) => void }) {
  const [topic, setTopic] = useState("");
  const [reason, setReason] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (topic.trim()) onSubmit(topic.trim(), reason.trim());
      }}
    >
      <label>
        最近、迷っていること・考えていることは？
        <textarea value={topic} onChange={(e) => setTopic(e.target.value)} required />
      </label>
      <label>
        なぜそれについて考えていますか？（任意）
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button type="submit">次へ</button>
    </form>
  );
}

function ActionForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (description: string, reason: string, result: string) => void;
}) {
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (description.trim()) onSubmit(description.trim(), reason.trim(), result.trim());
      }}
    >
      <label>
        何をしましたか？
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="例: 大学の学部を3つ比較した"
          required
        />
      </label>
      <label>
        なぜそれをしようと思いましたか？（任意）
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <label>
        やってみてどうでしたか？（任意）
        <textarea value={result} onChange={(e) => setResult(e.target.value)} />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "分析中..." : "記録する"}
      </button>
    </form>
  );
}

function ReflectionForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (answer: string) => void;
}) {
  const [answer, setAnswer] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (answer.trim()) onSubmit(answer.trim());
      }}
    >
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="思ったことを自由に書いてください"
        required
      />
      <button type="submit" disabled={busy}>
        {busy ? "考え中..." : "送信する"}
      </button>
    </form>
  );
}
