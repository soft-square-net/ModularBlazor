// Arabic: the Loading and Progress component pages.
const SUBLABELS = {
  possession: 'الاستحواذ',
  'pass accuracy': 'دقة التمرير',
  'shots on target': 'تسديدات على المرمى',
  rating: 'التقييم',
  tickets: 'التذاكر',
  passes: 'تمريرات',
};

export default {
  messages: {
    ...SUBLABELS, // on their own too: an update rewrites the ring's label, and only its <small> is translated then
    // ── Loading ──
    Loading: 'التحميل',
    'Loading…': 'جارٍ التحميل…',
    'Spinners, skeleton placeholders, a loading overlay, busy buttons and a page-top loader. Pick the pattern by what the reader is waiting for (see the first example). Every animation slows or stops for <code>prefers-reduced-motion</code>.':
      'مؤشرات دوّارة، وهياكل مؤقتة، وطبقة تحميل، وأزرار مشغولة، وشريط تحميل أعلى الصفحة. اختر النمط بحسب ما ينتظره القارئ (انظر المثال الأول). وتبطؤ كل حركة أو تتوقف مع <code>prefers-reduced-motion</code>.',
    'Which loading pattern?': 'أي نمط تحميل تختار؟',
    'Suggested use for each component.': 'الاستخدام المقترح لكل مكوّن.',
    Skeleton: 'الهيكل المؤقت',
    'First load of a content area (article lists, cards, a profile). The layout does not jump when the content arrives.':
      'التحميل الأول لمنطقة محتوى (قوائم المقالات، البطاقات، ملف شخصي). لا يقفز التخطيط عند وصول المحتوى.',
    Spinner: 'المؤشر الدوّار',
    'Short waits in a small place: a widget, a dropdown, a "load more" button.': 'انتظار قصير في مكان صغير: أداة، أو قائمة منسدلة، أو زر «تحميل المزيد».',
    Overlay: 'طبقة التحميل',
    'Refreshing content that is already on screen (a table, a chart): it stays visible, dimmed.': 'تحديث محتوى معروض بالفعل (جدول، رسم بياني): يبقى ظاهرًا لكن باهتًا.',
    'Busy button': 'الزر المشغول',
    'A form or action is being sent: prevents a second click.': 'نموذج أو إجراء قيد الإرسال: يمنع النقرة الثانية.',
    'Page loader': 'شريط تحميل الصفحة',
    'Moving between pages or modules (Blazor navigation, lazy-loaded DLLs).': 'الانتقال بين الصفحات أو الوحدات (تنقل Blazor، ومكتبات DLL المحمّلة عند الطلب).',
    'Progress bar': 'شريط التقدّم',
    'When the amount is known: uploads, steps, reading or match progress.': 'عندما يكون المقدار معروفًا: الرفع، والخطوات، وتقدّم القراءة أو المباراة.',
    Spinners: 'المؤشرات الدوّارة',
    'Ring, dots, bars (an equaliser, for live audio or a live match) and pulse (a "live" beacon). Colour them with a tone class.':
      'حلقة، ونقاط، وأعمدة (معادل صوت، للبث الصوتي أو المباراة المباشرة)، ونبض (منارة «مباشر»). لوّنها بصنف درجة لونية.',
    LIVE: 'مباشر',
    'Size, line width and colours': 'الحجم وعرض الخط والألوان',
    'Set <code>--mud-spinner-size</code>, <code>--mud-spinner-width</code>, <code>--mud-spinner-color</code> and <code>--mud-spinner-track</code>, or pass them to <code>createSpinner()</code>.':
      'اضبط <code>--mud-spinner-size</code> و<code>--mud-spinner-width</code> و<code>--mud-spinner-color</code> و<code>--mud-spinner-track</code>، أو مرّرها إلى <code>createSpinner()</code>.',
    'Skeleton: an article card while it loads': 'الهيكل المؤقت: بطاقة مقال أثناء تحميلها',
    'Shapes: <code>--text</code>, <code>--title</code>, <code>--circle</code>, <code>--rect</code>, <code>--media</code> (16:9). Add <code>--pulse</code> for a fade instead of the shimmer.':
      'الأشكال: <code>--text</code>، <code>--title</code>، <code>--circle</code>، <code>--rect</code>، <code>--media</code> (16:9). أضف <code>--pulse</code> لتلاشٍ بدل اللمعان.',
    Reload: 'إعادة التحميل',
    Photo: 'صورة',
    CULTURE: 'ثقافة',
    'The new wing of the City Gallery opens its doors': 'الجناح الجديد في معرض المدينة يفتح أبوابه',
    'Three floors of contemporary work, and a rooftop sculpture garden.': 'ثلاثة طوابق من الأعمال المعاصرة، وحديقة منحوتات على السطح.',
    'Loading overlay': 'طبقة التحميل',
    'Dims a container that is being refreshed, with a spinner and optional text. Its children are not touched, and it sets <code>aria-busy</code>.':
      'تُعتّم حاوية قيد التحديث، مع مؤشر دوّار ونص اختياري. لا تمسّ عناصرها الداخلية، وتضبط <code>aria-busy</code>.',
    'Premier division': 'الدرجة الممتازة',
    Ridgeway: 'ريدجواي',
    'Old Town': 'المدينة القديمة',
    Refresh: 'تحديث',
    'Dots spinner': 'مؤشر النقاط',
    'Updating scores…': 'جارٍ تحديث النتائج…',
    'Busy buttons': 'الأزرار المشغولة',
    "A spinner over the button's content, which keeps its width; the button is disabled until it is done.":
      'مؤشر دوّار فوق محتوى الزر الذي يحتفظ بعرضه؛ ويبقى الزر معطّلًا حتى تنتهي العملية.',
    'Save article': 'حفظ المقال',
    Saved: 'تم الحفظ',
    'A thin bar at the top of the window while a page or module loads. <code>start()</code> creeps towards 90 %, <code>done()</code> completes it; calls nest.':
      'شريط رفيع أعلى النافذة أثناء تحميل صفحة أو وحدة. <code>start()</code> يتقدّم ببطء نحو 90٪، و<code>done()</code> يكمله؛ والاستدعاءات متداخلة.',
    Start: 'بدء',
    'Set 60 %': 'ضبط 60٪',
    Done: 'انتهاء',
    'Simulate navigation': 'محاكاة التنقل',
    Functions: 'الدوال',
    'Ring. Modifiers <code>--small</code>, <code>--large</code>, <code>--dual</code>. Variables <code>--mud-spinner-size</code>, <code>--mud-spinner-width</code>, <code>--mud-spinner-color</code>, <code>--mud-spinner-track</code>.':
      'حلقة. المعدِّلات <code>--small</code>، <code>--large</code>، <code>--dual</code>. المتغيرات <code>--mud-spinner-size</code>، <code>--mud-spinner-width</code>، <code>--mud-spinner-color</code>، <code>--mud-spinner-track</code>.',
    'Dots (one inner <code>&lt;span&gt;</code>), bars (four <code>&lt;i&gt;</code>), pulse (empty).':
      'النقاط (عنصر <code>&lt;span&gt;</code> داخلي واحد)، والأعمدة (أربعة <code>&lt;i&gt;</code>)، والنبض (فارغ).',
    '<code>primary</code>, <code>secondary</code>, <code>info</code>, <code>success</code>, <code>warning</code>, <code>error</code>, <code>dark</code>, <code>inherit</code>: the colour of spinners and progress bars.':
      '<code>primary</code>، <code>secondary</code>، <code>info</code>، <code>success</code>، <code>warning</code>، <code>error</code>، <code>dark</code>، <code>inherit</code>: لون المؤشرات الدوّارة وأشرطة التقدّم.',
    'Placeholder with a shimmer. Shapes <code>--text</code>, <code>--title</code>, <code>--circle</code>, <code>--rect</code>, <code>--media</code>; <code>--pulse</code>.':
      'عنصر مؤقت بلمعان. الأشكال <code>--text</code>، <code>--title</code>، <code>--circle</code>، <code>--rect</code>، <code>--media</code>؛ و<code>--pulse</code>.',
    'A container that can show <code>.mud-loading__overlay</code>: visible while the container has <code>aria-busy="true"</code> (or <code>.is-loading</code>).':
      'حاوية يمكنها إظهار <code>.mud-loading__overlay</code>: تظهر ما دامت الحاوية تحمل <code>aria-busy="true"</code> (أو <code>.is-loading</code>).',
    '<code>variant</code> (ring | dots | bars | pulse), <code>color</code>, <code>size</code>, <code>thickness</code>, <code>trackColor</code>, <code>label</code> (false = decorative).':
      '<code>variant</code> (ring | dots | bars | pulse)، <code>color</code>، <code>size</code>، <code>thickness</code>، <code>trackColor</code>، <code>label</code> (false = زخرفي).',
    '<code>text</code>, <code>spinner</code>, <code>color</code>, <code>blur</code>, <code>visible</code>. Returns <code>show</code>, <code>hide</code>, <code>setText</code>, <code>isVisible</code>, <code>dispose</code>.':
      '<code>text</code>، <code>spinner</code>، <code>color</code>، <code>blur</code>، <code>visible</code>. تُرجع <code>show</code>، <code>hide</code>، <code>setText</code>، <code>isVisible</code>، <code>dispose</code>.',
    'Busy state on or off.': 'تشغيل حالة الانشغال أو إيقافها.',
    '<code>start()</code>, <code>set(percent)</code>, <code>done(force)</code>, <code>isActive()</code>.':
      '<code>start()</code>، <code>set(percent)</code>، <code>done(force)</code>، <code>isActive()</code>.',
    'A spinner in an element Blazor renders empty.': 'مؤشر دوّار داخل عنصر يعرضه Blazor فارغًا.',
    'An overlay over any element. Handle methods: show, hide, setText, isVisible, dispose.': 'طبقة فوق أي عنصر. دوال المقبض: show، hide، setText، isVisible، dispose.',
    'The busy button and the page loader from C#.': 'الزر المشغول وشريط تحميل الصفحة من C#.',

    // ── Progress ──
    Progress: 'التقدّم',
    "Linear bars and circular progress. The value, colours, line width and borders are custom properties, so markup alone works (Razor), and <code>MudProgressLinear</code> / <code>MudProgressCircular</code> add labels in the page's digits, thresholds and indeterminate states.":
      'أشرطة خطية وتقدّم دائري. القيمة والألوان وعرض الخط والحدود خصائص مخصّصة، فتكفي العلامات وحدها (Razor)، ويضيف <code>MudProgressLinear</code> / <code>MudProgressCircular</code> تسميات بأرقام الصفحة، وعتبات، وحالات غير محدّدة.',
    'Linear: values and colours': 'خطي: القيم والألوان',
    'Sizes, stripes and labels': 'الأحجام والخطوط والتسميات',
    'Sizes <code>--small</code> / <code>--large</code> (or <code>--mud-progress-height</code>), <code>--striped</code>, <code>--animated</code>, the value inside a tall bar, and a caption row with <code>--stacked</code>.':
      'الأحجام <code>--small</code> / <code>--large</code> (أو <code>--mud-progress-height</code>)، و<code>--striped</code>، و<code>--animated</code>، والقيمة داخل شريط عريض، وسطر عنوان مع <code>--stacked</code>.',
    'Season ticket sales': 'مبيعات التذاكر الموسمية',
    '3 of 5 stands': '3 من 5 مدرجات',
    'Checkout step': 'خطوة الدفع',
    'Step 3 of 5': 'الخطوة 3 من 5',
    'Buffer and indeterminate': 'المخزن المؤقت وغير المحدّد',
    'A buffer bar (e.g. how much of a video has loaded), and a sliding bar when the amount is not known.':
      'شريط مخزن مؤقت (مثل مقدار ما حُمّل من فيديو)، وشريط منزلق عندما يكون المقدار غير معروف.',
    'Borders, track and colours': 'الحدود والمسار والألوان',
    '<code>--mud-progress-border-width</code> / <code>--mud-progress-border-color</code> put a border around the track; <code>--mud-progress-color</code> and <code>--mud-progress-track</code> take any colour; <code>--mud-progress-radius</code> squares it.':
      '<code>--mud-progress-border-width</code> / <code>--mud-progress-border-color</code> يضعان حدًّا حول المسار؛ و<code>--mud-progress-color</code> و<code>--mud-progress-track</code> يقبلان أي لون؛ و<code>--mud-progress-radius</code> يجعله مربّع الزوايا.',
    'Linear in JavaScript, with thresholds': 'خطي في JavaScript مع عتبات',
    'The colour follows the value: below 40 % red, then amber, from 75 % green. Drag the slider.':
      'يتبع اللون القيمة: أحمر تحت 40٪، ثم كهرماني، وأخضر من 75٪. اسحب المنزلق.',
    'Budget used': 'الميزانية المستهلكة',
    Value: 'القيمة',
    'Circular: CSS donut': 'دائري: حلقة CSS',
    'Markup only: <code>--mud-progress-value</code>, <code>--mud-progress-size</code>, <code>--mud-progress-thickness</code> (line width), <code>--mud-progress-border-width</code> and <code>--mud-progress-border-color</code> (both edges of the ring). <code>--ccw</code> fills counter-clockwise.':
      'بالعلامات فقط: <code>--mud-progress-value</code>، <code>--mud-progress-size</code>، <code>--mud-progress-thickness</code> (عرض الخط)، <code>--mud-progress-border-width</code> و<code>--mud-progress-border-color</code> (حافتا الحلقة). و<code>--ccw</code> يملأ عكس عقارب الساعة.',
    'Circular: SVG ring playground': 'دائري: ساحة تجربة حلقة SVG',
    '<code>MudProgressCircular</code> draws an SVG ring with round caps. Change every option here.':
      '<code>MudProgressCircular</code> يرسم حلقة SVG بأطراف مستديرة. غيّر كل خيار هنا.',
    Size: 'الحجم',
    'Line width': 'عرض الخط',
    'Border width': 'عرض الحد',
    Colour: 'اللون',
    'Track colour': 'لون المسار',
    'Border colour': 'لون الحد',
    'Flat ends': 'أطراف مستوية',
    'Counter-clockwise': 'عكس عقارب الساعة',
    Indeterminate: 'غير محدّد',
    'Circular: match stats and KPIs': 'دائري: إحصاءات المباراة ومؤشرات الأداء',
    'Thresholds, sub-labels, a custom label function and the indeterminate spinner.': 'العتبات، والتسميات الفرعية، ودالة تسمية مخصّصة، والمؤشر غير المحدّد.',
    'MudProgressLinear options': 'خيارات MudProgressLinear',
    'MudProgressCircular options': 'خيارات MudProgressCircular',
    'Linear bar: <code>.mud-progress__track</code> &gt; <code>.mud-progress__bar</code> (+ <code>__buffer</code>, <code>__value</code>), <code>.mud-progress__label</code>, <code>.mud-progress__caption</code>. Modifiers <code>--small</code>, <code>--large</code>, <code>--square</code>, <code>--striped</code>, <code>--animated</code>, <code>--indeterminate</code>, <code>--steps</code>, <code>--stacked</code>.':
      'شريط خطي: <code>.mud-progress__track</code> &gt; <code>.mud-progress__bar</code> (+ <code>__buffer</code>، <code>__value</code>)، <code>.mud-progress__label</code>، <code>.mud-progress__caption</code>. المعدِّلات <code>--small</code>، <code>--large</code>، <code>--square</code>، <code>--striped</code>، <code>--animated</code>، <code>--indeterminate</code>، <code>--steps</code>، <code>--stacked</code>.',
    'CSS circular progress with <code>.mud-donut__label</code>; <code>--ccw</code>. The centre is <code>--mud-donut-hole</code> (the surface colour).':
      'تقدّم دائري بـ CSS مع <code>.mud-donut__label</code>؛ و<code>--ccw</code>. والمركز هو <code>--mud-donut-hole</code> (لون السطح).',
    '<code>--mud-progress-value</code>, <code>-buffer</code>, <code>-color</code>, <code>-track</code>, <code>-height</code>, <code>-radius</code>, <code>-size</code>, <code>-thickness</code>, <code>-border-width</code>, <code>-border-color</code>, <code>-steps</code>.':
      '<code>--mud-progress-value</code>، <code>-buffer</code>، <code>-color</code>، <code>-track</code>، <code>-height</code>، <code>-radius</code>، <code>-size</code>، <code>-thickness</code>، <code>-border-width</code>، <code>-border-color</code>، <code>-steps</code>.',
    'The range (0–100 by default) and an optional buffer value.': 'المدى (0–100 افتراضيًا) وقيمة مخزن مؤقت اختيارية.',
    'Palette names or CSS colours; thresholds <code>[{ from, color }]</code> by percentage.': 'أسماء ألوان اللوحة أو ألوان CSS؛ والعتبات <code>[{ from, color }]</code> بالنسبة المئوية.',
    'Dimensions (numbers are px) and the border around the track.': 'الأبعاد (الأرقام بالبكسل) والحد حول المسار.',
    'Look and state.': 'المظهر والحالة.',
    '<code>label</code>: true (the percentage), false, text or <code>(value, percent) =&gt; text</code>. <code>labelPosition</code>: end | inside | top.':
      '<code>label</code>: true (النسبة المئوية)، أو false، أو نص، أو <code>(value, percent) =&gt; text</code>. و<code>labelPosition</code>: end | inside | top.',
    'As above.': 'كما سبق.',
    'Diameter and line width, in px.': 'القطر وعرض الخط، بالبكسل.',
    'A border on the outer and inner edge of the ring.': 'حدّ على الحافتين الخارجية والداخلية للحلقة.',
    "<code>round</code> or <code>butt</code>; degrees from 12 o'clock; direction.": '<code>round</code> أو <code>butt</code>؛ والدرجات بدءًا من الساعة 12؛ والاتجاه.',
    'The centre text.': 'نص المركز.',
    '<code>setBuffer</code> is linear only.': '<code>setBuffer</code> للشريط الخطي فقط.',
  },
  patterns: [
    // Ring and donut labels: "62%<small>possession</small>" (the number changes with the value).
    [/^(.+?)<small>(possession|pass accuracy|shots on target|rating|tickets|passes)<\/small>$/, (_, value, sub) => `${value}<small>${SUBLABELS[sub]}</small>`],
    [/^Handle methods: ([^.]+)\.$/, 'دوال المقبض: $1.'],
  ],
};
