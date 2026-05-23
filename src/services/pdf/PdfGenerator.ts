export interface PdfGenerator {
  /** Rasterizes the given DOM node into a single multi-page A4 PDF File. */
  generateFromNode(node: HTMLElement, fileName: string): Promise<File>;
}
