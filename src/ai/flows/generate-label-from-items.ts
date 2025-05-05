'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating a label from a list of identified items.
 *
 * - generateLabelFromItems - A function that generates a label based on identified items.
 * - GenerateLabelFromItemsInput - The input type for the generateLabelFromItems function.
 * - GenerateLabelFromItemsOutput - The return type for the generateLabelFromItems function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const GenerateLabelFromItemsInputSchema = z.object({
  items: z.array(z.string()).describe('A list of identified items to include on the label.'),
});
export type GenerateLabelFromItemsInput = z.infer<typeof GenerateLabelFromItemsInputSchema>;

const GenerateLabelFromItemsOutputSchema = z.object({
  labelText: z.string().describe('The text to be printed on the label.'),
});
export type GenerateLabelFromItemsOutput = z.infer<typeof GenerateLabelFromItemsOutputSchema>;

export async function generateLabelFromItems(input: GenerateLabelFromItemsInput): Promise<GenerateLabelFromItemsOutput> {
  return generateLabelFromItemsFlow(input);
}

const generateLabelPrompt = ai.definePrompt({
  name: 'generateLabelPrompt',
  input: {
    schema: z.object({
      items: z.array(z.string()).describe('A list of identified items to include on the label.'),
    }),
  },
  output: {
    schema: z.object({
      labelText: z.string().describe('The text to be printed on the label.'),
    }),
  },
  prompt: `You are a label generation expert. Given a list of items, generate concise label text suitable for printing on a label.

Items: {{#each items}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}

Label Text:`, 
});

const generateLabelFromItemsFlow = ai.defineFlow<
  typeof GenerateLabelFromItemsInputSchema,
  typeof GenerateLabelFromItemsOutputSchema
>(
  {
    name: 'generateLabelFromItemsFlow',
    inputSchema: GenerateLabelFromItemsInputSchema,
    outputSchema: GenerateLabelFromItemsOutputSchema,
  },
  async input => {
    const {output} = await generateLabelPrompt(input);
    return output!;
  }
);
