// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Docs: using Astro (static pages, Islands) together with the Modular Blazor WebAssembly client and MudTail.
// English is the root locale (/guides/...), Arabic lives under /ar/ and is laid out right-to-left.
export default defineConfig({
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
					label: 'Reference',
					translations: { ar: 'المرجع' },
					items: [{ autogenerate: { directory: 'reference' } }],
				},
			],
		}),
	],
});
