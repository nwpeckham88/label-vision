'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating a concise summary from a list of identified items.
 *
 * - generateSummaryFromItems - A function that generates a summary based on identified items.
 * - GenerateSummaryFromItemsInput - The input type for the generateSummaryFromItems function.
 * - GenerateSummaryFromItemsOutput - The return type for the generateSummaryFromItems function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const GenerateSummaryFromItemsInputSchema = z.object({
  items: z.array(z.string()).describe('A list of identified items to summarize.'),
});
export type GenerateSummaryFromItemsInput = z.infer<typeof GenerateSummaryFromItemsInputSchema>;

const GenerateSummaryFromItemsOutputSchema = z.object({
  summary: z.string().describe('A concise summary text based on the provided items.'),
});
export type GenerateSummaryFromItemsOutput = z.infer<typeof GenerateSummaryFromItemsOutputSchema>;

export async function generateSummaryFromItems(input: GenerateSummaryFromItemsInput): Promise<GenerateSummaryFromItemsOutput> {
  return generateSummaryFromItemsFlow(input);
}

const generateSummaryPrompt = ai.definePrompt({
  name: 'generateSummaryPrompt',
  input: {
    schema: z.object({
      items: z.array(z.string()).describe('A list of identified items to summarize.'),
    }),
  },
  output: {
    schema: z.object({
      summary: z.string().describe('A concise summary text based on the provided items.'),
    }),
  },
  prompt: `You are a labelling expert. Given a list of items, generate a concise summary (max 5 words) suitable for a label header. Focus on the most prominent or defining items if the list is long.

Items: {{#each items}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}

Summary:`,
});

const generateSummaryFromItemsFlow = ai.defineFlow<
  typeof GenerateSummaryFromItemsInputSchema,
  typeof GenerateSummaryFromItemsOutputSchema
>(
  {
    name: 'generateSummaryFromItemsFlow',
    inputSchema: GenerateSummaryFromItemsInputSchema,
    outputSchema: GenerateSummaryFromItemsOutputSchema,
  },
  async input => {
    // Handle empty item list gracefully
    if (input.items.length === 0) {
      return { summary: 'Empty' };
    }
    const {output} = await generateSummaryPrompt(input);
    return output!;
  }
);
