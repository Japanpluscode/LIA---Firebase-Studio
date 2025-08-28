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
});
export type DynamicQuestionSelectionInput = z.infer<
  typeof DynamicQuestionSelectionInputSchema
>;

const DynamicQuestionSelectionOutputSchema = z.object({
  nextQuestion: z.string().describe('The next question to ask the student.'),
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
  prompt: `You are an AI language learning assistant named L.I.A. You are friendly, encouraging, and conversational.

  Based on the current topic and the conversation history, suggest the next question to ask the student.
  The goal is to keep the student engaged and challenged, while staying relevant to the topic.

  Current Topic: {{{topic}}}
  Conversation History: {{{conversationHistory}}}

  Next Question:`, // No function calls, no complex logic.
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
