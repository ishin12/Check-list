import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import type { PdfGenerator } from './PdfGenerator';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/**
 * Generates a PDF by rasterizing rendered HTML. The browser handles Arabic
 * shaping and RTL, so the output is correct without embedding fonts in jsPDF.
 * The captured image is sliced across A4 pages when the content is tall.
 */
export class HtmlRasterPdfGenerator implements PdfGenerator {
  async generateFromNode(node: HTMLElement, fileName: string): Promise<File> {
    // Make sure webfonts (incl. Arabic) are loaded before capture, else glyphs
    // fall back or render as boxes.
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
    const dataUrl = await toPng(node, {
      pixelRatio,
      backgroundColor: '#ffffff',
      cacheBust: true,
    });

    const img = await loadImage(dataUrl);
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    const imgWidthPx = img.width;
    const imgHeightPx = img.height;
    // Scale so the image width fits A4 width; compute page height in source px.
    const pxPerMm = imgWidthPx / A4_WIDTH_MM;
    const pageHeightPx = Math.floor(A4_HEIGHT_MM * pxPerMm);

    if (imgHeightPx <= pageHeightPx) {
      const renderedHeightMm = imgHeightPx / pxPerMm;
      pdf.addImage(dataUrl, 'PNG', 0, 0, A4_WIDTH_MM, renderedHeightMm);
    } else {
      let offsetPx = 0;
      let page = 0;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable for PDF paging.');

      while (offsetPx < imgHeightPx) {
        const sliceHeightPx = Math.min(pageHeightPx, imgHeightPx - offsetPx);
        canvas.width = imgWidthPx;
        canvas.height = sliceHeightPx;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(
          img,
          0,
          offsetPx,
          imgWidthPx,
          sliceHeightPx,
          0,
          0,
          imgWidthPx,
          sliceHeightPx,
        );
        const sliceData = canvas.toDataURL('image/png');
        const sliceHeightMm = sliceHeightPx / pxPerMm;
        if (page > 0) pdf.addPage();
        pdf.addImage(sliceData, 'PNG', 0, 0, A4_WIDTH_MM, sliceHeightMm);
        offsetPx += sliceHeightPx;
        page += 1;
      }
    }

    const blob = pdf.output('blob');
    return new File([blob], fileName, { type: 'application/pdf' });
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
