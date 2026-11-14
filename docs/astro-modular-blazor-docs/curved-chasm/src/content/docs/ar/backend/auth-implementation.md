---
title: "المصادقة: التنفيذ"
description: ما بني حتى الآن من تصميم المصادقة — فحص المضيف لرموز JWT، والصلاحيات والمنح محددة المدة، وفحوص تفعيل الوحدات، وخدمة الهوية OpenIddict.
sidebar:
  order: 12
---

تتابع هذه الصفحة ما **نفذ** من [تصميم المصادقة والتفويض](/ar/backend/auth-design/).

| خطوة التصميم | الحالة |
| --- | --- |
| 1. خدمة الهوية (OpenIddict) في Aspire؛ وJwtBearer والسياسة الاحتياطية وحماية واجهة الإدارة في المضيف | جانب المضيف **منجز** (في `main`). وخدمة الهوية **مدمجة في `main` ومتحقق منها**، وربط Authority للمجموعات موجود |
| 2. `RequirePermission` وصلاحيات البيان وفحص التفعيل؛ واختبار تفريغ ذاكرة السياسات | **منجز** |
| 3. وسيط المستأجر، وفحص العضوية، وتقييد الاشتراكات | وسيط المستأجر **منجز** ([المستأجرون وبياناتهم](/ar/backend/tenancy-data/)). وفحص العضوية لكل طلب وتقييد الاشتراكات لم ينجزا بعد |
| 4. مخزن المنح، و`IAccessScopes`، وتحويل المطالبات | **منجز** |
| 5. وحدتا المناوبات والمحتوى | بُنيت الوحدات الأولية؛ والتطوير الوظيفي هو الخطوة التالية |
| 6. فجوات بيئة التشغيل لـ Elsa (الخدمات المستضافة، وخط المعالجة الفرعي، وإعلان التفريغ) | منفذة في `claude/module-hosted-services-c8094b`؛ أما وحدة خادم Elsa نفسها فما زالت لاحقة |

## المضيف (`src/WebApi/WebApi`)

تفحص كل نسخة الرموز ولها الكلمة الأخيرة؛ وتبحث الصلاحيات على الخادم، ولا تحمل في الرمز أبدا.

```text
request ─► UseRouting ─► UseAuthentication (JwtBearer) ─► UseTenancy (tenant + claim check) ─► UseAuthorization ─► endpoint
                                                                                                 │
              PermissionRequirement ─► IAccessScopes ─► GrantCache (per tenant+user, 5 min, cleared via "access.grants.changed")
                                                            └─► platform.access_grants (tenant store) │ in memory without a store
```

| الجزء | المكان | ما هو |
| --- | --- | --- |
| `RequirePermission(...)` و`PermissionRequirement` و`PlatformClaims` و`PlatformRoles` و`PlatformPermissions` و`AccessScope` و`GrantSources` و`IAccessScopes` و`IGrantStore` و`IPermissionCatalog` و`ModuleManifest.Permissions` | `WebApi.Contracts/Security` | كل ما تراه الوحدة. أنواع المضيف فقط، فلا شيء في خط التفويض يمسك الوحدة |
| JwtBearer، والسياسة الاحتياطية، ومعالج الصلاحيات، وذاكرة المنح ومخزنها، والإبطال عبر الوسيط | `WebApi/Security` | `builder.AddPlatformSecurity("broker")`؛ و`app.UseRouting(); app.UsePlatformSecurity();` |
| فحوص التفعيل | `Modularity/ModuleAuthorization.cs` | يفشل التفعيل (400) عند صلاحية غير مصرح بها، أو نوع متطلب معرف في الوحدة، أو سياسة مسماة |
| إدارة المنح، وفهرس الصلاحيات، و`/me` مع الصلاحيات | الوحدة الأساسية `identity` 1.1.0 | `GET`/`POST /api/identity/grants`، و`DELETE /grants/{id}` (`access.grants.manage`)، و`GET /permissions` |

### الرموز

- يشير `Auth:Authority` إلى خدمة الهوية (اكتشاف OIDC وJWKS)؛ وقيمة `Auth:Audience` الافتراضية `modular-webapi`.
- تحويل المطالبات الواردة معطل، فيقرأ المضيف `sub` و`tenant` و`role` كما صدرت تماما.
- دون جهة إصدار، يطبق القسم القياسي `Authentication:Schemes:Bearer`: وهو ما يكتبه `dotnet user-jwts` للتطوير.

### آمن افتراضيا

تحتاج كل نقطة نهاية إلى مستدع مسجل الدخول ما لم تستدع `AllowAnonymous()`. والمتاح دون دخول اليوم: `/health`، ومستندات
OpenAPI وScalar (حيث تفعل)، و`/api/identity/me`.

### الصلاحيات والمنح

- **فحص نقطة النهاية (عام):** يملك المستدعي الصلاحية في نطاق ما من مستأجر الطلب، أو عبر دور منصة.
- **الفحوص لكل مورد شيفرة في الوحدة:**
  `IAccessScopes.HasPermissionAsync(permission, [AccessScope.Press(p), AccessScope.Category(c)])`. وتستخدم مرشحات القوائم
  `ScopesAsync(permission)`؛ وتأتي حقوق مستخدم آخر (المسند إليه مثلا) من `UserHasPermissionAsync`.
- **المنحة** مستأجر × مستخدم × صلاحية × نطاق (`tenant` و`press:{id}` و`category:{id}`)، مع `validFrom`/`validTo` اختياريين
  (UTC) ومصدر (`standing` أو `shift:{id}`).
- **تقيم النوافذ وقت الفحص**، فتبدأ منحة المناوبة وتنتهي بالساعة دون أي حدث للذاكرة المؤقتة.
- ينشر `IGrantStore.ReplaceSourceAsync` جدول مناوبات في معاملة واحدة؛ وينهي `EndAsync` منح مستخدم من مصدر ما مبكرا (تسجيل
  الخروج).
- **لا يمكن منح صلاحيات المنصة** (400)، إلا `access.grants.manage` التي يحتاجها مسؤولو المستأجرين.
- **التخزين:** `platform.access_grants` في مخزن المستأجرين، مع ترحيلات `AddAccessGrants` للمحركات الأربعة. ودون مخزن، تكون
  المنح في الذاكرة، تبذر من `Access:Grants:N:{Tenant,UserId,Permission,Scope}`.

### أدوار المنصة ونقاط النهاية المحمية

- يملك `platform-admin` كل صلاحيات المنصة (`platform.modules.manage` و`platform.tenants.manage` و`access.grants.manage`) في
  أي مستأجر ودون مستأجر. وتأتي الربوط الأخرى من `Access:Roles:{role}:N`.
- يحتاج `/api/admin/modules` إلى `platform.modules.manage`؛ ويحتاج إنشاء المستأجرين وتحديثهم إلى `platform.tenants.manage`؛
  وتحتاج واجهة المنح إلى `access.grants.manage`.

### في الوحدة

```csharp
public ModuleManifest Manifest { get; } = new("content", "Content", "1.0.0", "content")
{
    Permissions =
    [
        new PermissionDefinition("content.author", "Write and submit articles"),
        new PermissionDefinition("content.publish", "Publish approved articles")
    ]
};

app.MapPost("/{id}/publish", PublishAsync).RequirePermission("content.publish");   // any of several: RequirePermission("a", "b")
```

تظهر الصلاحيات المصرح بها في فهرس الصلاحيات (`GET /api/identity/permissions`). واستخدام صلاحية لا يصرح بها البيان، أو تعريف
`IAuthorizationRequirement` في الوحدة، أو استخدام سياسة مسماة، يفشل التفعيل: فتلك الأنواع ستخزنها خطوط التفويض في المضيف
وتبقي الوحدة في الذاكرة.

### رموز التطوير

```bash
dotnet user-jwts create --project src/WebApi/WebApi --name admin --role platform-admin
dotnet user-jwts create --project src/WebApi/WebApi --name editor1 --claim tenant=acme
```

لرموز `user-jwts` قيمة `aud` مضبوطة على عناوين ملف التشغيل (`http://localhost:5298` و`https://localhost:7276`). والنسخ على
منافذ أخرى تحتاج إلى `--audience` أو `Authentication:Schemes:Bearer:ValidAudiences`.

### ما تحقق منه

على مضيف مستقل (المنفذ 5298)، والمنح في الذاكرة وفي PostgreSQL:

- تعيد واجهة الإدارة 401 دون دخول، و403 لمحرر، و200 لـ `platform-admin`؛ وتعيد كتابات المستأجرين 403 لمحرر.
- رمز لـ `acme` مع `X-Tenant: globex` يحصل على 403.
- تسري المنح المضافة والملغاة في الطلب التالي؛ والمنحة التي يقع `validFrom` لها في المستقبل لا تسري بعد؛ ومنح صلاحية منصة
  يعيد 400.
- رفضت وحدة اختبار (400) لصلاحية غير مصرح بها، ثم لنوع متطلب خاص بها. وخدمت النسخة المصرح بها 403، ثم 200 بعد المنحة،
  وفرغت بعد ذلك.
- عمل ترحيل `AddAccessGrants` على PostgreSQL (وترحيلات SQL Server وMySQL وOracle موجودة لكنها لم تشغل).

## خدمة الهوية

خدمة الهوية مدمجة في `main` (المشروع `src/WebApi/Identity/WebApi.Identity.Server`) وتعمل كعملية Aspire مستقلة. في مختبر Hybird تظهر على `http://localhost:5090/` وتستخدمها مجموعات WebApi بوصفها جهة الإصدار. وتبقى خدمة الهوية خارج محمل وحدات التشغيل.

OpenIddict (خادم التفويض) مع ASP.NET Core Identity (الحسابات)، في عملية مستقلة بقاعدة بيانات خاصة، ولا تكون أبدا وحدة
تشغيل. تملك الحسابات العامة، وعضويات المستأجرين، وسياسة أمان المستأجر، وإصدار الرموز. ولا تملك الصلاحيات ولا المنح:
فالمضيف يبحث عنها.

| ما هو | القيمة في مختبر Hybird |
| --- | --- |
| جهة الإصدار (`iss`) | `http://localhost:5090/` (الإعداد `Identity:Issuer`؛ والشرطة المائلة الأخيرة جزء منه) |
| الجمهور (`aud`) | `modular-webapi` |
| الاكتشاف، وJWKS | `/.well-known/openid-configuration`، و`/.well-known/jwks` |
| التفويض، والرمز | `/connect/authorize`، و`/connect/token` |
| معلومات المستخدم، وإنهاء الجلسة، والإلغاء | `/connect/userinfo`، و`/connect/endsession`، و`/connect/revoke` |

رموز الوصول JWT موقعة (RS256، `typ: at+jwt`)، غير مشفرة، صالحة 10 دقائق. ورموز التجديد صالحة 14 يوما وتدور مع كل استخدام.
وتتحقق منها خوادم الموارد بـ `JwtBearer` و`MapInboundClaims = false`، و`RequireHttpsMetadata = false` في المختبر.

### العملاء والمطالبات

| العميل | النوع | التدفقات |
| --- | --- | --- |
| `blazor-client` | عام | Authorization Code مع PKCE (إلزامي)، ورمز التجديد؛ النطاقات `openid profile email offline_access api` |
| `elsa-workflows` | سري | client credentials؛ النطاق `api` |

| المطالبة | المعنى |
| --- | --- |
| `sub` | معرف المستخدم العام، نفسه في كل مستأجر |
| `tenant` | المستأجر الوحيد الذي صدر له الرمز؛ ولا يغيب إلا في رمز المنصة ورموز client credentials |
| `role` | أدوار المنصة فقط (`platform-admin`)؛ وتبقى أدوار المستأجر عضويات |
| `name`، `email` | اسم العرض (ملف المستأجر أولا) وبريد الحساب |
| `amr` | كيف سجل المستخدم الدخول، مصفوفة JSON (`["pwd"]`، أو مع `"mfa"`) |

لا تحمل الرموز أبدا صلاحيات ولا صحفا ولا فئات ولا مناوبات.

### التدفقات

- **الدخول لمستأجر:** يسمي طلب التفويض المستأجر (`tenant=acme`، أو `login_hint=tenant:acme`). والعضوية النشطة الوحيدة تختار
  نفسها؛ والعضويات المتعددة تذهب إلى منتقي المستأجر؛ وانعدامها لا يعطي رمزا إلا لمستخدم له دور منصة (*رمز منصة* دون
  `tenant`).
- **يفحص الإصدار** الحساب (غير مقفل)، وعضوية **نشطة**، وسياسة أمان المستأجر. والفشل خطأ OAuth مثل `access_denied` مع وصف.
- **التجديد** يفحص كل شيء من جديد.
- **تبديل المستأجر:** طلب التفويض من جديد بالمستأجر الآخر و`prompt=none`؛ دون كلمة مرور، وزوج رموز جديد مرتبط بذلك المستأجر.
- **سياسة أمان المستأجر:** يرفض `RequireMfa` لكل مستأجر إصدار الرموز ما لم يستخدم الدخول المصادقة متعددة العوامل. العلم يعمل؛
  أما التسجيل في المصادقة متعددة العوامل وخطوة العامل الثاني فلم تبن بعد.

### واجهة إدارة العضويات

يستدعيها `platform-admin` لأي مستأجر، أو عضو `tenant-admin` نشط برمز لذلك المستأجر.

| الطريقة والمسار | يفعل |
| --- | --- |
| `GET /api/admin/tenants/{tenant}/members` | يسرد الأعضاء |
| `POST /api/admin/tenants/{tenant}/members` | يدعو بالبريد (الحالة `Invited`)؛ ويقبل المستخدم على `/Account/Invitations` |
| `POST …/members/{userId}/suspend` | يعلق **ويلغي رموز التجديد والرموز المؤقتة لذلك المستأجر** |
| `POST …/members/{userId}/activate` | يعيد تنشيط عضو معلق |
| `DELETE …/members/{userId}` | يزيل العضوية والملف، ويلغي رموز المستأجر |
| `PUT /api/admin/tenants/{tenant}` | اسم العرض و`RequireMfa` (لمسؤول المنصة فقط) |

تبقى رموز الوصول الصادرة صالحة حتى تنتهي (10 دقائق على الأكثر)؛ ويسد فحص العضوية لكل طلب في المضيف، الذي لم يبن بعد،
هذه الفجوة.

### البيانات والحسابات والمفاتيح

- قاعدة بيانات PostgreSQL باسم `identity` (مورد Aspire `identity-db` على الخادم `tenant-data`)، بالمخطط `identity`: جداول
  Identity وOpenIddict مع `TenantMemberships` و`TenantProfiles` و`Tenants` (السياسة). Npgsql فقط: للخدمة قاعدة بيانات واحدة
  خاصة بها ولا تستخدم `WebApi.Data`.
- حسابات التطوير (`Identity:Seed`): `admin@modular.local` (platform-admin، دون عضويات)، و`editor@modular.local` (acme وglobex)،
  و`acme-admin@modular.local` (tenant-admin في acme).
- مفاتيح التوقيع: شهادات تطوير محليا. ويحتاج الإنتاج إلى مفاتيح من خزنة مفاتيح مع تدوير عبر JWKS، وإلى مفاتيح Data Protection
  في Redis قبل تشغيل أكثر من نسخة (مهمة لاحقة).

**تحقق** في مختبر Hybird الكامل: client credentials، وCode مع PKCE، والتجديد، وتبديل المستأجر بـ `prompt=none`، ومنتقي
المستأجر، ورفض غير الأعضاء، ورمز مسؤول المنصة، ورفض واجهة الإدارة بـ 403، وإلغاء رموز التجديد عند التعليق والإزالة، والدعوة
والقبول، ورفض `RequireMfa`.

## OAuth في Scalar بمختبر Hybird

يستخدم Scalar العميل العام `scalar-client` مع تدفق Authorization Code وPKCE، دون سر عميل. يسجل المستخدم الدخول في خدمة الهوية المستقلة، ثم يستبدل Scalar رمز التفويض برمز وصول ويرفقه بطلبات واجهة المجموعة المختارة.

```text
المتصفح / واجهة Scalar                   خدمة الهوية                    YARP ← مجموعة WebApi
http://localhost:5080/.../scalar/         http://localhost:5090          http://localhost:5080
       │                                          │                               │
       ├─ انتقال /connect/authorize ────────────►│                               │
       │◄─ تسجيل الدخول ثم إعادة الرمز ──────────┤                               │
       ├─ POST /connect/token مع PKCE (fetch) ──►│                               │
       │◄─ access_token (JWT) ────────────────────┤                               │
       ├─ طلب API مع Authorization: Bearer ────────────────────────────────────►│
       │                                          │                تحقق JWT والتفويض
```

تختلف قواعد المتصفح بين الانتقال إلى صفحة الدخول وطلب الرمز:

| الإعداد | ما الذي يطابقه | مثال مختبر Hybird |
| --- | --- | --- |
| أصل CORS المسموح | المخطط والمضيف والمنفذ فقط لكود المتصفح | `http://localhost:5080` (إدخال واحد يغطي مسارات Scalar الجذر والمجموعات) |
| عنوان إعادة OAuth | عنوان الاستدعاء كاملا، بما فيه المسار | `http://localhost:5080/scalar/` أو `http://localhost:5080/pools/sales/scalar/` |

الانتقال العلوي إلى `/connect/authorize` لا تمنعه CORS. لكن طلب JavaScript من Scalar إلى `/connect/token` عابر للأصول، ولذلك يجب السماح بأصل البوابة في CORS لخدمة الهوية. كما يجب تسجيل عنوان إعادة التوجيه المطابق تماما للعميل `scalar-client`.

### روابط Scalar في النشر A وB

في السيناريو A افتح Scalar عبر البوابة الثابتة، عادة `http://localhost:5080/scalar/`. وفي السيناريو B استخدم مسار المجموعة، مثل `http://localhost:5080/pools/sales/scalar/` أو `/pools/worker/scalar/`. سجل عنوان إعادة التوجيه الكامل المطابق لكل مدخل Scalar. لا تعتمد عنوان نسخة Aspire مثل `http://localhost:65033/scalar/` كعنوان ثابت؛ فقد يتغير المنفذ بعد إعادة التشغيل. تبقى البوابة ثابتة وتوجه YARP الطلب إلى المجموعة.

إعداد CORS الحالي للتطوير:

```json
{
  "Cors": {
    "AllowedOrigins": [ "http://localhost:5080" ]
  }
}
```

يجب أن يتضمن تسجيل عميل Scalar عناوين إعادة التوجيه الدقيقة للجذر والمجموعات. هذه القيم المحلية خاصة بمختبر Hybird؛ اضبط أصل HTTPS وعناوين إعادة التوجيه الفعلية لكل نشر عميل، ولا تستخدم أصولا أو عناوين عامة بنجمة.

### تشخيص أخطاء Scalar

- **ظهور “Failed to fetch” بعد الدخول:** افحص لوحة Network في المتصفح. إذا فشل `/connect/token` بسبب CORS فأضف أصل Scalar الدقيق إلى قائمة السماح في خدمة الهوية. وإذا كانت الاستجابة 400 فقارن `redirect_uri` بالتسجيل حرفيا، بما في ذلك المخطط والمنفذ والمسار والشرطة المائلة الأخيرة.
- **401 من واجهة محمية:** لم يرفق Scalar رمز وصول صالحا أو رفضت الواجهة جهة الإصدار أو الجمهور أو التوقيع أو الصلاحية. أعد التفويض وافحص ترويسة الطلب `Authorization: Bearer` ونص الاستجابة.
- **403 من واجهة محمية:** قُبل الرمز لكن لا يحمل الصلاحية أو النطاق المطلوب.
- **تغير المنفذ بعد إعادة التشغيل:** استخدم أصل البوابة الثابت ومسار المجموعة، ولا تحفظ عنوان نسخة عشوائي.

## ما لم يبن بعد

- التحقق من عضوية المستأجر لكل طلب في WebApi، مع نشر الإلغاء من خدمة الهوية.
- قوالب منح المناوبات وتكامل سير عمل Elsa؛ التسجيل في MFA؛ وإدارة مفاتيح توقيع الإنتاج وتدويرها.
- لا يلزم فحص JWT في البوابة لصحة النظام لأن كل مجموعة WebApi تتحقق من الرموز بنفسها. يمكن إضافة فحص البوابة كطبقة طرفية إضافية، مع إبقاء فرض التفويض داخل واجهة الخدمة المستقبلة.
