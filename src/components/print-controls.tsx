'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Printer } from 'lucide-react';

interface PrintControlsProps {
  onPrint: (printerName: string) => void;
  disabled?: boolean; // Should disable printer selection and print button
}

// Define types for the API response and potential errors
interface ApiError {
  detail: string;
}

/**
 * Component to select a printer and initiate printing.
 */
export function PrintControls({ onPrint, disabled = false }: PrintControlsProps) {
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string | undefined>(undefined);
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchPrinters = useCallback(async () => {
    setIsLoadingPrinters(true);
    setFetchError(null);
    try {
      const response = await fetch('/api/printers');
      if (!response.ok) {
         let errorDetail = `HTTP error! status: ${response.status}`;
          try {
              const errorJson = await response.json() as ApiError;
              errorDetail = errorJson.detail || errorDetail;
          } catch (e) { /* Ignore if not JSON */ }
         throw new Error(errorDetail);
      }
      const printers = await response.json();
      if (Array.isArray(printers) && printers.every(p => typeof p === 'string')) {
        setAvailablePrinters(printers);
        // Automatically select the first printer if none is selected or current selection is invalid
        if (printers.length > 0 && (!selectedPrinter || !printers.includes(selectedPrinter))) {
          setSelectedPrinter(printers[0]);
        }
        if (printers.length === 0) {
            setSelectedPrinter(undefined);
        }
      } else {
        throw new Error("Invalid printer list format received");
      }
    } catch (error) {
      console.error("Error fetching printers:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch printers.";
      setFetchError(errorMessage);
      setAvailablePrinters([]);
      setSelectedPrinter(undefined);
      toast({ variant: 'destructive', title: 'Could not load printers', description: errorMessage });
    } finally {
      setIsLoadingPrinters(false);
    }
  }, [toast, selectedPrinter]); // Depend on selectedPrinter to potentially re-validate selection

  // Fetch printers on component mount
  useEffect(() => {
    fetchPrinters();
     // We don't necessarily need to poll here unless printers change very dynamically
     // const intervalId = setInterval(fetchPrinters, 15000); // Optional: Refresh occasionally
     // return () => clearInterval(intervalId);
  }, [fetchPrinters]);

  const handlePrinterChange = (value: string) => {
    setSelectedPrinter(value);
  };

  const handlePrintClick = () => {
    if (selectedPrinter) {
      onPrint(selectedPrinter);
    } else {
       toast({ variant: 'warning', title: 'No Printer Selected', description: 'Please select a printer first.' });
    }
  };

  const overallDisabled = disabled || isLoadingPrinters || fetchError !== null || availablePrinters.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Printer className="h-5 w-5" />
          3. Print Label
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="printer-select-controls">Printer</Label>
          <Select
            value={selectedPrinter ?? ''} // Use empty string if undefined for Select
            onValueChange={handlePrinterChange}
            disabled={disabled || isLoadingPrinters || fetchError !== null || availablePrinters.length === 0}
            name="printer-select-controls"
            required
          >
            <SelectTrigger id="printer-select-controls" className="w-full">
              <SelectValue placeholder={
                  isLoadingPrinters ? "Loading printers..." :
                  fetchError ? "Error loading printers" :
                  availablePrinters.length === 0 ? "No printers found" :
                  "Select a printer"
              } />
            </SelectTrigger>
            <SelectContent>
              {availablePrinters.map((printerName) => (
                <SelectItem key={printerName} value={printerName}>
                  {printerName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fetchError && (
            <p className="text-xs text-destructive mt-1">Error: {fetchError}</p>
          )}
          {!fetchError && !isLoadingPrinters && availablePrinters.length === 0 && (
             <p className="text-xs text-muted-foreground mt-1">No printers available via the print service.</p>
          )}
        </div>
        <Button
          onClick={handlePrintClick}
          disabled={overallDisabled || !selectedPrinter}
          className="w-full"
        >
          {isLoadingPrinters ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Printer className="mr-2 h-4 w-4" />
          )}
          Print Label
        </Button>
      </CardContent>
    </Card>
  );
} 