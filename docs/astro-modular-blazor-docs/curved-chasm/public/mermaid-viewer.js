const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.5;
const ZOOM_STEP = 0.2;

function setupViewer(viewer) {
	if (viewer.dataset.ready === 'true') return;
	const stage = viewer.querySelector('.mermaid-diagram');
	const svg = stage?.querySelector('svg');
	if (!stage || !svg) return;
	const arabic = document.documentElement.lang.startsWith('ar');
	const labels = arabic
		? { zoomIn: 'تكبير', zoomOut: 'تصغير', fit: 'ملاءمة العرض', reset: 'إعادة ضبط العرض', zoom: 'مستوى التكبير', tools: 'أدوات المخطط' }
		: { zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit diagram', reset: 'Reset view', zoom: 'Zoom level', tools: 'Diagram tools' };

	if (!viewer.querySelector('.mermaid-toolbar')) {
		const toolbar = document.createElement('div');
		toolbar.className = 'mermaid-toolbar';
		toolbar.setAttribute('role', 'toolbar');
		toolbar.setAttribute('aria-label', labels.tools);
		const addButton = (action, label, path) => {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'mermaid-control';
			button.dataset.mermaidAction = action;
			button.setAttribute('aria-label', label);
			button.title = label;
			const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			icon.setAttribute('viewBox', '0 0 24 24');
			icon.setAttribute('aria-hidden', 'true');
			const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			iconPath.setAttribute('d', path);
			icon.append(iconPath);
			button.append(icon);
			toolbar.append(button);
		};
		addButton('zoom-out', labels.zoomOut, 'M5 12h14');
		const indicator = document.createElement('output');
		indicator.className = 'mermaid-zoom-level';
		indicator.setAttribute('aria-live', 'polite');
		indicator.setAttribute('aria-label', labels.zoom);
		indicator.textContent = '100%';
		toolbar.append(indicator);
		addButton('zoom-in', labels.zoomIn, 'M12 5v14M5 12h14');
		const divider = document.createElement('span');
		divider.className = 'mermaid-toolbar-divider';
		divider.setAttribute('aria-hidden', 'true');
		toolbar.append(divider);
		addButton('fit', labels.fit, 'M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3');
		addButton('reset', labels.reset, 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5');
		viewer.insertBefore(toolbar, stage);
	}

	viewer.dataset.ready = 'true';
	let zoom = 1;
	let panX = 0;
	let panY = 0;
	let drag = null;
	const zoomLabel = viewer.querySelector('.mermaid-zoom-level');

	function render() {
		svg.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
		if (zoomLabel) zoomLabel.value = `${Math.round(zoom * 100)}%`;
		stage.classList.toggle('is-zoomed', zoom !== 1 || panX !== 0 || panY !== 0);
	}

	function setZoom(nextZoom, centerX = stage.clientWidth / 2, centerY = stage.clientHeight / 2) {
		const bounded = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
		const ratio = bounded / zoom;
		panX = centerX - (centerX - panX) * ratio;
		panY = centerY - (centerY - panY) * ratio;
		zoom = bounded;
		render();
	}

	function reset() {
		zoom = 1;
		panX = 0;
		panY = 0;
		render();
	}

	viewer.addEventListener('click', (event) => {
		const button = event.target.closest('[data-mermaid-action]');
		if (!button) return;
		switch (button.dataset.mermaidAction) {
			case 'zoom-in': setZoom(zoom + ZOOM_STEP); break;
			case 'zoom-out': setZoom(zoom - ZOOM_STEP); break;
			case 'fit': reset(); break;
			case 'reset': reset(); break;
		}
	});

	stage.addEventListener('wheel', (event) => {
		if (!event.ctrlKey && !event.metaKey) return;
		event.preventDefault();
		const bounds = stage.getBoundingClientRect();
		setZoom(zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), event.clientX - bounds.left, event.clientY - bounds.top);
	}, { passive: false });

	stage.addEventListener('pointerdown', (event) => {
		if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('a, button')) return;
		drag = { x: event.clientX, y: event.clientY, panX, panY };
		stage.setPointerCapture(event.pointerId);
		stage.classList.add('is-panning');
	});

	stage.addEventListener('pointermove', (event) => {
		if (!drag) return;
		panX = drag.panX + event.clientX - drag.x;
		panY = drag.panY + event.clientY - drag.y;
		render();
	});

	function endDrag() {
		drag = null;
		stage.classList.remove('is-panning');
	}
	stage.addEventListener('pointerup', endDrag);
	stage.addEventListener('pointercancel', endDrag);

	stage.addEventListener('keydown', (event) => {
		if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom(zoom + ZOOM_STEP); }
		if (event.key === '-') { event.preventDefault(); setZoom(zoom - ZOOM_STEP); }
		if (event.key === '0') { event.preventDefault(); reset(); }
	});

	render();
}

document.querySelectorAll('.mermaid-viewer').forEach(setupViewer);
