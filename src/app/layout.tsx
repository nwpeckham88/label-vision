import type { Metadata } from 'next';
import { Inter } from 'next/font/google'; // Use Inter font for a clean look
import './globals.css';
import { Toaster } from '@/components/ui/toaster'; // Import Toaster
import { ThemeProvider } from '@/components/theme-provider'; // Import ThemeProvider

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Label Vision', // Update title
  description: 'Generate labels from photos using AI.', // Update description
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning> {/* Add suppressHydrationWarning */}
      <body className={`${inter.variable} font-sans antialiased`}>
         <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster /> {/* Add Toaster here */}
        </ThemeProvider>
      </body>
    </html>
  );
}
