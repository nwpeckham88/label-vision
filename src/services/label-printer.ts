
import { PDFDocument, rgb, StandardFonts, PageSizes, PDFFont } from 'pdf-lib';

/**
 * Represents the configuration for a label printer.
 */
export interface PrinterConfig {
  printerName: string;
  labelWidthInches: number;
  labelHeightInches: number;
}

/**
 * Represents formatting options for the label.
 */
export interface LabelFormattingOptions {
  fontFamily?: 'Helvetica' | 'Times-Roman' | 'Courier'; // Add more if needed
  textAlign?: 'left' | 'center' | 'right';
}

/**
 * Represents the structured content and formatting of a label.
 */
export interface LabelContent {
  summary: string;
  items: string[];
  formatting?: LabelFormattingOptions; // Make formatting optional
  // Removed fontSize, as pdf-lib will calculate optimal size
}

const DPI = 72; // PDF points per inch

/**
 * Asynchronously prints a label to the specified printer.
 * This remains a placeholder implementation.
 *
 * @param printerConfig The configuration for the printer.
 * @param labelContent The structured label content to print.
 * @returns A promise that resolves when the label has been printed successfully, or rejects if printing fails.
 */
export async function printLabel(printerConfig: PrinterConfig, labelContent: LabelContent): Promise<void> {
  // TODO: Implement actual printing logic (e.g., using browser print API with the generated PDF)
  // For now, we'll generate the PDF and log it. A real implementation might send this PDF to a printer API or use window.print().
  console.log(`--- Simulating Print ---`);
  console.log(`Printer: ${printerConfig.printerName}`);
  try {
    const pdfBytes = await generatePdf(printerConfig, labelContent);
    console.log(`Generated PDF for printing (${pdfBytes.length} bytes)`);
    // In a real scenario: send pdfBytes to printer or open print dialog
     // const blob = new Blob([pdfBytes], { type: 'application/pdf' });
     // const url = URL.createObjectURL(blob);
     // window.open(url); // Example: Opens PDF in new tab, user can print
  } catch (error) {
      console.error("Failed to generate PDF for printing:", error);
      throw error; // Re-throw error
  }
  console.log(`----------------------`);

  // Simulate potential error (less likely now as PDF generation handles layout)
  // if (Math.random() > 0.95) {
  //   throw new Error("Simulated printer connection error");
  // }

  return Promise.resolve();
}

/**
 * Asynchronously generates a PDF document for the specified label using pdf-lib.
 *
 * @param printerConfig The configuration for the printer (used for dimensions).
 * @param labelContent The structured label content and formatting options.
 * @returns A promise that resolves with a PDF document as a byte array.
 */
export async function generatePdf(printerConfig: PrinterConfig, labelContent: LabelContent): Promise<Uint8Array> {
    const { labelWidthInches, labelHeightInches } = printerConfig;
    const { summary, items } = labelContent;
    const { fontFamily = 'Helvetica', textAlign = 'left' } = labelContent.formatting || {};

    const widthPt = labelWidthInches * DPI;
    const heightPt = labelHeightInches * DPI;

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([widthPt, heightPt]);
    const { width, height } = page.getSize();

    // --- Font Selection ---
    let baseFont: StandardFonts = StandardFonts.Helvetica;
    let boldFont: StandardFonts = StandardFonts.HelveticaBold; // Default to Helvetica

    switch (fontFamily) {
        case 'Times-Roman':
            baseFont = StandardFonts.TimesRoman;
            boldFont = StandardFonts.TimesRomanBold;
            break;
        case 'Courier':
            baseFont = StandardFonts.Courier;
            boldFont = StandardFonts.CourierBold;
            break;
        // Add more cases if needed
    }
    const pdfBaseFont = await pdfDoc.embedFont(baseFont);
    const pdfBoldFont = await pdfDoc.embedFont(boldFont);


    // --- Margins and Paddings ---
    const margin = 5; // Points
    const contentWidth = width - 2 * margin;
    const contentHeight = height - 2 * margin;
    const headerBottomMargin = 4;
    const lineThickness = 0.5;
    const lineTopMargin = 2;
    const lineBottomMargin = 4;
    const itemSpacing = 1.5; // Vertical spacing between items

    // --- Header (Summary) ---
    const maxHeaderFontSize = 24;
    const minHeaderFontSize = 8;
    let headerFontSize = maxHeaderFontSize;
    let headerTextWidth = pdfBoldFont.widthOfTextAtSize(summary, headerFontSize);

    // Calculate optimal header font size
    while (headerTextWidth > contentWidth && headerFontSize > minHeaderFontSize) {
        headerFontSize -= 1;
        headerTextWidth = pdfBoldFont.widthOfTextAtSize(summary, headerFontSize);
    }
    const headerTextHeight = pdfBoldFont.heightAtSize(headerFontSize);
    let headerX = margin;
    if (textAlign === 'center') {
        headerX = (width - headerTextWidth) / 2;
    } else if (textAlign === 'right') {
        headerX = width - margin - headerTextWidth;
    }
    const headerY = height - margin - headerTextHeight;

    page.drawText(summary, {
        x: headerX,
        y: headerY,
        font: pdfBoldFont,
        size: headerFontSize,
        color: rgb(0, 0, 0),
    });

    // --- Separator Line ---
    const lineY = headerY - headerBottomMargin - lineTopMargin;
    page.drawLine({
        start: { x: margin, y: lineY },
        end: { x: width - margin, y: lineY },
        thickness: lineThickness,
        color: rgb(0.5, 0.5, 0.5), // Gray line
    });

    // --- Item List ---
    const itemListStartY = lineY - lineBottomMargin;
    const availableHeightForItems = itemListStartY - margin;
    const maxItemFontSize = 14;
    const minItemFontSize = 6;

    let optimalFontSize = minItemFontSize;
    let optimalColumns = 1;

    if (items.length > 0 && availableHeightForItems > 0) {
        // Find the best font size and column count that fits the items
        findOptimalFit: // Label for the outer loop
        for (let fontSize = maxItemFontSize; fontSize >= minItemFontSize; fontSize--) {
            const currentItemTextHeight = pdfBaseFont.heightAtSize(fontSize);
            const totalLineHeight = currentItemTextHeight + itemSpacing;

            for (let numCols = 3; numCols >= 1; numCols--) { // Prioritize more columns if they fit
                const colWidth = (contentWidth - (numCols - 1) * margin) / numCols; // Adjust for gaps
                const itemsPerCol = Math.ceil(items.length / numCols);
                const requiredHeight = itemsPerCol * totalLineHeight;

                // Check if text width fits in columns
                const itemsFitWidth = items.every(item => pdfBaseFont.widthOfTextAtSize(item, fontSize) <= colWidth);

                if (requiredHeight <= availableHeightForItems && itemsFitWidth) {
                    optimalFontSize = fontSize;
                    optimalColumns = numCols;
                    break findOptimalFit; // Found a good fit, exit both loops
                }
            }
        }

        // --- Draw Items ---
        const itemTextHeight = pdfBaseFont.heightAtSize(optimalFontSize);
        const totalLineHeight = itemTextHeight + itemSpacing;
        const colWidth = (contentWidth - (optimalColumns - 1) * margin) / optimalColumns;
        const itemsPerCol = Math.ceil(items.length / optimalColumns);

        let itemIndex = 0;
        for (let col = 0; col < optimalColumns; col++) {
            let currentY = itemListStartY - itemTextHeight; // Start drawing from top of item area
            const colStartX = margin + col * (colWidth + margin);

            for (let row = 0; row < itemsPerCol && itemIndex < items.length; row++) {
                const item = items[itemIndex++];
                const itemTextWidth = pdfBaseFont.widthOfTextAtSize(item, optimalFontSize);

                let itemX = colStartX;
                 if (textAlign === 'center') {
                    itemX = colStartX + (colWidth - itemTextWidth) / 2;
                } else if (textAlign === 'right') {
                    itemX = colStartX + colWidth - itemTextWidth;
                }

                // Safety check for Y position before drawing
                if (currentY < margin) {
                    console.warn("Stopping item drawing, potential overflow for:", item);
                    break; // Stop drawing in this column if we run out of space
                }

                page.drawText(item, {
                    x: itemX,
                    y: currentY,
                    font: pdfBaseFont,
                    size: optimalFontSize,
                    color: rgb(0, 0, 0),
                    maxWidth: colWidth, // Ensure text wraps within the column (though ideally pre-checked)
                    // lineHeight: totalLineHeight, // pdf-lib calculates line height based on font size
                    wordBreaks: [' '], // Basic word breaking
                });

                currentY -= totalLineHeight; // Move down for the next item
            }
             if (itemIndex >= items.length || currentY < margin) break; // All items drawn or ran out of space
        }
    }


    // --- Save PDF ---
    const pdfBytes = await pdfDoc.save();
    console.log(`--- PDF Generated (${pdfBytes.length} bytes) ---`);
    console.log(`Size: ${labelWidthInches}" x ${labelHeightInches}"`);
    console.log(`Summary: ${summary} (Font: ${boldFont}, Size: ${headerFontSize.toFixed(1)}pt)`);
    console.log(`Items: ${items.length} (Font: ${baseFont}, Optimal Size: ${optimalFontSize.toFixed(1)}pt, Columns: ${optimalColumns})`);
    console.log(`-------------------------`);
    return pdfBytes;
}
