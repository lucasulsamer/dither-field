<script lang="ts">
	import { onMount } from 'svelte';
	import ColorPicker from 'svelte-awesome-color-picker';
	import type { ProcessingMode, ProcessingParams, ColorMode } from '$lib/types';
	import logo from '$lib/assets/favicon.svg';

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null;
	let worker: Worker | null = null;
	let imageLoaded = false;
	let processing = false;
	let dragover = false;
	
	let originalImageData: ImageData | null = null;
	let processedImageData: ImageData | null = null;
	let showOriginal = false;
	let mode: ProcessingMode = 'dither-bayer';
	let threshold = 128;
	let pixelSize = 1;
	let colorMode: ColorMode = 'grayscale';
	
	let customWhite = '#ffffff';
	let customGrey = '#0000ff';
	let customBlack = '#000000';
	
	let swatches = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff'];
	
	type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
	let panelCorner: Corner = 'bottom-right';
	let isDraggingPanel = false;
	let panelElement: HTMLElement;
	let dragOffsetX = 0;
	let dragOffsetY = 0;
	let dragX = 0;
	let dragY = 0;
	
	let imageScale = 1;
	let imagePanX = 0;
	let imagePanY = 0;
	let isPanningImage = false;
	let panStartX = 0;
	let panStartY = 0;
	let startPanX = 0;
	let startPanY = 0;
	
	function startDragPanel(e: MouseEvent) {
		if (!panelElement) return;
		
		isDraggingPanel = true;
		const rect = panelElement.getBoundingClientRect();
		dragOffsetX = e.clientX - rect.left;
		dragOffsetY = e.clientY - rect.top;
		e.preventDefault();
	}
	
	function dragPanel(e: MouseEvent) {
		if (!isDraggingPanel || !panelElement) return;
		
		dragX = e.clientX - dragOffsetX;
		dragY = e.clientY - dragOffsetY;
	}
	
	function stopDragPanel(e: MouseEvent) {
		if (!isDraggingPanel) return;
		isDraggingPanel = false;
		
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const threshold = viewportWidth / 2;
		const vThreshold = viewportHeight / 2;
		
		const x = e.clientX;
		const y = e.clientY;
		
		if (x < threshold && y < vThreshold) {
			panelCorner = 'top-left';
		} else if (x >= threshold && y < vThreshold) {
			panelCorner = 'top-right';
		} else if (x < threshold && y >= vThreshold) {
			panelCorner = 'bottom-left';
		} else {
			panelCorner = 'bottom-right';
		}
	}
	
	function startPanImage(e: MouseEvent) {
		if (!imageLoaded) return;
		isPanningImage = true;
		panStartX = e.clientX;
		panStartY = e.clientY;
		startPanX = imagePanX;
		startPanY = imagePanY;
		e.preventDefault();
	}
	
	function panImage(e: MouseEvent) {
		if (!isPanningImage) return;
		const deltaX = e.clientX - panStartX;
		const deltaY = e.clientY - panStartY;
		imagePanX = startPanX + deltaX;
		imagePanY = startPanY + deltaY;
	}
	
	function stopPanImage() {
		isPanningImage = false;
	}
	
	function handleWheel(e: WheelEvent) {
		if (!imageLoaded || !canvas) return;
		e.preventDefault();
		
		const delta = -e.deltaY * 0.001;
		const newScale = Math.max(0.1, Math.min(10, imageScale + delta));
		
		const rect = canvas.getBoundingClientRect();
		const canvasCenterX = rect.left + rect.width / 2;
		const canvasCenterY = rect.top + rect.height / 2;
		
		const mouseX = e.clientX - canvasCenterX;
		const mouseY = e.clientY - canvasCenterY;
		
		const imagePointX = (mouseX - imagePanX) / imageScale;
		const imagePointY = (mouseY - imagePanY) / imageScale;
		
		imageScale = newScale;
		
		imagePanX = mouseX - imagePointX * imageScale;
		imagePanY = mouseY - imagePointY * imageScale;
	}

	onMount(() => {
		if (typeof Worker !== 'undefined') {
			worker = new Worker(new URL('$lib/workers/image.worker.ts', import.meta.url), {
				type: 'module'
			});
			
			worker.onmessage = (e) => {
				if (e.data.type === 'processed') {
					const { imageData } = e.data;
					if (canvas && ctx) {
						canvas.width = imageData.width;
						canvas.height = imageData.height;
						processedImageData = imageData;
						if (showOriginal && originalImageData) {
							// Keep showing original if that's what's currently displayed
							ctx.putImageData(originalImageData, 0, 0);
						} else {
							// Show the processed image
							ctx.putImageData(imageData, 0, 0);
						}
					}
					processing = false;
				}
			};
			
			worker.onerror = (error) => {
				console.error('Worker error:', error);
				processing = false;
			};
		}
		
		return () => {
			worker?.terminate();
		};
	});

	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files[0]) {
			loadImage(input.files[0]);
		}
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragover = false;
		
		if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
			loadImage(event.dataTransfer.files[0]);
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		dragover = true;
	}

	function handleDragLeave() {
		dragover = false;
	}
	
	function handleUploadClick() {
		const input = document.getElementById('fileInput') as HTMLInputElement;
		input?.click();
	}

	function loadImage(file: File) {
		if (!file.type.match(/image\/(png|jpeg|jpg)/)) {
			alert('Please upload a PNG or JPG image');
			return;
		}

		const reader = new FileReader();
		reader.onload = (e) => {
			const img = new Image();
			img.onload = () => {
				imageLoaded = true;
				
				setTimeout(() => {
					if (canvas) {
						ctx = canvas.getContext('2d', { willReadFrequently: true });
						if (ctx) {
							canvas.width = img.width;
							canvas.height = img.height;
							ctx.drawImage(img, 0, 0);
							originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
							processImage();
						}
					}
				}, 0);
			};
			img.src = e.target?.result as string;
		};
		reader.readAsDataURL(file);
	}

	function processImage() {
		if (!originalImageData || !worker || processing) return;
		
		processing = true;
		const params: ProcessingParams = {
			mode,
			threshold,
			pixelSize,
			colorMode,
			customWhite,
			customGrey,
			customBlack
		};
		
		worker.postMessage({
			type: 'process',
			width: originalImageData.width,
			height: originalImageData.height,
			data: originalImageData.data,
			params
		});
	}

	function exportImage() {
		if (!imageLoaded) return;
		
		canvas.toBlob((blob) => {
			if (blob) {
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `dither-field-${mode}-${Date.now()}.png`;
				a.click();
				URL.revokeObjectURL(url);
			}
		}, 'image/png');
	}

	function handleModeChange() {
		processImage();
	}

	function handleParamChange() {
		processImage();
	}
	
	function toggleOriginal() {
		if (!originalImageData || !ctx || !canvas) return;
		showOriginal = !showOriginal;
		if (showOriginal) {
			ctx.putImageData(originalImageData, 0, 0);
		} else if (processedImageData) {
			ctx.putImageData(processedImageData, 0, 0);
		}
	}
	
	$: toggleButtonCorner = (panelCorner === 'bottom-left' || panelCorner === 'top-left') ? 'bottom-right' : 'bottom-left';
</script>

<svelte:window 
	on:mousemove={(e) => {
		dragPanel(e);
		panImage(e);
	}} 
	on:mouseup={(e) => {
		stopDragPanel(e);
		stopPanImage();
	}}
/>

<!-- Fixed Header -->
<header class="header">
	<img src={logo} alt="Dither Field" class="logo" />
	<a href="https://github.com/lucasulsamer/dither-field" target="_blank" rel="noopener noreferrer" class="github-link" aria-label="View on GitHub">
		<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
		</svg>
	</a>
</header>

<div class="processor">
	{#if !imageLoaded}
		<div 
			class="upload-area"
			class:dragover
			role="button"
			tabindex="0"
			on:drop={handleDrop}
			on:dragover={handleDragOver}
			on:dragleave={handleDragLeave}
			on:click={handleUploadClick}
			on:keydown={(e) => e.key === 'Enter' && handleUploadClick()}
		>
			<div class="upload-content">
				<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="17 8 12 3 7 8" />
					<line x1="12" y1="3" x2="12" y2="15" />
				</svg>
				<h2>Upload Your Image</h2>
				<p>Drop a PNG or JPG image here, or click anywhere to browse</p>
				<input 
					type="file" 
					accept="image/png,image/jpeg" 
					on:change={handleFileSelect}
					id="fileInput"
				/>
			</div>
		</div>
	{:else}
		<div 
			class="canvas-container"
			on:mousedown={startPanImage}
			on:wheel={handleWheel}
			role="presentation"
		>
			<canvas 
				bind:this={canvas}
				style="transform: translate({imagePanX}px, {imagePanY}px) scale({imageScale}); cursor: {isPanningImage ? 'grabbing' : 'grab'};"
			></canvas>
		</div>

		<div 
			class="control-panel {panelCorner}"
			class:dragging={isDraggingPanel}
			bind:this={panelElement}
			style={isDraggingPanel ? `left: ${dragX}px; top: ${dragY}px;` : ''}
		>
			<div 
				class="panel-handle"
				on:mousedown={startDragPanel}
				role="button"
				tabindex="0"
			>
				<div class="handle-icon">⋮⋮</div>
			</div>
			
			<div class="panel-content">
				<div class="control-group">
					<label for="mode">Processing Mode</label>
					<select id="mode" bind:value={mode} on:change={handleModeChange}>
						<option value="dither-bayer">Dithering (Bayer Matrix)</option>
					</select>
				</div>

				<div class="control-group">
					<label for="colorMode">Color Mode</label>
					<select id="colorMode" bind:value={colorMode} on:change={handleParamChange}>
						<option value="grayscale">Grayscale</option>
						<option value="blue">Blue</option>
						<option value="red">Red</option>
						<option value="green">Green</option>
						<option value="yellow">Yellow</option>
						<option value="magenta">Magenta</option>
						<option value="cyan">Cyan</option>
						<option value="custom">Custom...</option>
					</select>
				</div>

				{#if colorMode === 'custom'}
					<div class="control-group">
						<label for="customWhite">White Color</label>
						<ColorPicker bind:hex={customWhite} {swatches} onInput={handleParamChange} />
					</div>
					
					<div class="control-group">
						<label for="customBlack">Black Color</label>
						<ColorPicker bind:hex={customBlack} {swatches} onInput={handleParamChange} />
					</div>
				{/if}

				{#if mode.startsWith('dither')}
					<div class="control-group">
						<label for="threshold">
							Threshold: {threshold}
						</label>
						<input 
							type="range" 
							id="threshold"
							min="0" 
							max="255" 
							bind:value={threshold}
							on:input={handleParamChange}
						/>
					</div>
					<div class="control-group">
						<label for="pixelSize">
							Pixel Size: {pixelSize}
						</label>
						<input 
							type="range" 
							id="pixelSize"
							min="1" 
							max="10" 
							bind:value={pixelSize}
							on:input={handleParamChange}
						/>
					</div>
				{/if}
				
				<button class="export-btn" on:click={exportImage}>
					Export Image
				</button>
			</div>
		</div>
		
		<button 
			class="toggle-button {toggleButtonCorner}"
			on:click={toggleOriginal}
			title={showOriginal ? 'Show Processed' : 'Show Original'}
		>
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				{#if showOriginal}
					<path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
					<path d="M9 9h6v6H9z"/>
				{:else}
					<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
					<circle cx="12" cy="12" r="3"/>
				{/if}
			</svg>
		</button>
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		overflow: hidden;
	}

	.header {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 60px;
		background: linear-gradient(135deg, #64748b 0%, #475569 100%);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
		display: flex;
		align-items: center;
		padding: 0 2rem;
		z-index: 100;
	}

	.header h1 {
		margin: 0;
		color: white;
		font-size: 1.5rem;
		font-weight: 600;
		letter-spacing: 0.5px;
	}

	.logo {
		height: 40px;
		width: auto;
	}

	.github-link {
		margin-left: auto;
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 8px;
		transition: all 0.2s;
		opacity: 0.9;
	}

	.github-link:hover {
		opacity: 1;
		background: rgba(255, 255, 255, 0.1);
		transform: scale(1.05);
	}

	.processor {
		position: fixed;
		top: 60px;
		left: 0;
		right: 0;
		bottom: 0;
		background: #1a1a1a;
		overflow: hidden;
	}

	.upload-area {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.3s ease;
		background: #1a1a1a;
		cursor: pointer;
	}

	.upload-area.dragover {
		background: #2a2a2a;
	}

	.upload-content {
		text-align: center;
		padding: 3rem;
		border: 3px dashed #444;
		border-radius: 12px;
		background: #252525;
		transition: all 0.3s ease;
		pointer-events: none;
	}

	.upload-area.dragover .upload-content {
		border-color: #64748b;
		background: #1e293b;
	}

	.upload-content svg {
		color: #888;
		margin-bottom: 1rem;
	}

	.upload-content h2 {
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
		color: #fff;
	}

	.upload-content p {
		color: #aaa;
		margin-bottom: 1.5rem;
	}

	input[type="file"] {
		display: none;
	}

	.canvas-container {
		width: 100%;
		height: 100%;
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 2rem;
		box-sizing: border-box;
	}

	canvas {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
		border-radius: 4px;
		transition: transform 0.05s ease-out;
		transform-origin: center center;
	}

	.control-panel {
		position: fixed;
		background: rgba(255, 255, 255, 0.95);
		backdrop-filter: blur(10px);
		border-radius: 16px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
		padding: 1rem;
		max-width: 320px;
		z-index: 50;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.control-panel.dragging {
		transition: none;
	}

	.panel-content {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.control-panel.top-left {
		top: 80px;
		left: 20px;
	}

	.control-panel.top-right {
		top: 80px;
		right: 20px;
	}

	.control-panel.bottom-left {
		bottom: 20px;
		left: 20px;
	}

	.control-panel.bottom-right {
		bottom: 20px;
		right: 20px;
	}

	.panel-handle {
		cursor: grab;
		padding: 0.5rem;
		text-align: center;
		border-bottom: 1px solid #eee;
		margin-bottom: 1rem;
		user-select: none;
	}

	.panel-handle:active {
		cursor: grabbing;
	}

	.handle-icon {
		color: #999;
		font-size: 1.2rem;
		letter-spacing: -2px;
	}

	.control-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		position: relative;
		overflow: visible;
	}
	
	:global(.color-picker) {
		position: relative;
		z-index: 9999 !important;
	}
	
	:global(.color-picker > div[role="dialog"]) {
		z-index: 9999 !important;
	}
	
	:global(.color-picker label + div) {
		z-index: 9999 !important;
	}

	.control-group label {
		font-size: 0.85rem;
		font-weight: 600;
		color: #333;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	select {
		padding: 0.5rem;
		border: 1px solid #ddd;
		border-radius: 8px;
		background: white;
		font-size: 0.95rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	select:hover {
		border-color: #64748b;
	}

	select:focus {
		outline: none;
		border-color: #64748b;
		box-shadow: 0 0 0 3px rgba(100, 116, 139, 0.1);
	}

	input[type="range"] {
		width: 100%;
		height: 6px;
		border-radius: 3px;
		background: #e0e0e0;
		outline: none;
		-webkit-appearance: none;
	}

	input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: linear-gradient(135deg, #64748b 0%, #475569 100%);
		cursor: pointer;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
		transition: all 0.2s;
	}

	input[type="range"]::-webkit-slider-thumb:hover {
		transform: scale(1.2);
	}

	input[type="range"]::-moz-range-thumb {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: linear-gradient(135deg, #64748b 0%, #475569 100%);
		cursor: pointer;
		border: none;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	.export-btn {
		margin-top: 0.5rem;
		padding: 0.75rem 1.5rem;
		background: linear-gradient(135deg, #64748b 0%, #475569 100%);
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.export-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(100, 116, 139, 0.4);
	}

	.export-btn:active {
		transform: translateY(0);
	}
	
	.toggle-button {
		position: fixed;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.95);
		backdrop-filter: blur(10px);
		border: none;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
		transition: all 0.2s;
		color: #475569;
	}
	
	.toggle-button:hover {
		transform: scale(1.1);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
		background: rgba(255, 255, 255, 1);
	}
	
	.toggle-button:active {
		transform: scale(1.05);
	}
	
	.toggle-button.bottom-left {
		bottom: 20px;
		left: 20px;
	}
	
	.toggle-button.bottom-right {
		bottom: 20px;
		right: 20px;
	}
</style>
