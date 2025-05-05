
'use client';

import type * as React from 'react';
import { Package } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface ItemListProps {
  items: string[];
  isLoading: boolean;
  title?: string; // Optional title prop
}

export function ItemList({ items, isLoading, title = "Identified Items" }: ItemListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Package className="h-5 w-5" />
          {title} {/* Use the title prop */}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-wrap gap-2">
            {[...Array(5)].map((_, index) => (
              <Skeleton key={index} className="h-6 w-20 rounded-full" />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {items.map((item, index) => (
              <Badge key={index} variant="secondary" className="text-sm px-3 py-1">
                {item}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No items identified yet. Upload a photo and click "Identify & Summarize".
          </p>
        )}
      </CardContent>
    </Card>
  );
}
