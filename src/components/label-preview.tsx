
'use client';

import type * as React from 'react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Printer, FileText, Loader2, Minus, Plus, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { PrinterConfig, LabelContent } from '@/services/label-printer';
import { printLabel, generatePdf } from '@/services/label-printer';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';


interface LabelPreviewProps {
  summary: string | null;
  items: string[];
  config: PrinterConfig;
  isGenerating: boolean; // True when AI is generating summary
  canGenerate: boolean; // True when items are identified and summary is ready
}

// Convert inches to pixels (assuming 96 DPI)
const INCH_TO_PX = 96;
const MIN_FONT_SIZE_PX = 8;
const MAX_FONT_SIZE_PX = 48;
const FONT_SIZE_STEP_PX = 1;
const FONT_ASPECT_RATIO = 0.5; // Approx width-to-height ratio for typical fonts

// Function to estimate text width
function estimateTextWidth(text: string, fontSizePx: number): number {
  return text.length * fontSizePx * FONT_ASPECT_RATIO;
}

export function LabelPreview({ summary, items, config, isGenerating, canGenerate }: LabelPreviewProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const { toast } = useToast();
  const [fontSize, setFontSize] = useState<number>(12); // Base font size for item list
  const previewRef = useRef<HTMLDivElement>(null);


  const labelWidthPx = useMemo(() => config.labelWidthInches * INCH_TO_PX, [config.labelWidthInches]);
  const labelHeightPx = useMemo(() => config.labelHeightInches * INCH_TO_PX, [config.labelHeightInches]);

  // Calculate optimal font size and column count
  useEffect(() => {
    if (!previewRef.current || items.length === 0 || !canGenerate || !summary) {
        // Reset font size if no content or not ready
        setFontSize(12);
        return;
    }

    const container = previewRef.current;
    const availableHeight = container.clientHeight - (MIN_FONT_SIZE_PX * 1.5 + 10 + 2); // Subtract approx header height, padding, separator
    const availableWidth = container.clientWidth - 10; // Subtract padding

    let bestFontSize = MIN_FONT_SIZE_PX;
    let bestCols = 1;

    // Try increasing font size
    for (let currentSize = MIN_FONT_SIZE_PX; currentSize <= MAX_FONT_SIZE_PX; currentSize += FONT_SIZE_STEP_PX) {
        const lineHeight = currentSize * 1.4; // Approximate line height

        // Try different column counts for the current font size
        for (let numCols = 1; numCols <= 3; numCols++) { // Limit to max 3 columns for simplicity
             const colWidth = (availableWidth - (numCols - 1) * 10) / numCols; // Subtract gap between columns
             const itemsPerCol = Math.ceil(items.length / numCols);
             const requiredHeight = itemsPerCol * lineHeight;

             // Check if all items fit within column width and container height
             const allItemsFitWidth = items.every(item => estimateTextWidth(item, currentSize) <= colWidth);

             if (requiredHeight <= availableHeight && allItemsFitWidth) {
                 // This configuration fits, potentially update best fit
                if (currentSize > bestFontSize) {
                   bestFontSize = currentSize;
                   bestCols = numCols;
                }
             } else if (numCols === 1 && !allItemsFitWidth) {
                 // If items don't even fit in one column, break inner loop early for this font size
                 break;
             }
        }
        // If no column configuration worked for this font size, stop increasing font size
         if (bestFontSize < currentSize) {
             break;
         }
    }

    setFontSize(bestFontSize);
    // Note: We are calculating bestCols but not explicitly using it to set CSS columns yet,
    // as text wrapping within the available width will handle layout reasonably well.
    // A more complex implementation could use `column-count`.

  }, [summary, items, labelWidthPx, labelHeightPx, canGenerate]);

  const handlePrint = async () => {
    if (!canGenerate || !summary) {
       toast({ title: 'Error', description: 'Cannot print label without summary and items.', variant: 'destructive' });
       return;
    }
    setIsPrinting(true);
    const labelContent: LabelContent = { summary, items, fontSize };
    try {
      await printLabel(config, labelContent);
      toast({ title: 'Success', description: 'Label sent to printer.' });
    } catch (error) {
      console.error('Printing failed:', error);
      toast({ title: 'Error', description: 'Failed to print label.', variant: 'destructive' });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleGeneratePdf = async () => {
     if (!canGenerate || !summary) {
       toast({ title: 'Error', description: 'Cannot generate PDF without summary and items.', variant: 'destructive' });
       return;
    }
    setIsGeneratingPdf(true);
    const labelContent: LabelContent = { summary, items, fontSize };
    try {
      const pdfBytes = await generatePdf(config, labelContent);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'label.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      toast({ title: 'Success', description: 'PDF generated successfully.' });
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast({ title: 'Error', description: 'Failed to generate PDF.', variant: 'destructive' });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const isLoading = isGenerating || isPrinting || isGeneratingPdf;

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Label Preview
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col p-2">
        {isGenerating ? (
          <div className="flex-grow flex items-center justify-center">
            <Skeleton className="w-full h-3/4" />
          </div>
        ) : canGenerate && summary && items.length > 0 ? (
          <div
            ref={previewRef}
            className="border rounded-md p-2 flex-grow overflow-hidden bg-white text-black flex flex-col" // Simulate label background, ensure black text for preview
            style={{
              width: `${labelWidthPx * 0.8}px`, // Scale down preview slightly for better fit
              height: `${labelHeightPx * 0.8}px`, // Scale down preview slightly
              maxWidth: '100%',
              maxHeight: '400px', // Max preview height
              aspectRatio: `${config.labelWidthInches} / ${config.labelHeightInches}`,
              margin: 'auto', // Center the preview box
            }}
          >
            {/* Header */}
            <div
                className="text-center font-bold truncate"
                style={{ fontSize: `${Math.min(MAX_FONT_SIZE_PX, Math.max(MIN_FONT_SIZE_PX, fontSize * 1.3))}px`, lineHeight: 1.2, marginBottom: '2px' }} // Larger, bold header
            >
                {summary}
            </div>
            <Separator className="bg-gray-400 my-1" />
             {/* Item List */}
            <div
              className="flex-grow overflow-y-auto text-left" // Allow vertical scroll if needed
              style={{ fontSize: `${fontSize}px`, lineHeight: 1.3 }} // Dynamically sized item list
             >
                <ul className="list-none p-0 m-0 flex flex-col flex-wrap max-h-full">
                  {items.map((item, index) => (
                    <li key={index} className="truncate leading-tight break-words">{item}</li>
                  ))}
                </ul>
            </div>
          </div>
        ) : (
          <div className="flex-grow flex items-center justify-center text-muted-foreground text-sm">
            {summary === 'Empty' ? 'No items identified to generate a label.' : 'Identify items first...'}
          </div>
        )}
      </CardContent>
       <CardFooter className="flex justify-end gap-2 p-4 border-t">
         <Button
          variant="outline"
          onClick={handleGeneratePdf}
          disabled={!canGenerate || isLoading}
          aria-label="Generate PDF"
        >
          {isGeneratingPdf ? (
            <Loader2 className="animate-spin" />
          ) : (
            <FileText />
          )}
          <span className="ml-2">PDF</span>
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
          <span className="ml-2">Print</span>
        </Button>
      </CardFooter>
    </Card>
  );
}
