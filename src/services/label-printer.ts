import { PDFDocument, rgb, StandardFonts, PageSizes, PDFFont, degrees } from 'pdf-lib';

/**
 * Represents the dimensions for a label.
 */
export interface LabelDimensions {
    labelWidthInches: number;
    labelHeightInches: number;
}

/**
 * Represents formatting options for the label.
 */
export interface LabelFormattingOptions {
    fontFamily?: 'Helvetica' | 'Times-Roman' | 'Courier';
    textAlign?: 'left' | 'center' | 'right';
}

/**
 * Represents the structured content and formatting of a label.
 */
export interface LabelContent {
    summary: string;
    items: string[];
    formatting?: LabelFormattingOptions;
    imageDataUri?: string | null; // Optional: Pre-processed (resized, grayscale) image data URI
}

const DPI = 72; // PDF points per inch

/**
 * Asynchronously generates a PDF document for the specified label using pdf-lib.
 *
 * @param dimensions The dimensions for the label.
 * @param labelContent The structured label content and formatting options, potentially including an image.
 * @returns A promise that resolves with a PDF document as a byte array.
 */
export async function generatePdf(dimensions: LabelDimensions, labelContent: LabelContent): Promise<Uint8Array> {
    const { labelWidthInches, labelHeightInches } = dimensions;
    const { summary, items, imageDataUri } = labelContent;
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
    }
    const pdfBaseFont = await pdfDoc.embedFont(baseFont);
    const pdfBoldFont = await pdfDoc.embedFont(boldFont);


    // --- Margins and Paddings ---
    const margin = 5; // Points
    let currentY = height - margin; // Track current Y position from top
    const contentWidth = width - 2 * margin;
    const headerBottomMargin = 4;
    const lineThickness = 0.5;
    const lineTopMargin = 2;
    const lineBottomMargin = 4;
    const itemSpacing = 1.5; // Vertical spacing between items
    const imagePadding = 4; // Space around the image

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
    const headerY = currentY - headerTextHeight;

    page.drawText(summary, {
        x: headerX,
        y: headerY,
        font: pdfBoldFont,
        size: headerFontSize,
        color: rgb(0, 0, 0),
    });
    currentY = headerY - headerBottomMargin; // Update Y position

    // --- Separator Line ---
    const lineY = currentY - lineTopMargin;
    page.drawLine({
        start: { x: margin, y: lineY },
        end: { x: width - margin, y: lineY },
        thickness: lineThickness,
        color: rgb(0.5, 0.5, 0.5), // Gray line
    });
    currentY = lineY - lineBottomMargin; // Update Y position


    // --- Image Handling (if provided) ---
    let imageDims = { width: 0, height: 0 };
    let embeddedImage: Awaited<ReturnType<typeof pdfDoc.embedPng | typeof pdfDoc.embedJpg>> | null = null;
    let imageSectionHeight = 0;
    const maxImageFraction = 0.3; // Max height fraction image can take

    if (imageDataUri) {
        try {
            if (imageDataUri.startsWith('data:image/png')) {
                 embeddedImage = await pdfDoc.embedPng(imageDataUri);
            } else if (imageDataUri.startsWith('data:image/jpeg') || imageDataUri.startsWith('data:image/jpg')) {
                 embeddedImage = await pdfDoc.embedJpg(imageDataUri);
            } else {
                console.warn("Unsupported image format for embedding:", imageDataUri.substring(0, 30));
            }

            if (embeddedImage) {
                const maxAllowedImageHeight = (height - margin * 2) * maxImageFraction; // Max height relative to label height
                const scale = Math.min(contentWidth / embeddedImage.width, maxAllowedImageHeight / embeddedImage.height, 1); // Don't scale up
                imageDims = embeddedImage.scale(scale);
                imageSectionHeight = imageDims.height + imagePadding * 2; // Reserve space for image + padding
            }
        } catch (e) {
            console.error("Failed to embed image:", e);
            embeddedImage = null; // Ensure it's null if embedding failed
            imageDims = { width: 0, height: 0 };
            imageSectionHeight = 0;
        }
    }

    // --- Item List Area Calculation ---
    const itemListStartY = currentY; // Top of the item list area
    const availableHeightForItems = itemListStartY - margin - imageSectionHeight; // Subtract image height if present

    // --- Item List ---
    const maxItemFontSize = 14;
    const minItemFontSize = 6;

    let optimalFontSize = minItemFontSize;
    let optimalColumns = 1;

    if (items.length > 0 && availableHeightForItems > 0) {
        // Find the best font size and column count that fits the items
        findOptimalFit:
        for (let fontSize = maxItemFontSize; fontSize >= minItemFontSize; fontSize--) {
            const currentItemTextHeight = pdfBaseFont.heightAtSize(fontSize);
            const totalLineHeight = currentItemTextHeight + itemSpacing;

            for (let numCols = 3; numCols >= 1; numCols--) {
                const colWidth = (contentWidth - (numCols - 1) * margin) / numCols;
                const itemsPerCol = Math.ceil(items.length / numCols);
                const requiredHeight = itemsPerCol * totalLineHeight;

                const itemsFitWidth = items.every(item => pdfBaseFont.widthOfTextAtSize(item, fontSize) <= colWidth);

                if (requiredHeight <= availableHeightForItems && itemsFitWidth) {
                    optimalFontSize = fontSize;
                    optimalColumns = numCols;
                    break findOptimalFit;
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
            let currentItemY = itemListStartY - itemTextHeight; // Start drawing from top of item area
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

                if (currentItemY < margin + imageSectionHeight) { // Check against bottom margin + potential image height
                    console.warn("Stopping item drawing, potential overflow for:", item);
                    break;
                }

                page.drawText(item, {
                    x: itemX,
                    y: currentItemY,
                    font: pdfBaseFont,
                    size: optimalFontSize,
                    color: rgb(0, 0, 0),
                    maxWidth: colWidth,
                    wordBreaks: [' '],
                });

                currentItemY -= totalLineHeight;
            }
             if (itemIndex >= items.length) break; // All items drawn
        }
    } else if (items.length > 0) {
         console.warn("Not enough vertical space for items, or no items.");
    }


    // --- Draw Image (if embedded) ---
    if (embeddedImage && imageDims.width > 0 && imageDims.height > 0) {
        const imageX = (width - imageDims.width) / 2; // Center image horizontally
        const imageY = margin + imagePadding; // Place image at the bottom with padding

        // Basic dithering simulation attempt (draw as grayscale)
        // pdf-lib doesn't have direct dithering. We assume pre-processing handled it.
        // Drawing with low opacity might simulate lighter printing, but not true dithering.
         page.drawImage(embeddedImage, {
             x: imageX,
             y: imageY,
             width: imageDims.width,
             height: imageDims.height,
             // opacity: 0.8, // Optional: slightly reduce opacity
         });
    }


    // --- Save PDF ---
    const pdfBytes = await pdfDoc.save();
    console.log(`--- PDF Generated (${pdfBytes.length} bytes) ---`);
    console.log(`Size: ${labelWidthInches}" x ${labelHeightInches}"`);
    console.log(`Summary: ${summary} (Font: ${boldFont}, Size: ${headerFontSize.toFixed(1)}pt)`);
    console.log(`Items: ${items.length} (Font: ${baseFont}, Optimal Size: ${optimalFontSize.toFixed(1)}pt, Columns: ${optimalColumns})`);
    if (imageDataUri && embeddedImage) {
         console.log(`Image: Included (Dimensions: ${imageDims.width.toFixed(0)}x${imageDims.height.toFixed(0)}pt)`);
    } else if (imageDataUri) {
         console.log(`Image: Provided but failed to embed or unsupported format.`);
    }
    console.log(`-------------------------`);
    return pdfBytes;
}
