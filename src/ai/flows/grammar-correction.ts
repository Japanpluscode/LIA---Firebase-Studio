// 'use server'

/**
 * @fileOverview Grammar correction AI agent.
 *
 * - correctGrammar - A function that corrects grammar in a given text.
 * - CorrectGrammarInput - The input type for the correctGrammar function.
 * - CorrectGrammarOutput - The return type for the correctGrammar function.
 */

'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const CorrectGrammarInputSchema = z.object({
  text: z
    .string()
    .describe('The text to be corrected for grammar mistakes.'),
});
export type CorrectGrammarInput = z.infer<typeof CorrectGrammarInputSchema>;

const CorrectGrammarOutputSchema = z.object({
  correctedText: z
    .string()
    .describe('The corrected text, with subtle grammar improvements.'),
});
export type CorrectGrammarOutput = z.infer<typeof CorrectGrammarOutputSchema>;

export async function correctGrammar(input: CorrectGrammarInput): Promise<CorrectGrammarOutput> {
  return correctGrammarFlow(input);
}

const prompt = ai.definePrompt({
  name: 'correctGrammarPrompt',
  input: {schema: CorrectGrammarInputSchema},
  output: {schema: CorrectGrammarOutputSchema},
  prompt: `You are a helpful AI that subtly corrects grammar mistakes in a given text.

  Original text: {{{text}}}

  Corrected text:`,
  config: {
    safetySettings: [
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_ONLY_HIGH',
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_NONE',
      },
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_LOW_AND_ABOVE',
      },
    ],
  },
});

const correctGrammarFlow = ai.defineFlow(
  {
    name: 'correctGrammarFlow',
    inputSchema: CorrectGrammarInputSchema,
    outputSchema: CorrectGrammarOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
