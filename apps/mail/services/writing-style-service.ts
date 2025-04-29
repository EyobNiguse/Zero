import { mapToObj, pipe, entries, sortBy, take, fromEntries, sum, values, takeWhile } from 'remeda';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { writingStyleMatrix } from '@zero/db/schema';
import { ChatGroq } from '@langchain/groq';
import { eq } from 'drizzle-orm';
import { db } from '@zero/db';
import pRetry from 'p-retry';
import { z } from 'zod';

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
  'avgSentenceLen', // average number of words in one sentence
  'avgParagraphLen', // average number of words in one paragraph
  'listUsageRatio', // fraction of lines that use bullets or numbers
  'passiveVoiceRatio', // fraction of sentences written in passive voice
  'sentimentScore', // overall feeling from −1 negative to 1 positive
  'politenessScore', // how often polite words like please appear
  'confidenceScore', // how strongly the writer sounds sure of themself
  'urgencyScore', // how urgent or time-sensitive the wording is
  'empathyScore', // how much care or concern is shown for others
  'formalityScore', // how formal versus casual the language is
  'hedgingRatio', // share of softeners like maybe or might per sentence
  'intensifierRatio', // share of strong words like very or extremely per sentence
  'readabilityFlesch', // flesch reading ease score higher means simpler to read (https://en.wikipedia.org/wiki/Flesch%E2%80%93Kincaid_readability_tests)
  'lexicalDiversity', // unique words divided by total words
  'jargonRatio', // fraction of technical or buzzword terms
  'exclamationFreq', // exclamation marks per 100 words
  'slangRatio', // fraction of slang words like vibe or wanna
  'contractionRatio', // fraction of words that use apostrophe contractions
  'lowercaseSentenceStartRatio', // fraction of sentences that begin with a lowercase letter
  'emojiDensity', // emoji characters per 100 words in the body
  'casualPunctuationRatio', // share of informal punctuation like "!!" or "?!"
  'capConsistencyScore', // fraction of sentences that start with a capital letter
  'phaticPhraseRatio', // share of small-talk phrases like "hope you are well"
] as const;

const SUM_METRIC_KEYS = [
  'questionCount', // total question marks in the body
  'ctaCount', // number of direct requests for action
  'emojiCount', // total emoji characters in the body
  'honorificPresence', // 1 if titles like "mr" or "dr" appear otherwise 0
  'greetingTotal', // total number of greetings
  'signOffTotal', // total number of sign offs
] as const;

const TOP_COUNTS_KEYS = ['greeting', 'signOff'] as const;

export const getWritingStyleMatrixForConnectionId = async (connectionId: string) => {
  return await db.query.writingStyleMatrix.findFirst({
    where: (table, ops) => {
      return ops.eq(table.connectionId, connectionId);
    },
    columns: {
      numMessages: true,
      style: true,
    },
  });
};

export const updateWritingStyleMatrix = async (connectionId: string, emailBody: string) => {
  const emailStyleMatrix = await extractStyleMatrix(emailBody);

  await pRetry(
    async () => {
      await db.transaction(async (tx) => {
        const [existingMatrix] = await tx
          .select({
            numMessages: writingStyleMatrix.numMessages,
            style: writingStyleMatrix.style,
          })
          .from(writingStyleMatrix)
          .where(eq(writingStyleMatrix.connectionId, connectionId))
          .for('update');

        if (!existingMatrix) {
          const newStyle = initializeStyleMatrixFromEmail(emailStyleMatrix);

          await tx.insert(writingStyleMatrix).values({
            connectionId,
            numMessages: 1,
            style: newStyle,
          });
        } else {
          const newStyle = createUpdatedMatrixFromNewEmail(
            existingMatrix.numMessages,
            existingMatrix.style,
            emailStyleMatrix,
          );

          await tx
            .update(writingStyleMatrix)
            .set({
              numMessages: existingMatrix.numMessages + 1,
              style: newStyle,
            })
            .where(eq(writingStyleMatrix.connectionId, connectionId));
        }
      });
    },
    {
      retries: 1,
    },
  );
};

const createUpdatedMatrixFromNewEmail = (
  numMessages: number,
  currentStyleMatrix: WritingStyleMatrix,
  emailStyleMatrix: EmailMatrix,
) => {
  const newStyle = {
    ...currentStyleMatrix,
  };

  for (const key of MEAN_METRIC_KEYS) {
    newStyle[key] = updateWelfordMetric(currentStyleMatrix[key], emailStyleMatrix[key]);
  }

  for (const key of SUM_METRIC_KEYS) {
    newStyle[key] = currentStyleMatrix[key] + emailStyleMatrix[key];
  }

  for (const key of TOP_COUNTS_KEYS) {
    const emailValue = emailStyleMatrix[key];
    if (emailValue) {
      newStyle[key][emailValue] = (newStyle[key][emailValue] ?? 0) + 1;
      newStyle[key] =
        TAKE_TYPE === 'coverage' ? takeTopCoverage(newStyle[key]) : takeTopK(newStyle[key]);
    }
  }

  return newStyle;
};

const takeTopCoverage = (data: Record<string, number>, coverage = TAKE_TOP_COVERAGE) => {
  const total = pipe(data, values(), sum());

  if (total === 0) {
    return {};
  }

  let running = 0;

  return pipe(
    data,
    entries(),
    sortBy(([_, count]) => -count),
    takeWhile(([_, count]) => {
      running += count;

      return running / total < coverage;
    }),
    fromEntries(),
  );
};

const takeTopK = (data: Record<string, number>, k = TAKE_TOP_K) => {
  return pipe(
    data,
    entries(),
    sortBy(([_, count]) => -count),
    take(k),
    fromEntries(),
  );
};

const initializeStyleMatrixFromEmail = (matrix: EmailMatrix) => {
  const initializedWelfordMetrics = mapToObj(MEAN_METRIC_KEYS, (key) => {
    return [key, initializeWelfordMetric(matrix[key])];
  });

  const initializedSumMetrics = mapToObj(SUM_METRIC_KEYS, (key) => {
    return [key, matrix[key]];
  });

  const initializedTopCountMetrics = mapToObj(TOP_COUNTS_KEYS, (key) => {
    return [key, matrix[key] ? { [matrix[key]]: 1 } : {}];
  });

  return {
    ...initializedWelfordMetrics,
    ...initializedSumMetrics,
    ...initializedTopCountMetrics,
  };
};

const updateWelfordMetric = (previousState: WelfordState, value: number) => {
  const count = previousState.count + 1;
  const delta = value - previousState.mean;
  const mean = previousState.mean + delta / count;
  const m2 = previousState.m2 + delta * (value - mean);

  return {
    count,
    mean,
    m2,
  };
};

const initializeWelfordMetric = (statValue: number) => {
  return {
    count: 1,
    mean: statValue,
    m2: 0,
  };
};

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

const extractStyleMatrix = async (emailBody: string) => {
  if (!emailBody.trim()) {
    throw new Error('Invalid body provided.');
  }

  const schema = z.object({
    // greeting and sign-off may be absent
    greeting: z.string().nullable(),
    signOff: z.string().nullable(),

    // structural
    avgSentenceLen: z.number(),
    avgParagraphLen: z.number(),
    listUsageRatio: z.number().min(0).max(1),

    // tone
    sentimentScore: z.number().min(-1).max(1),
    politenessScore: z.number().min(0).max(1),
    confidenceScore: z.number().min(0).max(1),
    urgencyScore: z.number().min(0).max(1),
    empathyScore: z.number().min(0).max(1),
    formalityScore: z.number().min(0).max(1),

    // style ratios
    passiveVoiceRatio: z.number().min(0).max(1),
    hedgingRatio: z.number().min(0).max(1),
    intensifierRatio: z.number().min(0).max(1),

    // readability and vocabulary
    readabilityFlesch: z.number(),
    lexicalDiversity: z.number().min(0).max(1),
    jargonRatio: z.number().min(0).max(1),

    // engagement cues
    questionCount: z.number().int().nonnegative(),
    ctaCount: z.number().int().nonnegative(),
    emojiCount: z.number().int().nonnegative(),
    exclamationFreq: z.number(),

    // casual-vs-formal extensions
    slangRatio: z.number().min(0).max(1),
    contractionRatio: z.number().min(0).max(1),
    lowercaseSentenceStartRatio: z.number().min(0).max(1),
    emojiDensity: z.number().min(0),
    casualPunctuationRatio: z.number().min(0).max(1),
    capConsistencyScore: z.number().min(0).max(1),
    honorificPresence: z.number().int().min(0).max(1),
    phaticPhraseRatio: z.number().min(0).max(1),
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', StyleMatrixExtractorPrompt()],
    ['human', '{input}'],
  ]);
  const llm = new ChatGroq({
    model: 'llama-3.1-8b-instant',
    temperature: 0,
    maxTokens: 300,
    maxRetries: 5,
  }).bind({
    response_format: {
      type: 'json_object',
    },
  });

  const parser = new JsonOutputParser<z.infer<typeof schema>>();
  const chain = prompt.pipe(llm).pipe(parser);

  const result = await chain.invoke({
    input: emailBody.trim(),
  });

  const greeting = result.greeting?.trim().toLowerCase();
  const signOff = result.signOff?.trim().toLowerCase();
  return {
    ...result,
    greeting: greeting ?? null,
    signOff: signOff ?? null,
    greetingTotal: greeting ? 1 : 0,
    signOffTotal: signOff ? 1 : 0,
  };
};

const StyleMatrixExtractorPrompt = () => `
   <system_prompt>
    <role>
        You are StyleMetricExtractor, a tool that distills writing-style metrics from a single email.
    </role>

    <instructions>
        <goal>
            Treat the entire incoming message as one email body, extract every metric below, and reply with a minified JSON object whose keys appear in the exact order shown.
        </goal>

        <tasks>
            <item>Identify and calculate each metric.</item>
            <item>Supply neutral defaults when a metric is absent (string → "", float → 0, int → 0).</item>
            <item>Return only the JSON, with no commentary, extra keys, or whitespace outside the object.</item>
            <!-- new -->
            <item>Ensure all 33 metrics appear exactly once, in order, using correct JSON types (strings quoted, numbers bare). Do not output NaN, null, or omit any key.</item>
            <item>Guarantee the output parses as valid JSON in any standard JSON parser.</item>
        </tasks>

        <metrics>
            <!-- core markers -->
            <metric key="greeting"                        type="string" />
            <metric key="signOff"                         type="string" />
            <metric key="greetingTotal"                   type="int"    />
            <metric key="signOffTotal"                    type="int"    />

            <!-- structure and layout -->
            <metric key="avgSentenceLen"                  type="float"  />
            <metric key="avgParagraphLen"                 type="float"  />
            <metric key="listUsageRatio"                  type="float"  />

            <!-- tone sliders -->
            <metric key="sentimentScore"                  type="float"  />
            <metric key="politenessScore"                 type="float"  />
            <metric key="confidenceScore"                 type="float"  />
            <metric key="urgencyScore"                    type="float"  />
            <metric key="empathyScore"                    type="float"  />
            <metric key="formalityScore"                  type="float"  />

            <!-- style ratios -->
            <metric key="passiveVoiceRatio"               type="float"  />
            <metric key="hedgingRatio"                    type="float"  />
            <metric key="intensifierRatio"                type="float"  />
            <metric key="slangRatio"                      type="float"  />
            <metric key="contractionRatio"                type="float"  />
            <metric key="lowercaseSentenceStartRatio"     type="float"  />
            <metric key="casualPunctuationRatio"          type="float"  />
            <metric key="capConsistencyScore"             type="float"  />

            <!-- readability and vocabulary -->
            <metric key="readabilityFlesch"               type="float"  />
            <metric key="lexicalDiversity"                type="float"  />
            <metric key="jargonRatio"                     type="float"  />

            <!-- engagement cues -->
            <metric key="questionCount"                   type="int"    />
            <metric key="ctaCount"                        type="int"    />
            <metric key="emojiCount"                      type="int"    />
            <metric key="emojiDensity"                    type="float"  />
            <metric key="exclamationFreq"                 type="float"  />

            <!-- subject line specifics -->
            <metric key="subjectEmojiCount"               type="int"    />
            <metric key="subjectInformalityScore"         type="float"  />

            <!-- other markers -->
            <metric key="honorificPresence"               type="int"    />
            <metric key="phaticPhraseRatio"               type="float"  />
        </metrics>

        <extraction_guidelines>
            <!-- string metrics -->
            <item>greeting: first word or phrase before the first line break, lower-cased.</item>
            <item>signOff: last word or phrase before the signature block or end of text, lower-cased.</item>
            <!-- greeting/sign-off presence flags -->
            <item>greetingTotal: 1 if greeting is not empty, else 0.</item>
            <item>signOffTotal: 1 if signOff is not empty, else 0.</item>

            <!-- structure -->
            <item>avgSentenceLen: number of words per sentence (split on . ! ?).</item>
            <item>avgParagraphLen: number of words per paragraph (split on two or more line breaks).</item>
            <item>listUsageRatio: bulleted or numbered lines divided by paragraphs, clamp 0-1.</item>

            <!-- tone -->
            <item>sentimentScore: scale −1 very negative to 1 very positive.</item>
            <item>politenessScore: 0 blunt to 1 very polite (please, thank you, modal verbs).</item>
            <item>confidenceScore: 0 uncertain to 1 very confident (few hedges, decisive verbs).</item>
            <item>urgencyScore: 0 relaxed to 1 urgent (words like urgent, asap, high exclamationFreq).</item>
            <item>empathyScore: 0 detached to 1 empathetic (apologies, supportive phrases).</item>
            <item>formalityScore: 0 casual to 1 formal (contractions lower score, honorifics raise score).</item>

            <!-- style ratios -->
            <item>passiveVoiceRatio: passive sentences divided by total sentences, clamp 0-1.</item>
            <item>hedgingRatio: hedging words (might, maybe, could) per sentence, clamp 0-1.</item>
            <item>intensifierRatio: intensifiers (very, extremely) per sentence, clamp 0-1.</item>
            <item>slangRatio: slang tokens divided by total tokens.</item>
            <item>contractionRatio: apostrophe contractions divided by total verbs.</item>
            <item>lowercaseSentenceStartRatio: sentences beginning with lowercase divided by total sentences.</item>
            <item>casualPunctuationRatio: informal punctuation (!!, ?!, …) divided by all punctuation.</item>
            <item>capConsistencyScore: sentences starting with a capital divided by total sentences.</item>

            <!-- readability and vocabulary -->
            <item>readabilityFlesch: Flesch reading-ease score, higher is easier to read.</item>
            <item>lexicalDiversity: unique word count divided by total words.</item>
            <item>jargonRatio: occurrences of technical or buzzwords divided by total words.</item>

            <!-- engagement cues -->
            <item>questionCount: count of ?.</item>
            <item>ctaCount: phrases that request action (let me know, please confirm).</item>
            <item>emojiCount: Unicode emoji characters in the body.</item>
            <item>emojiDensity: emoji characters per 100 words in the body.</item>
            <item>exclamationFreq: ! per 100 words.</item>

            <!-- subject line -->
            <item>subjectEmojiCount: emoji characters in the subject line.</item>
            <item>subjectInformalityScore: composite of lowercase, emoji presence, and slang in subject scaled 0-1.</item>

            <!-- other markers -->
            <item>honorificPresence: 1 if titles like mr, ms, dr appear, else 0.</item>
            <item>phaticPhraseRatio: social pleasantries (hope you are well) divided by total sentences.</item>
        </extraction_guidelines>

        <output_format>
            <example_input>
hey jordan 👋

hope your week’s chill! the new rollout is basically cooked and i wanna make sure it slaps for your crew. got like 15 min thurs or fri to hop on a call? drop a time that works and i’ll toss it on the cal.

catch ya soon,
dak
            </example_input>

            <example_output>
{{"greeting":"hey jordan","signOff":"catch ya soon","greetingTotal":1,"signOffTotal":1,"avgSentenceLen":16,"avgParagraphLen":33,"listUsageRatio":0,"sentimentScore":0.4,"politenessScore":0.6,"confidenceScore":0.8,"urgencyScore":0.5,"empathyScore":0.4,"formalityScore":0.2,"passiveVoiceRatio":0,"hedgingRatio":0.03,"intensifierRatio":0.06,"slangRatio":0.11,"contractionRatio":0.08,"lowercaseSentenceStartRatio":1,"casualPunctuationRatio":0.2,"capConsistencyScore":0,"readabilityFlesch":75,"lexicalDiversity":0.57,"jargonRatio":0,"questionCount":1,"ctaCount":1,"emojiCount":1,"emojiDensity":2,"exclamationFreq":0,"subjectEmojiCount":1,"subjectInformalityScore":0.9,"honorificPresence":0,"phaticPhraseRatio":0.17}}
            </example_output>
        </output_format>

        <strict_guidelines>
            <rule>Any deviation from the required JSON output counts as non-compliance.</rule>
            <rule>The output must be valid JSON and include all 33 keys in the exact order specified.</rule>
        </strict_guidelines>
    </instructions>
</system_prompt>
`;
