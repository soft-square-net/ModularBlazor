---
title: المستأجرون وبياناتهم
description: كيف يحدد مضيف WebApi مستأجر كل طلب، ويحفظ دليل المستأجرين، ويعطي كل مستأجر قاعدة بيانات خاصة على PostgreSQL أو SQL Server أو MySQL أو Oracle، ويرحل مخططات الوحدات عند التفعيل.
sidebar:
  order: 10
---

تصف هذه الصفحة ما **نفذ** في `src/WebApi`. والتصميم الذي يقوم عليه في [تعدد المستأجرين عبر المجموعات](/ar/backend/multitenancy/)
وفي [مذكرة تصميم المصادقة](/ar/backend/auth-design/).

يحدد المضيف مستأجر كل طلب، على كل نسخة في كل مجموعة. وتملك الوحدة الأساسية `tenancy` جانب الإدارة: الكتابة في مخزن
المستأجرين وتجهيز قواعد البيانات. والمجموعات التي لا تحمل `tenancy` (sales والعمال) تعرف كل المستأجرين مع ذلك، لأنها تقرأ
مخزن المستأجرين بنفسها.

```text
request ─► host middleware (Tenancy/): X-Tenant header, then host name (X-Forwarded-Host), then the token's "tenant" claim
              │                         └─ tenant directory: TenantStore (schema "platform"), in memory per replica,
              │                            reloaded on startup, every 5 min and on the broker fanout "tenants.changed"
              ├─► ITenantContext (scoped, host) ─► any module service injects it (the module scope falls back to the host)
              └─► module endpoint ─► waits until the module is initialized for this tenant (migrations), then runs
```

## أين تعيش الأجزاء

| الجزء | المكان | ما هو |
| --- | --- | --- |
| `ITenantContext` و`TenantInfo` و`ITenantDirectory` و`ITenantInitializer` و`IModuleActivation` و`.TenantOptional()` و`CreateTenantScope(...)` و`TenancyNames` | `WebApi.Contracts/Tenancy` | كل ما تراه الوحدة. يشحنه المضيف، فهوية النوع واحدة ولا شيء يمسك الوحدة |
| `TenantDbContext` و`AddTenantDbContext<T>()` و`EfRepository<T>` و`TenantStoreDbContext` و`TenantDatabases` و`DatabaseProviderAdapter` و`ProviderMigrationsAssembly` | `WebApi.Data` (يشحنه المضيف: EF Core 10 مع أربعة مزودين، وArdalis.Specification.EntityFrameworkCore) | طبقة البيانات المشتركة بين الوحدات. تبنى الوحدات عليها ولا تشحنها أبدا |
| `ITenantOwned` وأصناف الكيانات الأساسية و`IRepository<T>` / `IReadRepository<T>` | `WebApi.SharedKernel` (يشحنه المضيف، دون EF) | انظر [وحدات أثناء التشغيل](/ar/backend/runtime-modules/) |
| الوسيط، وذاكرة الدليل، وناقل `tenants.changed`، وتهيئة الوحدة لكل مستأجر | `WebApi/Tenancy` | `builder.AddPlatformTenancy("broker")`؛ و`app.UseRouting(); app.UseTenancy();` |
| إدارة الدليل، والتجهيز، والبذر (acme وglobex) | الوحدة الأساسية `tenancy` | تكتب في مخزن المستأجرين، ثم `ITenantDirectory.NotifyChangedAsync` |

## قواعد التحديد

- ترويسة `X-Tenant` هي الغالبة. وإن سمى اسم المضيف مستأجرا مختلفا، يحصل الطلب على **400**.
- مع رمز، يجب أن تطابق مطالبة `tenant` مستأجر الطلب (**403**)، أو تكون هي المستأجر حين لا يسمي الطلب أحدا.
- المستأجر المجهول يحصل على **404**، والمعلق على **403**.
- تحتاج نقاط نهاية الوحدات إلى مستأجر (**400** دونه) ما لم تكن `.TenantOptional()`. ونقاط نهاية المضيف لا تحتاج إليه
  أبدا. والوحدات `greeting` و`identity` و`tenancy` لا تشترط المستأجر حاليا.
- دون مخزن مستأجرين (نسخة محلية واحدة، دون `ConnectionStrings:TenantStore`)، يقرأ الدليل `Tenancy:Tenants` من الإعدادات،
  وتعيد نقاط الكتابة في tenancy الرمز 503.

## قاعدة بيانات لكل مستأجر، ومخطط لكل وحدة

- يسمي صف المستأجر **خادما** (اسم سلسلة اتصال، مثل `tenant-data`) وقاعدة بيانات؛ ولا أسرار في المخزن.
- يتصل `TenantDbContext` الخاص بالوحدة بقاعدة بيانات المستأجر الحالي. وتبقى جداول الوحدة منفصلة فيها (مخطط خاص بها، أو
  بادئة للجداول على MySQL وOracle)، مع جدول تاريخ ترحيلات خاص بها.
- صفوف `ITenantOwned` تختم بالمستأجر، وترشح به (مرشح استعلام عام)، ويرفض حفظها لمستأجر آخر: دفاع متعدد الطبقات الآن،
  ويبقى خيار قاعدة البيانات المشتركة مفتوحا.

### الترحيلات عند التفعيل

يسجل `AddTenantDbContext<T>()` مكون `ITenantInitializer` يرحل مخطط الوحدة:

- لكل مستأجر نشط، حين تحمل الوحدة على نسخة؛
- لمستأجر واحد، حين ينشأ أو يعاد تنشيطه.

ويعمل خلف قفل المحرك نفسه لكل (قاعدة بيانات مستأجر، سياق)، فترحل النسخ واحدة تلو الأخرى. وينتظر طلب الوحدة حتى 30 ثانية
لتهيئة مستأجره؛ والفشل يعطي **503** ويعاد في الطلب التالي. وتثبيت الوحدة يحفظ الحزمة فقط: لا شيء يعمل حتى تفعل.

### أمان التفريغ مع EF Core

تحصل كل وحدة على مزود خدمات EF داخلي خاص بها (`TenantEfServices`، واحد لكل محرك، يتخلص منه مع الوحدة)، فلا تدخل ذاكرات
النماذج والاستعلامات في EF، ومفاتيحها أنواع الوحدة، إلى ذاكرة EF على مستوى العملية. وتستدعي بيئة التشغيل
`IModuleLifecycleObserver` (`Loaded` / `ReleasingAsync`)؛ فيلغي المهيئ عمله وينتظره قبل التخلص من حاوية الوحدة. المزيد في
[تفريغ وحدات التشغيل](/ar/backend/runtime-module-unloading/).

## أربعة محركات قواعد بيانات

يمكن أن تعيش قواعد بيانات المستأجرين، ومخزن المستأجرين، على أي من أربعة محركات، ولكل منها مزود EF Core 10 يشحنه المضيف:

| المحرك | المزود | قاعدة بيانات المستأجر | جداول الوحدة | قفل الترحيل |
| --- | --- | --- | --- | --- |
| PostgreSQL | `Npgsql.EntityFrameworkCore.PostgreSQL` 10.0.3 | قاعدة بيانات | المخطط `<module>` | `pg_advisory_lock` |
| SQL Server | `Microsoft.EntityFrameworkCore.SqlServer` 10.0.14 | قاعدة بيانات | المخطط `<module>` | `sp_getapplock` |
| MySQL | `MySql.EntityFrameworkCore` 10.0.12 (من Oracle) | قاعدة بيانات | البادئة `<module>_` | `GET_LOCK` |
| Oracle | `Oracle.EntityFrameworkCore` 10.23.26400 | مستخدم مخطط فقط، يدخل عبر حساب الخادم (مصادقة بالوكالة) | البادئة `<module>_` | `DBMS_LOCK` |

- **الخوادم إعدادات:** `ConnectionStrings:<server>` مع `DatabaseServers:<server>:Provider` (و`PostgreSql` إن لم يضبط). ويستخدم
  مخزن المستأجرين `DatabaseServers:TenantStore:Provider`.
- **يمكن أن يكون مستأجرو النشر الواحد على محركات مختلفة.** ينشئ `POST /api/tenancy/tenants
  {"id":"contoso","databaseServer":"tenant-sql"}` قاعدة البيانات (وعلى Oracle مستخدم المخطط)، ثم ترحل إليها كل وحدة نشطة.
  والخادم المجهول يعطي 400.
- **اختلافات المحركات في مكان واحد:** يتولى `DatabaseProviderAdapter` سلاسل الاتصال، وتسجيل EF، وإنشاء قاعدة البيانات، والقفل،
  وعزل الوحدات.
- **لماذا هذه الحزم:** يتوقف مزود Pomelo لـ MySQL عند EF Core 9، لذا يستخدم MySQL حزمة `MySql.EntityFrameworkCore` من Oracle.
  وثبت `System.Security.Cryptography.Pkcs` على 10.0.15 لأن الإصدار المتعدي 9.0.11 فيه ثغرات معروفة.

### Oracle: المصادقة بالوكالة

اختار التصميم الأول مخطط المستأجر بـ `ALTER SESSION SET CURRENT_SCHEMA`. فانكسر في المختبر: يبحث مزود Oracle في EF عن جدول
تاريخه في `USER_TABLES`، الذي يسرد جداول المستخدم *المسجل دخوله*، فلم تر النسخة الثانية جدول التاريخ، وحاولت إنشاءه من
جديد، وفشلت بـ ORA-00955 في كل محاولة.

تسجيل الدخول كمستخدم المستأجر، عبر حساب الخادم (`User Id=<TENANT>; Proxy User Id=<server account>`)، يجعل مخطط الجلسة نفسه
مخطط المستأجر. ينشئ التجهيز المستخدم، ويمنحه `CREATE SESSION` و`TABLE` و`SEQUENCE` و`VIEW` و`PROCEDURE` و`TRIGGER`، و
`GRANT CONNECT THROUGH <server account>`. وهو متساوي الأثر: يعيد `POST /api/tenancy/tenants/{id}/provision` تشغيله كخطوة
إصلاح.

### مجموعة ترحيلات لكل محرك

- تشحن الترحيلات داخل تجميعة الوحدة، مجموعة لكل محرك: `Migrations/<Provider>/` بالمساحة `….Migrations.<Provider>`. ويستبدل
  `ProviderMigrationsAssembly` مكون `IMigrationsAssembly` في EF ولا يبقي إلا مجموعة المحرك (ولقطة نموذجه) الذي تعمل عليه
  قاعدة بيانات المستأجر.
- يشغل `src/WebApi/scripts/Add-Migration.ps1` الأمر `dotnet ef migrations add` مرة لكل محرك، ويتجاوز سلوكين في dotnet-ef يكسران
  وجود عدة مجموعات في مشروع واحد (اللقطة التي يحدثها، ومكان كتابة أول لقطة):

```powershell
./src/WebApi/scripts/Add-Migration.ps1 -Project src/WebApi/Modules/Custom/Inventory/WebApi.Modules.Inventory.Infrastructure -Name <Name>
```

- **تبقى الحزم صغيرة:** مراجع الوحدات إلى المشاريع التي يشحنها المضيف تحمل `ExcludeAssets="runtime;native"`، فلا تنسخ مكتبات
  عملاء المزودين أبدا إلى حزمة الوحدة.

### ملاحظات للإنتاج

- Oracle: يحتاج حساب الخادم إلى `CREATE USER` و`ALTER USER` و`GRANT ANY PRIVILEGE` و`EXECUTE` على `DBMS_LOCK` (يستخدم
  المختبر SYSTEM). ويحتاج التجهيز على SQL Server إلى `CREATE DATABASE`.
- تحقق في التشغيل: قواعد بيانات المستأجرين على المحركات الأربعة. أما مخزن المستأجرين على SQL Server وMySQL وOracle فمولد
  ومفحوص النموذج فقط؛ ويبقيه المختبر على PostgreSQL.
- جهز بحساب ذي صلاحيات، واخدم المستأجرين بحساب بأقل الصلاحيات (لم يمثل بعد).

## إضافة بيانات مستأجرين إلى وحدة

الوحدة النموذجية هي `Modules/Custom/Inventory`.

1. سم مشروع الدخول `*.Infrastructure` (أو استورد `WebApi.Data/SharedData.props`).
2. اشتق من `TenantDbContext`: اضبط `Schema`، واضبط النموذج في `ConfigureModel`.
3. استدع `services.AddTenantDbContext<T>()`. وهذا يسجل أيضا `IRepository<T>` و`IReadRepository<T>`.
4. أضف `IDesignTimeDbContextFactory` يعيد
   `new MyContext(TenantDbDesignTime.Options<MyContext>(args), TenantDbDesignTime.Tenant)`.
5. أضف الترحيلات، مجموعة لكل محرك، بـ `Add-Migration.ps1`.

## العمل خارج الطلب

تستدعي مجموعات العمال والمستهلكون والمهام `moduleServices.CreateTenantScope(tenantId)` للحصول على نطاق وحدة مرتبط بذلك
المستأجر. وتحمل الرسائل المستأجر في الترويسة `tenant` (`TenancyNames.MessageHeader`)؛ وتمر مهام المنصة على
`ITenantDirectory.All`. أما مستهلكو الوحدات وخدماتها المستضافة نفسها فلا تدعمها بيئة التشغيل بعد.

## قرارات

- **دون Finbuckle.** الطبقة الداخلية صغيرة، ومخازن Finbuckle المسجلة عند البدء وإعداداته لكل مستأجر وتركيزه على قاعدة
  البيانات المشتركة لا تناسب بيئة تحمل الوحدات لاحقا. ولا ترى الوحدات إلا `ITenantContext`، فيمكن استبداله لاحقا.
- **Elsa (وحدة سير العمل المستقبلية):** معرف المستأجر في Elsa هو معرف مستأجر المنصة. يقرأ `ITenantResolver` في Elsa
  `ITenantContext`، ويقرأ `ITenantsProvider` الدليل `ITenantDirectory`، وتحدث الوحدة مستأجري Elsa عند `tenants.changed`.
  ويحتفظ Elsa بقاعدة بيانات مشتركة خاصة به بأعمدة `TenantId`، ويجب أن يعمل على إصدار EF Core الخاص بالمضيف.

## ما لم يغط بعد

تفعيل الوحدات لكل مستأجر (الخطط)، وإعدادات الوحدة لكل مستأجر، وحذف مخطط الوحدة عند إلغاء تثبيتها.
