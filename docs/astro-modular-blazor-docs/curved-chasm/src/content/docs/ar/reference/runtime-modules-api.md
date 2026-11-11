---
title: واجهة وحدات التشغيل
description: نقاط نهاية الإدارة وإعدادات المجموعات وحقول البيان وقواعد التحزيم للوحدات المحملة والواجهة تعمل.
sidebar:
  order: 3
---

يعيش النموذج الأولي لوحدات التشغيل في `src/WebApi`. كيف يعمل: [وحدات أثناء التشغيل](/ar/backend/runtime-modules/).

## نقاط نهاية الإدارة

يمكن أن يصل استدعاء دورة الحياة إلى أي نسخة. فيغير الحالة المرغوبة للوحدة في الفهرس المشترك، ويطبقها على تلك النسخة،
ويبث التغيير لتتقارب كل نسخة في كل مجموعة. **وتصف الاستجابة النسخة التي أجابت.**

| الطريقة والمسار | يفعل |
| --- | --- |
| `GET /api/admin/modules` | يسرد الوحدات المسجلة كما تراها هذه النسخة |
| `POST /api/admin/modules` | **التثبيت**: حقل نموذج متعدد الأجزاء `package` يحوي `.dll` أو `.zip` أو `.nupkg`. وإعادة تثبيت معرف موجود ترقية: تحتفظ بالحالة وتبدل كل نسخة إلى الإصدار الجديد |
| `POST /api/admin/modules/{id}/activate` | الحالة المرغوبة `Active`: تحميل، وبناء الخدمات، وربط المسارات (المسارات في مجموعات `Api` فقط) |
| `POST /api/admin/modules/{id}/deactivate` | الحالة المرغوبة `Inactive`: إزالة المسارات؛ وتبقى الوحدات المحملة محملة |
| `POST /api/admin/modules/{id}/unload` | الحالة المرغوبة `Installed`: إزالة المسارات، والتخلص من الخدمات، وتفريغ التجميعات في كل مكان |
| `PUT /api/admin/modules/{id}/settings` | استبدال الإعدادات (كائن JSON)؛ وتبدل النسخ التي حملت الوحدة إلى نسخة معاد ضبطها |
| `DELETE /api/admin/modules/{id}` | التفريغ في كل مكان، وحذف الحزمة، وإزالة التسجيل |
| `GET /api/admin/modules/unloading` | النسخ المفرغة أو المستبدلة على هذه النسخة التي لم تحرر ذاكرتها بعد |

الأخطاء بصيغة problem details: `400` لحزمة أو بيان غير صالح، و`404` لوحدة غير معروفة، و`409` حين تستخدم وحدة أخرى
بادئة المسار، و`500` حين تكون ملفات الحزمة مفقودة.

تخدم نقاط نهاية الوحدات تحت `/api/{RoutePrefix}`.

### استجابة الحالة

يعيد `GET /api/admin/modules` والتفعيل وإلغاء التفعيل `ModuleStatus`:

| الحقل | المعنى |
| --- | --- |
| `module` | سجل الفهرس: المعرف والاسم والإصدار وبادئة المسار والتجميعة الرئيسية والإعدادات و`desiredState` و`installedAt` |
| `pool` | قيمة `Modules:Pool` للنسخة التي أجابت |
| `instance` | `machine:process` لتلك النسخة |
| `enabledInPool` | هل تطبق تلك المجموعة هذه الوحدة (`Modules:Enabled`) |
| `loaded` | هل الوحدة محملة على تلك النسخة |
| `routes` | مساراتها الحية على تلك النسخة، مثل `GET /api/greeting/{name}` |

ويعيد التفريغ وإلغاء التثبيت `{ id, unloaded, gcPasses, note }` للنسخة التي أجابت.

## نقاط نهاية أخرى في المضيف

| المسار | يفعل |
| --- | --- |
| `GET /api/pool` | المجموعة والدور والوحدات المفعلة ومعرف النسخة التي أجابت، مع أسماء سلاسل اتصالها (لا قيمها أبدا) |
| `GET /health` | فحص الصحة الذي تستخدمه البوابة والمنسق |
| `GET /openapi/v1.json` | مستند OpenAPI (في بيئة التطوير)، ويشمل مسارات الوحدات المفعلة |

## الحالات

| الحالة | المعنى | عند البدء |
| --- | --- | --- |
| `Installed` | الحزمة محفوظة والبيان مسجل، ولا شيء محمل | تبقى غير محملة |
| `Active` | محملة، والخدمات مبنية، والمسارات حية في مجموعات `Api` | تحمل وتربط مساراتها من جديد |
| `Inactive` | المسارات أزيلت؛ وتبقى محملة حيث كانت محملة | لا تحمل |

## الإعدادات

| المفتاح | الافتراضي | المعنى |
| --- | --- | --- |
| `Modules:Path` | `App_Data/modules` | مجلد الفهرس (`modules.json` وملف القفل والحزم). يجب أن تشير كل نسخة في كل مجموعة إلى المجلد نفسه |
| `Modules:RoutePrefix` | `/api` | المسار الأساسي لنقاط نهاية الوحدات |
| `Modules:Pool` | `all` | اسم المجموعة |
| `Modules:Role` | `Api` | `Api` يربط المسارات؛ و`Worker` يحمل الوحدات دون مسارات |
| `Modules:Enabled` | فارغ (الكل) | معرفات الوحدات التي تطبقها المجموعة، مثل `Modules__Enabled__0=sales` |
| `ConnectionStrings:broker` | لا شيء | اتصال RabbitMQ؛ حين يضبط، تبث تغييرات دورة الحياة على مبادلة البث `modules.state` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | لا شيء | حين يضبط، تصدر التتبعات والمقاييس والسجلات عبر OTLP (تضبطه لوحة Aspire) |

## العقد

```csharp
public interface IRuntimeModule
{
    ModuleManifest Manifest { get; }
    void ConfigureServices(IServiceCollection services, IConfiguration settings);
}

public sealed record ModuleManifest(string Id, string Name, string Version, string RoutePrefix)
{
    public string? Description { get; init; }
    public IReadOnlyDictionary<string, string?> DefaultSettings { get; init; }
}
```

| الحقل | القاعدة |
| --- | --- |
| `Id` | أحرف لاتينية صغيرة `a-z` و`0-9` و`.` و`-`؛ ثابت عبر الإصدارات |
| `Version` | أحرف وأرقام و`.` و`+` و`-` |
| `RoutePrefix` | قاعدة `Id` نفسها؛ وفريد بين الوحدات المثبتة |
| `DefaultSettings` | مفاتيح إعداد مسطحة (`Section:Key`)؛ تنسخ إلى الفهرس عند التثبيت |

تحوي الحزمة **صنفا واحدا فقط** عاما وغير مجرد يطبق `IRuntimeModule` وله منشئ بلا معاملات. وتأتي نقاط النهاية من
أصناف `ICarterModule` فيها. الخدمات ذات المفاتيح غير مدعومة بعد.

## تحزيم وحدة

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <!-- Copies private dependencies to the output and writes the .deps.json the loader uses. -->
    <EnableDynamicLoading>true</EnableDynamicLoading>
  </PropertyGroup>
  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
    <!-- Shared with the host: compile against them, never ship them. -->
    <PackageReference Include="Carter" Version="10.0.0" ExcludeAssets="runtime" />
    <ProjectReference Include="..\WebApi.Contracts\WebApi.Contracts.csproj" Private="false" ExcludeAssets="runtime" />
    <!-- Private dependency: loads into the module's own load context. -->
    <PackageReference Include="Humanizer.Core" Version="2.14.1" />
  </ItemGroup>
</Project>
```

| صيغة الحزمة | المحتوى |
| --- | --- |
| `.zip` (موصى بها) | **محتويات** `bin/<Configuration>/net10.0`: ملف dll للوحدة و`.deps.json` والتبعيات الخاصة |
| `.dll` | تجميعة الوحدة وحدها؛ للوحدات التي لا تبعيات خاصة لها فقط |
| `.nupkg` | يستخدم `lib/<أعلى netX.Y>/`؛ ولا **تستعاد** تبعيات الحزمة |

إن كان المضيف يشحن تجميعة بالاسم نفسه، تستخدم نسخة المضيف، أيا كان الإصدار الذي بنيت عليه الوحدة.

## جربها

**نسخة واحدة:**

```bash
dotnet build src/WebApi.Modules.Greeting
dotnet run --project src/WebApi --launch-profile http
```

اضغط محتويات `src/WebApi.Modules.Greeting/bin/Debug/net10.0` باسم `greeting.zip`، ثم:

```bash
curl -F "package=@greeting.zip" http://localhost:5298/api/admin/modules
curl -X POST http://localhost:5298/api/admin/modules/greeting/activate
curl http://localhost:5298/api/greeting/john_doe
```

يحوي `src/WebApi/WebApi.http` كل الطلبات.

**المجموعات والنسخ:** شغل [مختبر البنية الهجينة](/ar/backend/hybrid-lab/) وأرسل الطلبات نفسها إلى البوابة،
`http://localhost:5080`.
