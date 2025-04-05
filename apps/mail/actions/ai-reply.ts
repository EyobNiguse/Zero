'use server';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { generateCompletions } from '@/lib/groq';

// Function to truncate email thread content to fit within token limits
function truncateThreadContent(threadContent: string, maxTokens: number = 4000): string {
  // Estimate current token count (roughly 4 characters per token)
  const estimatedTokens = threadContent.length / 4;
  
  // If already under limit, return as is
  if (estimatedTokens <= maxTokens) {
    return threadContent;
  }
  
  // Split the thread into individual emails
  const emails = threadContent.split('\n---\n');
  
  // Start with just the most recent email (last in the array)
  let truncatedContent = emails[emails.length - 1] || '';
  
  // Estimate tokens for the most recent email
  let currentTokens = truncatedContent.length / 4;
  
  // If even the most recent email is too large, truncate it
  if (currentTokens > maxTokens) {
    // Get the first part of the email up to the maxTokens limit
    // Multiply by 4 to convert tokens to characters, and reduce by 20% for safety
    const safeCharLimit = Math.floor(maxTokens * 4 * 0.8);
    truncatedContent = truncatedContent.substring(0, safeCharLimit);
    truncatedContent += "\n\n[Email content truncated due to length]";
    return truncatedContent;
  }
  
  // Try to include previous emails, starting from the second most recent
  for (let i = emails.length - 2; i >= 0; i--) {
    // Calculate tokens for the next email
    const nextEmailTokens = (emails[i]?.length || 0) / 4;
    
    // If adding this email would exceed the limit, stop here
    if (currentTokens + nextEmailTokens > maxTokens * 0.9) { // 90% of limit for safety
      break;
    }
    
    // Add this email to the content
    truncatedContent = `${emails[i]}\n---\n${truncatedContent}`;
    currentTokens += nextEmailTokens;
  }
  
  // Add a note if we had to truncate
  if (emails.length > 1 && currentTokens < estimatedTokens) {
    truncatedContent = `[Earlier parts of the conversation were omitted]\n\n${truncatedContent}`;
  }
  
  return truncatedContent;
}

// Extracts the most important parts of an email thread to fit within token limits
function extractEmailSummary(threadContent: string, maxTokens: number = 4000): string {
  // Split the thread into individual emails
  const emails = threadContent.split('\n---\n');
  
  // If there's only one email or it's already small enough, just truncate it
  if (emails.length <= 1 || threadContent.length / 4 <= maxTokens) {
    return truncateThreadContent(threadContent, maxTokens);
  }
  
  // Get the most recent email
  const latestEmail = emails[emails.length - 1] || '';
  
  // Extract subject lines and senders from all emails
  const emailMetadata = emails.map(email => {
    const subjectMatch = email.match(/Subject: (.*?)(\n|$)/i);
    const fromMatch = email.match(/From: (.*?)(\n|$)/i);
    return {
      subject: subjectMatch ? subjectMatch[1] : 'No subject',
      from: fromMatch ? fromMatch[1] : 'Unknown sender'
    };
  });
  
  // Create a summary of the thread
  let summary = "Email Thread Summary:\n\n";
  emailMetadata.forEach((meta, index) => {
    summary += `Email ${index + 1}: From ${meta.from}, Subject: ${meta.subject}\n`;
  });
  
  // Add the full content of the most recent email
  summary += "\n\nMost recent email (full content):\n\n";
  summary += latestEmail;
  
  // If we still have token budget, add parts of the previous email
  const estimatedSummaryTokens = summary.length / 4;
  if (estimatedSummaryTokens < maxTokens * 0.8 && emails.length > 1) {
    const previousEmail = emails[emails.length - 2] || '';
    const remainingTokens = maxTokens - estimatedSummaryTokens;
    const safeCharLimit = Math.floor(remainingTokens * 4 * 0.8);
    
    if (previousEmail.length <= safeCharLimit) {
      summary += "\n\nPrevious email:\n\n" + previousEmail;
    } else {
      summary += "\n\nPrevious email (truncated):\n\n" + previousEmail.substring(0, safeCharLimit) + "...";
    }
  }
  
  return summary;
}

// Cleans up AI-generated email content
function cleanupEmailContent(content: string): string {
  // Remove any "Subject:" lines
  let cleanedContent = content.replace(/^Subject:.*?(\n|$)/i, '');
  
  // Remove any "Here's a draft..." or similar meta-text
  cleanedContent = cleanedContent.replace(/^Here's (a|an|the) (draft|template|example).*?(\n|$)/i, '');
  
  // Remove any explanatory text at the beginning
  cleanedContent = cleanedContent.replace(/^I've (created|written|prepared|drafted).*?(\n|$)/i, '');
  
  // Remove any trailing instructions or explanations
  cleanedContent = cleanedContent.replace(/\n\nFeel free to.*$/i, '');
  cleanedContent = cleanedContent.replace(/\n\nLet me know if.*$/i, '');
  
  // Remove placeholder text in brackets
  cleanedContent = cleanedContent.replace(/\[.*?\]/g, '');
  
  // Trim whitespace
  cleanedContent = cleanedContent.trim();
  
  return cleanedContent;
}

// Generates an AI response for an email reply based on the thread content
export async function generateAIResponse(
  threadContent: string,
  originalSender: string,
): Promise<string> {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  if (!process.env.GROQ_API_KEY) {
    throw new Error('Groq API key is not configured');
  }

  // Use a more aggressive content reduction approach
  const processedContent = extractEmailSummary(threadContent, 3000); // Reduced to 3000 tokens max

  // Create the system message
  const systemPrompt = `You are an email assistant helping ${session.user.name} write professional and concise email replies.
  
  Important instructions:
  - Generate a real, ready-to-send email reply, not a template
  - Do not include placeholders like [Recipient], [discount percentage], etc.
  - Do not include formatting instructions or explanations
  - Do not include "Subject:" lines
  - Do not include "Here's a draft..." or similar meta-text
  - Write as if this email is ready to be sent immediately
  - Use real, specific content instead of placeholders
  - Address the recipient directly without using [brackets]
  - Be concise but thorough (2-3 paragraphs maximum)
  - Write in the first person as if you are ${session.user.name}
  - Double space paragraphs (2 newlines)
  - Add two spaces below the sign-off
  - End with the name: ${session.user.name}`;
  
  // Create the user message - keep it shorter
  const prompt = `
  Here's the context of the email thread (some parts may be summarized or truncated due to length):
  ${processedContent}

  Generate a professional, helpful, and concise email reply to ${originalSender}.
  Keep your response under 200 words.
  `;

  try {
    // Use direct fetch to the Groq API
    const { completion } = await generateCompletions({
      model: 'llama3-8b-8192',
      systemPrompt,
      prompt ,
      temperature: 0.7,
      max_tokens: 500
    })

    const content = cleanupEmailContent(completion);
    
    return content;
  } catch (error: any) {
    console.error('Error generating AI response:', error);
    throw error;
  }
}
