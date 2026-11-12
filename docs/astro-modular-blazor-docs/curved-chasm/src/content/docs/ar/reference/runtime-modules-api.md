---
title: واجهة وحدات التشغيل
description: نقاط نهاية الإدارة وإعدادات المجموعات وحقول البيان وقواعد التحزيم للوحدات المحملة والواجهة تعمل.
sidebar:
  order: 3
---

يعيش النموذج الأولي لوحدات التشغيل في `src/WebApi/WebApi`. كيف يعمل: [وحدات أثناء التشغيل](/ar/backend/runtime-modules/).

## نقاط نهاية الإدارة

يمكن أن يصل استدعاء دورة الحياة إلى أي نسخة. فيغير الحالة المرغوبة للوحدة في الفهرس المشترك، ويطبقها على تلك النسخة،
ويبث التغيير لتتقارب كل نسخة في كل مجموعة. **وتصف الاستجابة النسخة التي أجابت.**

يحتاج كل استدعاء إداري إلى الصلاحية `platform.modules.manage` (يملكها الدور `platform-admin`): **401** دون رمز، و**403** دون
الصلاحية. انظر [المصادقة: التنفيذ](/ar/backend/auth-implementation/).

| الطريقة والمسار | يفعل |
| --- | --- |
| `GET /api/admin/modules` | يسرد الوحدات المسجلة كما تراها هذه النسخة |
| `POST /api/admin/modules` | **التثبيت**: حقل نموذج متعدد الأجزاء `package` يحوي `.dll` أو `.zip` أو `.nupkg`. وإعادة تثبيت معرف موجود ترقية: تحتفظ بالحالة وتبدل كل نسخة إلى الإصدار الجديد |
| `POST /api/admin/modules/{id}/activate` | الحالة المرغوبة `Active`: تحميل، وبناء الخدمات، وربط المسارات (المسارات في مجموعات `Api` فقط) |
| `POST /api/admin/modules/{id}/deactivate` | الحالة المرغوبة `Inactive`: إزالة المسارات؛ وتبقى الوحدات المحملة محملة |
| `POST /api/admin/modules/{id}/unload` | الحالة المرغوبة `Installed`: إزالة المسارات، والتخلص من الخدمات، وتفريغ التجميعات في كل مكان |
| `PUT /api/admin/modules/{id}/settings` | استبدال الإعدادات (كائن JSON)؛ وتبدل النسخ التي حملت الوحدة إلى نسخة معاد ضبطها |
| `DELETE /api/admin/modules/{id}` | التفريغ في كل مكان، وحذف الحزمة، وإزالة التسجيل. و`409` للوحدة الأساسية |
| `GET /api/admin/modules/unloading` | النسخ المفرغة أو المستبدلة على هذه النسخة التي لم تحرر ذاكرتها بعد |

الأخطاء بصيغة problem details: `400` لحزمة أو بيان غير صالح، أو حين يجد التفعيل صلاحية غير مصرح بها أو متطلب تفويض معرفا
في الوحدة أو سياسة مسماة؛ و`404` لوحدة غير معروفة؛ و`409` حين تستخدم وحدة أخرى بادئة المسار، أو عند حذف وحدة أساسية أو
رفع حزمة فوقها؛ و`500` حين تكون ملفات الحزمة مفقودة.

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
| `GET /health` | فحص الصحة الذي تستخدمه البوابة والمنسق (دون دخول) |
| `GET /openapi/webapi.json` | مستند OpenAPI لنقاط النهاية المدمجة في المضيف (الإدارة و`/api/pool` و`/health`) |
| `GET /openapi/modules/{id}.json` | مستند OpenAPI لوحدة واحدة؛ و`404` ما لم تكن مساراتها مربوطة على هذه النسخة |
| `GET /openapi` | المستندات المتاحة الآن: `[{name, title, url, isDefault}]` |
| `GET /scalar` (ويحول `/` إليه) | مرجع واجهة Scalar، مع مبدل للمستندات نفسها |

نقاط نهاية OpenAPI وScalar متاحة دون دخول، وتوجد في بيئة التطوير، أو حين يضبط `OpenApi:Enabled=true`. وخلف مسارات البوابة
`/pools/{pool}/` تحمل عناوين المستندات تلك البادئة (من `X-Forwarded-Prefix`). كيف يعمل:
[وحدات أثناء التشغيل](/ar/backend/runtime-modules/).

## نقاط نهاية الوحدات الأساسية

| الوحدة | نقاط النهاية | الصلاحية |
| --- | --- | --- |
| `identity` | `GET /api/identity/me` (دون دخول؛ ومع صلاحيات المستدعي حين يكون مسجلا)، و`/users`، و`/users/{userName}` | مسجل الدخول |
| `identity` | `GET /api/identity/permissions` (الفهرس)، و`GET`/`POST /api/identity/grants`، و`DELETE /api/identity/grants/{id}` | `access.grants.manage` |
| `tenancy` | `GET /api/tenancy/tenants`، و`/tenants/{id}`، و`/current` | مسجل الدخول |
| `tenancy` | `POST /api/tenancy/tenants`، و`PATCH /api/tenancy/tenants/{id}`، و`POST /api/tenancy/tenants/{id}/provision` | `platform.tenants.manage` |

قواعد المستأجرين (الترويسات ورموز الحالة) في [المستأجرون وبياناتهم](/ar/backend/tenancy-data/).

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
| `OpenApi:Enabled` | `false` (مفعل في بيئة التطوير) | يخدم مستندات OpenAPI وScalar خارج بيئة التطوير |
| `Modules:CorePath` | `CoreModules` | مجلد حزم الوحدات الأساسية المشحونة مع الإصدار |
| `Auth:Authority` | لا شيء | خدمة الهوية (اكتشاف OIDC وJWKS). ودونها يطبق `Authentication:Schemes:Bearer` (`dotnet user-jwts`) |
| `Auth:Audience` | `modular-webapi` | جمهور الرمز المتوقع |
| `Access:Roles:{role}:N` | `platform-admin` ← كل صلاحيات المنصة | ربوط إضافية من الأدوار إلى الصلاحيات |
| `Access:Grants:N:{Tenant,UserId,Permission,Scope}` | لا شيء | منح للبذر حين لا يوجد مخزن مستأجرين |
| `ConnectionStrings:TenantStore` | لا شيء | مخزن المستأجرين (الدليل والمنح). ودونه يأتي المستأجرون من `Tenancy:Tenants` وتعيش المنح في الذاكرة |
| `ConnectionStrings:<server>`، `DatabaseServers:<server>:Provider` | المزود `PostgreSql` | خوادم قواعد البيانات التي تسميها صفوف المستأجرين؛ والمزودون `PostgreSql` و`SqlServer` و`MySql` و`Oracle` |
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
    public IReadOnlyList<PermissionDefinition> Permissions { get; init; } = [];
}
```

| الحقل | القاعدة |
| --- | --- |
| `Id` | أحرف لاتينية صغيرة `a-z` و`0-9` و`.` و`-`؛ ثابت عبر الإصدارات |
| `Version` | أحرف وأرقام و`.` و`+` و`-` |
| `RoutePrefix` | قاعدة `Id` نفسها؛ وفريد بين الوحدات المثبتة |
| `DefaultSettings` | مفاتيح إعداد مسطحة (`Section:Key`)؛ تنسخ إلى الفهرس عند التثبيت |
| `Permissions` | كل صلاحية تستخدمها نقاط نهايتها بـ `RequirePermission`؛ ويفشل التفعيل عند صلاحية غير مصرح بها |

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
    <ProjectReference Include="..\..\..\WebApi.Contracts\WebApi.Contracts.csproj" Private="false" ExcludeAssets="runtime" />
    <!-- Private dependency: loads into the module's own load context. -->
    <PackageReference Include="Humanizer.Core" Version="2.14.1" />
  </ItemGroup>
</Project>
```

تعيش الوحدات المخصصة في `src/WebApi/Modules/Custom/<Module>/`؛ والعقود في `src/WebApi/WebApi.Contracts/`، ولهذا يصعد
المرجع ثلاثة مجلدات. ويطبق `Modules/Custom/Directory.Build.props` على كل وحدة مخصصة. أما الوحدات ذات الطبقات
(`<Name>.Domain` و`.Application` و`.Infrastructure`، مثل `Custom/Inventory`) فتأخذ مراجعها من
`Modules/Directory.Build.props` بحسب لاحقة اسم المشروع، فتبقى ملفات مشاريعها شبه فارغة. وتعيش الوحدات الأساسية في
`Modules/Core/` وتشحن مع إصدار WebApi بدلا من ذلك؛ انظر [وحدات أثناء التشغيل](/ar/backend/runtime-modules/).

| صيغة الحزمة | المحتوى |
| --- | --- |
| `.zip` (موصى بها) | **محتويات** `bin/<Configuration>/net10.0`: ملف dll للوحدة و`.deps.json` والتبعيات الخاصة |
| `.dll` | تجميعة الوحدة وحدها؛ للوحدات التي لا تبعيات خاصة لها فقط |
| `.nupkg` | يستخدم `lib/<أعلى netX.Y>/`؛ ولا **تستعاد** تبعيات الحزمة |

إن كان المضيف يشحن تجميعة بالاسم نفسه، تستخدم نسخة المضيف، أيا كان الإصدار الذي بنيت عليه الوحدة.

## جربها

**نسخة واحدة:**

```bash
dotnet build src/WebApi/Modules/Custom/WebApi.Modules.Greeting
dotnet run --project src/WebApi/WebApi --launch-profile http
```

اضغط محتويات `src/WebApi/Modules/Custom/WebApi.Modules.Greeting/bin/Debug/net10.0` باسم `greeting.zip`، ثم:

```bash
curl -F "package=@greeting.zip" http://localhost:5298/api/admin/modules
curl -X POST http://localhost:5298/api/admin/modules/greeting/activate
curl http://localhost:5298/api/greeting/john_doe
```

يحوي `src/WebApi/WebApi/WebApi.http` كل الطلبات.

**المجموعات والنسخ:** شغل [مختبر البنية الهجينة](/ar/backend/hybrid-lab/) وأرسل الطلبات نفسها إلى البوابة،
`http://localhost:5080`.
