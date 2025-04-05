import { betterFetch } from "@better-fetch/fetch";
import { z } from "zod";

export const groqChatCompletionSchema = z.object({
  id: z.string(),
  object: z.string(),
  created: z.number(),
  model: z.string(),
  choices: z.array(
    z.object({
      index: z.number(),
      message: z.object({
        role: z.string(),
        content: z.string(),
      }),
      logprobs: z.null(),
      finish_reason: z.string(),
    })
  ),
  usage: z.object({
    queue_time: z.number(),
    prompt_tokens: z.number(),
    prompt_time: z.number(),
    completion_tokens: z.number(),
    completion_time: z.number(),
    total_tokens: z.number(),
    total_time: z.number(),
  }),
  system_fingerprint: z.string(),
  x_groq: z.object({
    id: z.string(),
  }),
});

export const groqEmbeddingSchema = z.object({
  object: z.string(),
  data: z.array(
    z.object({
      object: z.string(),
      embedding: z.array(z.number()),
      index: z.number(),
    })
  ),
  model: z.string(),
  usage: z.object({
    prompt_tokens: z.number(),
    total_tokens: z.number(),
  }),
});

export type GroqChatCompletion = z.infer<typeof groqChatCompletionSchema>;
export type GroqEmbedding = z.infer<typeof groqEmbeddingSchema>;

// Define available Groq models
export const GROQ_MODELS = {
  LLAMA_8B: 'llama3-8b-8192',
  LLAMA_70B: 'llama3-70b-8192',
  MIXTRAL: 'mixtral-8x7b-32768',
  GEMMA: 'gemma-7b-it'
} as const;

// Map OpenAI models to Groq equivalents
const MODEL_MAPPING: Record<string, string> = {
  'gpt-4o-mini': GROQ_MODELS.LLAMA_8B,
  'gpt-3.5-turbo': GROQ_MODELS.LLAMA_8B,
  'gpt-4': GROQ_MODELS.LLAMA_70B,
  'gpt-4-turbo': GROQ_MODELS.LLAMA_70B
};

/**
 * Creates embeddings for text input
 */
export async function createEmbedding(text: string, model: string = GROQ_MODELS.LLAMA_8B) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('Groq API key is not configured');
  }

  if (!text || text.trim() === '') {
    throw new Error('Empty text cannot be embedded');
  }

  const { data, error } = await betterFetch('https://api.groq.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    output: groqEmbeddingSchema,
    body: {
      model,
      input: text
    }
  });

  if (error) {
    throw new Error(`Embedding API error: ${error.message || 'Unknown error'}`);
  }

  return data.data[0]?.embedding || [];
}

/**
 * Creates embeddings for multiple text inputs
 */
export async function createEmbeddings(texts: Record<string, string>, model: string = GROQ_MODELS.LLAMA_8B) {
  const embeddings: Record<string, number[]> = {};

  for (const [key, text] of Object.entries(texts)) {
    if (!text || text.trim() === '') continue;
    
    try {
      embeddings[key] = await createEmbedding(text, model);
    } catch (error) {
      console.error(`Error creating embedding for ${key}:`, error);
    }
  }
  
  return embeddings;
}

// Define model type to allow any string (developer's choice)
type CompletionsParams = {
  model: string, // Allow any model string the developer wants to use
  prompt?: string,
  systemPrompt?: string,
  temperature: number,
  max_tokens: number,
  embeddings?: Record<string, number[]>
};

// Define the request body type with proper TypeScript interface
interface GroqRequestBody {
  model: string;
  messages: Array<{role: string; content: string}>;
  temperature: number;
  max_tokens: number;
  // Add any other standard properties here
  [key: string]: any; // Allow additional properties
}

export async function generateCompletions({ 
  model, 
  prompt, 
  systemPrompt, 
  temperature, 
  max_tokens,
  embeddings 
}: CompletionsParams) {
  if (!process.env.GROQ_API_KEY) 
    throw new Error('Groq API Key is missing');

  // Map OpenAI model names to Groq equivalents if needed
  const groqModel = MODEL_MAPPING[model] || model;

  // Create a more specific system prompt to avoid templates and placeholders
  let finalSystemPrompt = systemPrompt || process.env.AI_SYSTEM_PROMPT || '';
  
  // Add instructions to avoid templates and placeholders
  finalSystemPrompt += `\n\nIMPORTANT INSTRUCTIONS:
- Generate a real, ready-to-send email, not a template
- Do not include placeholders like [Recipient], [discount percentage], etc.
- Do not include formatting instructions or explanations
- Do not include "Subject:" lines
- Do not include "Here's a draft..." or similar meta-text
- Write as if this email is ready to be sent immediately
- Use real, specific content instead of placeholders
- Address the recipient directly without using [brackets]
- If you need to include a call-to-action, make it specific (e.g., "Visit our website at example.com" instead of "[Insert CTA button]")`;

  // Ensure we have valid messages
  const messages = [];
  
  if (finalSystemPrompt && finalSystemPrompt.trim() !== '') {
    messages.push({
      role: 'system',
      content: finalSystemPrompt
    });
  }

  if (prompt && prompt.trim() !== '') {
    messages.push({ 
      role: 'user', 
      content: prompt 
    });
  } else {
    // If no prompt is provided, add a minimal prompt to avoid API errors
    messages.push({
      role: 'user',
      content: 'Please write an email.'
    });
  }

  // Prepare the request body with the correct type
  const requestBody: GroqRequestBody = {
    model: groqModel,
    messages,
    temperature,
    max_tokens,
  };

  // Add embeddings if provided - using type assertion to avoid TypeScript errors
  if (embeddings && Object.keys(embeddings).length > 0) {
    // Add as a custom property
    (requestBody as any).user_context = {
      embeddings
    };
  }

  // Log the request for debugging
  console.log('Groq API Request:', {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    originalModel: model,
    mappedModel: groqModel,
    messageCount: messages.length,
    hasEmbeddings: !!embeddings
  });

  try {
    // Use regular fetch for more control over the request
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify(requestBody) // Explicitly stringify the request body
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      throw new Error(`GROQ API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    // Validate the response against our schema
    try {
      const validatedData = groqChatCompletionSchema.parse(data);
      
      // Clean up the response to remove any remaining template-like content
      let content = validatedData.choices[0]?.message.content || '';
      
      // Remove any "Subject:" lines
      content = cleanupEmailContent(content)
      
      // Trim whitespace
      content = content.trim();
      
      return { completion: content };
    } catch (validationError) {
      console.error('Response validation error:', validationError);
      // Fall back to using the raw response if validation fails
      let content = data.choices[0]?.message.content || '';
      
      // Apply the same cleanup to the raw response
      content = cleanupEmailContent(content)
      
      return { completion: content };
    }
  } catch (error) {
    console.error('Groq API Call Error:', error);
    throw error;
  }
}

/**
 * Helper function to truncate email thread content to fit within token limits
 */
export function truncateThreadContent(threadContent: string, maxTokens: number = 12000): string {
  const emails = threadContent.split('\n---\n');
  let truncatedContent = emails[emails.length - 1];

  for (let i = emails.length - 2; i >= 0; i--) {
    const newContent = `${emails[i]}\n---\n${truncatedContent}`;
    const estimatedTokens = newContent.length / 4;

    if (estimatedTokens > maxTokens) {
      break;
    }

    truncatedContent = newContent;
  }

  return truncatedContent ?? '';
}

// Function to clean up AI-generated email content
export function cleanupEmailContent(content: string): string {
  // Remove various forms of meta-text at the beginning
  let cleanedContent = content
    // Remove "Here is the email:" and variations
    .replace(/^(Here is|Here's|Below is|Following is|This is|Attached is)( the| an| a)? (email|message|response|reply|draft):?.*?(\n|$)/i, '')
    
    // Remove any "Subject:" lines
    .replace(/^Subject:.*?(\n|$)/i, '')
    
    // Remove any "Here's a draft..." or similar meta-text
    .replace(/^Here's (a|an|the) (draft|template|example|email).*?(\n|$)/i, '')
    
    // Remove any explanatory text at the beginning
    .replace(/^I've (created|written|prepared|drafted|composed).*?(\n|$)/i, '')
    .replace(/^I (created|wrote|prepared|drafted|composed).*?(\n|$)/i, '')
    .replace(/^As (requested|instructed|asked).*?(\n|$)/i, '')
    .replace(/^Based on (your|the) (request|instructions).*?(\n|$)/i, '')
    
    // Remove any trailing instructions or explanations
    .replace(/\n\nFeel free to.*$/i, '')
    .replace(/\n\nLet me know if.*$/i, '')
    .replace(/\n\nPlease (let me know|feel free).*$/i, '')
    .replace(/\n\nHope this (helps|works).*$/i, '')
    .replace(/\n\nIs there anything else.*$/i, '')
    
    // Remove placeholder text in brackets
    .replace(/\[.*?\]/g, '');
  
  // Trim whitespace
  cleanedContent = cleanedContent.trim();
  
  return cleanedContent;
}

