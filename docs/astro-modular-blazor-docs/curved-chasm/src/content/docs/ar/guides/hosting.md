---
title: الاستضافة والنشر
description: موقع nginx واحد يخدم Astro على / وعميل Blazor على /app/، وبناء Docker متعدد المراحل، والتطوير المحلي.
sidebar:
  order: 5
---

## التطوير المحلي

شغل كل جزء بأداته الخاصة؛ وتتواصل الأجزاء عبر HTTP.

| الجزء | الأمر | العنوان |
| --- | --- | --- |
| الواجهة البرمجية | `dotnet run --project src/api/ModularBlazor.Host` | http://localhost:5100 |
| عميل Blazor | `dotnet run --project src/apps/blazor/ModularBlazor.Client` | http://localhost:5000 |
| موقع Astro | `npm run dev` في مشروع Astro | http://localhost:4321 |
| عرض MudTail التجريبي | `npx vite --port 3001` في `src/MudTail` | http://localhost:3001 |

في التطوير يكون موقع Astro والعميل على **أصلين مختلفين** (منفذين مختلفين)، فلا يتشاركان `localStorage`. لاختبار
النسق المشترك وتسجيل الدخول المشترك، مرر العميل عبر خادم تطوير Astro:

```js title="astro.config.mjs"
export default defineConfig({
  vite: {
    server: {
      proxy: { '/app': { target: 'http://localhost:5000', changeOrigin: true } },
    },
  },
});
```

ويجب حينها بناء العميل مع `<base href="/app/">`.

## الإنتاج: موقع nginx واحد

صورة العميل تخدم تطبيق Blazor عبر nginx أصلا (`src/apps/blazor/ModularBlazor.Client/nginx`). ضع مخرجات Astro في
الجذر والعميل تحت `/app/`:

```text
/usr/share/nginx/html/
  index.html, news/, sport/, _astro/, 404.html     Astro (dist/)
  app/
    index.html, _framework/, css/, modules/         Blazor client (publish output, base href /app/)
  islands/                                          optional islands host
```

```nginx title="snippets/app.conf"
root /usr/share/nginx/html;
include /etc/nginx/mime.types;
types { application/wasm wasm; application/octet-stream dll; }

# Modules: raw bytes, never the SPA fallback, never stale.
location ^~ /app/modules/ {
    gzip off;
    default_type application/octet-stream;
    add_header Cache-Control "no-cache";
    try_files $uri =404;
}

# Blazor client: unknown paths under /app/ go to its index.html and the Router handles them.
location /app/ {
    try_files $uri $uri/ /app/index.html =404;
}

# Astro: real files only, with Astro's own 404 page.
location / {
    try_files $uri $uri/ $uri.html =404;
}
error_page 404 /404.html;

# Hashed Astro assets can be cached for a long time.
location /_astro/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

:::caution
اجعل البديل `/app/` محصورا في `/app/`. فلو كان `try_files … /index.html` على مستوى الموقع كله، لأجاب عن كل صفحة
Astro مفقودة، وعن كل وحدة مفقودة، بواجهة Blazor بدلا من 404.
:::

## Docker

وسع ملف Dockerfile الخاص بالعميل بمرحلة لـ Astro، وانسخ المخرجين إلى صورة nginx:

```dockerfile
FROM node:22 AS astro
WORKDIR /site
COPY docs/astro-site/package*.json ./
RUN npm ci
COPY docs/astro-site/ ./
RUN npm run build

# … the existing .NET publish stage of the client, publishing to /app/publish …

FROM nginx:alpine
COPY --from=astro /site/dist/ /usr/share/nginx/html/
COPY --from=publish /app/publish/wwwroot/ /usr/share/nginx/html/app/
```

استبدل `docs/astro-site` بمجلد مشروع Astro لديك. وإن كان الموقع يستورد MudTail، فانسخ `src/MudTail` إلى هذه
المرحلة وابنه أولا (`npm --prefix src/MudTail ci && npm --prefix src/MudTail run build`)، لأن اعتمادية `file:`
تشير إلى ذلك المجلد.

مع Aspire، تربط حاوية العميل المجلد `wwwroot/modules` أصلا. وحين يكون العميل تحت `/app/`، اربطه في
`/usr/share/nginx/html/app/modules` بدلا من ذلك.

## موقع التوثيق هذا

هذا الموقع نفسه مشروع Astro (Starlight) في `docs/astro-modular-blazor-docs/curved-chasm`:

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # static output in dist/
```
