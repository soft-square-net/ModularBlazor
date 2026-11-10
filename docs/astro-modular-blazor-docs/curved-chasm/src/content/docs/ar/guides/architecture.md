---
title: خيارات البنية
description: جنبا إلى جنب، أو جزر Blazor، أو جزر MudTail فقط. كلفة كل خيار ومتى تختاره.
sidebar:
  order: 1
---

## 1. جنبا إلى جنب (البداية الموصى بها)

يملك Astro جذر النطاق، ويعيش عميل Blazor تحت مسار فرعي.

```text
https://example.com/                 Astro: home, sections, articles, docs   (static files)
https://example.com/news/derby-day/  Astro
https://example.com/app/             Blazor client (index.html + _framework + modules)
https://example.com/app/reports      Blazor route, loads Module.Reports on navigation
https://api.example.com/             ModularBlazor.Host (catalog, identity, tenants)
```

- يحتاج عميل Blazor إلى `<base href="/app/">` في الملف `wwwroot/index.html`. كل روابط الوحدات ومساراتها نسبية
  إلى الأساس، فلا يتغير شيء آخر.
- التطبيقان على أصل (origin) واحد، فيتشاركان `localStorage`: نسق MudTail (`mud_vanilla_theme_config`) ورمز تسجيل
  الدخول (`authToken`) مرئيان لكليهما.
- تربط صفحات Astro بالتطبيق بروابط عادية (`/app/login`، `/app/reports`). فيحمل المتصفح Blazor تحميلا كاملا
  مرة واحدة.

**اختره عندما** يكون الموقع العام والتطبيق تجربتين مختلفتين يمكنهما مشاركة الترويسة والتذييل والنسق.

## 2. جزر Blazor داخل صفحات Astro

يسجل مكون Blazor باستخدام `RegisterForJavaScript` في **مضيف جزر** صغير، ويركب في صفحة Astro عبر عنصر
مخصص حين يظهر على الشاشة.

```text
/news/derby-day/                     static article HTML
  └─ <blazor-island component="live-table">   boots /islands/_framework/blazor.webassembly.js on scroll
/islands/                            islands host (Blazor WebAssembly, no Router, no #app)
```

- يدفع ثمن تنزيل بيئة .NET عند أول جزيرة في الزيارة؛ ويبقى كل ما عداها في الصفحة ثابتا.
- يعيد استخدام مكونات C# وعملاء الواجهة البرمجية (`AddApiClients`) الموجودة لديك.
- مضيف الجزر مشروع Blazor منفصل؛ راجع [جزر Blazor](/ar/guides/blazor-islands/).

**اختره عندما** تكون أداة واحدة في صفحة عامة معقدة إلى حد تكون فيه إعادة كتابتها بـ JS أسوأ من تنزيل بيئة
التشغيل: جدول دوري مباشر بعوامل تصفية، أو نموذج بقواعد تحقق من الخادم، أو محرر.

## 3. جزر MudTail فقط

لا Blazor في الصفحات العامة. فـ MudTail يقدم أصلا الأجزاء التفاعلية التي يحتاجها موقع أخبار أو رياضة أو فن:

| الحاجة | MudTail |
| --- | --- |
| شريط عناوين، نتائج مباشرة | `data-mud="ticker"`، `data-mud="score-strip"` |
| التنقل | `data-mud="mega-nav"`، `data-mud-nav-toggle` |
| معارض الصور | `data-mud="lightbox"` |
| تقدم القراءة، الظهور عند التمرير | `data-mud="reading-progress"`، `data-mud-reveal` |
| تبويبات، أكورديون، حوار، درج جانبي | `MudTabs`، `MudAccordion`، `MudDialog`، `MudDrawer` |
| جداول بترقيم صفحات وبحث | `MudDataTable` |
| بطاقات إحصاء، مؤشرات تقدم | `createStatCard`، `MudProgressLinear`، `MudProgressCircular` |

**اختره عندما** تكون الصفحة محتوى بتفاعل خفيف. إنه الخيار الأخف، والترميز هو نفسه الذي تعرضه قوالب Razor، فيمكن
نقل قسم بين Astro وBlazor دون إعادة تصميم.

## مقارنة

| | جنبا إلى جنب | جزر Blazor | MudTail فقط |
| --- | --- | --- | --- |
| JavaScript في الصفحة العامة | MudTail فقط | MudTail وبيئة .NET عند الطلب | MudTail فقط |
| إعادة استخدام مكونات C# | داخل التطبيق فقط | نعم | لا |
| مشروع إضافي | موقع Astro | موقع Astro ومضيف جزر | موقع Astro |
| الأجزاء المتحركة في الإنتاج | موقعان، أصل واحد | ثلاث عمليات بناء، أصل واحد | موقعان، أصل واحد |

تجمع معظم المشاريع بين **1 و3**، وتضيف **2** للأداة النادرة التي تستحق ذلك.
