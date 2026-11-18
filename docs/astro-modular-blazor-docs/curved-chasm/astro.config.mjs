// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';
import rehypeMermaid from 'rehype-mermaid';

function rehypeMermaidViewer() {
	return (tree, file) => {
		const isArabic = /(?:^|[\\/])ar(?:[\\/]|$)/.test(file.path ?? '');
		const labels = isArabic
			? { code: 'عرض شفرة المخطط', diagram: 'عرض المخطط' }
			: { code: 'View Diagram Code', diagram: 'View Diagram' };

		function visit(parent) {
			if (!Array.isArray(parent.children)) return;

			parent.children = parent.children.flatMap((node) => {
				const code = node.type === 'element' && node.tagName === 'pre'
					? node.children?.find((child) => child.type === 'element' && child.tagName === 'code')
					: undefined;
				const classes = code?.properties?.className ?? [];
				if (!classes.includes('language-mermaid')) {
					visit(node);
					return [node];
				}
				const source = code.children.map((child) => child.value ?? '').join('');
				const sourceBlock = {
					type: 'element', tagName: 'pre', properties: {},
					children: [{ type: 'element', tagName: 'code', properties: { className: ['language-text'] }, children: [{ type: 'text', value: source }] }],
				};
				const toggleIcon = {
					type: 'element', tagName: 'svg',
					properties: { 'aria-hidden': 'true', viewBox: '0 0 24 24', className: ['mermaid-toggle-icon'] },
					children: [{ type: 'element', tagName: 'path', properties: { d: 'm7 8-4 4 4 4m10-8 4 4-4 4M14 4l-4 16', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, children: [] }],
				};
				return [{
					type: 'element', tagName: 'div', properties: { className: ['mermaid-viewer'] },
					children: [
						{ type: 'element', tagName: 'div', properties: { className: ['mermaid-diagram'], tabindex: '0', 'aria-label': isArabic ? 'مخطط تفاعلي؛ اسحب للتحريك واستخدم أدوات التكبير' : 'Interactive diagram; drag to pan and use the zoom controls' }, children: [node] },
						{
							type: 'element', tagName: 'details', properties: { className: ['mermaid-code-toggle'] },
							children: [
								{ type: 'element', tagName: 'summary', properties: {}, children: [toggleIcon, { type: 'element', tagName: 'span', properties: { className: ['mermaid-code-label'] }, children: [{ type: 'text', value: labels.code }] }, { type: 'element', tagName: 'span', properties: { className: ['mermaid-diagram-label'] }, children: [{ type: 'text', value: labels.diagram }] }] },
								sourceBlock,
							],
						},
					],
				}];
			});
		}

		visit(tree);
	};
}

// Docs: using Astro (static pages, Islands) together with the Modular Blazor WebAssembly client and MudTail.
// English is the root locale (/guides/...), Arabic lives under /ar/ and is laid out right-to-left.
export default defineConfig({
	markdown: {
		processor: unified({
			rehypePlugins: [
				rehypeMermaidViewer,
				[
					rehypeMermaid,
					{
						mermaidConfig: {
							theme: 'base',
							fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
							fontSize: 15,
							flowchart: { curve: 'basis', nodeSpacing: 48, rankSpacing: 58, padding: 16 },
							sequence: { actorMargin: 54, messageMargin: 38, noteMargin: 16, mirrorActors: false },
							 themeVariables: {
								primaryColor: '#28243f',
								primaryTextColor: '#f4f2ff',
								primaryBorderColor: '#8b7cf6',
								secondaryColor: '#202f43',
								secondaryTextColor: '#e5f0ff',
								secondaryBorderColor: '#5da9e9',
								tertiaryColor: '#173b35',
								tertiaryTextColor: '#e5fff5',
								tertiaryBorderColor: '#45c2a1',
								lineColor: '#9a9bb3',
								textColor: '#ecebfa',
								mainBkg: '#28243f',
								secondBkg: '#202f43',
								tertiaryBkg: '#173b35',
								clusterBkg: '#171923',
								clusterBorder: '#45445a',
								nodeBorder: '#8b7cf6',
								actorBkg: '#28243f',
								actorBorder: '#8b7cf6',
								actorTextColor: '#f4f2ff',
								actorLineColor: '#77788d',
								 signalColor: '#c6c2e0',
								signalTextColor: '#f4f2ff',
								labelBoxBkgColor: '#252437',
								labelBoxBorderColor: '#55536e',
								labelTextColor: '#f4f2ff',
								loopTextColor: '#e9e6ff',
								noteBkgColor: '#342d16',
								noteBorderColor: '#d1a94d',
								noteTextColor: '#fff2c6',
								activationBkgColor: '#39345a',
								activationBorderColor: '#a69cf8',
								edgeLabelBackground: '#191a22',
								fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
							},
						},
					},
				],
			],
		}),
	},
	integrations: [
		starlight({
			head: [{ tag: 'script', attrs: { src: '/mermaid-viewer.js', type: 'module' } }],
			title: { en: 'Astro × Modular Blazor', ar: 'Astro مع Blazor المعياري' },
			description: 'How to combine Astro sites and Islands with the Modular Blazor WebAssembly client and MudTail.',
			defaultLocale: 'root',
			locales: {
				root: { label: 'English', lang: 'en' },
				ar: { label: 'العربية', lang: 'ar', dir: 'rtl' },
			},
			customCss: ['./src/styles/custom.css'],
			sidebar: [
				{
					label: 'Start here',
					translations: { ar: 'ابدأ هنا' },
					items: [{ autogenerate: { directory: 'start' } }],
				},
				{
					label: 'Guides',
					translations: { ar: 'الأدلة' },
					items: [{ autogenerate: { directory: 'guides' } }],
				},
				{
					label: 'Backend architecture',
					translations: { ar: 'البنية الخلفية' },
					items: [{ autogenerate: { directory: 'backend' } }],
				},
				{
					label: 'Modules',
					translations: { ar: 'الوحدات' },
					items: [{ autogenerate: { directory: 'modules' } }],
				},
				{
					label: 'Reference',
					translations: { ar: 'المرجع' },
					items: [{ autogenerate: { directory: 'reference' } }],
				},
			],
		}),
	],
});
