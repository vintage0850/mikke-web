// Core domain types for Mikke Web MVP.
// Everything is persisted client-side (localStorage) — no backend.

export type Likert = 1 | 2 | 3 | 4 | 5;

export interface BeforeQuestionnaire {
  b1: Likert;
  b2: Likert;
  b3: Likert;
  answeredAt: string;
}

export interface AfterQuestionnaire {
  a1: Likert;
  a2: Likert;
  a3: Likert;
  a4: Likert;
  freeText: string;
  answeredAt: string;
}

export type ActionCategory =
  | "COMPARE"
  | "RESEARCH"
  | "ANALYZE"
  | "ASK"
  | "TRY"
  | "CREATE"
  | "IMPROVE"
  | "DECIDE"
  | "AVOID"
  | "REFLECT";

export interface Topic {
  id: string;
  topic: string;
  reason: string;
  createdAt: string;
}

export interface ActionRecord {
  id: string;
  topicId: string;
  description: string;
  reason: string;
  result: string;
  primaryCategory: ActionCategory;
  secondaryCategory: ActionCategory | null;
  createdAt: string;
}

export interface Reflection {
  id: string;
  actionId: string;
  question: string;
  answer: string;
  createdAt: string;
}

export interface Signal {
  id: string;
  actionId: string;
  reflectionId: string;
  tag: string; // short normalized criterion key, e.g. "continuity", "atmosphere"
  description: string; // human readable observation
  sourceText: string;
  createdAt: string;
}

export interface Evidence {
  id: string;
  tag: string;
  signalIds: string[];
  summary: string;
  createdAt: string;
}

export type InsightValidation = "ACCURATE" | "PARTLY_ACCURATE" | "UNSURE" | "INACCURATE";

export interface Insight {
  id: string;
  statement: string;
  evidenceIds: string[];
  confidence: number; // 0-1, heuristic
  status: "ACTIVE" | "REJECTED";
  userValidation: InsightValidation | null;
  createdAt: string;
}

export interface MikkeState {
  accessCode: string | null;
  onboardingDone: boolean;
  before: BeforeQuestionnaire | null;
  after: AfterQuestionnaire | null;
  topic: Topic | null;
  actions: ActionRecord[];
  reflections: Reflection[];
  signals: Signal[];
  evidence: Evidence[];
  insights: Insight[];
  rejectedInsightTags: string[]; // tags user has said "違う" to, don't re-propose
}

export const emptyState: MikkeState = {
  accessCode: null,
  onboardingDone: false,
  before: null,
  after: null,
  topic: null,
  actions: [],
  reflections: [],
  signals: [],
  evidence: [],
  insights: [],
  rejectedInsightTags: [],
};
