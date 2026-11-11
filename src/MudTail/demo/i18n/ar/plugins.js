// Arabic: the Plugins page.
export default {
  messages: {
    Plugins: 'الإضافات',
    'Extend MudTail with your own components, <code>data-mud</code> behaviours, icons, texts, styles and design tokens, in plain JavaScript with GSAP and Tailwind. A plugin is one object; <code>use(plugin)</code> installs it and <code>removePlugin(name)</code> undoes all of it. Its components work in vanilla JS (<code>createComponent</code>) and in Blazor (<code>create</code>, with <code>OnMudEvent</code>), like the built-in ones.':
      'وسّع MudTail بمكوّناتك وسلوكيات <code>data-mud</code> وأيقوناتك ونصوصك وأنماطك ورموز التصميم الخاصة بك، بلغة JavaScript المجردة مع GSAP وTailwind. الإضافة كائن واحد؛ يثبّتها <code>use(plugin)</code> ويلغي <code>removePlugin(name)</code> كل ما سجّلته. وتعمل مكوّناتها في JavaScript المجردة (<code>createComponent</code>) وفي Blazor (<code>create</code> مع <code>OnMudEvent</code>)، مثل المكوّنات المدمجة.',
    'Writing a plugin': 'كتابة إضافة',
    "Static parts (tokens, styles, icons, texts) are declared; components, behaviours and the plugin's API come from <code>setup(ctx, options)</code>. The context records everything it registers. A plugin loaded from a URL cannot <code>import 'mudtail'</code>, so <code>ctx.mudtail</code> (the whole API) and <code>ctx.gsap</code> are handed to it.":
      "تُعلَن الأجزاء الثابتة (الرموز والأنماط والأيقونات والنصوص)، وتأتي المكوّنات والسلوكيات وواجهة الإضافة البرمجية من <code>setup(ctx, options)</code>. ويسجّل السياق كل ما يضيفه. ولا تستطيع إضافة محمّلة من رابط أن تنفّذ <code>import 'mudtail'</code>، لذا يُسلَّم إليها <code>ctx.mudtail</code> (الواجهة كاملة) و<code>ctx.gsap</code>.",
    'Installing it and using its component': 'تثبيتها واستخدام مكوّنها',
    'The countdown plugin on this page, live. Remove it and its components, behaviour, icon, styles and tokens are gone; install it again and they come back. The second countdown raises <code>done</code> after a few seconds.':
      'إضافة العدّ التنازلي في هذه الصفحة، مباشرة. أزلها فتختفي مكوّناتها وسلوكها وأيقونتها وأنماطها ورموزها؛ وثبّتها من جديد فتعود. ويطلق العدّ الثاني الحدث <code>done</code> بعد ثوانٍ.',
    'Remove the plugin': 'إزالة الإضافة',
    'Install the plugin': 'تثبيت الإضافة',
    'Pause / resume all (plugin API)': 'إيقاف / استئناف الكل (واجهة الإضافة)',
    'Northbridge v Harbour City': 'نورثبريدج ضد هاربر سيتي',
    'Cup final: penalties': 'نهائي الكأس: ركلات الترجيح',
    'The second countdown ends after a few seconds and raises "done".': 'ينتهي العدّ الثاني بعد ثوانٍ ويطلق الحدث "done".',
    'The plugin is removed: its component, behaviour, icon, styles and tokens are gone. Install it again.': 'أُزيلت الإضافة: اختفى مكوّنها وسلوكها وأيقونتها وأنماطها ورموزها. ثبّتها من جديد.',
    'demo.plugins.done': 'الحدث "done" من {label}: المباراة مباشرة الآن.',
    'Its behaviour on markup rendered elsewhere, styled with Tailwind': 'سلوكها على ترميز أُنشئ في مكان آخر، بتنسيق Tailwind',
    "The plugin's <code>data-mud=\"countdown\"</code> behaviour starts on markup the server or Blazor rendered, also on elements that were there before the plugin loaded. The colours are Tailwind utilities made from the plugin's tokens (<code>bg-countdown-digit-bg</code>, <code>text-countdown-accent</code>, <code>gap-countdown-gap</code>), so they follow dark mode.":
      'يبدأ سلوك الإضافة <code>data-mud="countdown"</code> على الترميز الذي أنشأه الخادم أو Blazor، حتى على العناصر الموجودة قبل تحميل الإضافة. والألوان أدوات Tailwind مصنوعة من رموز الإضافة (<code>bg-countdown-digit-bg</code> و<code>text-countdown-accent</code> و<code>gap-countdown-gap</code>)، فتتبع الوضع الداكن.',
    'Evening kick-off': 'انطلاق المساء',
    "Tailwind: utilities from a plugin's tokens": 'Tailwind: أدوات من رموز الإضافة',
    "Tailwind runs when the app is built, so the app adds the plugin's theme to its stylesheet once. Colour tokens become colours; give a token <code>tailwind: 'spacing'</code>, <code>'radius'</code>, <code>'shadow'</code>… for other namespaces, or <code>false</code> for none. <code>@source</code> lets Tailwind see the classes the plugin's own files use.":
      "يعمل Tailwind عند بناء التطبيق، لذا يضيف التطبيق سمة الإضافة إلى ملف أنماطه مرة واحدة. وتصبح رموز الألوان ألوانًا؛ وأعطِ الرمز <code>tailwind: 'spacing'</code> أو <code>'radius'</code> أو <code>'shadow'</code>… لمجالات أخرى، أو <code>false</code> لاستبعاده. ويتيح <code>@source</code> لـTailwind رؤية الأصناف التي تستخدمها ملفات الإضافة.",
    'Shell / CSS': 'الطرفية / CSS',
    'Blazor: load a plugin and use it from C#': 'Blazor: تحميل إضافة واستخدامها من C#',
    "Ship the plugin file in a Razor class library's <code>wwwroot</code> and load it at runtime: the URL is resolved against the page. Its components go through the same <code>create</code> and <code>OnMudEvent</code> as the built-in ones, and the module's <code>dispose()</code> and <code>activeCount()</code> include them.":
      'ضع ملف الإضافة في <code>wwwroot</code> لمكتبة أصناف Razor وحمّله وقت التشغيل: يُحَلّ الرابط نسبةً إلى الصفحة. وتمر مكوّناتها عبر <code>create</code> و<code>OnMudEvent</code> نفسيهما كالمكوّنات المدمجة، وتشملها <code>dispose()</code> و<code>activeCount()</code> للوحدة.',
    'Plugin definition': 'تعريف الإضافة',
    'Lower-case name (optionally <code>@scope/name</code>), <code>x.y.z</code> version.': 'اسم بأحرف صغيرة (اختياريًا <code>@scope/name</code>)، وإصدار <code>x.y.z</code>.',
    "<code>{ mudtail: '^0.1.0', plugins: { other: '&gt;=1.0.0' } | ['other'] }</code>. Ranges: <code>^ ~ &gt;= &gt; &lt;= &lt; =</code>, several with spaces (all) or <code>||</code> (any).":
      "<code>{ mudtail: '^0.1.0', plugins: { other: '&gt;=1.0.0' } | ['other'] }</code>. النطاقات: <code>^ ~ &gt;= &gt; &lt;= &lt; =</code>، وعدة نطاقات بمسافات (كلها) أو <code>||</code> (أيّها).",
    '<code>{ key: value | { light, dark, tailwind? } }</code> → <code>--mud-&lt;key&gt;</code> on <code>:root</code> and the dark theme.':
      '<code>{ key: value | { light, dark, tailwind? } }</code> ← <code>--mud-&lt;key&gt;</code> على <code>:root</code> وفي السمة الداكنة.',
    'CSS, injected inside <code>@layer components</code> so Tailwind utilities still win (<code>setPluginStyleLayer</code> changes it).':
      'CSS يُحقن داخل <code>@layer components</code> لتبقى لأدوات Tailwind الغلبة (ويغيّره <code>setPluginStyleLayer</code>).',
    'Icons for <code>getIconSvg</code> (a Lucide icon node or inner SVG markup); texts per locale for <code>t()</code>.':
      'أيقونات لـ<code>getIconSvg</code> (عقدة أيقونة Lucide أو ترميز SVG داخلي)؛ ونصوص لكل لغة لـ<code>t()</code>.',
    '<code>{ name: factory }</code>, the same as <code>ctx.behavior</code> / <code>ctx.component</code>.': '<code>{ name: factory }</code>، مثل <code>ctx.behavior</code> / <code>ctx.component</code>.',
    "Returns the plugin's API (an object, its <code>dispose</code> runs on removal), a cleanup function, or a promise of either.":
      'تعيد واجهة الإضافة (كائنًا يُنفَّذ <code>dispose</code> فيه عند الإزالة)، أو دالة تنظيف، أو وعدًا بأيٍّ منهما.',
    'Context (ctx)': 'السياق (ctx)',
    '<code>factory(host, options, emit, ctx)</code> → a handle with <code>dispose()</code>. Built-in names are reserved.':
      '<code>factory(host, options, emit, ctx)</code> ← مقبض فيه <code>dispose()</code>. وأسماء المكوّنات المدمجة محجوزة.',
    '<code>factory(element, ctx)</code> → <code>{ dispose }</code> or <code>null</code>. Replacing a built-in one puts it back on removal.':
      '<code>factory(element, ctx)</code> ← <code>{ dispose }</code> أو <code>null</code>. واستبدال سلوك مدمج يعيده عند الإزالة.',
    'The same as the definition keys, at runtime. <code>styles</code> and <code>tokens</code> return a remover.': 'مثل مفاتيح التعريف، وقت التشغيل. ويعيد <code>styles</code> و<code>tokens</code> دالة إزالة.',
    "<code>'theme'</code>, <code>'locale'</code>, <code>'direction'</code> or any window event; <code>emit</code> raises <code>mud-plugin:&lt;name&gt;:&lt;event&gt;</code>.":
      "<code>'theme'</code> أو <code>'locale'</code> أو <code>'direction'</code> أو أي حدث للنافذة؛ ويطلق <code>emit</code> الحدث <code>mud-plugin:&lt;name&gt;:&lt;event&gt;</code>.",
    'The whole API, GSAP, the translator, and an <code>AbortSignal</code> aborted on removal.': 'الواجهة كاملة، وGSAP، والمترجم، و<code>AbortSignal</code> يُلغى عند الإزالة.',
    "Another plugin's API; <code>emit(name, payload)</code> for a <code>DotNetObjectReference</code> or callbacks; cleanup on removal; a disposable handle that Blazor's <code>dispose()</code> / <code>activeCount()</code> also see.":
      'واجهة إضافة أخرى؛ و<code>emit(name, payload)</code> لـ<code>DotNetObjectReference</code> أو للاستدعاءات؛ وتنظيف عند الإزالة؛ ومقبض قابل للتخلص تراه أيضًا <code>dispose()</code> / <code>activeCount()</code> في Blazor.',
    'Checks a definition when it is written; returns it frozen.': 'يفحص التعريف عند كتابته؛ ويعيده مجمّدًا.',
    'Installs; returns <code>{ name, version, api, ready, dispose }</code>. The same plugin twice is harmless.': 'يثبّت؛ ويعيد <code>{ name, version, api, ready, dispose }</code>. وتثبيت الإضافة نفسها مرتين لا يضر.',
    'Several in order; from a URL (resolved against the page) or a module, resolving after async setup.': 'عدة إضافات بالترتيب؛ من رابط (يُحَلّ نسبةً إلى الصفحة) أو وحدة، ويكتمل بعد الإعداد غير المتزامن.',
    'Undoes everything, disposes live components. Plugins that require it go first (or with <code>force</code>).': 'يلغي كل شيء ويتخلص من المكوّنات الحية. والإضافات التي تحتاجها تُزال أولًا (أو مع <code>force</code>).',
    'The API, a check, and <code>[{ name, version, description, components, behaviors }]</code>.': 'الواجهة، وفحص، و<code>[{ name, version, description, components, behaviors }]</code>.',
    '<code>onEvent</code>: <code>(name, payload) =&gt; …</code> or <code>{ eventName: handler }</code>.': '<code>onEvent</code>: <code>(name, payload) =&gt; …</code> أو <code>{ eventName: handler }</code>.',
    'A component without a plugin; returns the remover.': 'مكوّن دون إضافة؛ ويعيد دالة الإزالة.',
    'The <code>@theme inline</code> block for its tokens (the <code>mudtail-plugin-css</code> command writes it).': 'كتلة <code>@theme inline</code> لرموزها (يكتبها الأمر <code>mudtail-plugin-css</code>).',
    '<code>mud-plugin-installed</code>, <code>mud-plugin-removed</code> on <code>window</code>, detail <code>{ name, version }</code>.': '<code>mud-plugin-installed</code> و<code>mud-plugin-removed</code> على <code>window</code>، وتفاصيلهما <code>{ name, version }</code>.',
    'Blazor (mudtail.blazor.js)': 'Blazor (الملف mudtail.blazor.js)',
    'Load and install; resolve to the plugin descriptions.': 'تحميل وتثبيت؛ ويكتمل بأوصاف الإضافات.',
    'Plugin components too; <code>componentNames()</code> lists them after the built-in ones.': 'ومكوّنات الإضافات أيضًا؛ ويسردها <code>componentNames()</code> بعد المدمجة.',
    'The API as an <code>IJSObjectReference</code>, or one call returning its value.': 'الواجهة كـ<code>IJSObjectReference</code>، أو استدعاء واحد يعيد قيمته.',
    'List, remove, and <code>OnMudEvent("plugin", { action, name, version })</code>.': 'السرد والإزالة و<code>OnMudEvent("plugin", { action, name, version })</code>.',
  },
};
