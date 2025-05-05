
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Capitalizes the first letter of each word in a string.
 * @param str The input string.
 * @returns The string with each word capitalized.
 */
export function capitalizeWords(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase() // Ensure consistent starting case
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
