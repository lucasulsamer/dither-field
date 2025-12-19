export type ProcessingMode = 'dither-bayer' | 'dither-floyd' | 'halftone';
export type ColorMode = 'grayscale' | 'blue' | 'red' | 'green' | 'yellow' | 'magenta' | 'cyan' | 'custom';
export type BaseColorMode = 'grayscale' | 'blue' | 'red' | 'green' | 'yellow' | 'magenta' | 'cyan';

export interface ProcessingParams {
	mode: ProcessingMode;
	threshold: number;
	pixelSize: number;
	colorMode: ColorMode;
	customWhite?: string;
	customGrey?: string;
	customBlack?: string;
}
