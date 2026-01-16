type RawAnswer = Record<string, any>;

export type QualitativeComputedAnswer = {
  questionId: number;
  categoryId: number;
  weight: number;
  responsePoints: number; // vem do frontend (ou fallback de parsing)
  score: number; // responsePoints * weight
  maxScore: number; // maxResponsePoints * weight
};

export type QualitativeCategoryRate = {
  categoryId: number;
  obtained: number;
  max: number;
  score: number; // percent 0..100
};

export type QualitativeTotals = {
  obtained: number;
  max: number;
  percent: number; // 0..100
};

export function parseResponsePoints(input: any): number {
  if (input === null || input === undefined) return 0;

  if (typeof input === "number") {
    if (input <= 0) return 0;
    if (input === 1) return 1;
    return 2;
  }

  if (typeof input === "boolean") return input ? 2 : 1;

  const s = String(input).trim().toLowerCase();
  if (s === "2" || s === "sim" || s === "s" || s === "yes" || s === "y")
    return 2;
  if (s === "1" || s === "nao" || s === "não" || s === "n" || s === "no")
    return 1;
  if (s === "0" || s === "n/a" || s === "na" || s === "não aplicável") return 0;
  return 0;
}

function toFiniteNumberOrNull(input: any): number | null {
  const n = typeof input === "number" ? input : Number(input);
  return Number.isFinite(n) ? n : null;
}

function getAnswerPoints(answer: RawAnswer | undefined): number | null {
  if (!answer) return null;

  // Explicit numeric points/weight coming from frontend
  const direct =
    (answer as any).responsePoints ??
    (answer as any).points ??
    (answer as any).peso ??
    (answer as any).pesoResposta ??
    (answer as any).answerPoints;

  const asNumber = toFiniteNumberOrNull(direct);
  if (asNumber !== null) return asNumber;

  return null;
}

function getQuestionMaxResponsePoints(
  question: {
    maxResponsePoints?: number;
    alternatives?: Array<{ weight?: number; peso?: number; points?: number }>;
    alternativas?: Array<{ weight?: number; peso?: number; points?: number }>;
    options?: Array<{ weight?: number; peso?: number; points?: number }>;
    opcoes?: Array<{ weight?: number; peso?: number; points?: number }>;
  },
  answer?: RawAnswer
): number {
  // 1. Tenta buscar das alternativas da pergunta (maior peso disponível)
  const alternatives =
    (question as any).alternatives ??
    (question as any).alternativas ??
    (question as any).options ??
    (question as any).opcoes;

  if (Array.isArray(alternatives) && alternatives.length > 0) {
    let maxWeight = -Infinity;
    for (const alt of alternatives) {
      const w = alt.weight ?? alt.peso ?? alt.points ?? alt.responsePoints ?? 0;
      const wNum = typeof w === "number" ? w : Number(w);
      if (Number.isFinite(wNum) && wNum > maxWeight) {
        maxWeight = wNum;
      }
    }
    if (maxWeight > -Infinity) return maxWeight;
  }

  // 2. Fallback: maxResponsePoints explícito na pergunta
  const fromQuestion = toFiniteNumberOrNull(
    (question as any).maxResponsePoints
  );
  if (fromQuestion !== null) return fromQuestion;

  // 3. Fallback: maxResponsePoints no answer
  const fromAnswer = toFiniteNumberOrNull(
    (answer as any)?.maxResponsePoints ?? (answer as any)?.maxPoints
  );
  if (fromAnswer !== null) return fromAnswer;

  throw new Error(
    "maxResponsePoints é obrigatório (defina alternativas na pergunta, maxResponsePoints no questionário ou envie no answer)."
  );
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeQualitativeScores(params: {
  questions: Array<{
    id: number;
    categoryId: number;
    weight: number;
    maxResponsePoints?: number;
    alternatives?: Array<{ weight?: number; peso?: number; points?: number }>;
    alternativas?: Array<{ weight?: number; peso?: number; points?: number }>;
    options?: Array<{ weight?: number; peso?: number; points?: number }>;
    opcoes?: Array<{ weight?: number; peso?: number; points?: number }>;
  }>;
  answers: RawAnswer[];
}): {
  normalizedAnswers: QualitativeComputedAnswer[];
  categories: QualitativeCategoryRate[];
  totals: QualitativeTotals;
} {
  const { questions, answers } = params;

  const answerByQuestionId = new Map<number, RawAnswer>();
  for (const a of Array.isArray(answers) ? answers : []) {
    const qid = Number((a as any).questionId ?? (a as any).id);
    if (Number.isFinite(qid)) answerByQuestionId.set(qid, a);
  }

  const normalizedAnswers: QualitativeComputedAnswer[] = [];
  const categoryAgg = new Map<number, { obtained: number; max: number }>();

  let totalObtained = 0;
  let totalMax = 0;

  for (const q of questions) {
    const weight = Number(q.weight ?? 1) || 1;

    const ans = answerByQuestionId.get(Number(q.id));
    const responsePoints = getAnswerPoints(ans);
    if (responsePoints === null) {
      throw new Error(
        `responsePoints é obrigatório para a pergunta ${Number(
          q.id
        )} (envie no payload do frontend).`
      );
    }
    const maxResponsePoints = getQuestionMaxResponsePoints(q, ans);
    const maxScore = maxResponsePoints * weight;
    const score = responsePoints * weight;

    const categoryId = Number(q.categoryId);

    // Mostrar alternativas disponíveis
    const alts = q.alternatives ?? q.alternativas ?? q.options ?? q.opcoes;

    normalizedAnswers.push({
      questionId: Number(q.id),
      categoryId,
      weight,
      responsePoints,
      score,
      maxScore,
    });

    totalObtained += score;
    totalMax += maxScore;

    const prev = categoryAgg.get(categoryId) ?? { obtained: 0, max: 0 };
    prev.obtained += score;
    prev.max += maxScore;
    categoryAgg.set(categoryId, prev);
  }

  const categories: QualitativeCategoryRate[] = Array.from(
    categoryAgg.entries()
  )
    .map(([categoryId, v]) => {
      const percent = v.max > 0 ? (v.obtained / v.max) * 100 : 0;
      return {
        categoryId,
        obtained: round2(v.obtained),
        max: round2(v.max),
        score: round2(percent),
      };
    })
    .sort((a, b) => a.categoryId - b.categoryId);

  const totals: QualitativeTotals = {
    obtained: round2(totalObtained),
    max: round2(totalMax),
    percent: round2(totalMax > 0 ? (totalObtained / totalMax) * 100 : 0),
  };

  return { normalizedAnswers, categories, totals };
}

export function computeCategoryRatesFromComputedAnswers(
  normalizedAnswers: QualitativeComputedAnswer[]
): { categories: QualitativeCategoryRate[]; totals: QualitativeTotals } {
  const categoryAgg = new Map<number, { obtained: number; max: number }>();
  let totalObtained = 0;
  let totalMax = 0;

  for (const a of Array.isArray(normalizedAnswers) ? normalizedAnswers : []) {
    const categoryId = Number((a as any).categoryId);
    const score =
      typeof (a as any).score === "number"
        ? (a as any).score
        : Number((a as any).score);
    const maxScore =
      typeof (a as any).maxScore === "number"
        ? (a as any).maxScore
        : Number((a as any).maxScore);

    if (
      !Number.isFinite(categoryId) ||
      !Number.isFinite(score) ||
      !Number.isFinite(maxScore)
    ) {
      throw new Error(
        "answers salvas não estão normalizadas (faltam score/maxScore/categoryId)."
      );
    }

    totalObtained += score;
    totalMax += maxScore;

    const prev = categoryAgg.get(categoryId) ?? { obtained: 0, max: 0 };
    prev.obtained += score;
    prev.max += maxScore;
    categoryAgg.set(categoryId, prev);
  }

  const categories: QualitativeCategoryRate[] = Array.from(
    categoryAgg.entries()
  )
    .map(([categoryId, v]) => {
      const percent = v.max > 0 ? (v.obtained / v.max) * 100 : 0;
      return {
        categoryId,
        obtained: round2(v.obtained),
        max: round2(v.max),
        score: round2(percent),
      };
    })
    .sort((a, b) => a.categoryId - b.categoryId);

  const totals: QualitativeTotals = {
    obtained: round2(totalObtained),
    max: round2(totalMax),
    percent: round2(totalMax > 0 ? (totalObtained / totalMax) * 100 : 0),
  };

  return { categories, totals };
}
