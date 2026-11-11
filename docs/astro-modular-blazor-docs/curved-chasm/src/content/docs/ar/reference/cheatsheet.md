---
title: ورقة مرجعية
description: ما يقابل كل مفهوم في Astro وBlazor وMudTail، في صفحة واحدة.
sidebar:
  order: 1
---

## المفاهيم

| Astro | Blazor (هذا المشروع) | MudTail |
| --- | --- | --- |
| مكون `.astro` | مكون `.razor` | أصناف CSS و`data-mud` |
| القالب (`<slot />`) | `LayoutComponentBase` مع `[LayoutKey]` (`@Body`) | `mud-site`، `mud-site-header`، `mud-site-footer` |
| صفحة في `src/pages/` | `@page` داخل وحدة | — |
| جزيرة مع `client:*` | `RegisterForJavaScript` مع `<BlazorIsland load=…>` | `autoInit(root)` |
| `<script>` داخل مكون | `js/module.js` في الوحدة (`moduleHost`) | `registerBehavior(name, factory)` |
| مجموعات المحتوى | الواجهة البرمجية وبيانات الوحدات | — |
| توجيه اللغات (`/ar/…`) | `CultureInfo`، `IStringLocalizer` | `setLocale`، `t`، `translateElement` |
| `dir="rtl"` على `<html>` | كذلك | يتبع `dir`، بخصائص منطقية |

## تحميل الجزر

| Astro | `<BlazorIsland>` | يبدأ |
| --- | --- | --- |
| `client:load` | `load="eager"` | فورا |
| `client:idle` | `load="idle"` | حين يكون المتصفح خاملا |
| `client:visible` | `load="visible"` | حين يظهر على الشاشة (بهامش 200px) |
| `client:media="q"` | `load="media" media="q"` | حين يتحقق الاستعلام |
| `client:only` | فتحة فارغة | فورا، دون بديل |

## واجهات Blazor في JavaScript المستخدمة هنا

| الواجهة | المكان | الغرض |
| --- | --- | --- |
| `builder.RootComponents.RegisterForJavaScript<T>("name")` | `Program.cs` في مضيف الجزر | إتاحة مكون لـ JS |
| `<script autostart="false">` مع `Blazor.start({ loadBootResource })` | `src/lib/blazor.ts` | البدء عند الطلب، من `/islands/` |
| `Blazor.rootComponents.add(el, "name", params)` | `<BlazorIsland>` | التركيب؛ يعيد `setParameters` و`dispose` |

## صادرات MudTail المستخدمة في Astro

| الصادر | الاستخدام |
| --- | --- |
| `mudtail/mudtail.css` | الأنماط والمتغيرات |
| `mudtail/tailwind.css` | إعداد Tailwind v4 |
| `initTheme()`، `updateTheme()` | النسق المحفوظ، مشترك مع Blazor على أصل واحد |
| `autoInit(document.body)` | كل سلوكيات `data-mud` |
| `setLocale('ar')`، `setDirection('rtl', 'ar')` | اللغة والاتجاه |
| `MudTabs`، `MudDataTable`، `MudDialog`، … | مكونات تبنى في JS |

## المسارات

| المسار | يخدمه |
| --- | --- |
| `/`، `/news/…`، `/_astro/…` | مخرجات Astro |
| `/app/…` | عميل Blazor (بديل SPA إلى `/app/index.html`) |
| `/app/modules/…` | ملفات الوحدات، بلا بديل |
| `/islands/…` | مضيف الجزر (اختياري) |
| `http://localhost:5100/api/…` | ModularBlazor.Host |

## إبقاء وحدات الخادم قابلة للفصل

تحقق من هذه القواعد قبل دمج أي تغيير في وحدة، حتى يمكن نقلها لاحقا إلى مجموعة خاصة بها
([سيناريوهات النشر](/ar/backend/deployment-scenarios/#ابن-لـ-b-وانشر-كـ-a)):

| القاعدة | التحقق |
| --- | --- |
| العقود فقط | لا تشير إلى الوحدات الأخرى إلا عبر تجميعات `*.Contracts` الخاصة بها (اختبار بنية في CI) |
| بيانات خاصة | مخطط و`DbContext` خاصان بها؛ لا ربط ولا معاملات بين الوحدات |
| استدعاءات جاهزة للشبكة | توقيعات غير متزامنة، وكائنات نقل بيانات فقط، ولا كيانات ولا حالة مشتركة عبر العقد |
| رسائل موثوقة | تنشر تغييرات الحالة عبر صندوق الصادر (outbox)؛ والمستهلكون متساوو الأثر (inbox) |
| وسيط حقيقي | تمر الرسائل عبر الوسيط حتى لو كانت الوحدتان في العملية نفسها |
| المستأجر في كل مكان | معرف المستأجر في بيانات gRPC الوصفية وفي ترويسات الرسائل |
| لا شيء محلي | لا ذاكرة مؤقتة ولا مؤقتات ولا ملفات داخل الذاكرة قد تحتاجها نسخة أخرى |
| نقاط النهاية | أصناف `ICarterModule`؛ ولا شيء يسجل بالمسح عند بدء التشغيل فقط |
