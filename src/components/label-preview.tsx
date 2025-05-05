'use client';

import type * as React from 'react';
import { useState, useEffect, useMemo, useCallback, useTransition } from 'react';
import { Printer, FileText, Loader2, RefreshCw, Settings2, Pilcrow, AlignLeft, AlignCenter, AlignRight, CaseSensitive, Image as ImageIcon, WifiOff, ServerCrash, Info } from 'lucide-react'; // Add WifiOff, ServerCrash, Info

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
// Rename PrinterConfig to LabelDimensions to avoid confusion with actual printer config
import type { LabelDimensions, LabelContent, LabelFormattingOptions } from '@/services/label-printer';
import { generatePdf } from '@/services/label-printer';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'; // Import Tooltip components

interface LabelPreviewProps {
  summary: string | null;
  items: string[];
  dimensions: LabelDimensions; // Use LabelDimensions
  selectedPrinter: string | null; // Name of the selected printer
  apiStatus: 'pending' | 'healthy' | 'unhealthy'; // Status of the Python API
  isGeneratingSummary: boolean;
  canGenerate: boolean; // True when items identified and summary ready
  onRegenerateSummary: (items: string[]) => void;
  photoDataUri: string | null;
  pythonApiUrl: string; // Base URL for the Python desktop API
}

// Constants for image processing
const MAX_IMAGE_WIDTH_PX = 200;
const MAX_IMAGE_HEIGHT_PX = 100;

// Image processing function (resize and convert to grayscale Data URI)
async function processImageForLabel(dataUri: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      let newWidth = img.width;
      let newHeight = img.height;
      const scaleX = MAX_IMAGE_WIDTH_PX / img.width;
      const scaleY = MAX_IMAGE_HEIGHT_PX / img.height;
      const scale = Math.min(scaleX, scaleY, 1);

      newWidth = img.width * scale;
      newHeight = img.height * scale;

      canvas.width = newWidth;
      canvas.height = newHeight;
      ctx.drawImage(img, 0, 0, newWidth, newHeight);

      // Convert to grayscale
      const imageData = ctx.getImageData(0, 0, newWidth, newHeight);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = avg; data[i + 1] = avg; data[i + 2] = avg;
      }
      ctx.putImageData(imageData, 0, 0);

      // Basic thresholding for black/white
      const threshold = 128;
      const thresholdedData = ctx.getImageData(0, 0, newWidth, newHeight);
      const tData = thresholdedData.data;
      for (let i = 0; i < tData.length; i += 4) {
        const gray = tData[i];
        const bw = gray < threshold ? 0 : 255;
        tData[i] = bw; tData[i + 1] = bw; tData[i + 2] = bw;
      }
      ctx.putImageData(thresholdedData, 0, 0);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      console.error("Failed to load image for processing.");
      resolve(null);
    };
    img.src = dataUri;
  });
}


export function LabelPreview({
  summary,
  items,
  dimensions, // Renamed prop
  selectedPrinter,
  apiStatus,
  isGeneratingSummary,
  canGenerate,
  onRegenerateSummary,
  photoDataUri,
  pythonApiUrl, // New prop
}: LabelPreviewProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [formattingOptions, setFormattingOptions] = useState<LabelFormattingOptions>({
    fontFamily: 'Helvetica',
    textAlign: 'left',
  });
  const [includeImageChecked, setIncludeImageChecked] = useState(false);
  const [processedImageDataUri, setProcessedImageDataUri] = useState<string | null>(null);
  const [isProcessingImage, startImageProcessingTransition] = useTransition();
  const [printError, setPrintError] = useState<string | null>(null);

  const { toast } = useToast();
  const [pdfGenerationKey, setPdfGenerationKey] = useState(0);
  const [isGeneratingPreview, startPreviewTransition] = useTransition();

  const isLoading = isGeneratingSummary || isPrinting || isGeneratingPdf || isGeneratingPreview || isProcessingImage;
  const labelAspectRatio = useMemo(() => dimensions.labelWidthInches / dimensions.labelHeightInches, [dimensions]);
  const printApiUrl = `${pythonApiUrl}/print`; // Construct the full print API URL

  // --- Determine Print Button State ---
  const isPrintDisabled = isLoading || !canGenerate || !selectedPrinter || apiStatus !== 'healthy';
  const getPrintButtonTooltip = () => {
    if (!canGenerate) return "Generate label content first";
    if (apiStatus === 'pending') return "Connecting to print service...";
    if (apiStatus === 'unhealthy') return "Print service unavailable";
    if (!selectedPrinter) return "Select a printer";
    return "Send label to printer";
  }

  // Process image when checkbox is checked and photo exists
  useEffect(() => {
    if (includeImageChecked && photoDataUri) {
      startImageProcessingTransition(async () => {
        try {
          const processedUri = await processImageForLabel(photoDataUri);
          setProcessedImageDataUri(processedUri);
          if (!processedUri) {
            toast({ title: 'Image Error', description: 'Could not process image for label.', variant: 'destructive' });
          }
        } catch (error) {
          console.error("Image processing error:", error);
          toast({ title: 'Image Error', description: 'Failed to process image.', variant: 'destructive' });
          setProcessedImageDataUri(null);
        }
      });
    } else {
      setProcessedImageDataUri(null);
    }
  }, [includeImageChecked, photoDataUri, toast]);

  // Generate PDF preview whenever relevant props change
  useEffect(() => {
    let objectUrl: string | null = null;

    const generatePreview = async () => {
      if (canGenerate && summary && items.length > 0) {
        try {
          const imageToInclude = includeImageChecked ? processedImageDataUri : null;
          const labelContent: LabelContent = { summary, items, formatting: formattingOptions, imageDataUri: imageToInclude };
          // Use dimensions prop here
          const pdfBytes = await generatePdf(dimensions, labelContent);
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          objectUrl = URL.createObjectURL(blob);
          setPdfPreviewUrl(objectUrl);
          setPdfGenerationKey(prev => prev + 1);
        } catch (error) {
          console.error('Preview PDF generation failed:', error);
          setPdfPreviewUrl(null);
          toast({ title: 'Error', description: 'Failed to generate PDF preview.', variant: 'destructive' });
        }
      } else {
        setPdfPreviewUrl(null);
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
  }, [summary, items, dimensions, canGenerate, formattingOptions, toast, processedImageDataUri, includeImageChecked]);


  const handleRegenerateClick = useCallback(() => {
    if (items.length > 0) {
      onRegenerateSummary(items);
    }
  }, [items, onRegenerateSummary]);

  const handlePrint = async () => {
    if (!canGenerate || !summary || !selectedPrinter || apiStatus !== 'healthy') {
      toast({ title: 'Cannot Print', description: getPrintButtonTooltip(), variant: 'destructive' });
      return;
    }
    setIsPrinting(true);
    setPrintError(null);

    const imageToInclude = includeImageChecked ? processedImageDataUri : null;
    const labelContent: LabelContent = { summary, items, formatting: formattingOptions, imageDataUri: imageToInclude };

    try {
      // 1. Generate PDF using dimensions
      const pdfBytes = await generatePdf(dimensions, labelContent);
      const base64Pdf = Buffer.from(pdfBytes).toString('base64');

      // 2. Send to Python API using the constructed URL and selected printer
      const response = await fetch(printApiUrl, { // Use dynamic URL
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfData: base64Pdf,
          printerName: selectedPrinter, // Send selected printer name
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error structure' }));
        const errorMessage = errorData.detail || `HTTP error! status: ${response.status}`;
        console.error('Printing API error:', errorMessage);
        throw new Error(`Failed to send label to printer: ${errorMessage}`);
      }

      const result = await response.json();
      console.log('Print API response:', result);
      toast({ title: 'Print Request Sent', description: result.message || 'Label sent to the printing service.' });

    } catch (error) {
      console.error('Printing failed:', error);
      let userMessage = 'An unknown error occurred during printing.';
      if (error instanceof TypeError && error.message.includes('fetch')) {
        userMessage = `Could not connect to the printing service at ${pythonApiUrl}. Ensure the Python desktop app is running.`;
      } else if (error instanceof Error) {
        userMessage = error.message;
      }
      setPrintError(userMessage);
      toast({ title: 'Printing Error', description: userMessage, variant: 'destructive' });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!canGenerate || !summary) {
      toast({ title: 'Error', description: 'Cannot download PDF without summary and items.', variant: 'destructive' });
      return;
    }
    setIsGeneratingPdf(true);
    const imageToInclude = includeImageChecked ? processedImageDataUri : null;
    const labelContent: LabelContent = { summary, items, formatting: formattingOptions, imageDataUri: imageToInclude };
    try {
      const pdfBytes = await generatePdf(dimensions, labelContent);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const safeSummary = summary?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'label';
      link.download = `label-${safeSummary}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      toast({ title: 'Success', description: 'PDF downloaded successfully.' });
    } catch (error) {
      console.error('PDF download failed:', error);
      toast({ title: 'Error', description: 'Failed to download PDF.', variant: 'destructive' });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

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
          4. Label Preview & Actions
        </CardTitle>
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
              >
                <ToggleGroupItem value="left" aria-label="Left Align"> <AlignLeft className="h-4 w-4" /> </ToggleGroupItem>
                <ToggleGroupItem value="center" aria-label="Center Align"> <AlignCenter className="h-4 w-4" /> </ToggleGroupItem>
                <ToggleGroupItem value="right" aria-label="Right Align"> <AlignRight className="h-4 w-4" /> </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="include-image"
                checked={includeImageChecked}
                onCheckedChange={(checked) => setIncludeImageChecked(Boolean(checked))}
                disabled={!photoDataUri || isLoading}
                aria-label="Include image on label"
              />
              <Label htmlFor="include-image" className="text-sm font-medium cursor-pointer"> Include Image </Label>
              {isProcessingImage && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
            {!photoDataUri && (
              <p className="text-xs text-muted-foreground">Upload photo to enable image inclusion.</p>
            )}
          </PopoverContent>
        </Popover>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col items-center justify-center p-2 bg-muted/20 min-h-[150px]">
        {printError && (
          <Alert variant="destructive" className="mb-4 w-full max-w-sm">
            <Info className="h-4 w-4" />
            <AlertTitle>Printing Service Issue</AlertTitle>
            <AlertDescription>
              {printError}
              <Button variant="link" size="sm" onClick={() => setPrintError(null)} className="pl-1 h-auto py-0 text-xs"> Dismiss </Button>
            </AlertDescription>
          </Alert>
        )}
        {isLoading && !pdfPreviewUrl && (
          <div className="w-full h-full flex items-center justify-center">
            <Skeleton className="w-[80%] h-[80%] max-w-xs max-h-60" style={{ aspectRatio: labelAspectRatio }} />
          </div>
        )}
        {!isLoading && !canGenerate && !printError && (
          <div className="text-center text-muted-foreground text-sm p-4">
            {summary === 'Empty' ? 'No items identified to generate a label.' : 'Identify items or generate summary first.'}
          </div>
        )}
        {pdfPreviewUrl && (
          <div className="relative w-full h-full max-w-md mx-auto" style={{ aspectRatio: labelAspectRatio }}>
            {(isGeneratingPreview || (includeImageChecked && isProcessingImage)) && (
              <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 rounded-md">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
            <iframe
              key={pdfGenerationKey}
              src={pdfPreviewUrl}
              title="Label Preview"
              className={cn(
                "w-full h-full border rounded-md shadow-sm",
                (isGeneratingPreview || (includeImageChecked && isProcessingImage)) && "opacity-50"
              )}
              style={{ contain: 'content' }}
            />
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-2 p-4 border-t">
        <Button
          variant="outline"
          onClick={handleRegenerateClick}
          disabled={isLoading || items.length === 0}
          aria-label="Regenerate Summary"
          className="w-full sm:w-auto"
        >
          {isGeneratingSummary ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          <span className="ml-2">Regenerate</span>
        </Button>
        <div className="flex gap-2 w-full sm:w-auto justify-end">
          <Button
            variant="outline"
            onClick={handleDownloadPdf}
            disabled={!canGenerate || isLoading}
            aria-label="Download PDF"
          >
            {isGeneratingPdf ? <Loader2 className="animate-spin" /> : <FileText />}
            <span className="ml-2 hidden sm:inline">PDF</span>
          </Button>
          {/* Print Button with Tooltip */}
          <Tooltip>
              <TooltipTrigger asChild>
                {/* Wrap Button in a span for Tooltip when disabled */}
                <span className={cn(isPrintDisabled && "cursor-not-allowed")}>
                  <Button
                    onClick={handlePrint}
                    disabled={isPrintDisabled}
                    aria-label="Print Label via Desktop App"
                    // Remove pointer events if disabled so span cursor takes effect
                    className={cn(isPrintDisabled && "pointer-events-none")}
                  >
                    {isPrinting ? <Loader2 className="animate-spin" /> :
                     apiStatus === 'unhealthy' ? <WifiOff /> :
                     apiStatus === 'pending' ? <ServerCrash /> :
                     <Printer />}
                    <span className="ml-2 hidden sm:inline">Print</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                 <p>{getPrintButtonTooltip()}</p>
              </TooltipContent>
          </Tooltip>
        </div>
      </CardFooter>
    </Card>
  );
}

