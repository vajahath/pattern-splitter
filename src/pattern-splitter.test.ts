import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseUnit, getSvgDimensionsInMM, generateTiledPDF, getTileBorderInstructions } from './pattern-splitter';
import type { PatternSplitterOptions } from './pattern-splitter';

// Hoist mocks to ensure they are available before imports/mocks
const mocks = vi.hoisted(() => {
    return {
        addPage: vi.fn(),
        output: vi.fn().mockReturnValue(new Blob(['pdf-content'], { type: 'application/pdf' })),
        setDrawColor: vi.fn(),
        setLineWidth: vi.fn(),
        setLineDashPattern: vi.fn(),
        rect: vi.fn(),
        setFontSize: vi.fn(),
        setTextColor: vi.fn(),
        text: vi.fn(),
        line: vi.fn(),
        circle: vi.fn(),
        triangle: vi.fn(),
        getTextWidth: vi.fn().mockReturnValue(10), // Mock width
        saveGraphicsState: vi.fn(),
        restoreGraphicsState: vi.fn(),
        setFillColor: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        close: vi.fn(),
        fillStroke: vi.fn(),
        svg2pdf: vi.fn().mockResolvedValue(undefined),
    };
});

// Mock jspdf
vi.mock('jspdf', () => {
    return {
        jsPDF: vi.fn(function () {
            return {
                addPage: mocks.addPage,
                output: mocks.output,
                setDrawColor: mocks.setDrawColor,
                setLineWidth: mocks.setLineWidth,
                setLineDashPattern: mocks.setLineDashPattern,
                rect: mocks.rect,
                setFontSize: mocks.setFontSize,
                setTextColor: mocks.setTextColor,
                text: mocks.text,
                line: mocks.line,
                circle: mocks.circle,
                triangle: mocks.triangle,
                getTextWidth: mocks.getTextWidth,
                saveGraphicsState: mocks.saveGraphicsState,
                restoreGraphicsState: mocks.restoreGraphicsState,
                setFillColor: mocks.setFillColor,
                moveTo: mocks.moveTo,
                lineTo: mocks.lineTo,
                close: mocks.close,
                fillStroke: mocks.fillStroke,
            };
        }),
    };
});

// Mock svg2pdf.js
vi.mock('svg2pdf.js', () => {
    return {
        default: mocks.svg2pdf,
        svg2pdf: mocks.svg2pdf,
    };
});

describe('Pattern Splitter', () => {

    describe('parseUnit', () => {
        it('should return null for null input', () => {
            expect(parseUnit(null)).toBeNull();
        });

        it('should parse mm correctly', () => {
            expect(parseUnit('100mm')).toBeCloseTo(100);
        });

        it('should parse cm correctly', () => {
            expect(parseUnit('10cm')).toBeCloseTo(100);
        });

        it('should parse in correctly', () => {
            expect(parseUnit('1in')).toBeCloseTo(25.4);
        });

        it('should parse px (default) correctly', () => {
            expect(parseUnit('96')).toBeCloseTo(25.4);
        });
    });

    describe('getSvgDimensionsInMM', () => {
        it('should get dimensions from width/height attributes in mm', () => {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute('width', '210mm');
            svg.setAttribute('height', '297mm');
            const dims = getSvgDimensionsInMM(svg);
            expect(dims.w).toBeCloseTo(210);
            expect(dims.h).toBeCloseTo(297);
        });

        it('should fallback to viewBox if width/height are missing', () => {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            // 96px = 25.4mm
            svg.setAttribute('viewBox', '0 0 96 96');
            const dims = getSvgDimensionsInMM(svg);
            expect(dims.w).toBeCloseTo(25.4);
            expect(dims.h).toBeCloseTo(25.4);
        });

        it('should default to A4 if nothing is present', () => {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            const dims = getSvgDimensionsInMM(svg);
            expect(dims.w).toBe(210);
            expect(dims.h).toBe(297);
        });
    });

    describe('getTileBorderInstructions', () => {
        it('should return all none for 1x1 grid', () => {
            const instr = getTileBorderInstructions(0, 0, 1, 1);
            expect(instr).toEqual({ top: 'none', right: 'none', bottom: 'none', left: 'none' });
        });

        it('should handle 2x2 grid correctly', () => {
            // Tile 1-1 (0,0): Top-Left
            expect(getTileBorderInstructions(0, 0, 2, 2)).toEqual({
                top: 'none', right: 'glue', bottom: 'glue', left: 'none'
            });
            // Tile 1-2 (0,1): Top-Right
            expect(getTileBorderInstructions(0, 1, 2, 2)).toEqual({
                top: 'none', right: 'none', bottom: 'glue', left: 'cut'
            });
            // Tile 2-1 (1,0): Bottom-Left
            expect(getTileBorderInstructions(1, 0, 2, 2)).toEqual({
                top: 'cut', right: 'glue', bottom: 'none', left: 'none'
            });
            // Tile 2-2 (1,1): Bottom-Right
            expect(getTileBorderInstructions(1, 1, 2, 2)).toEqual({
                top: 'cut', right: 'none', bottom: 'none', left: 'cut'
            });
        });

        it('should handle 3x3 middle tile correctly', () => {
            // Middle tile (1,1) in 3x3
            expect(getTileBorderInstructions(1, 1, 3, 3)).toEqual({
                top: 'cut', right: 'glue', bottom: 'glue', left: 'cut'
            });
        });

        it('should handle 1xN strip (horizontal)', () => {
            // 1 row, 3 cols
            // First
            expect(getTileBorderInstructions(0, 0, 1, 3)).toEqual({
                top: 'none', right: 'glue', bottom: 'none', left: 'none'
            });
            // Middle
            expect(getTileBorderInstructions(0, 1, 1, 3)).toEqual({
                top: 'none', right: 'glue', bottom: 'none', left: 'cut'
            });
            // Last
            expect(getTileBorderInstructions(0, 2, 1, 3)).toEqual({
                top: 'none', right: 'none', bottom: 'none', left: 'cut'
            });
        });

        it('should handle Nx1 strip (vertical)', () => {
            // 3 rows, 1 col
            // First
            expect(getTileBorderInstructions(0, 0, 3, 1)).toEqual({
                top: 'none', right: 'none', bottom: 'glue', left: 'none'
            });
            // Middle
            expect(getTileBorderInstructions(1, 0, 3, 1)).toEqual({
                top: 'cut', right: 'none', bottom: 'glue', left: 'none'
            });
            // Last
            expect(getTileBorderInstructions(2, 0, 3, 1)).toEqual({
                top: 'cut', right: 'none', bottom: 'none', left: 'none'
            });
        });
    });

    describe('generateTiledPDF', () => {
        beforeEach(() => {
            vi.clearAllMocks();
            // Reset output return value just in case
            mocks.output.mockReturnValue(new Blob(['pdf-content'], { type: 'application/pdf' }));
        });

        it('should generate a PDF from a simple SVG', async () => {
            const svgText = '<svg width="100mm" height="100mm" viewBox="0 0 100 100"></svg>';
            const options: PatternSplitterOptions = {
                svgText,
                paperWidth: 210,
                paperHeight: 297,
                margin: 10,
            };

            const result = await generateTiledPDF(options);

            expect(result.pdfBlob).toBeDefined();
            expect(result.tiles).toBe(1);

            // Verification of PDF calls
            expect(mocks.output).toHaveBeenCalledWith('blob');
            expect(mocks.svg2pdf).toHaveBeenCalled();
        });

        it('should calculate multiple tiles correctly', async () => {
            // large SVG: 400mm x 400mm
            // Paper A4: 210mm x 297mm.
            // Margins 10mm -> Usable 190mm x 277mm.
            // Cols: ceil(400 / 190) = ceil(2.1) = 3
            // Rows: ceil(400 / 277) = ceil(1.44) = 2
            // Total tiles: 6

            const svgText = '<svg width="400mm" height="400mm" viewBox="0 0 400 400"></svg>';
            const options: PatternSplitterOptions = {
                svgText,
                paperWidth: 210,
                paperHeight: 297,
                margin: 10,
            };

            const result = await generateTiledPDF(options);

            expect(result.cols).toBe(3);
            expect(result.rows).toBe(2);
            expect(result.tiles).toBe(6);

            // Page additions: expected 5 new pages for 6 tiles (1st tile on init page)
            expect(mocks.addPage).toHaveBeenCalledTimes(5);
        });

        it('should accept onProgress callback', async () => {
            const svgText = '<svg width="100mm" height="100mm" viewBox="0 0 100 100"></svg>';
            const onProgress = vi.fn();
            const options: PatternSplitterOptions = {
                svgText,
                paperWidth: 210,
                paperHeight: 297,
                margin: 10,
                onProgress,
            };

            await generateTiledPDF(options);
            expect(onProgress).toHaveBeenCalled();
        });
        it('should add cut/glue annotations to PDF', async () => {
            // 2x2 grid
            const svgText = '<svg width="400mm" height="400mm" viewBox="0 0 400 400"></svg>';
            const options: PatternSplitterOptions = {
                svgText,
                paperWidth: 210,
                paperHeight: 297,
                margin: 10,
            };

            await generateTiledPDF(options);

            // We expect some calls to text with [glue] and [cut out]
            // Tile 1-1 (Right: Glue, Bottom: Glue)
            // Tile 1-2 (Left: Cut, Bottom: Glue)
            // Tile 2-1 (Right: Glue, Top: Cut)
            // Tile 2-2 (Left: Cut, Top: Cut)

            const textCalls = mocks.text.mock.calls.map(c => c[0]); // First arg is text

            expect(textCalls).toContain('[ GLUE ]');
            expect(textCalls).toContain('[ CUT  OUT ]');

            // Should be present multiple times. 
            // 2x2 grid:
            // Right glue: Tile 1-1, Tile 2-1 (2 times)
            // Bottom glue: Tile 1-1, Tile 1-2 (2 times)
            // Top cut: Tile 2-1, Tile 2-2 (2 times)
            // Left cut: Tile 1-2, Tile 2-2 (2 times)

            const glueCount = textCalls.filter(t => t === '[ GLUE ]').length;
            const cutCount = textCalls.filter(t => t === '[ CUT  OUT ]').length;

            expect(glueCount).toBeGreaterThanOrEqual(4);
            expect(cutCount).toBeGreaterThanOrEqual(4);
        });
        it('should throw error if margin is less than 10mm', async () => {
            const svgText = '<svg width="100mm" height="100mm" viewBox="0 0 100 100"></svg>';
            const options: PatternSplitterOptions = {
                svgText,
                paperWidth: 210,
                paperHeight: 297,
                margin: 9, // Too small
            };

            await expect(generateTiledPDF(options)).rejects.toThrow('Margin must be at least 10mm');
        });
    });
});
