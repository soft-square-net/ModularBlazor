---
title: "نقاط النهاية: Minimal API مع Carter"
description: لماذا تستخدم الواجهة Minimal API مع وحدات Carter، وليس FastEndpoints، حين تحمل الوحدات والتطبيق يعمل.
sidebar:
  order: 6
---

**القرار:** نبقي على **Minimal API مع Carter**. كل وحدة تعرض نقاط نهايتها في أصناف `ICarterModule`. ولا نضيف
FastEndpoints.

## السياق

- الوحدات المدمجة تترجم مع المضيف. يسردها `HostModules`، ويجد `CarterModuleTypes()` أصناف `ICarterModule` فيها،
  ويربطها `app.MapCarter()` عند بدء التشغيل.
- ويمكن أيضا **رفع وحدات والواجهة تعمل** (`.dll` أو `.nupkg`): يقرأ المضيف التجميعة، ويسجل بيانها في مخطط
  الوحدات، ويثبتها المسؤول ويفعلها ويحملها دون إعادة تشغيل.

لذا يجب أن يقبل إطار نقاط النهاية نقاط نهاية جديدة بعد بدء التشغيل.

## الخيارات

| | FastEndpoints مع Carter | Minimal API مع Carter |
| --- | --- | --- |
| اكتشاف نقاط النهاية | يمسح `AddFastEndpoints()` التجميعات مرة؛ ويبني `UseFastEndpoints()` المسارات مرة | يمكن استدعاء `ICarterModule.AddRoutes(app)` في أي وقت، على أي باني مسارات |
| نقاط نهاية بعد البدء | غير مدعومة: الوحدة الجديدة تحتاج إلى إعادة تشغيل | مدعومة، عبر `EndpointDataSource` ديناميكي |
| النماذج في الشيفرة | نموذجان (أصناف FastEndpoints ووحدات Carter)، ومساران للتحقق، ومساران لـ OpenAPI | نموذج واحد |
| ما تحصل عليه | أصناف طلب–نقطة نهاية–استجابة، وتحقق مدمج، ومعالجات قبلية وبعدية | مرشحات نقاط النهاية، ومجموعات المسارات، وFluentValidation: قريب بما يكفي مع اصطلاح صغير |

## لماذا يبقى Carter مناسبا

`ICarterModule` عقد بأسلوب واحد، `AddRoutes(IEndpointRouteBuilder app)`. يعتمد المضيف على هذا العقد، لا على مسح
`MapCarter()` عند البدء:

```text
built-in module   → MapCarter() at startup
runtime module    → module.AddRoutes(privateRouteBuilder) on activation
                    → endpoints added to a dynamic EndpointDataSource
                    → change token → routing rebuilds, no restart
```

## النتائج

- تكتب نقاط النهاية بالطريقة نفسها في الوحدات المدمجة ووحدات التشغيل.
- الأجزاء الصعبة في وحدات التشغيل لا تعتمد على إطار نقاط النهاية: حاوية حقن تبعيات لكل وحدة، وسياقات تحميل
  التجميعات، وإخلاء الذاكرة المؤقتة. انظر [وحدات أثناء التشغيل](/ar/backend/runtime-modules/).
- الفرق التي تريد أسلوب طلب–نقطة نهاية–استجابة تكتب صنفا لكل نقطة نهاية داخل وحدة Carter، مع مرشح نقطة نهاية
  للتحقق.
