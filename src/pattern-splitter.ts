// pattern-splitter.ts
// TypeScript conversion of prototype.html logic

import type { jsPDF as JsPDFType } from 'jspdf';

export type PatternSplitterOptions = {
  svgText: string;
  paperWidth: number;
  paperHeight: number;
  margin: number;
  onProgress?: (progress: number, message: string) => void;
};

export type PatternSplitterResult = {
  tiles: number;
  rows: number;
  cols: number;
  pdfBlob: Blob;
};

const PX_TO_MM = 25.4 / 96;

function parseUnit(val: string | null): number | null {
  if (!val) return null;
  val = val.toLowerCase();
  const num = parseFloat(val);
  if (val.endsWith('mm')) return num;
  if (val.endsWith('cm')) return num * 10;
  if (val.endsWith('in')) return num * 25.4;
  if (val.endsWith('pt')) return num * (25.4 / 72);
  if (val.endsWith('pc')) return num * (25.4 / 6);
  return num * PX_TO_MM;
}

function getSvgDimensionsInMM(svg: SVGElement): { w: number; h: number } {
  let w = svg.getAttribute('width');
  let h = svg.getAttribute('height');
  const viewBox = svg.getAttribute('viewBox');

  let widthMM = parseUnit(w);
  let heightMM = parseUnit(h);

  if ((!widthMM || !heightMM) && viewBox) {
    const parts = viewBox.split(/\s|,/).filter(Boolean).map(parseFloat);
    if (parts.length === 4) {
      if (!widthMM) widthMM = parts[2] * PX_TO_MM;
      if (!heightMM) heightMM = parts[3] * PX_TO_MM;
    }
  }

  if (!widthMM) widthMM = 210;
  if (!heightMM) heightMM = 297;

  return { w: widthMM, h: heightMM };
}

export async function generateTiledPDF(options: PatternSplitterOptions): Promise<PatternSplitterResult> {
  const { svgText, paperWidth, paperHeight, margin, onProgress } = options;

  // Dynamic imports
  const { jsPDF } = await import('jspdf');
  const svg2pdfModule = await import("svg2pdf.js");
  const svg2pdfFn = svg2pdfModule.svg2pdf || svg2pdfModule.default;

  // Parse SVG
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const svgElement = doc.documentElement as unknown as SVGElement;

  // Remove scripts
  svgElement.querySelectorAll("script").forEach((s) => s.remove());

  // Get dimensions
  const size = getSvgDimensionsInMM(svgElement);
  let svgWidthMM = size.w;

  // Normalize viewBox
  if (!svgElement.hasAttribute("viewBox")) {
    svgElement.setAttribute(
      "viewBox",
      `0 0 ${size.w / PX_TO_MM} ${size.h / PX_TO_MM}`
    );
  }
  const viewBox = svgElement
    .getAttribute("viewBox")!
    .split(/\s|,/)
    .filter(Boolean)
    .map(parseFloat);
  const vbW = viewBox[2];
  const vbH = viewBox[3];
  const vbAspect = vbW / vbH;

  // Sync height to aspect ratio
  let svgHeightMM = svgWidthMM / vbAspect;

  // Paper and grid
  const usableW = paperWidth - 2 * margin;
  const usableH = paperHeight - 2 * margin;
  const cols = Math.ceil(svgWidthMM / usableW);
  const rows = Math.ceil(svgHeightMM / usableH);
  const totalTiles = cols * rows;

  // PDF setup
  const pdf = new jsPDF({
    orientation: paperWidth > paperHeight ? "l" : "p",
    unit: "mm",
    format: [paperWidth, paperHeight],
  }) as InstanceType<typeof JsPDFType>;

  // ViewBox units per mm
  const [vx, vy, vw, vh] = viewBox;
  const scaleX = vw / svgWidthMM;
  const scaleY = vh / svgHeightMM;

  let processedCount = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r > 0 || c > 0) pdf.addPage([paperWidth, paperHeight]);
      processedCount++;
      if (onProgress) {
        const pct = Math.round((processedCount / totalTiles) * 100);
        onProgress(pct, `Generating Tile ${r + 1}-${c + 1}...`);
      }
      // Tile viewBox
      const startX_MM = c * usableW;
      const startY_MM = r * usableH;
      const tileVx = vx + startX_MM * scaleX;
      const tileVy = vy + startY_MM * scaleY;
      const tileVw = usableW * scaleX;
      const tileVh = usableH * scaleY;
      // Clone and set tile SVG
      const tileSvg = svgElement.cloneNode(true) as SVGElement;
      tileSvg.setAttribute("width", `${usableW}mm`);
      tileSvg.setAttribute("height", `${usableH}mm`);
      tileSvg.setAttribute(
        "viewBox",
        `${tileVx} ${tileVy} ${tileVw} ${tileVh}`
      );
      await svg2pdfFn(tileSvg, pdf, {
        x: margin,
        y: margin,
        width: usableW,
        height: usableH,
      });
      // Draw cut lines (dashed border)
      pdf.setDrawColor(150, 150, 150);
      pdf.setLineWidth(0.2);
      pdf.setLineDashPattern([3, 3], 0);
      pdf.rect(margin, margin, usableW, usableH);
      pdf.setLineDashPattern([], 0);
      pdf.setFontSize(8);
      pdf.setTextColor(150);
      pdf.text(`Tile: ${r + 1}-${c + 1}`, margin + 2, margin + 4);

      // --- SCALE VERIFICATION LINES (Corner Ruler) ---
      // Draw outside the dashed border, in the top-left physical margin
      const verifyLen = 50; // 50mm = 5cm
      // Place at (5mm, 5mm) from the physical page edge
      const startX = 5;
      const startY = 5;

      pdf.setDrawColor(0, 0, 0); // Black
      pdf.setLineWidth(0.2); // Thin precision line

      // Horizontal Line (Top)
      pdf.line(startX, startY, startX + verifyLen, startY);
      // Vertical Ticks for Horizontal Line
      pdf.line(startX, startY - 1.5, startX, startY + 1.5); // 0 mark
      pdf.line(startX + verifyLen, startY - 1.5, startX + verifyLen, startY + 1.5); // 5cm mark

      // Vertical Line (Side)
      const vLineStartY = startY + 5;
      pdf.line(startX, vLineStartY, startX, vLineStartY + verifyLen);
      // Horizontal Ticks for Vertical Line
      pdf.line(startX - 1.5, vLineStartY, startX + 1.5, vLineStartY); // 0 mark
      pdf.line(startX - 1.5, vLineStartY + verifyLen, startX + 1.5, vLineStartY + verifyLen); // 5cm mark

      // Text Labels
      pdf.setFontSize(7);
      pdf.setTextColor(50);
      // Horizontal Label
      pdf.text("5cm", startX + 20, startY - 2);
      // Vertical Label (Rotated 90 degrees)
      pdf.text("5cm", startX - 2, vLineStartY + 35, { angle: 90 });
    }
  }

  // Export PDF
  const pdfBlob = pdf.output('blob');
  return {
    tiles: totalTiles,
    rows,
    cols,
    pdfBlob,
  };
}
