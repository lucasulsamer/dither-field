// Bayer matrix for ordered dithering
const BAYER_MATRIX_4x4 = [
	[0, 8, 2, 10],
	[12, 4, 14, 6],
	[3, 11, 1, 9],
	[15, 7, 13, 5]
];

// Normalize Bayer matrix values
const BAYER_SIZE = 4;
const BAYER_NORMALIZED = BAYER_MATRIX_4x4.map(row => 
	row.map(val => (val + 0.5) / (BAYER_SIZE * BAYER_SIZE))
);

// Color mapping modes
type ColorMode = 'grayscale' | 'blue' | 'red' | 'green' | 'yellow' | 'magenta' | 'cyan' | 'custom';
type BaseColorMode = 'grayscale' | 'blue' | 'red' | 'green' | 'yellow' | 'magenta' | 'cyan';

interface CustomColors {
	white: string;
	grey: string;
	black: string;
}

function hexToRGB(hex: string): [number, number, number] {
	hex = hex.replace('#', '');
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);
	
	return [r, g, b];
}

function getColorRGB(mode: BaseColorMode, brightness: number): [number, number, number] {
	switch (mode) {
		case 'blue':
			return [0, 0, brightness];
		case 'red':
			return [brightness, 0, 0];
		case 'green':
			return [0, brightness, 0];
		case 'yellow':
			return [brightness, brightness, 0];
		case 'magenta':
			return [brightness, 0, brightness];
		case 'cyan':
			return [0, brightness, brightness];
		case 'grayscale':
		default:
			return [brightness, brightness, brightness];
	}
}

function applyColorMode(imageData: ImageData, mode: ColorMode, customColors?: CustomColors): ImageData {
	const { width, height, data } = imageData;
	const output = new ImageData(width, height);

	for (let i = 0; i < data.length; i += 4) {
		const brightness = data[i];
		
		let r, g, b;
		
		if (mode === 'custom' && customColors) {
			if (brightness === 255) {
				[r, g, b] = hexToRGB(customColors.white);
			} else if (brightness === 0) {
				[r, g, b] = hexToRGB(customColors.black);
			} else {
				const [baseR, baseG, baseB] = hexToRGB(customColors.grey);
				const factor = brightness / 255;
				r = Math.round(baseR * factor);
				g = Math.round(baseG * factor);
				b = Math.round(baseB * factor);
			}
		} else {
			switch (mode) {
				case 'blue':
					r = 0;
					g = 0;
					b = brightness;
					break;
				case 'red':
					r = brightness;
					g = 0;
					b = 0;
					break;
				case 'green':
					r = 0;
					g = brightness;
					b = 0;
					break;
				case 'yellow':
					r = brightness;
					g = brightness;
					b = 0;
					break;
				case 'magenta':
					r = brightness;
					g = 0;
					b = brightness;
					break;
				case 'cyan':
					r = 0;
					g = brightness;
					b = brightness;
					break;
				case 'grayscale':
				default:
					r = brightness;
					g = brightness;
					b = brightness;
					break;
			}
		}
		
		output.data[i] = r;
		output.data[i + 1] = g;
		output.data[i + 2] = b;
		output.data[i + 3] = 255;
	}
	
	return output;
}

function pixelate(
	imageData: ImageData,
	pixelSize: number
): ImageData {
	const { width, height, data } = imageData;
	const output = new ImageData(width, height);

	for (let by = 0; by < height; by += pixelSize) {
		for (let bx = 0; bx < width; bx += pixelSize) {
			let sum = 0;
			let count = 0;

			for (let dy = 0; dy < pixelSize && by + dy < height; dy++) {
				for (let dx = 0; dx < pixelSize && bx + dx < width; dx++) {
					const x = bx + dx;
					const y = by + dy;
					const idx = (y * width + x) * 4;

					const gray =
						0.299 * data[idx] +
						0.587 * data[idx + 1] +
						0.114 * data[idx + 2];

					sum += gray;
					count++;
				}
			}

			const avgBrightness = Math.round(sum / count);

			for (let dy = 0; dy < pixelSize && by + dy < height; dy++) {
				for (let dx = 0; dx < pixelSize && bx + dx < width; dx++) {
					const x = bx + dx;
					const y = by + dy;
					const idx = (y * width + x) * 4;

					output.data[idx] = avgBrightness;
					output.data[idx + 1] = avgBrightness;
					output.data[idx + 2] = avgBrightness;
					output.data[idx + 3] = 255;
				}
			}
		}
	}

	return output;
}

self.onmessage = (e) => {
	if (e.data.type === 'process') {
		try {
			const { width, height, data, params } = e.data;
			
			// Reconstruct ImageData from raw data
			let imageData = new ImageData(new Uint8ClampedArray(data), width, height);
			let processed: ImageData;

			if (params.pixelSize > 1) {
				imageData = pixelate(imageData, params.pixelSize);
			}

			// Apply dithering to convert to black/white
			switch (params.mode) {
				case 'dither-bayer':
					processed = ditherBayer(imageData, params.threshold);
					break;
				default:
					processed = imageData;
			}

			// Apply color mode (maps black/white to selected colors)
			const customColors = params.colorMode === 'custom' && params.customWhite && params.customGrey && params.customBlack
				? { white: params.customWhite, grey: params.customGrey, black: params.customBlack }
				: undefined;
			processed = applyColorMode(processed, params.colorMode, customColors);

			self.postMessage({ type: 'processed', imageData: processed });
		} catch (error) {
			console.error('Error in worker:', error);
			self.postMessage({ type: 'error', error: String(error) });
		}
	}
};

function ditherBayer(imageData: ImageData, threshold: number): ImageData {
	const { width, height, data } = imageData;
	const output = new ImageData(width, height);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const idx = (y * width + x) * 4;
			
			// Convert to grayscale
			const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
			
			// Get Bayer threshold
			const bayerX = x % BAYER_SIZE;
			const bayerY = y % BAYER_SIZE;
			const bayerValue = BAYER_NORMALIZED[bayerY][bayerX];
			
			// Apply dithering
			const adjustedThreshold = threshold + (bayerValue - 0.5) * 100;
			const value = gray > adjustedThreshold ? 255 : 0;
			
			output.data[idx] = value;
			output.data[idx + 1] = value;
			output.data[idx + 2] = value;
			output.data[idx + 3] = 255;
		}
	}

	return output;
}

export {};
