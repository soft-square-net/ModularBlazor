---
title: جزر Blazor في Astro
description: سجل مكونات Blazor لتستدعى من JavaScript في مضيف جزر صغير، وركبها في صفحات Astro عند الحاجة مع بديل ثابت.
sidebar:
  order: 3
---

:::note[مقترح]
لا شيء مما في هذه الصفحة موجود في المستودع بعد. إنها وصفة مبنية على واجهات Blazor وAstro العامة. تحقق من
خيارات الإقلاع مقابل إصدار .NET المحدد في `Directory.Build.props` (net10.0) عند التنفيذ.
:::

## كيف يعمل

1. **مضيف جزر** صغير (مشروع Blazor WebAssembly) يسجل المكونات التي قد تظهر في الصفحات العامة باستخدام
   `RegisterForJavaScript`. ليس فيه موجه (Router) ولا عنصر `#app`.
2. ينشر في `/islands/` على الأصل نفسه الذي عليه موقع Astro.
3. يعرض مكون Astro اسمه `<BlazorIsland>` عنصرا مخصصا مع بديل ثابت. وحين يتحقق شرط `load` الخاص به، يبدأ
   بيئة Blazor (مرة واحدة لكل صفحة) ويستدعي `Blazor.rootComponents.add`.
4. حين يغادر العنصر الصفحة، يتخلص من المكون.

## لماذا مضيف منفصل

يضيف ملف `Program.cs` في العميل المكون `App` إلى `#app` ويحمل وحدات بدء التشغيل قبل أول عرض. وفي صفحة Astro لا
يوجد `#app`، ولا داعي لتنزيل القوالب ووحدة تسجيل الدخول من أجل أداة صغيرة. المضيف المنفصل يبقى صغيرا ويبدأ
بسرعة.

## 1. مضيف الجزر

```xml title="src/apps/blazor/ModularBlazor.Islands/ModularBlazor.Islands.csproj"
<Project Sdk="Microsoft.NET.Sdk.BlazorWebAssembly">
  <PropertyGroup>
    <!-- Same rule as the client: islands may call any framework API. -->
    <PublishTrimmed>false</PublishTrimmed>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.Components.WebAssembly" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="..\ModularBlazor.Infrastructure\ModularBlazor.Infrastructure.csproj" />
  </ItemGroup>
</Project>
```

```csharp title="src/apps/blazor/ModularBlazor.Islands/Program.cs"
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using soft.square.net.ModularBlazor.Infrastructure.Auth;

var builder = WebAssemblyHostBuilder.CreateDefault(args);

// Each island gets a name that Astro pages use. Parameters are passed as JSON from the page.
builder.RootComponents.RegisterForJavaScript<TodoSummary>(identifier: "todo-summary");
builder.RootComponents.RegisterForJavaScript<LeagueTable>(identifier: "league-table");

// The same typed API clients the client uses (ApiBaseUrl from appsettings.json).
builder.Services.AddApiClients(builder.Configuration["ApiBaseUrl"] ?? "http://localhost:5100");

await builder.Build().RunAsync();
```

مكونات الجزر مكونات Razor عادية. اجعلها مكتفية بذاتها: تأخذ مدخلاتها معاملات، وتعرض روابط بدلا من التنقل،
ولا تعتمد على قالب.

```razor title="TodoSummary.razor"
@inject IApiClient Api

<section class="mud-card">
  <h3 class="mud-card__title">@Title</h3>
  @if (_open is null) { <p>Loading…</p> }
  else { <p>@_open open tasks · <a href="/app/todo">Open the app</a></p> }
</section>

@code {
  [Parameter] public string Title { get; set; } = "My tasks";
  private int? _open;
  protected override async Task OnInitializedAsync() => _open = await Api.CountOpenTodosAsync(); // your API call
}
```

## 2. تشغيل البيئة من صفحة Astro

تحمل البيئة عند الطلب، مع `autostart="false"`، ويخبر Blazor بمكان ملفاته، لأن عنوان الصفحة ليس تحت
`/islands/`.

```ts title="src/lib/blazor.ts"
type BlazorApi = {
  start(options?: unknown): Promise<void>;
  rootComponents: {
    add(el: Element, name: string, params: Record<string, unknown>): Promise<{
      setParameters(p: Record<string, unknown>): Promise<void>;
      dispose(): Promise<void>;
    }>;
  };
};

const BASE = '/islands/';
let starting: Promise<BlazorApi> | undefined;

/** Loads and starts the islands host once per page; every island awaits the same promise. */
export function startBlazor(): Promise<BlazorApi> {
  return (starting ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${BASE}_framework/blazor.webassembly.js`;
    script.setAttribute('autostart', 'false');
    script.onerror = reject;
    script.onload = () => {
      const Blazor = (window as unknown as { Blazor: BlazorApi }).Blazor;
      Blazor.start({
        // Boot files come from /islands/_framework/, appsettings.json from /islands/.
        loadBootResource: (type: string, name: string) =>
          type === 'configuration' ? `${BASE}${name}` : `${BASE}_framework/${name}`,
      }).then(() => resolve(Blazor), reject);
    };
    document.head.append(script);
  }));
}
```

## 3. المكون `<BlazorIsland>`

```astro title="src/components/BlazorIsland.astro"
---
interface Props {
  /** Identifier given to RegisterForJavaScript. */
  component: string;
  /** Component parameters (JSON-serialisable). */
  params?: Record<string, unknown>;
  /** When to start: like client:load / client:idle / client:visible / client:media. */
  load?: 'eager' | 'idle' | 'visible' | 'media';
  media?: string;
}
const { component, params = {}, load = 'visible', media } = Astro.props;
---
<blazor-island data-component={component} data-params={JSON.stringify(params)} data-load={load} data-media={media}>
  <slot />
</blazor-island>

<script>
  import { startBlazor } from '../lib/blazor';

  class BlazorIsland extends HTMLElement {
    #instance?: { dispose(): Promise<void> };
    #cancel = () => {};
    #disconnected = false;

    connectedCallback() {
      const mount = () => this.#mount();
      switch (this.dataset.load) {
        case 'eager':
          mount();
          break;
        case 'idle': {
          const id = requestIdleCallback(mount);
          this.#cancel = () => cancelIdleCallback(id);
          break;
        }
        case 'media': {
          const mq = matchMedia(this.dataset.media ?? 'all');
          if (mq.matches) { mount(); break; }
          const onChange = () => { if (mq.matches) { mq.removeEventListener('change', onChange); mount(); } };
          mq.addEventListener('change', onChange);
          this.#cancel = () => mq.removeEventListener('change', onChange);
          break;
        }
        default: {
          const io = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) { io.disconnect(); mount(); }
          }, { rootMargin: '200px' });
          io.observe(this);
          this.#cancel = () => io.disconnect();
        }
      }
    }

    async #mount() {
      const Blazor = await startBlazor();
      if (this.#disconnected) return;
      this.replaceChildren(); // drop the static fallback; Blazor renders into the element
      this.#instance = await Blazor.rootComponents.add(
        this, this.dataset.component!, JSON.parse(this.dataset.params ?? '{}'));
    }

    disconnectedCallback() {
      this.#disconnected = true;
      this.#cancel();
      this.#instance?.dispose();
    }
  }

  customElements.define('blazor-island', BlazorIsland);
</script>
```

## 4. الاستخدام

```astro title="src/pages/sport/league.astro"
---
import Site from '../../layouts/Site.astro';
import BlazorIsland from '../../components/BlazorIsland.astro';
---
<Site title="League">
  <article>
    <h1>Premier division</h1>
    <p>Static article text, rendered at build time…</p>

    <BlazorIsland component="league-table" params={{ season: 2026 }} load="visible">
      <!-- Fallback: shown until the island starts, and to crawlers. -->
      <a href="/app/sport/league">See the full table</a>
    </BlazorIsland>
  </article>
</Site>
```

## وحدات وقت التشغيل

لا يعرف مضيف الجزر إلا المكونات التي بني معها. والمكونات الموجودة في **وحدة تحمل أثناء التشغيل**
(`Module.ToDo`، `Module.Reports`) لا يمكن تسجيلها مباشرة، لأن `RegisterForJavaScript` يحتاج النوع قبل بناء المضيف.
وهناك طريقان:

- **الإشارة إلى مشروع الوحدة** من مضيف الجزر. بسيط، لكن الجزيرة تشحن مع المضيف ولم تعد تتبع إصدارات الوحدة.
- **مكون عام `ModuleIsland`.** سجل مكونا واحدا (`"module-island"`) يأخذ معرف وحدة واسم نوع مكون، فينزل
  الوحدة ويعرض النوع عبر `DynamicComponent`. يتطلب ذلك محمل الوحدات الموجود اليوم في
  `ModularBlazor.Client/Services` (`ModuleManager.EnsureLoadedAsync`)، والذي يجب نقله أولا إلى مكتبة مشتركة مع
  قارئات الحزم ومخزن الأصول.

ابدأ بالخيار الأول، ولا تنتقل إلى الثاني إلا حين تحتاج عدة وحدات إلى جزر.

## قائمة التحقق

- [ ] مضيف الجزر منشور في `/islands/` على **الأصل نفسه** الذي عليه موقع Astro.
- [ ] ملف `appsettings.json` الخاص به يضبط `ApiBaseUrl`، والقائمة `Cors:Origins` في الواجهة البرمجية تتضمن أصل
  الموقع.
- [ ] كل جزيرة تعرض بديلا مفيدا في فتحتها.
- [ ] الجزر تعرض روابط بدلا من التنقل، وتمرر البيانات معاملات.
- [ ] MudTail ينسق الجزيرة: فهي تستخدم أصناف CSS نفسها التي يستخدمها باقي الصفحة.
