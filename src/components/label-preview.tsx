
'use client';

import type * as React from 'react';
import { useState, useEffect, useMemo, useCallback, useTransition } from 'react';
import { Printer, FileText, Loader2, RefreshCw, Settings2, Pilcrow, AlignLeft, AlignCenter, AlignRight, CaseSensitive } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { PrinterConfig, LabelContent, LabelFormattingOptions } from '@/services/label-printer';
import { printLabel, generatePdf } from '@/services/label-printer';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"


interface LabelPreviewProps {
  summary: string | null;
  items: string[];
  config: PrinterConfig;
  isGeneratingSummary: boolean; // True when AI is generating summary
  canGenerate: boolean; // True when items are identified and summary is ready
  onRegenerateSummary: (items: string[]) => void; // Callback to trigger summary regeneration
}

export function LabelPreview({
  summary,
  items,
  config,
  isGeneratingSummary,
  canGenerate,
  onRegenerateSummary,
}: LabelPreviewProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [formattingOptions, setFormattingOptions] = useState<LabelFormattingOptions>({
      fontFamily: 'Helvetica',
      textAlign: 'left',
  });
  const { toast } = useToast();
  const [pdfGenerationKey, setPdfGenerationKey] = useState(0); // Key to force iframe reload
  const [isGeneratingPreview, startPreviewTransition] = useTransition();

  const isLoading = isGeneratingSummary || isPrinting || isGeneratingPdf || isGeneratingPreview;
  const labelAspectRatio = useMemo(() => config.labelWidthInches / config.labelHeightInches, [config]);

  // Generate PDF preview whenever relevant props change
  useEffect(() => {
    let objectUrl: string | null = null;

    const generatePreview = async () => {
      if (canGenerate && summary && items.length > 0) {
        try {
          const labelContent: LabelContent = { summary, items, formatting: formattingOptions };
          const pdfBytes = await generatePdf(config, labelContent);
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          objectUrl = URL.createObjectURL(blob);
          setPdfPreviewUrl(objectUrl);
          setPdfGenerationKey(prev => prev + 1); // Update key to force iframe refresh
        } catch (error) {
          console.error('Preview PDF generation failed:', error);
          setPdfPreviewUrl(null); // Clear preview on error
          toast({ title: 'Error', description: 'Failed to generate PDF preview.', variant: 'destructive' });
        }
      } else {
        setPdfPreviewUrl(null); // Clear preview if not ready
      }
    };

     // Debounce PDF generation slightly to avoid excessive regeneration during rapid changes
    const timeoutId = setTimeout(() => {
       startPreviewTransition(generatePreview);
    }, 300); // 300ms debounce

    // Cleanup function to revoke the object URL
    return () => {
       clearTimeout(timeoutId);
       if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
       }
    };
  }, [summary, items, config, canGenerate, formattingOptions, toast]); // Regenerate on these changes


  const handleRegenerateClick = useCallback(() => {
    if (items.length > 0) {
      onRegenerateSummary(items);
    }
  }, [items, onRegenerateSummary]);

  const handlePrint = async () => {
    if (!canGenerate || !summary) {
       toast({ title: 'Error', description: 'Cannot print label without summary and items.', variant: 'destructive' });
       return;
    }
    setIsPrinting(true);
    const labelContent: LabelContent = { summary, items, formatting: formattingOptions };
    try {
      // Consider directly printing the generated PDF blob if possible
      await printLabel(config, labelContent);
      toast({ title: 'Success', description: 'Label sent to printer.' });
    } catch (error) {
      console.error('Printing failed:', error);
      toast({ title: 'Error', description: 'Failed to print label.', variant: 'destructive' });
    } finally {
      setIsPrinting(false);
    }
  };

   const handleDownloadPdf = async () => {
     if (!canGenerate || !summary) {
       toast({ title: 'Error', description: 'Cannot download PDF without summary and items.', variant: 'destructive' });
       return;
    }
    // Re-generate PDF for download to ensure it's the latest version
    setIsGeneratingPdf(true);
    const labelContent: LabelContent = { summary, items, formatting: formattingOptions };
    try {
      const pdfBytes = await generatePdf(config, labelContent);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `label-${summary?.toLowerCase().replace(/\s+/g, '-') || 'generated'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href); // Clean up URL object
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
          Label Preview & Actions
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
                        <SelectValue placeholder="Select font" />
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
                    aria-label="Text alignment"
                 >
                    <ToggleGroupItem value="left" aria-label="Left align">
                      <AlignLeft className="h-4 w-4" />
                    </ToggleGroupItem>
                    <ToggleGroupItem value="center" aria-label="Center align">
                      <AlignCenter className="h-4 w-4" />
                    </ToggleGroupItem>
                    <ToggleGroupItem value="right" aria-label="Right align">
                       <AlignRight className="h-4 w-4" />
                    </ToggleGroupItem>
                 </ToggleGroup>
              </div>
          </PopoverContent>
        </Popover>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col items-center justify-center p-2 bg-muted/20">
        {isLoading && !pdfPreviewUrl && ( // Show skeleton only if loading and no preview exists yet
          <div className="w-full h-full flex items-center justify-center">
             <Skeleton className="w-[80%] h-[80%] max-w-xs max-h-60" style={{ aspectRatio: labelAspectRatio }}/>
          </div>
        )}
        {!isLoading && !canGenerate && (
           <div className="text-center text-muted-foreground text-sm p-4">
             {summary === 'Empty' ? 'No items identified to generate a label.' : 'Identify items or generate summary first...'}
          </div>
        )}
         {pdfPreviewUrl && (
           <div className="relative w-full h-full max-w-md mx-auto" style={{ aspectRatio: labelAspectRatio }}>
             {isGeneratingPreview && (
                 <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 rounded-md">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                 </div>
             )}
             <iframe
                key={pdfGenerationKey} // Force re-render when key changes
                src={pdfPreviewUrl}
                title="Label Preview"
                className={cn(
                    "w-full h-full border rounded-md shadow-sm",
                    isGeneratingPreview && "opacity-50" // Slightly dim while loading new preview
                )}
                style={{ contain: 'content' }} // Optimization hint
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
            {isGeneratingSummary ? (
                <Loader2 className="animate-spin" />
            ) : (
                <RefreshCw />
            )}
            <span className="ml-2">Regenerate</span>
          </Button>
         <div className="flex gap-2 w-full sm:w-auto justify-end">
            <Button
                variant="outline"
                onClick={handleDownloadPdf}
                disabled={!canGenerate || isLoading}
                aria-label="Download PDF"
            >
              {isGeneratingPdf ? (
                <Loader2 className="animate-spin" />
              ) : (
                <FileText />
              )}
              <span className="ml-2 hidden sm:inline">PDF</span>
            </Button>
            <Button
              onClick={handlePrint}
              disabled={!canGenerate || isLoading}
              aria-label="Print Label"
            >
              {isPrinting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Printer />
              )}
              <span className="ml-2 hidden sm:inline">Print</span>
            </Button>
         </div>
      </CardFooter>
    </Card>
  );
}
