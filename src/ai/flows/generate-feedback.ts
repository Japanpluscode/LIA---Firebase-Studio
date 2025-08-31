'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating feedback on a student's conversation performance.
 *
 * It includes:
 * - `generateFeedback`: A function to initiate the feedback generation process.
 * - `GenerateFeedbackInput`: The input type for the `generateFeedback` function.
 * - `GenerateFeedbackOutput`: The output type for the `generateFeedback` function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateFeedbackInputSchema = z.object({
  topic: z.string().describe('The topic of the conversation.'),
  conversationHistory: z
    .string()
    .describe('The full transcript of the conversation between the student and the AI.'),
});
export type GenerateFeedbackInput = z.infer<typeof GenerateFeedbackInputSchema>;

const GenerateFeedbackOutputSchema = z.object({
  feedback: z
    .string()
    .describe(
      'Constructive feedback for the student based on their performance in the conversation. Focus on areas for improvement and offer encouragement.'
    ),
});
export type GenerateFeedbackOutput = z.infer<typeof GenerateFeedbackOutputSchema>;

export async function generateFeedback(
  input: GenerateFeedbackInput
): Promise<GenerateFeedbackOutput> {
  return generateFeedbackFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateFeedbackPrompt',
  input: {schema: GenerateFeedbackInputSchema},
  output: {schema: GenerateFeedbackOutputSchema},
  prompt: `You are an AI language learning assistant reviewing a conversation between a student and another AI.
  Your goal is to provide constructive feedback to the student to help them improve.

  Analyze the conversation provided below. Consider grammar, vocabulary, and relevance to the topic.
  Provide a short, encouraging feedback summary that highlights one or two areas for improvement.

  Conversation Topic: {{{topic}}}
  Conversation History:
  {{{conversationHistory}}}

  Feedback:`,
});

const generateFeedbackFlow = ai.defineFlow(
  {
    name: 'generateFeedbackFlow',
    inputSchema: GenerateFeedbackInputSchema,
    outputSchema: GenerateFeedbackOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
