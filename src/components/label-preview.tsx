'use client';

import { AlignCenter, AlignLeft, AlignRight, FileText, Info, Loader2, Settings2 } from 'lucide-react'; // Added Download icon
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
  // Simplified: Return the original dataUri as no preview-specific processing is implemented yet.
  return dataUri;
}


export function LabelPreview({
  summary,
  items,
  dimensions,
  imageDataUri, // Receive image URI from parent
  isProcessing, // Receive loading state from parent
  processingError, // Receive error state from parent
}: LabelPreviewProps) {
  // Internal state for preview generation and formatting
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [formattingOptions, setFormattingOptions] = useState<LabelFormattingOptions>({
    fontFamily: 'Helvetica',
    textAlign: 'left',
  });
  const [includeImageChecked, setIncludeImageChecked] = useState(false);
  const [previewDisplayImageUri, setPreviewDisplayImageUri] = useState<string | null>(null);
  const [isProcessingImageForPreview, startImagePreviewTransition] = useTransition();
  const { toast } = useToast(); // Keep toast for internal preview errors if needed
  const [pdfGenerationKey, setPdfGenerationKey] = useState(0);
  const [isGeneratingPreview, startPreviewTransition] = useTransition();

  // Remove dependencies on variables that no longer exist in this component
  // const isLoadingPreviewInternally = isGeneratingPreview || isProcessingImageForPreview;
  const isLoadingPreviewInternally = isGeneratingPreview;
  const labelAspectRatio = useMemo(() => dimensions.labelWidthInches / dimensions.labelHeightInches, [dimensions]);

  // Process image specifically for preview display if checked and URI exists
  useEffect(() => {
    if (includeImageChecked && imageDataUri) {
      startImagePreviewTransition(async () => {
        try {
          const processedUri = await processImageForPreview(imageDataUri);
          setPreviewDisplayImageUri(processedUri);
        } catch (error) {
          console.error("Image preview processing error:", error);
          setPreviewDisplayImageUri(null);
          toast({ title: 'Preview Error', description: 'Failed to process image for preview.', variant: 'destructive' });
        }
      });
    } else {
      setPreviewDisplayImageUri(null);
    }
  }, [includeImageChecked, imageDataUri, toast]); // Add toast dependency

  // Generate PDF preview whenever relevant props or formatting change
  useEffect(() => {
    let objectUrl: string | null = null;

    const generatePreview = async () => {
      // Only generate if not processing from parent and content exists
      if (!isProcessing && summary && items.length > 0) {
        try {
           const imageToInclude = includeImageChecked ? previewDisplayImageUri : null;
          // Removed dependency on isGeneratingPdf state
          const labelContent: LabelContent = { summary, items, formatting: formattingOptions, imageDataUri: imageToInclude };
          const pdfBytes = await generatePdf(dimensions, labelContent);
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          objectUrl = URL.createObjectURL(blob);
          setPdfPreviewUrl(objectUrl);
          setPdfGenerationKey(prev => prev + 1);
        } catch (error) {
          console.error('Preview PDF generation failed:', error);
          setPdfPreviewUrl(null);
          toast({ title: 'Preview Error', description: 'Failed to generate PDF preview.', variant: 'destructive' });
        }
      } else {
        setPdfPreviewUrl(null); // Clear preview if processing or no content
      }
    };

    const timeoutId = setTimeout(() => {
      startPreviewTransition(generatePreview);
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  // Removed dependencies that no longer exist or affect preview: canGenerate, processedImageDataUri
  }, [summary, items, dimensions, formattingOptions, toast, previewDisplayImageUri, includeImageChecked, isProcessing]);


  const handleFormattingChange = <K extends keyof LabelFormattingOptions>(
    key: K,
    // Add explicit type 'string' for value from ToggleGroup
    value: LabelFormattingOptions[K] | string
  ) => {
    // Ensure value is of the correct type before setting state
    if (key === 'textAlign' && ['left', 'center', 'right'].includes(value as string)) {
        setFormattingOptions(prev => ({ ...prev, [key]: value as LabelFormattingOptions['textAlign'] }));
    } else if (key === 'fontFamily' && ['Helvetica', 'Times-Roman', 'Courier'].includes(value as string)) {
        setFormattingOptions(prev => ({ ...prev, [key]: value as LabelFormattingOptions['fontFamily'] }));
    }
  };


  return (
    // Wrap in TooltipProvider if using tooltips internally, otherwise parent provider is fine
    // <TooltipProvider>
      <Card className="flex flex-col h-full shadow-md">
        <CardHeader className="flex flex-row items-center justify-between p-4 border-b">
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Label Preview
          </CardTitle>
          {/* Keep formatting controls as they affect the preview */}
          <Popover>
            <PopoverTrigger asChild>
              {/* Disable formatting if parent is processing or preview is generating */}
              <Button variant="ghost" size="icon" disabled={isProcessing || isLoadingPreviewInternally} aria-label="Formatting Options">
                <Settings2 className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-4 space-y-4 bg-card border shadow-lg rounded-md">
              <div className="space-y-2">
                <Label htmlFor="font-family" className="text-sm font-medium">Font Family</Label>
                <Select
                  value={formattingOptions.fontFamily}
                  onValueChange={(value) => handleFormattingChange('fontFamily', value as typeof formattingOptions.fontFamily)}
                  disabled={isProcessing || isLoadingPreviewInternally}
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
                  // Type assertion needed here if handleFormattingChange expects specific types
                  onValueChange={(value: string) => { // Explicitly type value as string
                    if (value) handleFormattingChange('textAlign', value)
                  }}
                  className="flex justify-around"
                  aria-label="Text Alignment"
                  disabled={isProcessing || isLoadingPreviewInternally}
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
                  // Disable if no image or parent is processing or internal processing active
                  disabled={!imageDataUri || isProcessing || isProcessingImageForPreview}
                  aria-label="Include image in preview"
                />
                <Label htmlFor="include-image-preview" className="text-sm font-medium cursor-pointer"> Include Image </Label>
                {isProcessingImageForPreview && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              </div>
              {!imageDataUri && (
                <p className="text-xs text-muted-foreground">Upload photo to enable image inclusion.</p>
              )}
            </PopoverContent>
          </Popover>
        </CardHeader>
        <CardContent className="flex-grow flex flex-col items-center justify-center p-4 bg-muted/30 min-h-[200px] relative overflow-hidden">
          {/* Display parent processing error */}
          {processingError && (
            <Alert variant="destructive" className="absolute top-4 left-4 right-4 max-w-sm mx-auto z-20 shadow-lg">
              <Info className="h-4 w-4" />
              <AlertTitle>Processing Error</AlertTitle>
              <AlertDescription>{processingError}</AlertDescription>
            </Alert>
          )}
          {/* Updated loading logic based only on parent state */}
          {isProcessing && !pdfPreviewUrl && (
            <div className="w-full h-full flex items-center justify-center absolute inset-0 bg-background/50 z-10">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Processing Image...</p>
              </div>
            </div>
          )}
          {/* Show placeholder only when not processing and no summary */}
          {!isProcessing && !summary && !processingError && (
            <div className="text-center text-muted-foreground text-base italic p-4">
              Upload photo to generate preview.
            </div>
          )}
          {/* PDF Preview Area */}
          <div
              className="relative w-full max-w-md mx-auto flex-grow flex items-center justify-center"
              style={{ aspectRatio: labelAspectRatio }}
          >
              {pdfPreviewUrl ? (
                  <iframe
                      key={pdfGenerationKey} // Force refresh when URL changes
                      src={pdfPreviewUrl}
                      title="Label Preview"
                      className={cn(
                          "w-full h-full border rounded-md shadow-lg bg-white",
                          // Dim slightly only if internal preview regeneration is happening
                          isLoadingPreviewInternally && "opacity-50"
                      )}
                      style={{ contain: 'content' }}
                  />
              ) : (
                  // Show skeleton only if parent *isn't* processing but we expect content (summary exists)
                  !isProcessing && summary && <Skeleton className="w-full h-full rounded-md" style={{ aspectRatio: labelAspectRatio }} />
              )}
               {/* Show loader overlay only during internal preview regeneration */} 
               {isLoadingPreviewInternally && pdfPreviewUrl && (
                  <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-10 rounded-md">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
              )}
          </div>
        </CardContent>
        {/* Footer removed as actions are in parent */}
      </Card>
    // </TooltipProvider>
  );
}
