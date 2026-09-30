import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import type { PdfGenerator } from './PdfGenerator';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const JPEG_QUALITY = 0.85;

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

    // Each page is re-encoded as JPEG: lossless PNG pages made a one-visit
    // report with photos ~14 MB, too heavy to send over WhatsApp.
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable for PDF paging.');

    let offsetPx = 0;
    let page = 0;
    while (offsetPx < imgHeightPx) {
      const sliceHeightPx = Math.min(pageHeightPx, imgHeightPx - offsetPx);
      canvas.width = imgWidthPx;
      canvas.height = sliceHeightPx;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
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
      // A trailing slice with nothing on it (layout rounding) is not a page.
      if (page > 0 && isBlank(ctx, canvas.width, canvas.height)) break;
      const sliceData = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      const sliceHeightMm = sliceHeightPx / pxPerMm;
      if (page > 0) pdf.addPage();
      pdf.addImage(sliceData, 'JPEG', 0, 0, A4_WIDTH_MM, sliceHeightMm, undefined, 'FAST');
      offsetPx += sliceHeightPx;
      page += 1;
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

/** True when a canvas area is (near) plain white. Samples a grid of pixels. */
function isBlank(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const { data } = ctx.getImageData(0, 0, width, height);
  const step = 4 * 7;   // every 7th pixel
  for (let i = 0; i < data.length; i += step) {
    if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) return false;
  }
  return true;
}
