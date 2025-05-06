'use client';

import { ImagePlus, X } from 'lucide-react'; // Added ImagePlus
import Image from 'next/image';
import type * as React from 'react';
import { useCallback, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface PhotoUploaderProps {
  onPhotoUploaded: (dataUri: string, file: File) => void;
  onPhotoCleared: () => void;
  disabled?: boolean;
}

export function PhotoUploader({ onPhotoUploaded, onPhotoCleared, disabled }: PhotoUploaderProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false); // State for drag-n-drop visual feedback
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUri = reader.result as string;
      setPreviewUrl(dataUri);
      // Pass both dataUri and file object
      onPhotoUploaded(dataUri, file);
    };
    reader.readAsDataURL(file);
  }, [onPhotoUploaded]);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile] // Add missing dependency: processFile
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
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  // --- Drag and Drop Handlers ---
   const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // Necessary to allow drop
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
       const file = files[0];
       if (file.type.startsWith('image/')) {
           processFile(file);
           // Update file input ref for consistency if needed (optional)
           if (fileInputRef.current) {
             // Cannot directly set FileList, but can clear it
             fileInputRef.current.value = '';
           }
       }
    }
  };

  return (
    <div
        className={cn(
            "border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center transition-colors duration-200",
            disabled ? 'opacity-60 cursor-not-allowed bg-muted/30 border-border' : 'hover:border-primary hover:bg-primary/5',
            isDragging ? 'border-primary bg-primary/10' : 'border-border bg-card',
            previewUrl ? 'border-solid' : '' // Change border style when preview is shown
        )}
        onClick={handleUploadClick} // Click anywhere to upload when no preview
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={previewUrl ? "Uploaded photo area" : "Photo upload area, click or drag image"}
    >
      <Input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled}
        aria-hidden="true" // Hide from accessibility tree as interaction is handled by the div
      />

      {previewUrl ? (
        <div className="relative w-full max-w-sm aspect-video rounded-md overflow-hidden"> {/* Changed aspect ratio */}
          <Image
            src={previewUrl}
            alt={fileName || 'Uploaded photo preview'}
            fill // Use fill to cover the container
            style={{ objectFit: 'contain' }} // Contain ensures the whole image is visible
            data-ai-hint="uploaded photo"
          />
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-7 w-7 rounded-full shadow-md z-10" // Smaller, added shadow
            onClick={(e) => { e.stopPropagation(); handleClear(); }} // Stop propagation to prevent triggering upload
            aria-label="Clear Photo"
            disabled={disabled}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-center py-6">
          <ImagePlus className={cn("h-12 w-12 mb-3", disabled ? "text-muted-foreground/50" : "text-muted-foreground")} />
          <Label className={cn("text-base font-medium", disabled ? "text-muted-foreground/50" : "text-foreground")}>
            {isDragging ? "Drop image here" : "Drag 'n' drop or click"}
          </Label>
          <p className="text-sm text-muted-foreground mt-1">Upload a photo to identify items</p>
        </div>
      )}

      {fileName && previewUrl && (
          <p className="text-xs text-muted-foreground truncate max-w-full px-2 mt-2">{fileName}</p>
      )}
    </div>
  );
}
