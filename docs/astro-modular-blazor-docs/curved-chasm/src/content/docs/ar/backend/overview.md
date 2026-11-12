---
title: نظرة عامة على الخادم
description: كيف تنشر الواجهة البرمجية، وكيف تتواصل الوحدات فيما بينها، وكيف تضاف وحدات جديدة أثناء التشغيل.
sidebar:
  order: 1
---

الواجهة البرمجية (`ModularBlazor.Host`) **تطبيق موحد معياري**: كل وحدة (Auth وCatalog وMultitenancy وMedia
وTodo وغيرها) تعيش في حل واحد، ولها مشاريع Domain وApplication وInfrastructure خاصة بها. يشرح هذا القسم كيف
تنشر هذه الواجهة وكيف تتوسع وكيف تمدد:

- **شيفرة واحدة وطريقتان للنشر.** شغل الصورة نفسها نسخا متطابقة (السيناريو A)، أو قسم الوحدات إلى مجموعات
  تتوسع كل منها وحدها (السيناريو B). التصميم يسمح بنقل وحدة من A إلى B بالإعدادات، لا بإعادة كتابتها.
- **تواصل هجين.** تستدعي الوحدات بعضها مباشرة حين تحتاج إلى جواب فوري، وترسل رسائل عبر وسيط حين تغير حالة
  وحدة أخرى أو تعلن عن حدث.
- **وحدات أثناء التشغيل.** يستطيع المسؤول رفع حزمة وحدة والواجهة تعمل، فتثبت وتفعل وتخدم دون إعادة تشغيل.

## الصورة الكاملة

```text
Client (Blazor WASM, Astro pages)
   │  static files ──► CDN
   ▼
Edge load balancer + YARP gateway        TLS, JWT, rate limit, tenant resolution
   │
   ├──► Core pool   [Identity · Workflow · Inventory]  ×2     same image,
   ├──► Sales pool  [Sales]                            ×4     EnabledModules
   └──  Worker pool [consumers + scheduled jobs]       ×2     and Role per pool
                 │
   Message broker · Redis · Tenant store + tenant databases · Object store
   OpenTelemetry: traces, metrics, logs (tenant + correlation ids) across everything
```

## أين تعيش في المستودع

| المسار | ما هو |
| --- | --- |
| `src/api/ModularBlazor.Host` | مضيف الواجهة الإنتاجي ووحداته المدمجة (`HostModules`) |
| `src/WebApi/WebApi` | النموذج الأولي لوحدات التشغيل: صورة واحدة تعمل كأي مجموعة |
| `src/WebApi/WebApi.Contracts` | `IRuntimeModule` و`ModuleManifest`، وعقود المستأجرين والأمان التي تراها الوحدات |
| `src/WebApi/WebApi.Data` | طبقة بيانات يشحنها المضيف: `TenantDbContext`، ومخزن المستأجرين، وأربعة مزودين لـ EF Core |
| `src/WebApi/WebApi.SharedKernel` | أنواع نطاق أساسية وواجهات مستودعات يشحنها المضيف (دون EF) |
| `src/WebApi/Identity/WebApi.Identity.Server` | خدمة الهوية OpenIddict (في الفرع `claude/identity-service-da759e`، ولم تدمج بعد) |
| `src/WebApi/Modules/Core/` | **الوحدات الأساسية** (`Identity` و`Tenancy`): تبنى مع كل إصدار من WebApi وتفعل افتراضيا |
| `src/WebApi/Modules/Custom/` | **الوحدات المخصصة**: تبنى وحدها وترفع والتطبيق يعمل |
| `src/WebApi/Modules/Custom/WebApi.Modules.Greeting` | وحدة مخصصة نموذجية، ترفع كحزمة |
| `src/WebApi/Modules/Custom/Inventory` | وحدة مخصصة نموذجية بطبقات (Domain وApplication وInfrastructure) |
| `src/Aspire/Hybird` | مختبر Aspire: بوابة، وثلاث مجموعات، وRabbitMQ وRedis وPostgreSQL |

يحمل `src/WebApi/Modules/Directory.Build.props` الإعدادات المشتركة للوحدات ذات الطبقات؛ ويضيف كل من `Core/` و`Custom/`
ملف `Directory.Build.props` خاصا به فوقه. والنوعان وحدات تشغيل عادية: لا يختلفان إلا في طريقة وصولهما (مع الإصدار، أو
برفع من المسؤول). انظر [وحدات أثناء التشغيل](/ar/backend/runtime-modules/).

## اقرأ بهذا الترتيب

| الصفحة | تجيب عن |
| --- | --- |
| [التواصل](/ar/backend/communication/) | متى تستدعي ومتى ترسل رسالة، وكيف تجعل الرسائل موثوقة |
| [سيناريوهات النشر](/ar/backend/deployment-scenarios/) | تطبيق موحد بنسخ متعددة أم خدمات منفصلة، وما يحتاجه كل منهما ليكون آمنا |
| [البنية المستهدفة](/ar/backend/target-architecture/) | التصميم المجمع: البوابة ومجموعات الوحدات والوسيط وRedis والمراقبة |
| [مختبر البنية الهجينة](/ar/backend/hybrid-lab/) | البنية المستهدفة تعمل محليا عبر .NET Aspire، وما قاسته |
| [تعدد المستأجرين](/ar/backend/multitenancy/) | كيف ينتقل المستأجر عبر الاستدعاءات والرسائل، وأين تعيش بياناته |
| [المستأجرون وبياناتهم](/ar/backend/tenancy-data/) | منفذ: تحديد المستأجر، وقاعدة بيانات لكل مستأجر على أربعة محركات، والترحيلات عند التفعيل |
| [نقاط النهاية: Minimal API مع Carter](/ar/backend/endpoints-carter/) | لماذا Minimal API مع Carter وليس FastEndpoints |
| [وحدات أثناء التشغيل](/ar/backend/runtime-modules/) | كيف تثبت وحدة وتفعل وتخدم والواجهة تعمل، على كل نسخة في كل مجموعة |
| [تفريغ وحدات التشغيل](/ar/backend/runtime-module-unloading/) | ما يلزم لتحرير ذاكرة وحدة، مقيسا بتفريغات الذاكرة |
| [المصادقة والتفويض](/ar/backend/auth-design/) | مذكرة تصميم: خدمة الهوية، وعضويات المستأجرين، والمنح محددة النطاق، وصلاحيات الوحدات، وسير عمل غرفة الأخبار |
| [المصادقة: التنفيذ](/ar/backend/auth-implementation/) | ما بني: فحص JWT، والصلاحيات والمنح، وفحوص التفعيل، وخدمة الهوية |

نقاط نهاية الإدارة وقواعد التحزيم في [مرجع واجهة وحدات التشغيل](/ar/reference/runtime-modules-api/).

## مبادئ

- **ابن للسيناريو B وانشر كالسيناريو A** إلى أن تحتاج وحدة فعلا إلى أن تتوسع أو تفشل وحدها.
- **لا تعرف الوحدة عن غيرها إلا عقودها**: كائنات نقل البيانات والواجهات والأحداث، لا جداولها ولا أصنافها.
- **استخدم الوسيط الحقيقي حتى داخل عملية واحدة**، حتى لا يتغير سلوك رسائل الوحدة حين تنقل إلى الخارج.
- **لا شيء مهم يعيش في ذاكرة نسخة واحدة**: المفاتيح والذاكرة المؤقتة والأقفال والملفات كلها مشتركة.
