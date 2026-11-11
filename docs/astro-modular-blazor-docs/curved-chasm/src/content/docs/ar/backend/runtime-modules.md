---
title: وحدات أثناء التشغيل
description: كيف يثبت النموذج الأولي WebApi وحدة مرفوعة ويفعلها ويخدمها والواجهة تعمل، دون إعادة تشغيل.
sidebar:
  order: 7
---

يبين النموذج الأولي في `src/WebApi` أنه يمكن رفع وحدة وتفعيلها وخدمتها **والواجهة تعمل**. إنه شيفرة بحثية: يثبت
الآلية ويقيس حدودها.

| المشروع | دوره |
| --- | --- |
| `WebApi` | المضيف. يحمل مجلد `Modularity/` بيئة التشغيل. |
| `WebApi.Contracts` | `IRuntimeModule` و`ModuleManifest`. يشير إليه المضيف، فهو مشترك دائما. |
| `WebApi.Modules.Greeting` | وحدة نموذجية. **لا** يشير إليها المضيف: تضغط مخرجات بنائها وترفع. |

## دورة الحياة

```text
upload ─► Install ─► Activate ─────────► Deactivate ─► Unload ─► Uninstall
          │          │                    │             │
          │          ├ load assembly      ├ routes 404  ├ dispose module services
          │          ├ build services     │             ├ evict framework caches
          │          └ map routes (live)  │             └ unload the load context
          └ read the manifest in a throw-away load context, register it
```

- **التثبيت** يحفظ الحزمة، ويقرأ البيان من التجميعة، ويسجله مع إعداداته الافتراضية. لا يبقى شيء محملا.
- **التفعيل** يحمل التجميعة، ويبني خدمات الوحدة، ويربط مساراتها. فتجيب فورا.
- **إلغاء التفعيل** يزيل المسارات (404) لكنه يبقي الوحدة محملة، فيكون التفعيل التالي فوريا.
- **التفريغ** يتخلص كذلك من خدمات الوحدة ويفرغ تجميعاتها؛ انظر
  [تفريغ وحدات التشغيل](/ar/backend/runtime-module-unloading/).
- **تحفظ الحالة المرغوبة.** عند بدء التشغيل، تفعل من جديد كل وحدة حالتها `Active`.

يحفظ النموذج الأولي التسجيلات في `modules.json`؛ أما المضيف الحقيقي فيحفظها في مخطط الوحدات.

## وحدة

```csharp
public sealed class GreetingModule : IRuntimeModule
{
    public ModuleManifest Manifest { get; } = new("greeting", "Greeting", "1.0.0", "greeting")
    {
        DefaultSettings = new Dictionary<string, string?> { ["Greeting:Prefix"] = "Hello" }
    };

    public void ConfigureServices(IServiceCollection services, IConfiguration settings)
    {
        services.Configure<GreetingOptions>(settings.GetSection("Greeting"));
        services.AddSingleton<GreetingCounter>();
        services.AddScoped<GreetingService>();
    }
}

public sealed class GreetingEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        app.MapGet("/{name}", (string name, GreetingService greetings) => greetings.Greet(name));
    }
}
```

تخدم نقاط نهايتها تحت `/api/{RoutePrefix}` (هنا `/api/greeting/...`) وتظهر في `/openapi/v1.json` ما دامت الوحدة
مفعلة.

## أربع مشكلات وحلولها

### 1. جدول المسارات يبنى عند البدء

`ModuleEndpointDataSource` هو `EndpointDataSource` يضاف إلى التطبيق مرة واحدة فارغا. عند التفعيل، يعمل
`ICarterModule.AddRoutes()` الخاص بالوحدة على `ModuleRouteBuilder` خاص، داخل مجموعة مسارات `/api/{prefix}`. تدخل
نقاط النهاية الناتجة مصدر البيانات، فيطلق رمز التغيير، ويعاد بناء التوجيه دون إعادة تشغيل. ويزيلها إلغاء التفعيل
بالطريقة نفسها.

### 2. حاوية حقن التبعيات مجمدة بعد البدء

الوحدة المثبتة لاحقا لا تستطيع إضافة خدمات إلى حاوية المضيف. `ModuleContainer` **حاوية فوقية** لكل وحدة:

- تبنى خدمات الوحدة (`GreetingService` و`GreetingCounter` و`IOptions<GreetingOptions>`) في الحاوية الفوقية.
- ويأتي كل ما عدا ذلك (`ILogger` وإعدادات المضيف وخدمات الطلب ذات النطاق) من المضيف.
- تعمل كل نقطة نهاية للوحدة و`HttpContext.RequestServices` مضبوط على نطاق للوحدة فوق نطاق الطلب، فتعيش خدمات
  النطاق الخاصة بالوحدة طلبا واحدا بالضبط.
- **أي نوع يذكر نوعا من الوحدة يبنى دائما في الحاوية الفوقية**، حتى `ILogger<GreetingService>`. فحاوية المضيف
  تخزن كل نوع يطلب منها، وذلك التخزين سيبقي الوحدة في الذاكرة إلى الأبد.

### 3. هوية الأنواع عبر سياقات التحميل

تحمل كل وحدة في **`AssemblyLoadContext` قابل للجمع** خاص بها (`ModuleLoadContext`):

- أي تجميعة يشحنها المضيف (الإطار وCarter و`WebApi.Contracts`) تحل من المضيف. وإلا لكان `IRuntimeModule` في
  الوحدة نوعا مختلفا عن نوع المضيف، ولفشل كل تحويل.
- تحمل التبعيات الخاصة بالوحدة (تستخدم الوحدة النموذجية Humanizer) في سياقها الخاص، اعتمادا على ملف `.deps.json`.
- تحمل التجميعات **من البايتات**، فلا تقفل ملفات الحزمة أبدا ويمكن استبدالها.

### 4. يجب أن يتبع OpenAPI المسارات

يسجل مصدر البيانات أيضا كـ `IActionDescriptorChangeProvider`، ويشترك التطبيق عند البدء في `EndpointDataSource`
على مستوى حقن التبعيات. ودون هذا الاشتراك يحتفظ بأول قائمة نقاط نهاية رآها: فيتقادم OpenAPI وتبقى نقاط النهاية
القديمة في الذاكرة.

## الإعدادات

تنسخ القيم الافتراضية في البيان إلى التسجيل عند التثبيت. ويستطيع المسؤول استبدالها
(`PUT /api/admin/modules/{id}/settings`)؛ فتصل إلى `ConfigureServices` عند التحميل التالي. وإعادة التثبيت تحتفظ
بقيم المسؤول للمفاتيح التي لا تزال في الإصدار الجديد.

## ما لم يغط بعد

- جدول وحدات حقيقي بدلا من `modules.json`.
- التفويض على واجهة الإدارة؛ وتوقيع الحزم والتحقق منها.
- بث تغييرات الحالة لتتقارب كل النسخ (حدث `ModuleStateChanged` على الوسيط؛ والنسخ التي تبدأ لاحقا تقرأ الحالة
  المرغوبة عند الإقلاع).
- تشغيل ترحيلات EF Core الخاصة بالوحدة عند التفعيل، مرة واحدة، خلف قفل موزع.
- الخدمات ذات المفاتيح داخل الوحدات.
- استعادة تبعيات `.nupkg`: اشحن التبعيات في صيغة `.zip` بدلا من ذلك.
- تصريف الطلبات الجارية أثناء التفريغ.

نقاط النهاية وقواعد التحزيم: [مرجع واجهة وحدات التشغيل](/ar/reference/runtime-modules-api/).
