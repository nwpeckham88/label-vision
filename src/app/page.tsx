
'use client';

import type { FC } from 'react';
import { useState, useCallback, useTransition } from 'react';
import { identifyItemsFromPhoto } from '@/ai/flows/identify-items-from-photo';
import { generateLabelFromItems } from '@/ai/flows/generate-label-from-items';
import { PhotoUploader } from '@/components/photo-uploader';
import { ItemList } from '@/components/item-list';
import { LabelPreview } from '@/components/label-preview';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Wand2, AlertTriangle, Upload, Package, FileText } from 'lucide-react'; // Import necessary icons


const LabelVisionPage: FC = () => {
  const [photoDataUri, setPhotoDataUri] = useState<string | null>(null);
  const [identifiedItems, setIdentifiedItems] = useState<string[]>([]);
  const [generatedLabel, setGeneratedLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isIdentifying, startIdentifyingTransition] = useTransition();
  const [isGeneratingLabel, startGeneratingLabelTransition] = useTransition();

  const { toast } = useToast();

  const handlePhotoUpload = useCallback((dataUri: string) => {
    setPhotoDataUri(dataUri);
    setIdentifiedItems([]); // Clear previous items
    setGeneratedLabel(null); // Clear previous label
    setError(null); // Clear previous errors
  }, []);

   const handlePhotoClear = useCallback(() => {
    setPhotoDataUri(null);
    setIdentifiedItems([]);
    setGeneratedLabel(null);
    setError(null);
  }, []);


  const handleIdentifyItems = useCallback(async () => {
    if (!photoDataUri) {
      setError('Please upload a photo first.');
      return;
    }
    setError(null);
    setIdentifiedItems([]); // Clear previous items before starting
    setGeneratedLabel(null); // Clear label as well

    startIdentifyingTransition(async () => {
      try {
        const result = await identifyItemsFromPhoto({ photoDataUri });
        setIdentifiedItems(result.items);
        if (result.items.length > 0) {
          // Automatically trigger label generation after successful identification
          handleGenerateLabel(result.items);
        } else {
            toast({ title: 'Identification Complete', description: 'No items were identified in the photo.'});
        }
      } catch (err) {
        console.error('Identification error:', err);
        setError('Failed to identify items. Please try again.');
        toast({ title: 'Error', description: 'Item identification failed.', variant: 'destructive' });
      }
    });
  }, [photoDataUri, toast]); // Removed handleGenerateLabel from dependency array


  const handleGenerateLabel = useCallback((items: string[]) => {
     if (items.length === 0) {
      // Don't try to generate if no items were identified
      setGeneratedLabel(''); // Set empty label instead of null to show the empty text area
      return;
    }
    setError(null);

    startGeneratingLabelTransition(async () => {
      try {
        const result = await generateLabelFromItems({ items });
        setGeneratedLabel(result.labelText);
         toast({ title: 'Label Generated', description: 'Label text created based on identified items.'});
      } catch (err) {
        console.error('Label generation error:', err);
        setError('Failed to generate label. Please try again.');
        toast({ title: 'Error', description: 'Label generation failed.', variant: 'destructive' });
      }
    });
  }, [toast]); // Depends only on toast

  const handleLabelTextChange = (newText: string) => {
    // Allow user to edit the generated label
    setGeneratedLabel(newText);
  };

  const isLoading = isIdentifying || isGeneratingLabel;
  const itemsIdentified = identifiedItems.length > 0;

  return (
    <div className="container mx-auto p-4 md:p-8 min-h-screen flex flex-col bg-background">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2 flex items-center gap-2">
          <Wand2 className="text-primary h-8 w-8" /> Label Vision
        </h1>
        <p className="text-muted-foreground">
          Upload a photo, identify items with AI, and generate a printable label instantly.
        </p>
      </header>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <main className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Column 1: Upload */}
        <div className="flex flex-col gap-6">
         <Card>
            <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                 <Upload className="h-5 w-5" />
                 Upload Photo
                </CardTitle>
            </CardHeader>
            <CardContent>
                <PhotoUploader
                onPhotoUploaded={handlePhotoUpload}
                onPhotoCleared={handlePhotoClear}
                disabled={isLoading}
                />
                <Button
                    onClick={handleIdentifyItems}
                    disabled={!photoDataUri || isLoading}
                    className="w-full mt-4"
                    aria-label="Identify Items"
                >
                   <Wand2 className="mr-2" />
                    {isIdentifying ? 'Identifying...' : 'Identify Items'}
                </Button>
            </CardContent>
         </Card>
        </div>

        {/* Column 2: Identify */}
        <div className="flex flex-col gap-6">
            <ItemList items={identifiedItems} isLoading={isIdentifying} />
        </div>

        {/* Column 3: Generate & Print */}
        <div className="flex flex-col gap-6">
           <LabelPreview
            labelText={generatedLabel}
            isLoading={isGeneratingLabel}
            onLabelTextChange={handleLabelTextChange}
            itemsIdentified={itemsIdentified || generatedLabel !== null} // Enable buttons if items identified OR label exists
           />
        </div>
      </main>

      <footer className="mt-12 text-center text-sm text-muted-foreground">
        <Separator className="my-4" />
        Powered by Firebase Studio & Genkit
      </footer>
    </div>
  );
};

export default LabelVisionPage;

