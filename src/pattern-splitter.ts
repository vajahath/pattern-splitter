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

export const PX_TO_MM = 25.4 / 96;

export type BorderInstruction = 'glue' | 'cut' | 'none';

export type TileBorderInstructions = {
  top: BorderInstruction;
  right: BorderInstruction;
  bottom: BorderInstruction;
  left: BorderInstruction;
};

/**
 * Determines cut/glue instructions for a tile based on its position in the grid.
 * 
 * Strategy:
 * - We overlap to the right and down.
 * - This means for any tile:
 *   - LEFT border: If col > 0, we CUT (to overlap the previous tile).
 *   - TOP border: If row > 0, we CUT (to overlap the previous tile).
 *   - RIGHT border: If col < last, we GLUE (so the next tile can overlap us).
 *   - BOTTOM border: If row < last, we GLUE (so the next tile can overlap us).
 * 
 * Exceptions:
 * - Edges of the entire mosaic have 'none' (except manual trimming, but no overlap logic).
 */
export function getTileBorderInstructions(
  row: number,
  col: number,
  totalRows: number,
  totalCols: number
): TileBorderInstructions {
  // 0-based indices
  const isFirstRow = row === 0;
  const isLastRow = row === totalRows - 1;
  const isFirstCol = col === 0;
  const isLastCol = col === totalCols - 1;

  return {
    // If not first row, we cut top to overlap the one above.
    top: isFirstRow ? 'none' : 'cut',

    // If not last col, we leave glue area for the one to the right.
    right: isLastCol ? 'none' : 'glue',

    // If not last row, we leave glue area for the one below.
    bottom: isLastRow ? 'none' : 'glue',

    // If not first col, we cut left to overlap the one to the left.
    left: isFirstCol ? 'none' : 'cut',
  };
}

export function parseUnit(val: string | null): number | null {
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

export function getSvgDimensionsInMM(svg: SVGElement): { w: number; h: number } {
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

  if (margin < 10) {
    throw new Error('Margin must be at least 10mm for proper labeling.');
  }

  console.log('Generating PDF...', options);
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
      pdf.text(`Top | Tile: ${r + 1}-${c + 1}`, margin + 2, margin + 4);

      // --- CORNER ALIGNMENT MARKS (Elongated Plus Icons) ---
      // Centers are at the 4 corners of the content box.
      // Elongated towards the paper edge (outside the box).
      const cInner = 2; // Length inside the content box
      const cOuter = 5; // Length outside the content box

      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.2); // Thin precision lines
      pdf.setLineDashPattern([], 0); // Solid lines

      // Helper to draw alignment cross
      // isLeft: true if on left edge (elongate left), false if right (elongate right)
      // isTop: true if on top edge (elongate up), false if bottom (elongate down)
      const drawCornerMark = (cx: number, cy: number, isLeft: boolean, isTop: boolean) => {
        // Horizontal Line
        const xStart = isLeft ? cx - cOuter : cx - cInner;
        const xEnd = isLeft ? cx + cInner : cx + cOuter;
        pdf.line(xStart, cy, xEnd, cy);

        // Vertical Line
        const yStart = isTop ? cy - cOuter : cy - cInner;
        const yEnd = isTop ? cy + cInner : cy + cOuter;
        pdf.line(cx, yStart, cx, yEnd);
      };

      // Top-Left - not needed as the scale verification lines cover this area
      // Top-Right
      drawCornerMark(margin + usableW, margin, false, true);
      // Bottom-Right
      drawCornerMark(margin + usableW, margin + usableH, false, false);
      // Bottom-Left
      drawCornerMark(margin, margin + usableH, true, false);

      // --- SCALE VERIFICATION LINES (Corner Ruler) ---
      // Draw outside the dashed border, in the top-left physical margin
      // Relative to the content box (margin) so it moves inwards if margin is increased.
      const verifyLen = 50; // 50mm = 5cm
      const rulerOffset = 2; // Distance from the dashed border line

      const startX = margin;
      const startY = margin - rulerOffset;

      pdf.setDrawColor(0, 0, 0); // Black
      pdf.setLineWidth(0.2); // Thin precision line

      // Horizontal Line (Top)
      pdf.line(startX, startY, startX + verifyLen, startY);
      // Vertical Ticks for Horizontal Line
      pdf.line(startX, startY - 1.5, startX, startY + 1.5); // 0 mark
      pdf.line(startX + verifyLen, startY - 1.5, startX + verifyLen, startY + 1.5); // 5cm mark

      // Vertical Line (Side)
      const vLineStartY = startY + rulerOffset;
      const vLineStartX = startX - rulerOffset;
      pdf.line(vLineStartX, vLineStartY, vLineStartX, vLineStartY + verifyLen);
      // Horizontal Ticks for Vertical Line
      pdf.line(vLineStartX - 1.5, vLineStartY, vLineStartX + 1.5, vLineStartY); // 0 mark
      pdf.line(vLineStartX - 1.5, vLineStartY + verifyLen, vLineStartX + 1.5, vLineStartY + verifyLen); // 5cm mark

      // Text Labels
      pdf.setFontSize(6);
      pdf.setTextColor(50);
      // Horizontal Label
      pdf.text("5cm", startX + verifyLen + 1, startY + .5);
      // Vertical Label (Rotated 90 degrees)
      pdf.text("5cm", vLineStartX + .5, vLineStartY + verifyLen + 5, { angle: 90 });

      // --- DIAMOND ALIGNMENT MARKS ---
      // Helper function to draw diamond marks
      const markRadius = 2.5; // 5mm width/height total
      const drawDiamond = (centerX: number, centerY: number) => {
        pdf.saveGraphicsState();
        pdf.setDrawColor(0, 0, 0); // Black Stroke
        pdf.setFillColor(50, 50, 50); // Dark Grey Fill for high visibility

        // Construct Path manually (Top, Right, Bottom, Left)
        pdf.moveTo(centerX, centerY - markRadius);
        pdf.lineTo(centerX + markRadius, centerY);
        pdf.lineTo(centerX, centerY + markRadius);
        pdf.lineTo(centerX - markRadius, centerY);
        pdf.close();

        pdf.fillStroke(); // Fill it and stroke it

        // Draw Crosshair (White, High Contrast)
        pdf.setDrawColor(255, 255, 255);
        pdf.setLineWidth(0.3);

        // Horizontal Line
        pdf.line(centerX - markRadius, centerY, centerX + markRadius, centerY);
        // Vertical Line
        pdf.line(centerX, centerY - markRadius, centerX, centerY + markRadius);

        pdf.restoreGraphicsState();
      };

      const midH = margin + usableH / 2;
      const midW = margin + usableW / 2;

      // Right Mark
      if (c < cols - 1) {
        drawDiamond(margin + usableW, midH);
      }
      // Left Mark
      if (c > 0) {
        drawDiamond(margin, midH);
      }
      // Bottom Mark
      if (r < rows - 1) {
        drawDiamond(midW, margin + usableH);
      }
      // Top Mark
      if (r > 0) {
        drawDiamond(midW, margin);
      }

      // --- BORDER ANNOTATIONS (Cut / Glue) ---
      const borderInstr = getTileBorderInstructions(r, c, rows, cols);
      pdf.setFontSize(7);
      pdf.setTextColor(100, 100, 100); // Grey

      // Helper to draw centered text with icon in margin
      const drawLabelWithIcon = (type: BorderInstruction, x: number, y: number, angle: number = 0, iconOffsetX: number = 0, iconOffsetY: number = 0) => {
        const text = labelMap[type];
        if (!text || type === 'none') return;

        // Draw text using jsPDF's built-in rotation support
        pdf.text(text, x, y, { align: "center", angle });

        // Draw Icon - Use manual trigonometry for rotation
        const w = pdf.getTextWidth(text);
        const iconGap = 3;
        // Local position of icon center relative to text anchor
        const localX = w / 2 + iconGap + iconOffsetX;  // Apply icon offset
        const localY = -1 + iconOffsetY;  // Apply icon offset

        // Convert angle to radians
        const rad = (angle * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // Transform local icon center to absolute coordinates
        const iconCenterX = x + (localX * cos - localY * sin);
        const iconCenterY = y + (localX * sin + localY * cos);

        // Helper to transform icon-relative coordinates to absolute
        const toAbs = (ix: number, iy: number) => ({
          x: iconCenterX + (ix * cos - iy * sin),
          y: iconCenterY + (ix * sin + iy * cos)
        });

        pdf.setLineWidth(0.2);

        if (type === 'cut') {
          // Scissors ✂️
          const r = 0.6;
          // Top handle
          const h1 = toAbs(-1.5, -0.8);
          pdf.circle(h1.x, h1.y, r, 'S');
          // Bottom handle
          const h2 = toAbs(-1.5, 0.8);
          pdf.circle(h2.x, h2.y, r, 'S');
          // Blade 1
          const b1a = toAbs(-1.0, -0.8);
          const b1b = toAbs(2.0, 0.8);
          pdf.line(b1a.x, b1a.y, b1b.x, b1b.y);
          // Blade 2
          const b2a = toAbs(-1.0, 0.8);
          const b2b = toAbs(2.0, -0.8);
          pdf.line(b2a.x, b2a.y, b2b.x, b2b.y);
        } else if (type === 'glue') {
          // Glue Drop 💧
          pdf.setFillColor(150, 150, 150);
          // Circle part
          const c = toAbs(0, 0.5);
          pdf.circle(c.x, c.y, 1.2, 'F');
          // Triangle part
          const t1 = toAbs(0, -2);
          const t2 = toAbs(-1.1, 0.6);
          const t3 = toAbs(1.1, 0.6);
          pdf.triangle(t1.x, t1.y, t2.x, t2.y, t3.x, t3.y, 'F');
        }
      };

      const labelMap: Record<BorderInstruction, string> = {
        glue: "[ GLUE ]",
        cut: "[ CUT  OUT ]",
        none: ""
      };

      // Robust Geometry with Manual Micro-Adjustments:
      // Place labels perpendicularly adjacent to the diamond except left/right which are manually tweaked.
      // Diamond Radius = 2.5mm
      // Base Gap = 1.0mm (approx)
      const dist = 3.5;

      // MANUAL ADJUSTMENT VARIABLES - Adjust these to fine-tune left/right label positions
      // Left Side (90° rotation)
      const leftLabelOffsetX = 10;  // Horizontal offset for left label position
      const leftLabelOffsetY = 25;    // Vertical offset for left label position
      const leftIconOffsetX = -28;     // Horizontal offset for left icon (relative to text)
      const leftIconOffsetY = 9;     // Vertical offset for left icon (relative to text)

      // Right Side (270° rotation)
      const rightLabelOffsetX = 2.5; // Horizontal offset for right label position
      const rightLabelOffsetY = -20;     // Vertical offset for right label position
      const rightIconOffsetX = -20;      // Horizontal offset for right icon (relative to text)
      const rightIconOffsetY = -3;      // Vertical offset for right icon (relative to text)

      // Top Side (0° rotation)
      const topLabelOffsetX = 14;
      const topLabelOffsetY = 2.5;
      const topIconOffsetX = 0;
      const topIconOffsetY = 0;

      // Bottom Side (0° rotation)
      const bottomLabelOffsetX = -17;
      const bottomLabelOffsetY = -2.5;
      const bottomIconOffsetX = 0;
      const bottomIconOffsetY = 0;

      // Top
      if (borderInstr.top !== 'none') {
        // x = midW (Centered on diamond)
        // y = margin - dist (Above diamond)
        drawLabelWithIcon(borderInstr.top, midW + topLabelOffsetX, margin - dist + topLabelOffsetY, 0, topIconOffsetX, topIconOffsetY);
      }

      // Right
      if (borderInstr.right !== 'none') {
        // x = rightBorder + dist (Right of diamond)
        // y = midH (Centered on diamond)
        // Angle 270 (Top of letters points LEFT towards content, Bottom points RIGHT away)
        // Using manual adjustment variables
        drawLabelWithIcon(borderInstr.right, margin + usableW + dist + rightLabelOffsetX, midH + rightLabelOffsetY, 270, rightIconOffsetX, rightIconOffsetY);
      }

      // Bottom
      if (borderInstr.bottom !== 'none') {
        // x = midW (Centered on diamond)
        // y = bottomBorder + dist + textHeightAdjustment
        // Note: PDF text origin is baseline. We need to shift down by font height approx (2mm)
        drawLabelWithIcon(borderInstr.bottom, midW + bottomLabelOffsetX, margin + usableH + dist + 2 + bottomLabelOffsetY, 0, bottomIconOffsetX, bottomIconOffsetY);
      }

      // Left
      if (borderInstr.left !== 'none') {
        // x = leftBorder - dist (Left of diamond)
        // y = midH (Centered on diamond)
        // Angle 90 (Top of letters points LEFT away, Bottom points RIGHT towards content)
        // Using manual adjustment variables
        drawLabelWithIcon(borderInstr.left, margin - dist + leftLabelOffsetX, midH + leftLabelOffsetY, 90, leftIconOffsetX, leftIconOffsetY);
      }
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
