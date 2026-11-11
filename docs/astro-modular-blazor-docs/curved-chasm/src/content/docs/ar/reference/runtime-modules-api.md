---
title: واجهة وحدات التشغيل
description: نقاط نهاية الإدارة وحقول البيان وقواعد التحزيم للوحدات المحملة والواجهة تعمل.
sidebar:
  order: 3
---

يعيش النموذج الأولي لوحدات التشغيل في `src/WebApi`. كيف يعمل: [وحدات أثناء التشغيل](/ar/backend/runtime-modules/).

## نقاط نهاية الإدارة

| الطريقة والمسار | يفعل |
| --- | --- |
| `GET /api/admin/modules` | يسرد الوحدات المسجلة: الحالة المرغوبة، ومحملة أم لا، والمسارات الحية |
| `POST /api/admin/modules` | **التثبيت**: حقل نموذج متعدد الأجزاء `package` يحوي `.dll` أو `.zip` أو `.nupkg` |
| `POST /api/admin/modules/{id}/activate` | يحمل عند الحاجة، ويبني الخدمات، ويربط المسارات |
| `POST /api/admin/modules/{id}/deactivate` | يزيل المسارات؛ وتبقى الوحدة محملة |
| `POST /api/admin/modules/{id}/unload` | يزيل المسارات، ويتخلص من الخدمات، ويفرغ التجميعات |
| `PUT /api/admin/modules/{id}/settings` | يستبدل الإعدادات (كائن JSON)؛ وتطبق عند التحميل التالي |
| `DELETE /api/admin/modules/{id}` | يفرغ، ويحذف الحزمة، ويزيل التسجيل |
| `GET /api/admin/modules/unloading` | الوحدات المفرغة التي لم تحرر ذاكرتها بعد |

الأخطاء بصيغة problem details: `400` لحزمة أو بيان غير صالح، و`404` لوحدة غير معروفة، و`409` حين تكون الوحدة ما
زالت محملة أو تكون بادئة مسارها مستخدمة.

تخدم نقاط نهاية الوحدات تحت `/api/{RoutePrefix}`.

## الحالات

| الحالة | المعنى | تستعاد عند البدء |
| --- | --- | --- |
| `Installed` | الحزمة محفوظة والبيان مسجل، ولا شيء محمل | لا |
| `Active` | محملة، والخدمات مبنية، والمسارات حية | نعم، تفعل من جديد |
| `Inactive` | المسارات أزيلت؛ وقد تبقى محملة حتى تفرغ | لا |

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
| `DefaultSettings` | مفاتيح إعداد مسطحة (`Section:Key`)؛ تنسخ إلى التسجيل عند التثبيت |

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
