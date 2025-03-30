import { NextApiRequest, NextApiResponse } from 'next';
import { Configuration, OpenAIApi } from 'openai';

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query } = req.body;

    // Process the natural language query with AI
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [{
        role: "system",
        content: "You are an email search assistant. Convert natural language queries into email search queries."
      }, {
        role: "user",
        content: query
      }],
    });

    const aiResponse = completion.data.choices[0]?.message?.content;
    
    // Parse AI response and generate search suggestions
    const enhancedQuery = aiResponse?.split('\n')[0] || query;
    const suggestions = [
      enhancedQuery,
      // Add additional relevant search suggestions based on the AI response
    ];

    return res.status(200).json({
      results: suggestions,
      enhancedQuery,
    });

  } catch (error) {
    console.error('AI Search error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 