'use client';

import type { FC } from 'react';
import { useState, useCallback, useTransition, useMemo, useEffect } from 'react';
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
import { Wand2, AlertTriangle, Upload, Package, Ruler, Wifi, WifiOff, ServerCrash } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LabelDimensions } from '@/services/label-printer'; // Use LabelDimensions
import { Label } from '@/components/ui/label';
import { capitalizeWords } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'; // Import Tooltip components

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

const LabelVisionPage: FC = () => {
  const [photoDataUri, setPhotoDataUri] = useState<string | null>(null);
  const [identifiedItems, setIdentifiedItems] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [selectedLabelSizeKey, setSelectedLabelSizeKey] = useState<string>(DEFAULT_LABEL_SIZE_KEY);
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>('pending');
  const [error, setError] = useState<string | null>(null);

  const [isIdentifying, startIdentifyingTransition] = useTransition();
  const [isGeneratingSummary, startGeneratingSummaryTransition] = useTransition();

  const { toast } = useToast();

  const selectedDimensions = useMemo(() => LABEL_SIZES[selectedLabelSizeKey], [selectedLabelSizeKey]);

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
        const capitalizedItems = itemsToSummarize.map(capitalizeWords);
        const result = await generateSummaryFromItems({ items: capitalizedItems });
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
        const rawItems = result.items || [];
        const newItems = rawItems.map(capitalizeWords);
        setIdentifiedItems(newItems);

        if (newItems.length > 0) {
          toast({ title: 'Identification Complete', description: `${newItems.length} item(s) identified. Generating summary...` });
          handleGenerateOrRegenerateSummary(newItems);
        } else {
          toast({ title: 'Identification Complete', description: 'No items were identified in the photo.' });
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

  const handlePrinterChange = (value: string) => {
    setSelectedPrinter(value);
  };

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


  const isLoading = isIdentifying || isGeneratingSummary;
  const canGenerate = !isLoading && identifiedItems.length > 0 && summary !== null && summary !== 'Empty';
  const canPrint = canGenerate && selectedPrinter && apiStatus === 'healthy';


  return (
    <TooltipProvider>
      <div className="container mx-auto p-4 md:p-8 min-h-screen flex flex-col bg-background">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2 flex items-center gap-2">
              <Wand2 className="text-primary h-8 w-8" /> Label Vision
            </h1>
            <p className="text-muted-foreground">
              Upload a photo, identify items, generate a label, and print it.
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
                <div className="p-2 rounded-full bg-muted/50">
                 {getApiStatusIcon()}
                </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{getApiStatusTooltip()}</p>
            </TooltipContent>
          </Tooltip>
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

            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Ruler className="h-5 w-5" />
                  2. Label Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="label-size" className="mb-2 block">Label Size</Label>
                  <Select
                    value={selectedLabelSizeKey}
                    onValueChange={handleLabelSizeChange}
                    disabled={isLoading}
                    name="label-size"
                    required
                  >
                    <SelectTrigger id="label-size" className="w-full">
                      <SelectValue placeholder="Select label size" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(LABEL_SIZES).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          {capitalizeWords(key)} ({config.labelWidthInches} x {config.labelHeightInches}")
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="printer-select" className="mb-2 block">Printer</Label>
                  <Select
                    value={selectedPrinter ?? ''}
                    onValueChange={handlePrinterChange}
                    disabled={isLoading || apiStatus !== 'healthy' || availablePrinters.length === 0}
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
              dimensions={selectedDimensions} // Pass only dimensions
              selectedPrinter={selectedPrinter} // Pass selected printer
              apiStatus={apiStatus} // Pass API status
              isGeneratingSummary={isGeneratingSummary}
              canGenerate={canGenerate}
              onRegenerateSummary={() => handleGenerateOrRegenerateSummary(identifiedItems)}
              photoDataUri={photoDataUri}
              pythonApiUrl={PYTHON_API_BASE_URL} // Pass relative base URL
            />
          </div>
        </main>

        <footer className="mt-12 text-center text-sm text-muted-foreground">
          <Separator className="my-4" />
          Powered by Firebase Studio & Genkit
        </footer>
      </div>
    </TooltipProvider>
  );
};

export default LabelVisionPage;
