'use server';
import { SubjectGenerationSystemPrompt, StyleMatrixExtractorPrompt } from './prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { generateCompletions } from './groq';
import { ChatGroq } from '@langchain/groq';
import { z } from 'zod';

// AIResponse for Body Generation
interface AIBodyResponse {
  id: string;
  body: string; // Only body is returned
  type: 'email' | 'question' | 'system';
  position?: 'start' | 'end' | 'replace';
}

// User context type
interface UserContext {
  name?: string;
  email?: string;
}

const genericFailureMessage = 'Unable to fulfill your request.';

const postProcessMessage = (text: string): AIBodyResponse[] => {
  // --- Post-processing: Remove common conversational prefixes ---
  let generatedBody = text;
  const prefixesToRemove = [
    /^Here is the generated email body:/i,
    /^Sure, here's the email body:/i,
    /^Okay, here is the body:/i,
    /^Here's the draft:/i,
    /^Here is the email body:/i,
    /^Here is your email body:/i,
    // Add more prefixes if needed
  ];
  for (const prefixRegex of prefixesToRemove) {
    if (prefixRegex.test(generatedBody.trimStart())) {
      generatedBody = generatedBody.trimStart().replace(prefixRegex, '').trimStart();
      console.log(`AI Assistant Post-Check (Body): Removed prefix matching ${prefixRegex}`);
      break;
    }
  }
  // --- End Post-processing ---

  // Comprehensive safety checks for HTML tags and code blocks
  const unsafePattern = /(```|~~~|<[^>]+>|&lt;[^&]+&gt;|<script|<style|\bjavascript:|data:)/i;
  if (unsafePattern.test(generatedBody)) {
    console.warn(
      `AI Assistant Post-Check (Body): Detected forbidden content format (HTML/code)... Overriding.`,
    );
    return [{ id: 'override-' + Date.now(), body: genericFailureMessage, type: 'system' }];
  }

  const lowerBody = generatedBody.toLowerCase();
  const isRefusal =
    lowerBody.includes('i cannot') ||
    lowerBody.includes("i'm unable to") ||
    lowerBody.includes('i am unable to') ||
    lowerBody.includes('as an ai') ||
    lowerBody.includes('my purpose is to assist') ||
    lowerBody.includes('violates my safety guidelines') ||
    lowerBody.includes('sorry, i can only assist with email body');

  if (isRefusal) {
    console.warn(`AI Assistant Post-Check (Body): Detected refusal/interjection. Overriding.`);
    return [{ id: 'refusal-' + Date.now(), body: genericFailureMessage, type: 'system' }];
  }

  const isClarificationNeeded = checkIfQuestion(generatedBody);

  if (isClarificationNeeded) {
    console.log(`AI Assistant (Body): AI response is a clarification question...`);
    return [
      { id: 'question-' + Date.now(), body: generatedBody, type: 'question', position: 'replace' },
    ];
  } else {
    console.log(`AI Assistant (Body): AI response is email body content...`);
    return [{ id: 'email-' + Date.now(), body: generatedBody, type: 'email', position: 'replace' }];
  }
};

// --- Generate Subject for Email Body ---
export async function generateSubjectForEmail(body: string): Promise<string> {
  console.log(
    'AI Assistant (Subject): Generating subject for body:',
    body.substring(0, 100) + '...',
  );

  if (!body || body.trim() === '') {
    console.warn('AI Assistant (Subject): Cannot generate subject for empty body.');
    return '';
  }

  try {
    const systemPrompt = SubjectGenerationSystemPrompt;
    const subjectPrompt = `<email_body>
${body}
</email_body>

Please generate a concise subject line for the email body above.`;

    console.log(`AI Assistant (Subject): Calling generateCompletions...`);
    const { completion: generatedSubjectRaw } = await generateCompletions({
      model: 'gpt-4', // Using the more capable model
      systemPrompt: systemPrompt,
      prompt: subjectPrompt,
      temperature: 0.5,
    });
    console.log(`AI Assistant (Subject): Received subject completion:`, generatedSubjectRaw); // Log raw

    // --- Post-processing: Remove common conversational prefixes ---
    let generatedSubject = generatedSubjectRaw;
    const prefixesToRemove = [
      /^Here is the subject line:/i,
      /^Here is a subject line:/i,
      /^Here is a concise subject line for the email:/i,
      /^Okay, the subject is:/i,
      /^Subject:/i, // Remove potential "Subject:" prefix itself
      // Add more common prefixes if observed
    ];
    for (const prefixRegex of prefixesToRemove) {
      if (prefixRegex.test(generatedSubject.trimStart())) {
        generatedSubject = generatedSubject.trimStart().replace(prefixRegex, '').trimStart();
        console.log(`AI Assistant Post-Check (Subject): Removed prefix matching ${prefixRegex}`);
        break;
      }
    }
    // --- End Post-processing ---

    // Simple cleaning: trim whitespace from potentially cleaned subject
    const cleanSubject = generatedSubject.trim();

    if (cleanSubject.toLowerCase().includes('unable to generate subject')) {
      console.warn('AI Assistant (Subject): Detected refusal message.');
      return '';
    }

    return cleanSubject;
  } catch (error) {
    console.error(`Error during AI subject generation process...`, error);
    return '';
  }
}

// Helper function to check if text is a question
function checkIfQuestion(text: string): boolean {
  const trimmedText = text.trim().toLowerCase();
  if (trimmedText.endsWith('?')) return true;
  const questionStarters = [
    'what',
    'how',
    'why',
    'when',
    'where',
    'who',
    'can you',
    'could you',
    'would you',
    'will you',
    'is it',
    'are there',
    'should i',
    'do you',
  ];
  return questionStarters.some((starter) => trimmedText.startsWith(starter));
}

export const extractStyleMatrix = async (emailBody: string) => {
  if (!emailBody.trim()) {
    throw new Error('Invalid body provided.');
  }

  const schema = z.object({
    // greeting and sign-off may be absent
    greetingForm: z.string().nullable(),
    signOffForm: z.string().nullable(),

    // simple totals and flags
    tokenTotal: z.number().int().nonnegative(),
    charTotal: z.number().int().nonnegative(),
    paragraphs: z.number().int().nonnegative(),
    bulletListPresent: z.number().int().min(0).max(1),
    greetingPresent: z.number().int().min(0).max(1),
    signOffPresent: z.number().int().min(0).max(1),

    // structural averages
    averageSentenceLength: z.number(),
    averageLinesPerParagraph: z.number(),
    averageWordLength: z.number(),
    typeTokenRatio: z.number().min(0).max(1),
    movingAverageTtr: z.number().min(0),
    hapaxProportion: z.number().min(0).max(1),
    shannonEntropy: z.number().min(0),
    lexicalDensity: z.number().min(0).max(1),
    contractionRate: z.number().min(0),

    // syntax and usage
    subordinationRatio: z.number().min(0).max(1),
    passiveVoiceRate: z.number().min(0),
    modalVerbRate: z.number().min(0),
    parseTreeDepthMean: z.number().min(0),

    // punctuation-level rates
    commasPerSentence: z.number().min(0),
    exclamationPerThousandWords: z.number().min(0),
    questionMarkRate: z.number().min(0),
    ellipsisRate: z.number().min(0),
    parenthesesRate: z.number().min(0),
    emojiRate: z.number().min(0),

    // tone
    sentimentPolarity: z.number().min(-1).max(1),
    sentimentSubjectivity: z.number().min(0).max(1),
    formalityScore: z.number().min(0).max(100),
    hedgeRate: z.number().min(0),
    certaintyRate: z.number().min(0),

    // readability and cohesion
    fleschReadingEase: z.number(),
    gunningFogIndex: z.number(),
    smogIndex: z.number(),
    averageForwardReferences: z.number().min(0),
    cohesionIndex: z.number().min(0).max(1),

    // persona markers
    firstPersonSingularRate: z.number().min(0),
    firstPersonPluralRate: z.number().min(0),
    secondPersonRate: z.number().min(0),
    selfReferenceRatio: z.number().min(0).max(1),
    empathyPhraseRate: z.number().min(0),
    humorMarkerRate: z.number().min(0),

    // formatting habits
    markupBoldRate: z.number().min(0),
    markupItalicRate: z.number().min(0),
    hyperlinkRate: z.number().min(0),
    codeBlockRate: z.number().min(0),

    // rhetorical devices
    rhetoricalQuestionRate: z.number().min(0),
    analogyRate: z.number().min(0),
    imperativeSentenceRate: z.number().min(0),
    expletiveOpeningRate: z.number().min(0),
    parallelismRate: z.number().min(0),
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', StyleMatrixExtractorPrompt()],
    ['human', '{input}'],
  ]);
  const llm = new ChatGroq({
    model: 'llama-3.1-8b-instant',
    temperature: 0,
    maxTokens: 600,
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

  const greeting = result.greetingForm?.trim().toLowerCase();
  const signOff = result.signOffForm?.trim().toLowerCase();
  return {
    ...result,
    greeting: greeting ?? null,
    signOff: signOff ?? null,
    greetingTotal: greeting ? 1 : 0,
    signOffTotal: signOff ? 1 : 0,
  };
};
