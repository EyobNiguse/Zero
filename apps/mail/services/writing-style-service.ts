import { mapToObj, pipe, entries, sortBy, take, fromEntries, sum, values, takeWhile } from 'remeda';
import { writingStyleMatrix } from '@zero/db/schema';
import { extractStyleMatrix } from '@/lib/ai';
import { eq } from 'drizzle-orm';
import { db } from '@zero/db';
import pRetry from 'p-retry';

// leaving these in here for testing between them
// (switching to `k` will surely truncate what `coverage` was keeping)
const TAKE_TOP_COVERAGE = 0.95;
const TAKE_TOP_K = 10;
const TAKE_TYPE: 'coverage' | 'k' = 'coverage';

// Using Welford Variance Algorithm (https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance)
// Welford’s online algorithm continuously updates the running mean and variance using just three
// numbers—sample count, current mean, and cumulative squared deviation (M₂). Therefore, each new value
// can be processed the moment it arrives, with no need to store earlier data, while maintaining high
// numerical accuracy.
const MEAN_METRIC_KEYS = [
  'averageSentenceLength', // average number of words in one sentence
  'averageLinesPerParagraph', // average number of lines in one paragraph
  'averageWordLength', // average number of characters per token
  'typeTokenRatio', // unique words divided by total words
  'movingAverageTtr', // MTLD lexical diversity metric
  'hapaxProportion', // share of words that occur exactly once
  'shannonEntropy', // entropy of unigram distribution
  'lexicalDensity', // content words divided by total words
  'contractionRate', // apostrophe contractions per 1 000 tokens
  'subordinationRatio', // subordinate clauses divided by total clauses
  'passiveVoiceRate', // passive sentences per 1 000 tokens
  'modalVerbRate', // modal verbs like can/could per 1 000 tokens
  'parseTreeDepthMean', // mean depth of constituency parse trees
  'commasPerSentence', // commas per sentence
  'exclamationPerThousandWords', // exclamation marks per 1 000 tokens
  'questionMarkRate', // question marks per 1 000 tokens
  'ellipsisRate', // ellipses (…) per 1 000 tokens
  'parenthesesRate', // parentheses per 1 000 tokens
  'emojiRate', // emoji characters per 1 000 tokens
  'sentimentPolarity', // polarity score −1 negative to 1 positive
  'sentimentSubjectivity', // subjectivity score 0 objective to 1 subjective
  'formalityScore', // formality 0 casual to 100 formal
  'hedgeRate', // hedging words like maybe per 1 000 tokens
  'certaintyRate', // certainty words like definitely per 1 000 tokens
  'fleschReadingEase', // flesch reading ease (higher easier)
  'gunningFogIndex', // gunning fog readability index
  'smogIndex', // smog readability index
  'averageForwardReferences', // forward references per sentence
  'cohesionIndex', // semantic cohesion 0–1
  'firstPersonSingularRate', // I/me/my per 1 000 tokens
  'firstPersonPluralRate', // we/our per 1 000 tokens
  'secondPersonRate', // you/your per 1 000 tokens
  'selfReferenceRatio', // first-person pronouns ÷ total pronouns
  'empathyPhraseRate', // phrases like "I understand" per 1 000 tokens
  'humorMarkerRate', // humour markers like :) per 1 000 tokens
  'markupBoldRate', // bold markers per 1 000 tokens
  'markupItalicRate', // italic markers per 1 000 tokens
  'hyperlinkRate', // hyperlinks per 1 000 tokens
  'codeBlockRate', // fenced code blocks per 1 000 tokens
  'rhetoricalQuestionRate', // rhetorical questions per 1 000 tokens
  'analogyRate', // analogies with like/as per 1 000 tokens
  'imperativeSentenceRate', // imperative sentences per 1 000 tokens
  'expletiveOpeningRate', // openings like "There is" per 1 000 tokens
  'parallelismRate', // parallel syntactic patterns per 1 000 tokens
] as const;

const SUM_METRIC_KEYS = [
  'tokenTotal', // total tokens in the body
  'charTotal', // total characters in the body
  'paragraphs', // number of paragraph blocks
  'bulletListPresent', // 1 if any bullet/numbered list present
  'greetingPresent', // 1 if greeting exists otherwise 0
  'signOffPresent', // 1 if sign-off exists otherwise 0
] as const;

const TOP_COUNTS_KEYS = [
  'greetingForm', // raw greeting phrase
  'signOffForm', // raw sign-off phrase
] as const;

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------
export const getWritingStyleMatrixForConnectionId = async (connectionId: string) => {
  return db.query.writingStyleMatrix.findFirst({
    where: (t, o) => o.eq(t.connectionId, connectionId),
    columns: { numMessages: true, style: true },
  });
};

export const updateWritingStyleMatrix = async (connectionId: string, emailBody: string) => {
  const emailMetrics = await extractStyleMatrix(emailBody);

  await pRetry(
    async () => {
      await db.transaction(async (tx) => {
        const [row] = await tx
          .select({ numMessages: writingStyleMatrix.numMessages, style: writingStyleMatrix.style })
          .from(writingStyleMatrix)
          .where(eq(writingStyleMatrix.connectionId, connectionId))
          .for('update');

        if (!row) {
          await tx.insert(writingStyleMatrix).values({
            connectionId,
            numMessages: 1,
            style: initMatrix(emailMetrics),
          });
          return;
        }

        await tx
          .update(writingStyleMatrix)
          .set({
            numMessages: row.numMessages + 1,
            style: mergeMatrix(row.style, emailMetrics),
          })
          .where(eq(writingStyleMatrix.connectionId, connectionId));
      });
    },
    { retries: 1 },
  );
};

// ---------------------------------------------------------------------------
// Merge logic
// ---------------------------------------------------------------------------
const mergeMatrix = (current: WritingStyleMatrix, email: EmailMatrix): WritingStyleMatrix => {
  const next: WritingStyleMatrix = { ...current };

  // update running means / variance
  for (const k of MEAN_METRIC_KEYS) {
    next[k] = welfordUpdate(current[k], email[k]);
  }

  // update simple sums
  for (const k of SUM_METRIC_KEYS) {
    (next as any)[k] = (current as any)[k] + (email as any)[k];
  }

  // update categorical frequency maps
  for (const k of TOP_COUNTS_KEYS) {
    const v = email[k];
    if (!v) continue;
    const map = { ...(next as any)[k] } as Record<string, number>;
    map[v] = (map[v] ?? 0) + 1;
    (next as any)[k] = TAKE_TYPE === 'coverage' ? topCoverage(map) : topK(map);
  }

  return next;
};

// ---------------------------------------------------------------------------
// Frequency-map pruning helpers
// ---------------------------------------------------------------------------
const topCoverage = (data: Record<string, number>, coverage = TAKE_TOP_COVERAGE) => {
  const total = pipe(data, values(), sum());
  if (!total) return {};
  let running = 0;
  return pipe(
    data,
    entries(),
    sortBy(([_, c]) => -c),
    takeWhile(([_, c]) => {
      running += c;
      return running / total <= coverage;
    }),
    fromEntries(),
  );
};

const topK = (data: Record<string, number>, k = TAKE_TOP_K) =>
  pipe(
    data,
    entries(),
    sortBy(([_, c]) => -c),
    take(k),
    fromEntries(),
  );

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------
const initMatrix = (email: EmailMatrix): WritingStyleMatrix =>
  ({
    ...mapToObj(MEAN_METRIC_KEYS, (k) => [k, welfordInit(email[k])]),
    ...mapToObj(SUM_METRIC_KEYS, (k) => [k, (email as any)[k]]),
    ...mapToObj(TOP_COUNTS_KEYS, (k) => [k, (email as any)[k] ? { [(email as any)[k]!]: 1 } : {}]),
  }) as WritingStyleMatrix;

// ---------------------------------------------------------------------------
// Welford utilities
// ---------------------------------------------------------------------------
const welfordUpdate = (prev: WelfordState, value: number): WelfordState => {
  const count = prev.count + 1;
  const delta = value - prev.mean;
  const mean = prev.mean + delta / count;
  const m2 = prev.m2 + delta * (value - mean);
  return { count, mean, m2 };
};

const welfordInit = (value: number): WelfordState => ({ count: 1, mean: value, m2: 0 });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type WelfordState = {
  count: number;
  mean: number;
  m2: number;
};

export type EmailMatrix = Record<(typeof MEAN_METRIC_KEYS)[number], number> &
  Record<(typeof SUM_METRIC_KEYS)[number], number> &
  Record<(typeof TOP_COUNTS_KEYS)[number], string | null>;

export type WritingStyleMatrix = Record<(typeof MEAN_METRIC_KEYS)[number], WelfordState> &
  Record<(typeof SUM_METRIC_KEYS)[number], number> &
  Record<(typeof TOP_COUNTS_KEYS)[number], Record<string, number>>;
