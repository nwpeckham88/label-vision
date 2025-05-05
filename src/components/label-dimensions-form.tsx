'use client';

import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';

/**
 * Interface for the label dimensions.
 */
export interface LabelDimensions {
  labelWidthInches: number;
  labelHeightInches: number;
}

interface LabelDimensionsFormProps {
  initialDimensions: LabelDimensions;
  onDimensionsChange: (dimensions: LabelDimensions) => void;
  disabled?: boolean;
}

const MIN_DIMENSION = 0.5;
const MAX_DIMENSION = 12;

/**
 * A form component for inputting label dimensions (width and height).
 */
export function LabelDimensionsForm({
  initialDimensions,
  onDimensionsChange,
  disabled = false,
}: LabelDimensionsFormProps) {
  const [width, setWidth] = useState<string>(initialDimensions.labelWidthInches.toString());
  const [height, setHeight] = useState<string>(initialDimensions.labelHeightInches.toString());
  const [widthError, setWidthError] = useState<string | null>(null);
  const [heightError, setHeightError] = useState<string | null>(null);

  // Update internal state if initialDimensions prop changes externally
  useEffect(() => {
    setWidth(initialDimensions.labelWidthInches.toString());
    setHeight(initialDimensions.labelHeightInches.toString());
    setWidthError(null); // Clear errors on prop change
    setHeightError(null);
  }, [initialDimensions]);

  const validateAndPropagate = useCallback((newWidthStr: string, newHeightStr: string) => {
    const newWidthNum = parseFloat(newWidthStr);
    const newHeightNum = parseFloat(newHeightStr);
    let valid = true;

    if (isNaN(newWidthNum) || newWidthNum < MIN_DIMENSION || newWidthNum > MAX_DIMENSION) {
      setWidthError(`Width must be between ${MIN_DIMENSION}" and ${MAX_DIMENSION}"`);
      valid = false;
    } else {
      setWidthError(null);
    }

    if (isNaN(newHeightNum) || newHeightNum < MIN_DIMENSION || newHeightNum > MAX_DIMENSION) {
      setHeightError(`Height must be between ${MIN_DIMENSION}" and ${MAX_DIMENSION}"`);
      valid = false;
    } else {
      setHeightError(null);
    }

    if (valid) {
      onDimensionsChange({
        labelWidthInches: newWidthNum,
        labelHeightInches: newHeightNum,
      });
    }
  }, [onDimensionsChange]);

  const handleWidthChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setWidth(newValue);
    validateAndPropagate(newValue, height);
  };

  const handleHeightChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setHeight(newValue);
    validateAndPropagate(width, newValue);
  };

  return (
    <Card>
      <CardHeader>
        {/* Optional: Add title if needed, or remove header */}
        {/* <CardTitle className="text-lg font-semibold">Custom Dimensions</CardTitle> */}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 items-start">
          <div>
            <Label htmlFor="label-width">Width (inches)</Label>
            <Input
              id="label-width"
              type="number"
              step="0.1"
              min={MIN_DIMENSION}
              max={MAX_DIMENSION}
              value={width}
              onChange={handleWidthChange}
              disabled={disabled}
              className={cn(widthError && 'border-destructive')}
              aria-invalid={!!widthError}
              aria-describedby={widthError ? "label-width-error" : undefined}
            />
            {widthError && (
              <p id="label-width-error" className="text-xs text-destructive mt-1 flex items-center gap-1">
                 <AlertCircle className="h-3 w-3" /> {widthError}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="label-height">Height (inches)</Label>
            <Input
              id="label-height"
              type="number"
              step="0.1"
              min={MIN_DIMENSION}
              max={MAX_DIMENSION}
              value={height}
              onChange={handleHeightChange}
              disabled={disabled}
              className={cn(heightError && 'border-destructive')}
              aria-invalid={!!heightError}
              aria-describedby={heightError ? "label-height-error" : undefined}
            />
             {heightError && (
              <p id="label-height-error" className="text-xs text-destructive mt-1 flex items-center gap-1">
                 <AlertCircle className="h-3 w-3" /> {heightError}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 