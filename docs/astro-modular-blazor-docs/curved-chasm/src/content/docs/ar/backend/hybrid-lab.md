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

## الموارد

| المورد | ما هو |
| --- | --- |
| `gateway` (المنفذ 5080) | YARP. يذهب `/api/sales/**` و`/api/greeting/**` إلى مجموعة sales؛ وكل ما عداهما إلى core. ويصل `/pools/{core\|sales\|worker}/**` إلى مجموعة واحدة مباشرة (للمختبر فقط) |
| `core-1`، `core-2` | مجموعة core، `Role=Api`، الوحدات: identity وtenancy (وحدات أساسية، مفعلة افتراضيا) وworkflow وinventory |
| `sales-1` … `sales-4` | مجموعة sales، `Role=Api`، الوحدات: sales وgreeting (الوحدة النموذجية تقوم مقام Sales) |
| `worker-1`، `worker-2` | مجموعة العمال، `Role=Worker`: تحمل الوحدات (خدمات ومستهلكون) دون مسارات، ولا يصل إليها أي مسار عام |
| `broker` | RabbitMQ مع واجهة الإدارة |
| `redis` | الذاكرة المؤقتة والأقفال ومفاتيح Data Protection وعدادات تحديد المعدل |
| `tenant-data` | PostgreSQL: `TenantStore` (HybirdTenants) و`tenant-acme` و`tenant-globex`، مع pgAdmin |

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

## ما الذي تحقق منه

| الفحص | النتيجة |
| --- | --- |
| موازنة البوابة | لكل طلب عبر النسخ: مع 12 طلبا لكل مجموعة، core 6/6، وsales 3/3/3/3، وworker 6/6 |
| الربط | تتلقى كل نسخة سلاسل الاتصال `broker` و`redis` و`TenantStore` |
| قواعد المجموعات | تفعيل `greeting` عبر نسخة من core جعل نسخ sales الأربع تحملها وتربط مساراتها، ونسختي العمال تحملانها دون مسارات، وترك core دون تحميل |
| تقارب البث | التثبيت والتفعيل وإلغاء التفعيل والإعدادات والتفريغ وإلغاء التثبيت عبر نسخة واحدة تقاربت على النسخ الثماني كلها؛ و8 طوابير مربوطة بـ `modules.state` |
| تبديل دون توقف | إعادة تثبيت مع تغيير إعدادات تحت الحمل: أعاد 300 من 300 طلب الرمز 200، وكانت الإعدادات الجديدة حية على كل نسخة |
| الذاكرة بعد التبديل | تبقى النسخ المحررة غالبا تحت `/api/admin/modules/unloading` لبعض الوقت؛ وأظهرت تفريغات الذاكرة لاحقا النسخة النشطة وحدها في كل نسخة |

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
- التحقق من JWT وتحديد المعدل وتحديد المستأجر في البوابة: موصوفة في البحث، ولم تضبط بعد.
- التوسع التلقائي (مجموعة sales حسب المعالج أو الطلبات) وتوسيع مجموعة العمال حسب تأخر الطوابير (مثل KEDA على طول
  طابور RabbitMQ).
