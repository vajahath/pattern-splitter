import './style.css'
import { initPWA } from './pwa.ts'
import { generateTiledPDF } from './pattern-splitter.ts'


initPWA(document.body)

// --- State ---
let currentSvgText: string | null = null;
let currentSvgElement: SVGElement | null = null;
let svgWidthMM = 0;
let svgHeightMM = 0;
let previewScale = 0.2;
let originalDisplayW = 0;
let originalDisplayH = 0;

const PX_TO_MM = 25.4 / 96;

// --- DOM Elements ---
const els = {
	input: document.getElementById('fileInput') as HTMLInputElement,
	container: document.getElementById('svgContainer')!,
	hiddenContainer: document.getElementById('hiddenContainer')!,
	grid: document.getElementById('gridOverlay')!,
	wrapper: document.getElementById('previewWrapper')!,
	stats: document.getElementById('layoutStats')!,
	paperW: document.getElementById('paperW') as HTMLInputElement,
	paperH: document.getElementById('paperH') as HTMLInputElement,
	margin: document.getElementById('margin') as HTMLInputElement,
	btnExport: document.getElementById('btnExport') as HTMLButtonElement,
	progress: document.getElementById('loadingBar')!,
	bar: document.getElementById('progressBar')!,
	pText: document.getElementById('progressText')!,
	pInfo: document.getElementById('previewInfo')!,
	fileInfo: document.getElementById('fileInfo')!,
	fileName: document.getElementById('fileName')!,
	clearFileBtn: document.getElementById('clearFileBtn') as HTMLButtonElement,
	presetA4: document.getElementById('presetA4') as HTMLButtonElement,
	presetLetter: document.getElementById('presetLetter') as HTMLButtonElement,
	presetA0: document.getElementById('presetA0') as HTMLButtonElement,
	zoomIn: document.getElementById('zoomIn') as HTMLButtonElement,
	zoomOut: document.getElementById('zoomOut') as HTMLButtonElement,
};

// --- Event Listeners ---
els.input.addEventListener('change', handleFileUpload);
[els.paperW, els.paperH, els.margin].forEach(el => {
	el.addEventListener('input', updateGridPreview);
});
els.clearFileBtn.addEventListener('click', clearFile);
els.presetA4.addEventListener('click', () => setPreset('a4'));
els.presetLetter.addEventListener('click', () => setPreset('letter'));
els.presetA0.addEventListener('click', () => setPreset('a0'));
els.zoomIn.addEventListener('click', () => zoomPreview(0.1));
els.zoomOut.addEventListener('click', () => zoomPreview(-0.1));
els.btnExport.addEventListener('click', generatePDF);

// --- Core Logic ---
function setPreset(type: 'a4' | 'letter' | 'a0') {
	if (type === 'a4') { els.paperW.value = '210'; els.paperH.value = '297'; }
	if (type === 'letter') { els.paperW.value = '215.9'; els.paperH.value = '279.4'; }
	if (type === 'a0') { els.paperW.value = '841'; els.paperH.value = '1189'; }
	updateGridPreview();
}

function zoomPreview(delta: number) {
	if (!currentSvgElement) return;
	const newScale = Math.max(0.05, previewScale + delta);
	previewScale = newScale;
	updatePreviewDimensions();
}

function updatePreviewDimensions() {
	if (!originalDisplayW) return;
	const scaledW = originalDisplayW * previewScale;
	const scaledH = originalDisplayH * previewScale;
	els.wrapper.style.width = `${scaledW}px`;
	els.wrapper.style.height = `${scaledH}px`;
	els.pInfo.textContent = `${Math.round(previewScale * 100)}%`;
}

function clearFile() {
	currentSvgText = null;
	currentSvgElement = null;
	els.input.value = '';
	els.container.innerHTML = '';
	els.grid.innerHTML = '';
	els.wrapper.style.width = '0px';
	els.wrapper.style.height = '0px';
	els.stats.textContent = "Load an SVG to see stats.";
	els.stats.className = "mt-1";
	els.fileInfo.classList.add('hidden');
	els.btnExport.disabled = true;
	previewScale = 0.2;
	els.pInfo.textContent = "100%";
}

async function handleFileUpload(e: Event) {
	const file = (e.target as HTMLInputElement).files?.[0];
	if (!file) return;
	els.fileName.textContent = file.name;
	els.fileInfo.classList.remove('hidden');
	const text = await file.text();
	currentSvgText = text;
	const parser = new DOMParser();
	const doc = parser.parseFromString(text, "image/svg+xml");
	const svgElement = doc.documentElement as unknown as SVGElement;
	svgElement.querySelectorAll('script').forEach(s => s.remove());
	// 1. Determine Dimensions (Physical Size) from attributes
	const size = getSvgDimensionsInMM(svgElement);
	svgWidthMM = size.w;
	// 2. Normalize ViewBox
	if (!svgElement.hasAttribute('viewBox')) {
		svgElement.setAttribute('viewBox', `0 0 ${size.w / PX_TO_MM} ${size.h / PX_TO_MM}`);
	}
	const viewBox = svgElement.getAttribute('viewBox')!.split(/\s|,/).filter(Boolean).map(parseFloat);
	const vbW = viewBox[2];
	const vbH = viewBox[3];
	const vbAspect = vbW / vbH;
	// 3. Sync height to aspect ratio
	svgHeightMM = svgWidthMM / vbAspect;
	// 4. Set display attributes
	svgElement.setAttribute('width', '100%');
	svgElement.setAttribute('height', '100%');
	svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
	currentSvgElement = svgElement;
	// Render Preview
	els.container.innerHTML = '';
	els.container.appendChild(svgElement.cloneNode(true));
	// 5. Calculate Wrapper Dimensions strictly based on ViewBox Ratio
	originalDisplayW = svgWidthMM / PX_TO_MM;
	originalDisplayH = originalDisplayW / vbAspect;
	// Initial Auto-Fit
	const containerH = (document.getElementById('previewContainer') as HTMLElement).offsetHeight;
	const containerW = (document.getElementById('previewContainer') as HTMLElement).offsetWidth;
	const scaleH = (containerH - 80) / originalDisplayH;
	const scaleW = (containerW - 80) / originalDisplayW;
	previewScale = Math.min(scaleH, scaleW, 1);
	if (previewScale < 0.1) previewScale = 0.1;
	updatePreviewDimensions();
	els.btnExport.disabled = false;
	updateGridPreview();
}

function getSvgDimensionsInMM(svg: SVGElement): { w: number; h: number } {
	let w = svg.getAttribute('width');
	let h = svg.getAttribute('height');
	const viewBox = svg.getAttribute('viewBox');
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

function updateGridPreview() {
	if (!currentSvgElement) return;
	const pW = parseFloat(els.paperW.value);
	const pH = parseFloat(els.paperH.value);
	const m = parseFloat(els.margin.value);
	if (pW <= 0 || pH <= 0) return;
	const usableW = pW - (2 * m);
	const usableH = pH - (2 * m);
	if (usableW <= 0 || usableH <= 0) {
		els.stats.textContent = "Error: Margins larger than paper!";
		els.stats.className = "mt-1 text-red-600 font-bold";
		return;
	}
	const cols = Math.ceil(svgWidthMM / usableW);
	const rows = Math.ceil(svgHeightMM / usableH);
	els.stats.textContent = `Real Size: ${Math.round(svgWidthMM)}mm x ${Math.round(svgHeightMM)}mm. Creates ${cols * rows} tiles (${rows} rows x ${cols} cols).`;
	els.stats.className = "mt-1 text-slate-700";
	// --- REDRAW GRID ---
	els.grid.innerHTML = '';
	const tilePctW = (usableW / svgWidthMM) * 100;
	const tilePctH = (usableH / svgHeightMM) * 100;
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const box = document.createElement('div');
			box.className = 'grid-box';
			box.style.left = `${c * tilePctW}%`;
			box.style.top = `${r * tilePctH}%`;
			box.style.width = `${tilePctW}%`;
			box.style.height = `${tilePctH}%`;
			const label = document.createElement('span');
			label.className = 'tile-label';
			label.textContent = `${r + 1}-${c + 1}`;
			box.appendChild(label);
			els.grid.appendChild(box);
		}
	}
}

async function generatePDF() {
	if (!currentSvgText) return;
	els.progress.classList.remove('invisible');
	els.btnExport.disabled = true;
	els.pText.textContent = "Loading PDF libraries...";
	try {
		const pW = parseFloat(els.paperW.value);
		const pH = parseFloat(els.paperH.value);
		const m = parseFloat(els.margin.value);
		const options = {
			svgText: currentSvgText,
			paperWidth: pW,
			paperHeight: pH,
			margin: m,
			onProgress: (pct: number, msg: string) => {
				els.bar.style.width = `${pct}%`;
				els.pText.textContent = msg;
			}
		};
		const result = await generateTiledPDF(options);
		els.progress.classList.add('invisible');
		els.btnExport.disabled = false;
		// Download PDF
		const fileName = els.fileName.textContent?.replace('.svg', '') || 'pattern';
		const url = URL.createObjectURL(result.pdfBlob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${fileName}_tiled.pdf`;
		document.body.appendChild(a);
		a.click();
		setTimeout(() => {
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		}, 1000);
	} catch (err: any) {
		console.error(err);
		alert("Error: " + err.message);
		els.progress.classList.add('invisible');
		els.btnExport.disabled = false;
	}
}
