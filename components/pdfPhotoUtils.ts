import { jsPDF } from 'jspdf';
import type { PhotoData } from '../types';

export const PDF_LAYOUT = {
    PAGE_WIDTH: 215.9,
    PAGE_HEIGHT: 279.4,
    MARGIN: 12.7,
    TEAL_COLOR: [0, 125, 140] as [number, number, number],
    IMG_W: 132,
    IMG_H: 99,
    GAP: 5,
    RIGHT_INDENT: 1.5
};

/**
 * Draws a standardized photo log entry (Text on left, Image on right)
 */
export const drawPdfEntry = (
    doc: jsPDF,
    photo: PhotoData,
    y: number,
    contentMargin: number,
    textWidth: number,
    imgX: number
) => {
    let tY = y + (doc.getTextDimensions('Photo').h * 0.75);

    const drawTextField = (label: string, value: string, isDesc = false) => {
        doc.setFont('times', 'bold');
        doc.setFontSize(12);
        doc.text(label + ':', contentMargin, tY);
        doc.setFont('times', 'normal');

        if (isDesc) {
            tY += 5;
            const dLines = doc.splitTextToSize(value || ' ', textWidth);
            doc.text(dLines, contentMargin, tY);
            tY += doc.getTextDimensions(dLines).h;
        } else {
            const labelW = doc.getTextWidth(label + ':');
            const lines = doc.splitTextToSize(value || ' ', textWidth - labelW - 2);
            doc.text(lines, contentMargin + labelW + 2, tY);
            tY += doc.getTextDimensions(lines).h + 1.5;
        }
    };

    drawTextField(photo.isMap ? 'Map' : 'Photo', photo.photoNumber);
    if (!photo.isMap) {
        drawTextField('Direction', photo.direction || 'N/A');
    }
    drawTextField('Date', photo.date);
    drawTextField('Location', photo.location);
    drawTextField('Description', photo.description, true);

    if (photo.imageUrl) {
        doc.addImage(photo.imageUrl, 'JPEG', imgX, y, PDF_LAYOUT.IMG_W, PDF_LAYOUT.IMG_H);
    }
};

/**
 * Shared logic to generate the Photo Log section of any PDF
 */
export const drawPhotoLogSection = async (
    doc: jsPDF,
    photos: PhotoData[],
    drawHeader: (doc: jsPDF) => Promise<number>,
    drawFooter: (doc: jsPDF) => void
) => {
    const sitePhotos = photos.filter(p => !p.isMap && p.imageUrl);
    const mapPhotos = photos.filter(p => p.isMap && p.imageUrl);

    const TEAL_RIGHT = PDF_LAYOUT.PAGE_WIDTH - PDF_LAYOUT.MARGIN;
    const IMG_X = TEAL_RIGHT - PDF_LAYOUT.IMG_W - PDF_LAYOUT.RIGHT_INDENT;
    const CONTENT_MARGIN = PDF_LAYOUT.MARGIN + 4;
    const TEXT_W = IMG_X - CONTENT_MARGIN - PDF_LAYOUT.GAP;

    // 1. Draw Site Photos (2 per page)
    if (sitePhotos.length > 0) {
        const groups: number[][] = [];
        let currentGroup: number[] = [];
        sitePhotos.forEach((_, i) => {
            currentGroup.push(i);
            if (currentGroup.length === 2) {
                groups.push(currentGroup);
                currentGroup = [];
            }
        });
        if (currentGroup.length > 0) groups.push(currentGroup);

        for (let i = 0; i < groups.length; i++) {
            doc.addPage();
            const yStart = await drawHeader(doc);
            const pg = groups[i];

            if (pg.length === 1) {
                drawPdfEntry(doc, sitePhotos[pg[0]], yStart + 1, CONTENT_MARGIN, TEXT_W, IMG_X);
            } else {
                const availH = (PDF_LAYOUT.PAGE_HEIGHT - PDF_LAYOUT.MARGIN) - yStart;
                const photo1 = sitePhotos[pg[0]];
                const photo2 = sitePhotos[pg[1]];

                const entry1Y = yStart + 1;
                drawPdfEntry(doc, photo1, entry1Y, CONTENT_MARGIN, TEXT_W, IMG_X);

                const entry2Bottom = PDF_LAYOUT.PAGE_HEIGHT - PDF_LAYOUT.MARGIN - 0.5;
                const entry2Y = entry2Bottom - PDF_LAYOUT.IMG_H;

                // Center Line
                const lineY = ((entry1Y + PDF_LAYOUT.IMG_H) + entry2Y) / 2;
                doc.setDrawColor(PDF_LAYOUT.TEAL_COLOR[0], PDF_LAYOUT.TEAL_COLOR[1], PDF_LAYOUT.TEAL_COLOR[2]);
                doc.setLineWidth(0.5);
                doc.line(PDF_LAYOUT.MARGIN, lineY, TEAL_RIGHT, lineY);

                drawPdfEntry(doc, photo2, entry2Y, CONTENT_MARGIN, TEXT_W, IMG_X);
            }
            drawFooter(doc);
        }
    }

    // 2. Draw Maps (1 per page)
    if (mapPhotos.length > 0) {
        for (const map of mapPhotos) {
            doc.addPage();
            const yStart = await drawHeader(doc);
            
            // Map Drawing logic (Calculated height)
            const availH = (PDF_LAYOUT.PAGE_HEIGHT - PDF_LAYOUT.MARGIN - 25) - yStart;
            if (map.imageUrl) {
                // Simplified aspect ratio fit for maps
                doc.addImage(map.imageUrl, 'JPEG', CONTENT_MARGIN, yStart, PDF_LAYOUT.PAGE_WIDTH - (CONTENT_MARGIN * 2), availH, undefined, 'FAST');
                drawPdfEntry(doc, map, yStart + availH + 5, CONTENT_MARGIN, PDF_LAYOUT.PAGE_WIDTH - (CONTENT_MARGIN * 2), CONTENT_MARGIN);
            }
            drawFooter(doc);
        }
    }
};