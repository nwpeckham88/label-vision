
'use client';

import type * as React from 'react';
import { useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface PhotoUploaderProps {
  onPhotoUploaded: (dataUri: string, file: File) => void;
  onPhotoCleared: () => void;
  disabled?: boolean;
}

export function PhotoUploader({ onPhotoUploaded, onPhotoCleared, disabled }: PhotoUploaderProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        setFileName(file.name);
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUri = reader.result as string;
          setPreviewUrl(dataUri);
          // Pass both dataUri and file object
          onPhotoUploaded(dataUri, file);
        };
        reader.readAsDataURL(file);
      }
    },
    [onPhotoUploaded]
  );


  const handleClear = useCallback(() => {
    setPreviewUrl(null);
    setFileName(null);
    onPhotoCleared();
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Clear the file input
    }
  }, [onPhotoCleared]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col items-center gap-4">
          {previewUrl ? (
            <div className="relative w-full max-w-xs aspect-square rounded-md overflow-hidden border border-dashed">
              <Image
                src={previewUrl}
                alt={fileName || 'Uploaded photo preview'}
                layout="fill"
                objectFit="contain"
                data-ai-hint="uploaded photo"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-6 w-6 rounded-full"
                onClick={handleClear}
                aria-label="Clear Photo"
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div
              className={cn(
                'flex flex-col items-center justify-center w-full max-w-xs aspect-square rounded-md border-2 border-dashed border-border p-4 text-center cursor-pointer hover:border-primary transition-colors',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
              onClick={!disabled ? handleUploadClick : undefined}
              onKeyDown={(e) => !disabled && (e.key === 'Enter' || e.key === ' ') && handleUploadClick()}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-label="Upload Photo Area"
            >
              <Upload className="h-10 w-10 text-muted-foreground mb-2" />
              <Label className="text-sm text-muted-foreground">
                Click or Tap to Upload a Photo
              </Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
                disabled={disabled}
                aria-hidden="true" // Hide from accessibility tree as interaction is handled by the div
              />
            </div>
          )}
          {fileName && !previewUrl && <p className="text-sm text-muted-foreground">Loading preview...</p>}
          {fileName && previewUrl && <p className="text-sm text-muted-foreground truncate max-w-full px-2">{fileName}</p>}
           {!previewUrl && !fileName && (
              <Button
                variant="outline"
                onClick={handleUploadClick}
                disabled={disabled}
                aria-label="Upload Photo"
              >
                <Upload className="mr-2" />
                Upload Photo
              </Button>
            )
           }
        </div>
      </CardContent>
    </Card>
  );
}
