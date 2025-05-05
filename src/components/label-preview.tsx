'use client';

import { AlignCenter, AlignLeft, AlignRight, FileText, Info, Loader2, Settings2 } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { LabelContent, LabelDimensions, LabelFormattingOptions } from '@/services/label-printer';
import { generatePdf } from '@/services/label-printer';

export interface LabelPreviewProps {
  dimensions: LabelDimensions;
  summary: string | null;
  items: string[];
  imageDataUri?: string | null; // Image data from parent
  isProcessing?: boolean;       // Loading state from parent
  processingError?: string | null; // Error state from parent
}

// Constants for image processing (internal to preview if needed for display refinement)
// If heavy processing is done *before* sending to preview, these might not be needed here.
// const MAX_IMAGE_WIDTH_PX = 200;
// const MAX_IMAGE_HEIGHT_PX = 100;

// If image processing for display (like grayscale) is desired *within* the preview,
// keep a simplified version. Otherwise, remove this function if parent sends final image.
async function processImageForPreview(dataUri: string): Promise<string | null> {
  // Simplified: Just load and maybe resize slightly for display consistency if needed.
  // Or just return the original dataUri if no preview-specific processing required.
  return dataUri;
  // Example resize:
  // return new Promise((resolve) => { ... basic resize logic ... resolve(canvas.toDataURL(...)); });
}


export function LabelPreview({
  summary,
  items,
  dimensions,
  imageDataUri, // Renamed prop, now directly from parent
  isProcessing,
  processingError,
}: LabelPreviewProps) {
  // Internal state for preview-specific things
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [formattingOptions, setFormattingOptions] = useState<LabelFormattingOptions>({
    fontFamily: 'Helvetica',
    textAlign: 'left',
  });
  const [includeImageChecked, setIncludeImageChecked] = useState(false);
  // State for image *display* in preview, maybe processed differently than for print
  const [previewDisplayImageUri, setPreviewDisplayImageUri] = useState<string | null>(null);
  const [isProcessingImageForPreview, startImagePreviewTransition] = useTransition();
  const { toast } = useToast();
  const [pdfGenerationKey, setPdfGenerationKey] = useState(0);
  const [isGeneratingPreview, startPreviewTransition] = useTransition();

  const isLoading = isProcessing || isGeneratingPreview || isProcessingImageForPreview;
  const labelAspectRatio = useMemo(() => dimensions.labelWidthInches / dimensions.labelHeightInches, [dimensions]);

  // Process image specifically for preview display if needed
  useEffect(() => {
    if (includeImageChecked && imageDataUri) {
      startImagePreviewTransition(async () => {
        try {
          // Use the potentially simplified processing function
          const processedUri = await processImageForPreview(imageDataUri);
          setPreviewDisplayImageUri(processedUri);
        } catch (error) {
          console.error("Image preview processing error:", error);
          setPreviewDisplayImageUri(null); // Fallback or show error?
        }
      });
    } else {
      setPreviewDisplayImageUri(null);
    }
  }, [includeImageChecked, imageDataUri]);

  // Generate PDF preview whenever relevant props change
  useEffect(() => {
    let objectUrl: string | null = null;

    const generatePreview = async () => {
      // Preview generation depends only on props passed in
      if (!isProcessing && summary && items.length > 0) { 
        try {
          const imageToInclude = includeImageChecked ? previewDisplayImageUri : null;
          const labelContent: LabelContent = { summary, items, formatting: formattingOptions, imageDataUri: imageToInclude };
          const pdfBytes = await generatePdf(dimensions, labelContent);
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          objectUrl = URL.createObjectURL(blob);
          setPdfPreviewUrl(objectUrl);
          setPdfGenerationKey(prev => prev + 1);
        } catch (error) {
          console.error('Preview PDF generation failed:', error);
          setPdfPreviewUrl(null);
          // Consider showing a toast error specific to preview generation
          // toast({ title: 'Preview Error', description: 'Failed to generate PDF preview.', variant: 'destructive' });
        }
      } else {
        setPdfPreviewUrl(null); // Clear preview if processing or no content
      }
    };

    // Debounce preview generation slightly
    const timeoutId = setTimeout(() => {
      startPreviewTransition(generatePreview);
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  // Depend on props that affect the visual output of the PDF
  }, [summary, items, dimensions, formattingOptions, toast, previewDisplayImageUri, includeImageChecked, isProcessing]);


  // Removed handleRegenerateClick, handlePrint, handleDownloadPdf as logic moved to parent

  const handleFormattingChange = <K extends keyof LabelFormattingOptions>(
    key: K,
    value: LabelFormattingOptions[K]
  ) => {
    setFormattingOptions(prev => ({ ...prev, [key]: value }));
  };


  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Label Preview
        </CardTitle>
        {/* Keep formatting controls as they affect the preview */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" disabled={isLoading} aria-label="Formatting Options">
              <Settings2 className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="font-family" className="text-sm font-medium">Font Family</Label>
              <Select
                value={formattingOptions.fontFamily}
                onValueChange={(value) => handleFormattingChange('fontFamily', value as typeof formattingOptions.fontFamily)}
                disabled={isLoading}
              >
                <SelectTrigger id="font-family" className="w-full">
                  <SelectValue placeholder="Select Font" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Helvetica">Helvetica (Sans-Serif)</SelectItem>
                  <SelectItem value="Times-Roman">Times New Roman (Serif)</SelectItem>
                  <SelectItem value="Courier">Courier (Monospace)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Text Alignment</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={formattingOptions.textAlign}
                onValueChange={(value) => {
                  if (value) handleFormattingChange('textAlign', value as typeof formattingOptions.textAlign)
                }}
                className="flex justify-around"
                aria-label="Text Alignment"
                disabled={isLoading}
              >
                <ToggleGroupItem value="left" aria-label="Left Align"> <AlignLeft className="h-4 w-4" /> </ToggleGroupItem>
                <ToggleGroupItem value="center" aria-label="Center Align"> <AlignCenter className="h-4 w-4" /> </ToggleGroupItem>
                <ToggleGroupItem value="right" aria-label="Right Align"> <AlignRight className="h-4 w-4" /> </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="include-image-preview"
                checked={includeImageChecked}
                onCheckedChange={(checked) => setIncludeImageChecked(Boolean(checked))}
                disabled={!imageDataUri || isLoading || isProcessingImageForPreview}
                aria-label="Include image in preview"
              />
              <Label htmlFor="include-image-preview" className="text-sm font-medium cursor-pointer"> Include Image </Label>
              {isProcessingImageForPreview && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
            {!imageDataUri && (
              <p className="text-xs text-muted-foreground">Upload photo to enable image inclusion.</p>
            )}
          </PopoverContent>
        </Popover>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col items-center justify-center p-2 bg-muted/20 min-h-[150px]">
        {processingError && (
          <Alert variant="destructive" className="mb-4 w-full max-w-sm">
            <Info className="h-4 w-4" />
            <AlertTitle>Image Processing Error</AlertTitle>
            <AlertDescription>
              {processingError}
              {/* Removed dismiss button, parent controls error display */}
            </AlertDescription>
          </Alert>
        )}
        {/* Use parent's isProcessing state for the main loading skeleton */}
        {isProcessing && !pdfPreviewUrl && (
          <div className="w-full h-full flex items-center justify-center">
            <Skeleton className="w-[80%] h-[80%] max-w-xs max-h-60" style={{ aspectRatio: labelAspectRatio }} />
          </div>
        )}
        {/* Show specific preview loading state */}
        {isGeneratingPreview && pdfPreviewUrl && (
             <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 rounded-md">
               <Loader2 className="h-8 w-8 animate-spin text-primary" />
             </div>
        )}
        {!isProcessing && !summary && !processingError && (
          <div className="text-center text-muted-foreground text-sm p-4">
            {summary === 'Empty' ? 'No items identified to generate a label.' : 'Upload photo to generate preview.'}
          </div>
        )}
        {pdfPreviewUrl && (
          <div className="relative w-full h-full max-w-md mx-auto" style={{ aspectRatio: labelAspectRatio }}>
            {/* Removed internal loading overlay, parent loading state handles skeleton */}
            <iframe
              key={pdfGenerationKey}
              src={pdfPreviewUrl}
              title="Label Preview"
              className={cn(
                "w-full h-full border rounded-md shadow-sm",
                isGeneratingPreview && "opacity-50" // Dim slightly if regenerating preview
              )}
              style={{ contain: 'content' }}
            />
          </div>
        )}
      </CardContent>
       {/* Footer removed as actions (Print, Download, Regenerate) are handled by the parent */}
       {/* <CardFooter> ... </CardFooter> */}
    </Card>
  );
}
