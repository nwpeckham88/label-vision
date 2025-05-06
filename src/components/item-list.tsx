'use client';

import { Package } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface ItemListProps {
  items: string[];
  isLoading: boolean;
  title?: string; // Optional title prop
}

export function ItemList({ items, isLoading, title = "Identified Items" }: ItemListProps) {
  return (
    <Card className="shadow-md h-full"> {/* Ensure card takes full height */}
      <CardHeader>
        <CardTitle className="text-xl font-semibold flex items-center gap-2"> {/* Increased title size */}
          <Package className="h-5 w-5" />
          {title} {/* Use the title prop */}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-grow"> {/* Allow content to grow */}
        {isLoading ? (
          <div className="flex flex-wrap gap-2">
            {[...Array(8)].map((_, index) => ( // Show more skeletons
              <Skeleton key={index} className="h-7 w-24 rounded-full" /> // Slightly larger skeletons
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {items.map((item, index) => (
              <Badge key={index} variant="secondary" className="text-base px-4 py-1.5 rounded-md shadow-sm"> {/* Larger badges */}
                {item}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-base text-muted-foreground italic"> {/* Slightly larger text */}
            No items identified yet. Upload a photo and click &quot;Identify & Summarize&quot;.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
