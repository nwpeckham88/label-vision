
'use client';

import type * as React from 'react';
import { useState, useEffect } from 'react';
import { Printer, FileText, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { PrinterConfig } from '@/services/label-printer';
import { printLabel, generatePdf } from '@/services/label-printer';

interface LabelPreviewProps {
  labelText: string | null;
  isLoading: boolean;
  onLabelTextChange: (newText: string) => void;
  itemsIdentified: boolean; // To enable buttons only after items are identified
}

// Default printer config (replace with actual config mechanism if needed)
const defaultPrinterConfig: PrinterConfig = {
  printerName: 'DefaultLabelPrinter',
  labelWidthInches: 2.25,
  labelHeightInches: 1.25,
};

export function LabelPreview({ labelText, isLoading, onLabelTextChange, itemsIdentified }: LabelPreviewProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const { toast } = useToast();
  const [internalLabelText, setInternalLabelText] = useState(labelText ?? '');

  useEffect(() => {
    setInternalLabelText(labelText ?? '');
  }, [labelText]);


  const handlePrint = async () => {
    if (!internalLabelText) {
       toast({ title: 'Error', description: 'Label text cannot be empty.', variant: 'destructive' });
       return;
    }
    setIsPrinting(true);
    try {
      await printLabel(defaultPrinterConfig, { text: internalLabelText });
      toast({ title: 'Success', description: 'Label sent to printer.' });
    } catch (error) {
      console.error('Printing failed:', error);
      toast({ title: 'Error', description: 'Failed to print label.', variant: 'destructive' });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleGeneratePdf = async () => {
     if (!internalLabelText) {
       toast({ title: 'Error', description: 'Label text cannot be empty.', variant: 'destructive' });
       return;
    }
    setIsGeneratingPdf(true);
    try {
      const pdfBytes = await generatePdf(defaultPrinterConfig, { text: internalLabelText });
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'label.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href); // Clean up blob URL
      toast({ title: 'Success', description: 'PDF generated successfully.' });
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast({ title: 'Error', description: 'Failed to generate PDF.', variant: 'destructive' });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = event.target.value;
    setInternalLabelText(newText);
    onLabelTextChange(newText);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Generated Label
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full rounded-md" />
        ) : (
          <Textarea
            placeholder={itemsIdentified ? "Label text will appear here..." : "Identify items first..."}
            value={internalLabelText}
            onChange={handleTextChange}
            className="min-h-[100px] text-base resize-none bg-card" // Ensure good readability
            readOnly={!itemsIdentified || isLoading} // Only editable if items identified and not loading
            aria-label="Generated label text"
          />
        )}
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={handleGeneratePdf}
          disabled={!itemsIdentified || !internalLabelText || isLoading || isGeneratingPdf || isPrinting}
        >
          {isGeneratingPdf ? (
            <Loader2 className="animate-spin mr-2" />
          ) : (
            <FileText className="mr-2" />
          )}
          Generate PDF
        </Button>
        <Button
          onClick={handlePrint}
          disabled={!itemsIdentified || !internalLabelText || isLoading || isPrinting || isGeneratingPdf}
        >
          {isPrinting ? (
            <Loader2 className="animate-spin mr-2" />
          ) : (
            <Printer className="mr-2" />
          )}
          Print Label
        </Button>
      </CardFooter>
    </Card>
  );
}
