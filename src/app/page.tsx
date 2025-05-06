'use client';

import { ItemList } from '@/components/item-list';
import { LabelDimensionsForm } from '@/components/label-dimensions-form';
import { LabelPreview } from '@/components/label-preview';
import { PhotoUploader } from '@/components/photo-uploader';
import { PrintControls } from '@/components/print-controls';
import { ThemeToggle } from '@/components/theme-toggle';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from '@/components/ui/separator';
import { Toaster } from '@/components/ui/toaster';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { capitalizeWords } from '@/lib/utils';
import type { LabelDimensions } from '@/services/label-printer';
import { generatePdf, LabelContent } from '@/services/label-printer';
import { AlertTriangle, Ruler, ServerCrash, Upload, Wand2, Wifi, WifiOff } from 'lucide-react';
import type { FC } from 'react';
import { useCallback, useEffect, useState } from 'react';

// Python Desktop App API URLs (Now relative paths)
const PYTHON_API_BASE_URL = '/api'; // Base path for API calls served by Flask
const PYTHON_HEALTH_URL = `${PYTHON_API_BASE_URL}/health`;
const PYTHON_PRINTERS_URL = `${PYTHON_API_BASE_URL}/printers`;
const HEALTH_CHECK_INTERVAL = 10000; // Check health every 10 seconds

// Define standard label sizes (dimensions only)
const LABEL_SIZES: Record<string, LabelDimensions> = {
  small: { labelWidthInches: 2.25, labelHeightInches: 1.25 },
  medium: { labelWidthInches: 4, labelHeightInches: 2 },
  large: { labelWidthInches: 4, labelHeightInches: 6 },
  shipping: { labelWidthInches: 4, labelHeightInches: 6 },
  address: { labelWidthInches: 3.5, labelHeightInches: 1.125 },
};
const DEFAULT_LABEL_SIZE_KEY = 'small';

type ApiStatus = 'pending' | 'healthy' | 'unhealthy';

// Define types for the API response and potential errors
interface ProcessImageResponse {
  identifiedItems: string[];
  summary: string;
}

interface ApiError {
  detail: string;
}

const LabelVisionPage: FC = () => {
  const [photoDataUri, setPhotoDataUri] = useState<string | null>(null);
  const [identifiedItems, setIdentifiedItems] = useState<string[]>([]);
  const [labelSummary, setLabelSummary] = useState<string>('');
  const [selectedLabelSizeKey, setSelectedLabelSizeKey] = useState<string>(DEFAULT_LABEL_SIZE_KEY);
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>('pending');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [currentDimensions, setCurrentDimensions] = useState<LabelDimensions>(LABEL_SIZES[DEFAULT_LABEL_SIZE_KEY]);

  const { toast } = useToast();

  // --- API Health Check ---
  const checkApiHealth = useCallback(async () => {
    try {
      // Use relative URL
      const response = await fetch(PYTHON_HEALTH_URL);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ok') {
             setApiStatus('healthy');
        } else {
             setApiStatus('unhealthy');
             console.warn('API health check returned non-ok status:', data);
        }

      } else {
        setApiStatus('unhealthy');
        console.warn('API health check failed with status:', response.status);
      }
    } catch (err) {
      setApiStatus('unhealthy');
      console.warn('API health check failed:', err); // Log as warning, not critical error
    }
  }, []);

  useEffect(() => {
    checkApiHealth(); // Initial check
    const intervalId = setInterval(checkApiHealth, HEALTH_CHECK_INTERVAL);
    return () => clearInterval(intervalId); // Cleanup on unmount
  }, [checkApiHealth]);

  // --- Fetch Available Printers ---
  useEffect(() => {
    const fetchPrinters = async () => {
      if (apiStatus !== 'healthy') {
         // Don't fetch if API isn't healthy, clear list and selection
         setAvailablePrinters([]);
         setSelectedPrinter(null);
         return;
      }
      try {
        // Use relative URL
        const response = await fetch(PYTHON_PRINTERS_URL);
        if (!response.ok) {
          throw new Error(`Failed to fetch printers: ${response.statusText}`);
        }
        const printers = await response.json();
        if (Array.isArray(printers) && printers.every(p => typeof p === 'string')) {
          setAvailablePrinters(printers);
          // If no printer selected or current selection is not in the new list, select the first one
          if (!selectedPrinter || !printers.includes(selectedPrinter)) {
             setSelectedPrinter(printers.length > 0 ? printers[0] : null);
          }
        } else {
          throw new Error("Invalid printer list format received");
        }
      } catch (err) {
        console.error('Error fetching printers:', err);
        toast({
          title: 'Could not fetch printers',
          description: 'Failed to get printer list from the print service.',
          variant: 'destructive'
        });
        setAvailablePrinters([]);
        setSelectedPrinter(null);
      }
    };

    fetchPrinters();
  }, [apiStatus, toast, selectedPrinter]); // Re-fetch when API status becomes healthy or selectedPrinter changes (to reset)

  const handlePhotoUploaded = useCallback(async (dataUri: string) => {
    setPhotoDataUri(dataUri);
    setIdentifiedItems([]);
    setLabelSummary('');
    setProcessingError(null);
    setIsProcessing(true);

    console.log("Photo uploaded, calling API...");

    try {
      const response = await fetch('/api/process-image-for-label', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // Remove data URI prefix (e.g., "data:image/jpeg;base64,") before sending
        body: JSON.stringify({ imageData: dataUri.split(',')[1] }),
      });

      if (!response.ok) {
        let errorDetail = `HTTP error! status: ${response.status}`;
        try {
           const errorJson = await response.json() as ApiError;
           errorDetail = errorJson.detail || errorDetail;
        } catch (e) {
            // Ignore if response is not JSON or parsing fails
             console.error("Could not parse error response:", e);
        }
        throw new Error(errorDetail);
      }

      const result: ProcessImageResponse = await response.json();
      console.log("API Response:", result);
      setIdentifiedItems(result.identifiedItems || []);
      setLabelSummary(result.summary || 'Error: No summary received');
      toast({
         title: "Analysis Complete",
         description: `Found ${result.identifiedItems?.length || 0} items. Summary: \"${result.summary}\"`,
      });

    } catch (error) {
       console.error("Error processing image:", error);
       const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
       setProcessingError(errorMessage);
       toast({
         variant: 'destructive',
         title: 'Image Processing Failed',
         description: errorMessage,
       });
        setIdentifiedItems([]);
        setLabelSummary('');
    } finally {
      setIsProcessing(false);
    }
  }, [toast]);

  const handlePhotoCleared = useCallback(() => {
    setPhotoDataUri(null);
    setIdentifiedItems([]);
    setLabelSummary('');
    setProcessingError(null);
    setIsProcessing(false);
    console.log("Photo cleared.");
  }, []);

  const handleLabelSizeChange = (value: string) => {
    setSelectedLabelSizeKey(value);
    setCurrentDimensions(LABEL_SIZES[value]); // Update dimensions state from selection
  };

  const handlePrinterChange = (value: string) => {
    setSelectedPrinter(value);
  };

  const handlePrint = useCallback(async (printerName: string) => {
    if (!photoDataUri || identifiedItems.length === 0 || !labelSummary) {
      toast({
        variant: 'destructive',
        title: 'Cannot Print',
        description: 'Please upload a photo and ensure items are identified first.',
      });
      return;
    }

    console.log(`Generating PDF for printer: ${printerName}`);
    toast({ title: 'Generating PDF...' });

    try {
       const labelContent: LabelContent = {
         summary: labelSummary,
         items: identifiedItems,
         // Pass the original (potentially higher res) data URI for PDF generation
         // Consider adding image pre-processing (resize/grayscale) here or before
         // calling generatePdf if needed for specific printers/performance.
         imageDataUri: photoDataUri,
         formatting: {
           fontFamily: 'Helvetica',
           textAlign: 'left',
         },
       };

       const pdfBytes = await generatePdf(currentDimensions, labelContent);
       const pdfBase64 = Buffer.from(pdfBytes).toString('base64'); // Use Buffer for Node.js/browser compatibility

       console.log(`PDF generated (${pdfBytes.length} bytes), sending to print API...`);
       toast({ title: 'Sending to printer...' });

      const response = await fetch('/api/print', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pdfData: pdfBase64,
          printerName: printerName,
          labelSummary: labelSummary // Send summary for job name
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || `HTTP error! status: ${response.status}`);
      }

      console.log("Print API Response:", result);
      toast({
        title: 'Print Job Sent',
        description: result.message || `Successfully sent to ${printerName}.`,
      });

    } catch (error) {
      console.error("Error generating PDF or printing:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
       toast({
         variant: 'destructive',
         title: 'Printing Failed',
         description: errorMessage,
       });
    }
  }, [photoDataUri, identifiedItems, labelSummary, currentDimensions, toast]);

  const getApiStatusIcon = () => {
    switch (apiStatus) {
      case 'healthy':
        return <Wifi className="h-5 w-5 text-green-600" />;
      case 'unhealthy':
        return <WifiOff className="h-5 w-5 text-red-600" />;
      case 'pending':
      default:
        return <ServerCrash className="h-5 w-5 text-yellow-500" />;
    }
  };

   const getApiStatusTooltip = () => {
    switch (apiStatus) {
      case 'healthy':
        return 'Connected to Print Service';
      case 'unhealthy':
        return 'Disconnected from Print Service';
      case 'pending':
      default:
        return 'Checking Print Service connection...';
    }
  };

  const isLoading = isProcessing;

  return (
    <TooltipProvider>
      <div className="container mx-auto p-4 md:p-8 min-h-screen flex flex-col bg-background">
        <header className="mb-8 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <Wand2 className="text-primary h-8 w-8" />
             <div>
                <h1 className="text-3xl md:text-4xl font-bold text-foreground">Label Vision</h1>
                <p className="text-muted-foreground">
                    Upload a photo, identify items, generate a label, and print it.
                </p>
             </div>
          </div>
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                  <div className="p-2 rounded-full bg-card border border-border shadow-sm">
                  {getApiStatusIcon()}
                  </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{getApiStatusTooltip()}</p>
              </TooltipContent>
            </Tooltip>
             <ThemeToggle /> {/* Add ThemeToggle */}
          </div>
        </header>

        {processingError && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{processingError}</AlertDescription>
          </Alert>
        )}

        <main className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Column 1: Upload & Settings */}
          <div className="flex flex-col gap-6 md:order-1">
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle className="text-xl font-semibold flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  1. Upload Photo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PhotoUploader
                  onPhotoUploaded={handlePhotoUploaded}
                  onPhotoCleared={handlePhotoCleared}
                  disabled={isProcessing} // Disable uploader while processing
                />
              </CardContent>
            </Card>

            <Card className="shadow-md">
              <CardHeader>
                <CardTitle className="text-xl font-semibold flex items-center gap-2">
                  <Ruler className="h-5 w-5" />
                  2. Label Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="label-size" className="mb-2 block font-medium">Label Size</Label>
                  <Select
                    value={selectedLabelSizeKey}
                    onValueChange={handleLabelSizeChange}
                    disabled={isProcessing}
                    name="label-size"
                    required
                  >
                    <SelectTrigger id="label-size" className="w-full">
                      <SelectValue placeholder="Select label size" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(LABEL_SIZES).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          {capitalizeWords(key)} ({config.labelWidthInches} x {config.labelHeightInches}&quot;)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="printer-select" className="mb-2 block font-medium">Printer</Label>
                  <Select
                    value={selectedPrinter ?? ''}
                    onValueChange={handlePrinterChange}
                    disabled={isProcessing || apiStatus !== 'healthy' || availablePrinters.length === 0}
                    name="printer-select"
                    required
                  >
                    <SelectTrigger id="printer-select" className="w-full">
                      <SelectValue placeholder={
                          apiStatus === 'pending' ? 'Checking printers...' :
                          apiStatus === 'unhealthy' ? 'Connect print service...' :
                          availablePrinters.length === 0 ? 'No printers found' :
                          'Select a printer'
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
                   {apiStatus === 'unhealthy' && (
                        <p className="text-xs text-destructive mt-1">Print service is not connected. Ensure the desktop app is running.</p>
                   )}
                   {apiStatus === 'healthy' && availablePrinters.length === 0 && (
                       <p className="text-xs text-muted-foreground mt-1">No printers were detected by the print service.</p>
                   )}
                </div>
              </CardContent>
            </Card>

            <LabelDimensionsForm
               initialDimensions={currentDimensions}
               onDimensionsChange={(newDimensions: LabelDimensions) => {
                 setCurrentDimensions(newDimensions);
               }}
               disabled={isProcessing}
            />

            <PrintControls onPrint={handlePrint} disabled={!photoDataUri || identifiedItems.length === 0 || isProcessing}/>
          </div>

          {/* Column 2: Identify */}
          <div className="flex flex-col gap-6 md:order-2">
            <ItemList items={identifiedItems} isLoading={isLoading} title="3. Identified Items" />
          </div>

          {/* Column 3: Generate & Print */}
          <div className="flex flex-col gap-6 md:order-3">
            <LabelPreview
              dimensions={currentDimensions}
              summary={labelSummary}
              items={identifiedItems}
              imageDataUri={photoDataUri}
              isProcessing={isProcessing}
              processingError={processingError}
            />
          </div>
        </main>

        <footer className="mt-12 text-center text-sm text-muted-foreground">
          <Separator className="my-4" />
          Powered by Google Cloud & Genkit
        </footer>
      </div>
      <Toaster />
    </TooltipProvider>
  );
};

export default LabelVisionPage;
