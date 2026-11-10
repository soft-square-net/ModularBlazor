---
title: MudTail في Astro
description: ثبت MudTail في موقع Astro، وحمل أنماطه ومتغيراته، وشغل سلوكيات data-mud، وأبق النسق متزامنا مع Blazor.
sidebar:
  order: 2
---

MudTail عبارة عن CSS عادية وJavaScript عادية، فلا يحتاج إلى تكامل خاص مع Astro. والوحدة `Layouts.Default`
تستخدمه أصلا بالطريقة نفسها (`modules/client/Layouts.Default/node-app`)، ويمكن لموقع Astro نسخ هذا الإعداد.

## التثبيت

MudTail حزمة محلية (`src/MudTail`، `"private": true`). أشر إليها باعتمادية `file:` وابنها مرة واحدة ليوجد
المجلد `dist/`:

```bash
npm --prefix src/MudTail run build
npm install ../../src/MudTail      # from the Astro project; adjust the relative path
```

```json title="package.json"
{
  "dependencies": {
    "mudtail": "file:../../src/MudTail"
  }
}
```

تصدر الحزمة ما يلي:

| الاستيراد | المحتوى |
| --- | --- |
| `mudtail` | وحدة ES؛ تحل `gsap` و`lucide` من اعتمادياتها. استخدمها في Astro. |
| `mudtail/mudtail.css` | أنماط المكونات ومتغيرات `--mud-palette-*`، الفاتحة والداكنة |
| `mudtail/tailwind.css` | إعداد Tailwind v4 يربط المتغيرات بالأصناف المساعدة |
| `mudtail/blazor` | وحدة تشغيل بيني مستقلة لـ `IJSRuntime`. لا حاجة إليها في Astro. |

## تحميل الأنماط

استورد CSS مرة واحدة، في القالب الذي تستخدمه كل الصفحات:

```astro title="src/layouts/Site.astro"
---
import 'mudtail/mudtail.css';
const { title, lang = 'en', dir = 'ltr' } = Astro.props;
---
<html lang={lang} dir={dir}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
  </head>
  <body>
    <div class="mud-site">
      <slot />
    </div>
  </body>
</html>
```

### مع Tailwind

أضف Tailwind عبر إضافة Vite الخاصة به، ثم استورد إعداد MudTail بعد Tailwind ووجه `@source` إلى ملفات `.astro`:

```js title="astro.config.mjs"
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  vite: { plugins: [tailwindcss()] },
});
```

```css title="src/styles/site.css"
@import "tailwindcss";
@import "mudtail/tailwind.css";
@source "../**/*.astro";
```

يوفر الإعداد `bg-primary` و`bg-surface` و`text-ink` و`text-ink-muted` و`border-line` و`rounded-mud`، والمتغير
`dark:` مربوطا بـ `[data-theme="dark"]`، وكلها تتبع النسق الحالي.

## تشغيل السلوكيات

تجمع وسوم `<script>` في مكونات Astro وتشغل مرة واحدة لكل صفحة. شغل MudTail هناك:

```astro title="src/components/MudTail.astro"
<script>
  import { initTheme, autoInit } from 'mudtail';

  initTheme();               // applies the saved theme (palette, radius, dark mode) to <html>
  autoInit(document.body);   // every data-mud="…" and data-mud-reveal element on the page
</script>
```

ضع `<MudTail />` في القالب. والترميز هو نفسه الذي تعرضه قوالب Razor، مثل ترويسة `PublicLayout`:

```astro
<button type="button" class="mud-icon-btn mud-theme-toggle" data-mud="theme-toggle" aria-label="Dark mode">…</button>
<div class="mud-reading-progress" data-mud="reading-progress" aria-hidden="true"></div>
<nav class="mud-mega-nav" id="site-nav" data-mud="mega-nav" aria-label="Main">…</nav>
```

:::caution[سمات يملكها MudTail]
تضبط السلوكيات السمات `aria-expanded` و`aria-pressed` و`data-open` و`data-state` و`data-enhanced` و
`data-mud-revealed` بنفسها. لا تكتبها في الترميز، لا في Astro ولا في Razor.
:::

### مع انتقالات العرض

يستبدل `<ClientRouter />` في Astro محتوى الصفحة دون إعادة تحميل كاملة، لذا يجب أن تتبعه السلوكيات:

```astro
<script>
  import { initTheme, autoInit } from 'mudtail';

  let mud: { dispose(): void } | undefined;
  document.addEventListener('astro:page-load', () => {
    initTheme();
    mud = autoInit(document.body);
  });
  document.addEventListener('astro:before-swap', () => mud?.dispose());
</script>
```

## نسق واحد للتطبيقين

تحفظ `updateTheme()` النسق في `localStorage` وتطلق الحدث `mud-theme-changed`. ويقرأ Astro وعميل Blazor على
**الأصل نفسه** النسق المحفوظ ذاته، فالمستخدم الذي يختار الوضع الداكن في التطبيق يرى الموقع العام داكنا أيضا. لا
حاجة لشيء آخر.

## العربية والكتابة من اليمين إلى اليسار

يتبع MudTail السمة `dir` في `<html>`. اعرض `dir="rtl" lang="ar"` من القالب للصفحات العربية (يعطيك توجيه
الترجمة في Astro القيمة `Astro.currentLocale`). ثم استدع `setLocale('ar')` في سكربت الصفحة: الفهرس العربي مضمن
في MudTail، فتتحول نصوصه (جدول البيانات، معرض الصور، الشريط الإخباري، الحوارات) إلى العربية، ويضبط `dir` حسب
اللغة.

```astro
---
const isAr = Astro.currentLocale === 'ar';
---
<html lang={isAr ? 'ar' : 'en'} dir={isAr ? 'rtl' : 'ltr'}>
```
