'use server';

/**
 * @fileOverview This file defines a Genkit flow for dynamically selecting the next question in a conversation.
 *
 * It includes:
 * - `dynamicQuestionSelection`:  A function to initiate the dynamic question selection process.
 * - `DynamicQuestionSelectionInput`: The input type for the `dynamicQuestionSelection` function.
 * - `DynamicQuestionSelectionOutput`: The output type for the `dynamicQuestionSelection` function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DynamicQuestionSelectionInputSchema = z.object({
  topic: z.string().describe('The current conversation topic.'),
  conversationHistory: z.string().describe('The history of the conversation so far.'),
  studentContext: z.string().describe('A summary of past conversations to provide context about the student.')
});
export type DynamicQuestionSelectionInput = z.infer<
  typeof DynamicQuestionSelectionInputSchema
>;

const DynamicQuestionSelectionOutputSchema = z.object({
  nextResponse: z.string().describe('The next response to the student, which could be a question, a comment, or a follow-up statement.'),
});
export type DynamicQuestionSelectionOutput = z.infer<
  typeof DynamicQuestionSelectionOutputSchema
>;

export async function dynamicQuestionSelection(
  input: DynamicQuestionSelectionInput
): Promise<DynamicQuestionSelectionOutput> {
  return dynamicQuestionSelectionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'dynamicQuestionSelectionPrompt',
  input: {schema: DynamicQuestionSelectionInputSchema},
  output: {schema: DynamicQuestionSelectionOutputSchema},
  prompt: `You are an AI language learning assistant named L.I.A. You are friendly, encouraging, and conversational. Your goal is to engage the student in a natural, flowing conversation. Do not just ask a series of questions. Make comments, share your own (fictional) thoughts, and react to what the student says.

  CRITICAL: You must NEVER, under any circumstances, change the conversation topic. The conversation MUST remain strictly about the provided topic.

  You have access to a summary of the student's past conversations. Use this to remember things about the student and make the conversation more personal.

  Student Context (from past conversations):
  {{{studentContext}}}

  Current Topic: {{{topic}}}
  Current Conversation History:
  {{{conversationHistory}}}

  Your Next Conversational Response:`,
});

const dynamicQuestionSelectionFlow = ai.defineFlow(
  {
    name: 'dynamicQuestionSelectionFlow',
    inputSchema: DynamicQuestionSelectionInputSchema,
    outputSchema: DynamicQuestionSelectionOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
