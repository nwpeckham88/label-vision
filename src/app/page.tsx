
'use client';

import type { FC } from 'react';
import { useState, useCallback, useTransition, useMemo } from 'react';
import { identifyItemsFromPhoto } from '@/ai/flows/identify-items-from-photo';
import { generateSummaryFromItems } from '@/ai/flows/generate-label-from-items';
import { PhotoUploader } from '@/components/photo-uploader';
import { ItemList } from '@/components/item-list';
import { LabelPreview } from '@/components/label-preview';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Wand2, AlertTriangle, Upload, Package, Ruler } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PrinterConfig } from '@/services/label-printer';
import { Label } from '@/components/ui/label';

// Define standard label sizes
const LABEL_SIZES: Record<string, PrinterConfig> = {
  small: { printerName: 'DefaultLabelPrinter', labelWidthInches: 2.25, labelHeightInches: 1.25 },
  medium: { printerName: 'DefaultLabelPrinter', labelWidthInches: 4, labelHeightInches: 2 },
  large: { printerName: 'DefaultLabelPrinter', labelWidthInches: 4, labelHeightInches: 6 },
  'shipping': { printerName: 'DefaultLabelPrinter', labelWidthInches: 4, labelHeightInches: 6 }, // Alias for large
  'address': { printerName: 'DefaultLabelPrinter', labelWidthInches: 3.5, labelHeightInches: 1.125 },
};
const DEFAULT_LABEL_SIZE_KEY = 'small';


const LabelVisionPage: FC = () => {
  const [photoDataUri, setPhotoDataUri] = useState<string | null>(null);
  const [identifiedItems, setIdentifiedItems] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [selectedLabelSizeKey, setSelectedLabelSizeKey] = useState<string>(DEFAULT_LABEL_SIZE_KEY);
  const [error, setError] = useState<string | null>(null);

  const [isIdentifying, startIdentifyingTransition] = useTransition();
  const [isGeneratingSummary, startGeneratingSummaryTransition] = useTransition();

  const { toast } = useToast();

  const selectedConfig = useMemo(() => LABEL_SIZES[selectedLabelSizeKey], [selectedLabelSizeKey]);

  const handlePhotoUpload = useCallback((dataUri: string) => {
    setPhotoDataUri(dataUri);
    setIdentifiedItems([]);
    setSummary(null);
    setError(null);
  }, []);

   const handlePhotoClear = useCallback(() => {
    setPhotoDataUri(null);
    setIdentifiedItems([]);
    setSummary(null);
    setError(null);
  }, []);

  const handleGenerateOrRegenerateSummary = useCallback(async (itemsToSummarize: string[]) => {
    if (itemsToSummarize.length === 0) {
      setSummary('Empty');
      return;
    }
    setError(null);
    setSummary(null);
    startGeneratingSummaryTransition(async () => {
      try {
        const result = await generateSummaryFromItems({ items: itemsToSummarize });
        setSummary(result.summary);
        toast({ title: 'Summary Generated', description: 'Label summary created.' });
      } catch (err) {
        console.error('Summary generation error:', err);
        setError('Failed to generate summary. Please try again.');
        toast({ title: 'Error', description: 'Summary generation failed.', variant: 'destructive' });
        setSummary(null);
      }
    });
  }, [toast]);

  const handleIdentifyItems = useCallback(async () => {
    if (!photoDataUri) {
      setError('Please upload a photo first.');
      return;
    }
    setError(null);
    setIdentifiedItems([]);
    setSummary(null);

    startIdentifyingTransition(async () => {
      try {
        const result = await identifyItemsFromPhoto({ photoDataUri });
        const newItems = result.items || [];
        setIdentifiedItems(newItems);
        if (newItems.length > 0) {
           toast({ title: 'Identification Complete', description: `${newItems.length} item(s) identified. Generating summary...`});
           handleGenerateOrRegenerateSummary(newItems);
        } else {
            toast({ title: 'Identification Complete', description: 'No items were identified in the photo.'});
            setSummary('Empty');
        }
      } catch (err) {
        console.error('Identification error:', err);
        setError('Failed to identify items. Please try again.');
        toast({ title: 'Error', description: 'Item identification failed.', variant: 'destructive' });
        setIdentifiedItems([]);
        setSummary(null);
      }
    });
  }, [photoDataUri, toast, handleGenerateOrRegenerateSummary]);

  const handleLabelSizeChange = (value: string) => {
    setSelectedLabelSizeKey(value);
  };

  const isLoading = isIdentifying || isGeneratingSummary;
  const canGenerate = !isLoading && identifiedItems.length > 0 && summary !== null && summary !== 'Empty';

  return (
    <div className="container mx-auto p-4 md:p-8 min-h-screen flex flex-col bg-background">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2 flex items-center gap-2">
          <Wand2 className="text-primary h-8 w-8" /> Label Vision
        </h1>
        <p className="text-muted-foreground">
          Upload a photo, identify items, generate a label, and format it for printing or saving.
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
        {/* Column 1: Upload & Settings */}
        <div className="flex flex-col gap-6 md:order-1">
         <Card>
            <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                 <Upload className="h-5 w-5" />
                 1. Upload Photo
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
                    aria-label="Identify Items and Generate Summary"
                >
                   <Wand2 className="mr-2" />
                    {isIdentifying ? 'Identifying...' : (isGeneratingSummary ? 'Generating Summary...' : 'Identify & Summarize')}
                </Button>
            </CardContent>
         </Card>
         {/* Keep Label Settings here for flow */}
         <Card>
           <CardHeader>
             <CardTitle className="text-lg font-semibold flex items-center gap-2">
               <Ruler className="h-5 w-5" />
               2. Label Settings
             </CardTitle>
           </CardHeader>
           <CardContent>
             <Label htmlFor="label-size" className="mb-2 block">Label Size</Label>
             <Select
               value={selectedLabelSizeKey}
               onValueChange={handleLabelSizeChange}
               disabled={isLoading} // Disable while loading anything
             >
               <SelectTrigger id="label-size" className="w-full">
                 <SelectValue placeholder="Select label size" />
               </SelectTrigger>
               <SelectContent>
                 {Object.entries(LABEL_SIZES).map(([key, config]) => (
                   <SelectItem key={key} value={key}>
                     {key.charAt(0).toUpperCase() + key.slice(1)} ({config.labelWidthInches} x {config.labelHeightInches}")
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
           </CardContent>
         </Card>
        </div>

        {/* Column 2: Identify */}
        <div className="flex flex-col gap-6 md:order-2">
            <ItemList items={identifiedItems} isLoading={isIdentifying} title="3. Identified Items" />
        </div>

        {/* Column 3: Generate & Print */}
        <div className="flex flex-col gap-6 md:order-3">
           <LabelPreview
              summary={summary}
              items={identifiedItems}
              config={selectedConfig}
              isGeneratingSummary={isGeneratingSummary}
              canGenerate={canGenerate}
              onRegenerateSummary={handleGenerateOrRegenerateSummary}
              photoDataUri={photoDataUri} // Pass the original photo URI
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
