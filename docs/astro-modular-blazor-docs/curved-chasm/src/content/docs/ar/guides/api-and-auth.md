---
title: الواجهة البرمجية وتسجيل الدخول والمستأجرون
description: استدعاء ModularBlazor.Host من Astro أثناء البناء وفي المتصفح، ومشاركة تسجيل الدخول مع Blazor، وCORS، وترويسة X-Tenant.
sidebar:
  order: 4
---

## أثناء البناء: بيانات عامة فقط

تستطيع صفحات Astro استدعاء `fetch` في مقدمتها (frontmatter). تعمل هذه الشيفرة **عند بناء الموقع** (أو مع كل طلب
عند استخدام محول SSR)، ولا تعمل أبدا في متصفح الزائر. استخدمها للبيانات العامة فقط:

```astro title="src/pages/modules.astro"
---
const api = import.meta.env.API_BASE_URL ?? 'http://localhost:5100';
const modules = await fetch(`${api}/api/modules/core`).then(r => r.json());
---
<ul>{modules.map((m: { id: string; name: string }) => <li>{m.name}</li>)}</ul>
```

المسار `GET /api/modules/core` عام. أما كل ما تحت `/api/v1/identity` و`/api/v1/tenants` و`/api/me/modules`
فيحتاج إلى رمز، ولا يجوز أبدا تضمين رمز في HTML ثابت.

## في المتصفح: CORS

لا تجيب الواجهة البرمجية عن الطلبات القادمة من أصل آخر إلا من الأصول المذكورة في `Cors:Origins` (تطابق تام، دون
أحرف بدل). أضف أصول Astro، للتطوير والإنتاج:

```json title="src/api/ModularBlazor.Host/appsettings.Development.json"
{
  "Cors": {
    "Origins": [ "http://localhost:5000", "https://localhost:5001", "http://localhost:4321" ]
  }
}
```

مع Aspire، أضف متغير بيئة `Cors__Origins__<n>` آخر إلى المورد `host-api` في `src/Aspire/Host/Program.cs`.

## مشاركة تسجيل الدخول

يسجل المستخدمون دخولهم داخل عميل Blazor (`Module.Auth`، `/app/login`). وتخزن `JwtAuthenticationService` رمز
الوصول تحت المفتاح `authToken` ورمز التحديث تحت `refreshToken` في `localStorage`. وحين يخدم Astro والعميل من
**الأصل نفسه**، يستطيع سكربت في Astro قراءة الرمز لتخصيص الصفحة بعد تحميلها:

```ts
const token = localStorage.getItem('authToken')?.replace(/^"|"$/g, '');
if (token) {
  const me = await fetch(`${apiBase}/api/v1/identity/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (me.ok) showUser(await me.json());
  // 401: the token expired. Link to /app/login; the client refreshes or asks to sign in again.
}
```

- اقرأ الرمز فقط. فالتحديث وتسجيل الخروج من مسؤولية عميل Blazor، ليكون للجلسة مالك واحد.
- التحققات في المتصفح لتحسين التجربة فقط. أما الواجهة البرمجية فتفرض الصلاحيات (`Permissions.Identity.*`،
  `Permissions.Multitenancy.*`) في كل طلب.
- أي سكربت على الأصل يستطيع قراءة الرمز المخزن في `localStorage`. أبعد سكربتات الأطراف الثالثة عن الصفحات التي
  تقرؤه، واضبط سياسة أمان المحتوى (CSP).

## المستأجرون

رمز JWT صالح فقط للمستأجر الذي صدر له. والطلبات التي لا تحمل `X-Tenant` تذهب إلى المستأجر الجذر. إن كان الموقع
العام خاصا بكل مستأجر (اسم نطاق لكل مستأجر مثلا)، فأرسل الترويسة نفسها التي يرسلها العميل:

```ts
fetch(url, { headers: { Authorization: `Bearer ${token}`, 'X-Tenant': tenantId } });
```

## الربط بالتطبيق

الروابط العادية تعمل، لأن مسارات العميل نسبية إلى `/app/`:

| الرابط من Astro | يفتح |
| --- | --- |
| `/app/` | الصفحة الرئيسية للعميل (القوالب وتسجيل الدخول وحدات بدء تشغيل) |
| `/app/login` | `Module.Auth` |
| `/app/todo` | `Module.ToDo`، ينزل عند التنقل |
| `/app/admin` | `Module.Admin` (الدور `admin`) |
