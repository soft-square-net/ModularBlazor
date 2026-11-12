---
title: مختبر البنية الهجينة
description: البنية المستهدفة نموذجا قابلا للتشغيل في .NET Aspire — بوابة YARP، وثلاث مجموعات وحدات من صورة واحدة، وRabbitMQ وRedis وPostgreSQL — وما قاسه.
sidebar:
  order: 5
---

يشغل `src/Aspire/Hybird` [البنية المستهدفة](/ar/backend/target-architecture/) على جهاز واحد. تنشر صورة واحدة
(`src/WebApi/WebApi`) كثلاث **مجموعات وحدات** خلف **بوابة YARP**، وتتشارك **RabbitMQ** و**Redis** و**PostgreSQL**.
وتصدر كل نسخة بيانات OpenTelemetry إلى لوحة Aspire.

```bash
dotnet run --project src/Aspire/Hybird --launch-profile http
```

تفتح اللوحة على `http://localhost:17888`؛ وتستمع البوابة على `http://localhost:5080`. ويلزم Docker لحاويات الوسيط
وRedis وPostgreSQL.

خوادم قواعد بيانات المستأجرين على المحركات الأخرى اختيارية، لأن صورها كبيرة (SQL Server 2022 بحجم 2.2 GB، وMySQL 9.7 بحجم
1.28 GB، وOracle Database Free بحجم 14.1 GB) ولأن Oracle بطيء البدء:

```bash
dotnet run --project src/Aspire/Hybird --launch-profile http -- --Lab:Engines=sqlserver,mysql,oracle
```

## الموارد

| المورد | ما هو |
| --- | --- |
| `gateway` (المنفذ 5080) | YARP. يذهب `/api/sales/**` و`/api/greeting/**` إلى مجموعة sales؛ وكل ما عداهما إلى core. ويصل `/pools/{core\|sales\|worker}/**` إلى مجموعة واحدة مباشرة (للمختبر فقط) |
| `core-1`، `core-2` | مجموعة core، `Role=Api`، الوحدات: identity وtenancy (وحدات أساسية، مفعلة افتراضيا) وworkflow وinventory |
| `sales-1` … `sales-4` | مجموعة sales، `Role=Api`، الوحدات: sales وgreeting (الوحدة النموذجية تقوم مقام Sales) |
| `worker-1`، `worker-2` | مجموعة العمال، `Role=Worker`: تحمل الوحدات (خدمات ومستهلكون) دون مسارات، ولا يصل إليها أي مسار عام |
| `broker` | RabbitMQ مع واجهة الإدارة |
| `redis` | الذاكرة المؤقتة والأقفال ومفاتيح Data Protection وعدادات تحديد المعدل |
| `tenant-data` | PostgreSQL: `TenantStore` (HybirdTenants: سجل المستأجرين والمنح، بالمخطط `platform`)، و`tenant-acme` و`tenant-globex` (قاعدة بيانات لكل مستأجر، ومخطط لكل وحدة فيها)، مع pgAdmin. وتتلقى النسخ `ConnectionStrings:TenantStore` والخادم نفسه كـ `ConnectionStrings:tenant-data`، الذي تسميه صفوف المستأجرين |
| `tenant-sql` و`tenant-mysql` و`tenant-oracle` (`Lab:Engines`) | خوادم SQL Server وMySQL وOracle Database Free اختيارية للمستأجرين. وتتلقى النسخ `ConnectionStrings:<server>` و`DatabaseServers:<server>:Provider` |
| `identity` (المنفذ 5090) | خدمة الهوية OpenIddict، بقاعدة البيانات `identity-db`. **في الفرع `claude/identity-service-da759e` فقط**؛ ولم تربط المجموعات بها بعد. انظر [المصادقة: التنفيذ](/ar/backend/auth-implementation/) |

المجموعة هي N نسخة من المشروع نفسه؛ والإعدادات وحدها تختلف:

```text
Modules__Pool        core | sales | worker
Modules__Role        Api | Worker
Modules__Enabled__N  the modules this pool applies
Modules__Path        App_Data/modules-catalog   one catalog for every pool
ConnectionStrings    broker, redis, TenantStore  injected by Aspire
```

يبين `GET /api/pool` (أو `GET /pools/{pool}/api/pool` عبر البوابة) أي مجموعة ودور ونسخة أجابت، وبأي اتصالات ربطت.

## جرب دورة حياة الوحدة عبر المجموعات

تحتاج واجهة الإدارة إلى رمز بالدور `platform-admin` (انظر رموز التطوير في [المصادقة: التنفيذ](/ar/backend/auth-implementation/))؛
أرسله بـ `-H "Authorization: Bearer $TOKEN"` في الاستدعاءات الإدارية أدناه.

```bash
# install and activate through the gateway: the call reaches one core replica
curl -F "package=@greeting.zip" http://localhost:5080/api/admin/modules
curl -X POST http://localhost:5080/api/admin/modules/greeting/activate

# the gateway routes /api/greeting to the sales pool; every sales replica serves it
curl http://localhost:5080/api/greeting/john_doe

# how each pool sees the module
curl http://localhost:5080/pools/core/api/admin/modules     # enabledInPool: false, not loaded
curl http://localhost:5080/pools/sales/api/admin/modules    # loaded, routes mapped
curl http://localhost:5080/pools/worker/api/admin/modules   # loaded, no routes
```

## OpenAPI وScalar لكل مجموعة

تولد مستندات OpenAPI لكل نسخة، فيعرض Scalar في كل مجموعة ما تربطه تلك المجموعة
([كيف يعمل](/ar/backend/runtime-modules/)):

| العنوان (البوابة، المنفذ 5080) | يعرض |
| --- | --- |
| `/scalar` | مجموعة core: `webapi` و`identity` و`tenancy` |
| `/pools/sales/scalar` | مجموعة sales: `webapi`، ومعها `greeting` ما دامت مفعلة |
| `/pools/{pool}/openapi` | قائمة المستندات التي تخدمها تلك المجموعة الآن |

ترسل مسارات `/pools/{pool}/**` الترويسة `X-Forwarded-Prefix: /pools/{pool}` وتعطل تحويل البادئة الافتراضي في YARP،
الذي كان سيكتب فوق تلك الترويسة. وتبنى عناوين المستندات وعناوين الخوادم من الترويسة، فيبقى "Try it" على المسار
`/pools/{pool}/...` نفسه.

## المستأجرون في المختبر

```bash
# by header, or by host name (the gateway forwards it as X-Forwarded-Host)
curl -H "X-Tenant: acme" http://localhost:5080/api/tenancy/current
curl -H "Host: acme.localhost" http://localhost:5080/api/tenancy/current

# create a tenant on the SQL Server engine (needs platform.tenants.manage)
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"id":"contoso","databaseServer":"tenant-sql"}' http://localhost:5080/api/tenancy/tenants
```

يحل `acme.localhost` و`globex.localhost` إلى 127.0.0.1 في معظم المتصفحات. كيف يعمل التحديد والتجهيز:
[المستأجرون وبياناتهم](/ar/backend/tenancy-data/).

## ما الذي تحقق منه

| الفحص | النتيجة |
| --- | --- |
| موازنة البوابة | لكل طلب عبر النسخ: مع 12 طلبا لكل مجموعة، core 6/6، وsales 3/3/3/3، وworker 6/6 |
| الربط | تتلقى كل نسخة سلاسل الاتصال `broker` و`redis` و`TenantStore` |
| قواعد المجموعات | تفعيل `greeting` عبر نسخة من core جعل نسخ sales الأربع تحملها وتربط مساراتها، ونسختي العمال تحملانها دون مسارات، وترك core دون تحميل |
| تقارب البث | التثبيت والتفعيل وإلغاء التفعيل والإعدادات والتفريغ وإلغاء التثبيت عبر نسخة واحدة تقاربت على النسخ الثماني كلها؛ و8 طوابير مربوطة بـ `modules.state` |
| تبديل دون توقف | إعادة تثبيت مع تغيير إعدادات تحت الحمل: أعاد 300 من 300 طلب الرمز 200، وكانت الإعدادات الجديدة حية على كل نسخة |
| الذاكرة بعد التبديل | تبقى النسخ المحررة غالبا تحت `/api/admin/modules/unloading` لبعض الوقت؛ وأظهرت تفريغات الذاكرة لاحقا النسخة النشطة وحدها في كل نسخة |
| تحديد المستأجر | `X-Tenant: acme` و`Host: acme.localhost` يحددان acme كلاهما؛ وتكتب البوابة فوق `X-Forwarded-Host` الذي يرسله العميل؛ والمستأجر المجهول يحصل على 404، ومسار الوحدة الذي يشترط مستأجرا دون مستأجر على 400 |
| قاعدة بيانات لكل مستأجر | رحلت `inventory`، المرفوعة إلى مجموعة core، مخططها إلى `tenant-acme` و`tenant-globex` عند التفعيل؛ وبقيت الصفوف منفصلة على نسختي core |
| التجهيز | أنشأ `POST /api/tenancy/tenants` القاعدة `tenant-initech`؛ ورحلت إليها نسختا core، وعرفت نسخ sales الأربع (التي لا تحمل `tenancy`) المستأجر initech عبر `tenants.changed` |
| التعليق | أعطى `PATCH …/initech {"status":"Suspended"}` الرمز 403 على core وكل نسخ sales، بالترويسة واسم المضيف؛ وأعاد `Active` الرمز 200 |
| أربعة محركات | خدمت inventory 1.2.0 (مجموعة ترحيلات لكل محرك) مستأجرين على PostgreSQL وSQL Server (contoso) وMySQL (umbrella) وOracle (hooli وpiedpiper) على نسختي core؛ واكتشف هنا خلل ORA-00955 في Oracle وأصلح بالمصادقة بالوكالة |
| وحدة ذات طبقات | التقطت inventory 1.1.1 (Domain / Application / Infrastructure، وArdalis على EF Core 10) مخططها وبياناتها الموجودة؛ وأعطت قواعد النطاق 409؛ وفرغت دورتان كاملتان على النسختين |
| إعادة التشغيل | بقي المستأجرون، ومنهم المجهزون، بعد إعادة تشغيل المختبر (وحدة تخزين Postgres) |
| خدمة الهوية (فرع) | client credentials، وCode مع PKCE، والتجديد، وتبديل المستأجر، والمنتقي، ورفض غير الأعضاء، ورمز المنصة، ورفض واجهة الإدارة بـ 403، وإلغاء رموز التجديد عند التعليق والإزالة، والدعوة والقبول، ورفض `RequireMfa` |

## دروس في التصميم

### وازن لكل طلب، لا لكل اتصال

كل نسخة مورد مستقل في Aspire، وللبوابة وجهة لكل نسخة. استخدمت النسخة الأولى `WithReplicas` في Aspire، التي تضع النسخ
خلف عنوان وكيل واحد، مثل خدمة ClusterIP في Kubernetes. فرأى YARP وجهة واحدة، وثبت اتصاله الدائم المجمع **100 %**
من الحركة على نسخة واحدة.

يتبع الإنتاج القاعدة نفسها المطبقة على [gRPC](/ar/backend/deployment-scenarios/): أعط YARP (أو شبكة الخدمات) عناوين
الحاويات، عبر خدمة headless أو اكتشاف الخدمات، لا عنوانا افتراضيا يوازن على مستوى الاتصال.

### الاستدعاءات الإدارية تصل إلى نسخة واحدة، فيجب بث الحالة

قبل البث، كان التثبيت أو التفعيل عبر البوابة يصل إلى نسخة واحدة، فيعيد `/api/greeting` الرمز 404 على ثلاث من نسخ
sales الأربع. والحل هو الفهرس المشترك مع بث `ModuleStateChanged` الموصوف في
[وحدات أثناء التشغيل](/ar/backend/runtime-modules/).

## ما لا يمثل محليا

- شبكة CDN لملفات `_framework` في Blazor WebAssembly، والعميل نفسه (انظر `src/Aspire/Host`).
- TLS الطرفي وجدار حماية التطبيقات.
- فحص الرموز وتحديد المعدل في البوابة: لم يضبطا بعد. تفحص كل نسخة الرموز وتحدد المستأجر بنفسها؛ ولا تفعل البوابة سوى
  تمرير اسم المضيف.
- التوسع التلقائي (مجموعة sales حسب المعالج أو الطلبات) وتوسيع مجموعة العمال حسب تأخر الطوابير (مثل KEDA على طول
  طابور RabbitMQ).
