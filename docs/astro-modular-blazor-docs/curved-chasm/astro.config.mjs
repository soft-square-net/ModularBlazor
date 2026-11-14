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
						{ type: 'element', tagName: 'div', properties: { className: ['mermaid-diagram'] }, children: [node] },
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
			rehypePlugins: [rehypeMermaidViewer, rehypeMermaid],
		}),
	},
	integrations: [
		starlight({
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
					label: 'Reference',
					translations: { ar: 'المرجع' },
					items: [{ autogenerate: { directory: 'reference' } }],
				},
			],
		}),
	],
});
