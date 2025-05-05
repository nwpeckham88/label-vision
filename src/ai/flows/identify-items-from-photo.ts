'use server';

/**
 * @fileOverview An item identification AI agent that identifies items from a photo.
 *
 * - identifyItemsFromPhoto - A function that handles the item identification process.
 * - IdentifyItemsFromPhotoInput - The input type for the identifyItemsFromPhoto function.
 * - IdentifyItemsFromPhotoOutput - The return type for the identifyItemsFromPhoto function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const IdentifyItemsFromPhotoInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type IdentifyItemsFromPhotoInput = z.infer<typeof IdentifyItemsFromPhotoInputSchema>;

const IdentifyItemsFromPhotoOutputSchema = z.object({
  items: z.array(z.string()).describe('A list of items identified in the photo.'),
});
export type IdentifyItemsFromPhotoOutput = z.infer<typeof IdentifyItemsFromPhotoOutputSchema>;

export async function identifyItemsFromPhoto(input: IdentifyItemsFromPhotoInput): Promise<IdentifyItemsFromPhotoOutput> {
  return identifyItemsFromPhotoFlow(input);
}

const identifyItemsFromPhotoPrompt = ai.definePrompt({
  name: 'identifyItemsFromPhotoPrompt',
  input: {
    schema: z.object({
      photoDataUri: z
        .string()
        .describe(
          "A photo, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
        ),
    }),
  },
  output: {
    schema: z.object({
      items: z.array(z.string()).describe('A list of items identified in the photo.'),
    }),
  },
  prompt: `You are an expert in machine vision. You will identify the items in the photo.

Here is the photo: {{media url=photoDataUri}}

Return a list of the items in the photo.`,
});

const identifyItemsFromPhotoFlow = ai.defineFlow<
  typeof IdentifyItemsFromPhotoInputSchema,
  typeof IdentifyItemsFromPhotoOutputSchema
>({
  name: 'identifyItemsFromPhotoFlow',
  inputSchema: IdentifyItemsFromPhotoInputSchema,
  outputSchema: IdentifyItemsFromPhotoOutputSchema,
}, async input => {
  const {output} = await identifyItemsFromPhotoPrompt(input);
  return output!;
});
