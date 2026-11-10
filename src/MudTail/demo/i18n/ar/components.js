// Arabic: Components pages (core, editorial, dock, data table) and the shared page template.
const PAREN = { '(action id)': '(معرّف الإجراء)', '(tab id)': '(معرّف التبويب)', '(value)': '(القيمة)', none: 'لا شيء' };
const tr = (s) => Object.entries(PAREN).reduce((out, [en, ar]) => out.split(en).join(ar), s);

const STARTED_TAIL = {
  '': '',
  ' Options: <code>data-delay</code>, <code>data-duration</code>. It only animates <code>--mud-stat-progress</code>; without it (or with reduced motion) bars are full.':
    ' الخيارات: <code>data-delay</code>، <code>data-duration</code>. ولا يحرّك إلا <code>--mud-stat-progress</code>؛ ومن دونه (أو مع تقليل الحركة) تكون الأشرطة ممتلئة.',
  ' It rebuilds when Blazor re-renders the headlines.': ' ويُعاد بناؤه عندما يعيد Blazor عرض العناوين.',
  ' From code: <code>lightbox(items, index)</code> / <code>openLightbox(items, index)</code>.': ' ومن الشيفرة: <code>lightbox(items, index)</code> / <code>openLightbox(items, index)</code>.',
};

export default {
  messages: {
    // ── page template ──
    Breadcrumb: 'مسار التنقل',
    Copy: 'نسخ',
    'HTML / Razor': 'HTML / Razor',
    JavaScript: 'JavaScript',
    'Razor / C#': 'Razor / C#',
    'Copied to the clipboard': 'تم النسخ إلى الحافظة',
    'Copy is blocked here': 'النسخ غير مسموح هنا',
    Behaviour: 'سلوك',
    Classes: 'الأصناف',
    Options: 'الخيارات',
    Methods: 'الدوال',
    Events: 'الأحداث',
    Markup: 'الترميز',
    Attributes: 'السمات',
    Function: 'الدالة',
    'Query helpers': 'دوال الاستعلام المساعدة',
    'Filter operators': 'عوامل التصفية',

    // ── Buttons ──
    'Filled, outlined and text buttons in four colours and three sizes, with a GSAP ripple when created through <code>createMudButton()</code>.':
      'أزرار ممتلئة ومحدّدة ونصية بأربعة ألوان وثلاثة أحجام، مع تموّج GSAP عند إنشائها عبر <code>createMudButton()</code>.',
    'Variants and colours': 'الأنماط والألوان',
    Primary: 'أساسي',
    Secondary: 'ثانوي',
    Outlined: 'محدّد',
    Text: 'نصي',
    Delete: 'حذف',
    Disabled: 'معطّل',
    'Sizes and icons': 'الأحجام والأيقونات',
    Small: 'صغير',
    Medium: 'متوسط',
    Large: 'كبير',
    Download: 'تنزيل',
    Settings: 'الإعدادات',
    'With ripple (JavaScript)': 'مع التموّج (JavaScript)',
    Publish: 'نشر',
    Published: 'تم النشر',
    'Save draft': 'حفظ المسودة',
    'Base class.': 'الصنف الأساسي.',
    'Variant.': 'النمط.',
    'Colour.': 'اللون.',
    'Size; <code>.mud-button-icon</code> for icon-only buttons (give them an <code>aria-label</code>).':
      'الحجم؛ و<code>.mud-button-icon</code> للأزرار ذات الأيقونة فقط (امنحها <code>aria-label</code>).',
    'As the classes above.': 'مثل الأصناف أعلاه.',
    'SVG markup; <code>start</code> or <code>end</code>.': 'ترميز SVG؛ <code>start</code> أو <code>end</code>.',
    'Click handler; the ripple runs first.': 'معالج النقر؛ يعمل التموّج أولًا.',
    'Usual button attributes.': 'سمات الزر المعتادة.',

    // ── Cards ──
    'Cards and paper': 'البطاقات والأسطح',
    'Surfaces for grouping content: <code>.mud-paper</code> is a plain surface, <code>.mud-card</code> adds header, media, content and actions.':
      'أسطح لتجميع المحتوى: <code>.mud-paper</code> سطح بسيط، و<code>.mud-card</code> تضيف ترويسة ووسائط ومحتوى وإجراءات.',
    'Match report': 'تقرير المباراة',
    'Northbridge lead 2–1 after a second-half penalty. Harbour City push for an equaliser.': 'نورثبريدج يتقدم 2–1 بعد ركلة جزاء في الشوط الثاني، وهاربر سيتي يضغط بحثًا عن التعادل.',
    'Read more': 'اقرأ المزيد',
    Share: 'مشاركة',
    Paper: 'السطح',
    Elevated: 'مرتفع',
    Square: 'مربع',
    'Surface; modifiers <code>mud-paper-outlined</code>, <code>mud-paper-square</code>.': 'سطح؛ والمعدّلات <code>mud-paper-outlined</code> و<code>mud-paper-square</code>.',
    'Card with <code>.mud-card-header</code>, <code>.mud-card-media</code>, <code>.mud-card-content</code>, <code>.mud-card-actions</code>.':
      'بطاقة تضم <code>.mud-card-header</code> و<code>.mud-card-media</code> و<code>.mud-card-content</code> و<code>.mud-card-actions</code>.',

    // ── Typography ──
    'The type scale as classes, so the look stays independent of the HTML level you need for the document outline.':
      'مقياس الخطوط على شكل أصناف، فيبقى المظهر مستقلًا عن مستوى عنوان HTML الذي يتطلبه هيكل المستند.',
    Scale: 'المقياس',
    'Heading 3': 'عنوان 3',
    'Heading 5': 'عنوان 5',
    'Subtitle 1': 'عنوان فرعي 1',
    'Body 1: the default reading size for paragraphs.': 'متن 1: حجم القراءة الافتراضي للفقرات.',
    'Body 2: secondary text and dense layouts.': 'متن 2: للنص الثانوي والتخطيطات الكثيفة.',
    'Caption: image credits and footnotes': 'تعليق: لنسبة الصور والحواشي',
    Overline: 'نص علوي',
    'Headings.': 'العناوين.',
    'Subtitles.': 'العناوين الفرعية.',
    'Body text.': 'نص المتن.',
    'Small text styles.': 'أنماط النص الصغير.',

    // ── Elevation ──
    'Elevation and rounding': 'الارتفاع والزوايا',
    'Shadow levels <code>.mud-elevation-0</code> to <code>-24</code>, and radius utilities, including logical start / end corners that mirror in RTL.':
      'مستويات الظل من <code>.mud-elevation-0</code> إلى <code>-24</code>، وأدوات الزوايا، ومنها زوايا البداية / النهاية المنطقية التي تنعكس في الاتجاه من اليمين إلى اليسار.',
    Elevation: 'الارتفاع',
    Rounding: 'الزوايا',
    'Shadow depth.': 'عمق الظل.',
    'Radius; <code>.mud-rounded</code> follows the theme radius.': 'نصف القطر؛ و<code>.mud-rounded</code> يتبع زاوية السمة.',
    'Physical sides.': 'الجهات الفعلية.',
    'Logical start / end sides (swap in RTL).': 'جهتا البداية / النهاية المنطقيتان (تتبادلان في الاتجاه من اليمين إلى اليسار).',

    // ── Grid ──
    "A 12-column responsive grid built on logical properties, so it mirrors in RTL. Tailwind's grid utilities work alongside it.":
      'شبكة متجاوبة من 12 عمودًا مبنية على الخصائص المنطقية، فتنعكس في الاتجاه من اليمين إلى اليسار. وتعمل أدوات شبكة Tailwind إلى جانبها.',
    'Responsive columns': 'أعمدة متجاوبة',
    'Full width on phones, halves from <code>md</code>, thirds and a two-thirds column from <code>lg</code>.':
      'عرض كامل على الهواتف، وأنصاف من <code>md</code>، وأثلاث وعمود بثلثي العرض من <code>lg</code>.',
    'Centred, padded, capped at <code>--mud-container-max</code> (1280px).': 'في المنتصف مع حشوة، وبحد أقصى <code>--mud-container-max</code> (1280px).',
    'Flex row with gutters.': 'صف مرن مع فواصل.',
    'Column span.': 'امتداد العمود.',
    'Span from that breakpoint up.': 'الامتداد من نقطة التحول تلك فما فوق.',

    // ── Dialog ──
    'A modal dialog with a GSAP entrance, built in JavaScript and appended to <code>&lt;body&gt;</code>.':
      'نافذة حوار مشروطة تظهر بحركة GSAP، تُبنى بـ JavaScript وتُضاف إلى <code>&lt;body&gt;</code>.',
    Confirm: 'تأكيد',
    'Open dialog': 'فتح نافذة الحوار',
    'Dialog title.': 'عنوان نافذة الحوار.',
    'HTML string or element (escape user content).': 'نص HTML أو عنصر (عالج محتوى المستخدم قبل إدراجه).',
    '<code>[{ label, variant, color, onClick(e, dialog) }]</code>; without <code>onClick</code> a button closes the dialog.':
      '<code>[{ label, variant, color, onClick(e, dialog) }]</code>؛ ودون <code>onClick</code> يغلق الزر نافذة الحوار.',
    'CSS width cap.': 'الحد الأقصى للعرض في CSS.',
    'Called after it closes.': 'تُستدعى بعد الإغلاق.',
    'Show and hide (animated).': 'إظهار وإخفاء (بحركة).',
    'Removes it from the page.': 'تزيلها من الصفحة.',
    'Unpublish article?': 'إلغاء نشر المقال؟',
    'Readers will no longer see it. You can publish it again later.': 'لن يتمكن القرّاء من رؤيته بعد الآن. يمكنك نشره مجددًا لاحقًا.',
    Cancel: 'إلغاء',
    Unpublish: 'إلغاء النشر',
    Unpublished: 'تم إلغاء النشر',

    // ── Drawer ──
    'A panel that slides in from an edge. <code>start</code> and <code>end</code> follow the writing direction; <code>left</code>, <code>right</code>, <code>top</code> and <code>bottom</code> are physical.':
      'لوحة تنزلق من إحدى الحواف. <code>start</code> و<code>end</code> يتبعان اتجاه الكتابة؛ أما <code>left</code> و<code>right</code> و<code>top</code> و<code>bottom</code> فجهات فعلية.',
    Anchors: 'المواضع',
    start: 'البداية',
    end: 'النهاية',
    top: 'الأعلى',
    bottom: 'الأسفل',
    '<code>start</code> | <code>end</code> | <code>left</code> | <code>right</code> | <code>top</code> | <code>bottom</code>.': '<code>start</code> | <code>end</code> | <code>left</code> | <code>right</code> | <code>top</code> | <code>bottom</code>.',
    '<code>temporary</code> (with overlay), <code>persistent</code>, <code>mini</code>.': '<code>temporary</code> (مع طبقة تعتيم)، <code>persistent</code>، <code>mini</code>.',
    'Header text, size, initial state.': 'نص الترويسة والحجم والحالة الأولية.',
    'Animated.': 'بحركة.',
    'Update it.': 'لتحديثها.',
    'Removes the drawer and its overlay.': 'تزيل الدرج وطبقة التعتيم.',

    // ── Tabs ──
    'Tabs with an animated indicator, in six positions. <code>start</code> / <code>end</code> follow the writing direction.':
      'تبويبات بمؤشر متحرك في ستة مواضع. <code>start</code> / <code>end</code> يتبعان اتجاه الكتابة.',
    Positions: 'المواضع',
    Position: 'الموضع',
    News: 'أخبار',
    Sport: 'رياضة',
    Culture: 'ثقافة',
    'Top stories from the newsroom.': 'أهم الأخبار من غرفة الأخبار.',
    'Three live matches right now.': 'ثلاث مباريات مباشرة الآن.',
    'New acquisitions at the gallery.': 'مقتنيات جديدة في المعرض.',
    '<code>[{ id, label, icon?, badge?, content }]</code> (content: HTML string or element).': '<code>[{ id, label, icon?, badge?, content }]</code> (المحتوى: نص HTML أو عنصر).',
    'Placement and the starting tab.': 'الموضع والتبويب الأول.',
    'Called when the tab changes.': 'تُستدعى عند تغيّر التبويب.',
    'Change it.': 'لتغييرها.',
    'The element to insert.': 'العنصر المراد إدراجه.',
    'Removes it.': 'تزيله.',

    // ── Accordion ──
    'Expandable panels with a GSAP height animation. One panel at a time, or several with <code>multiExpand</code>.':
      'لوحات قابلة للتوسيع بحركة ارتفاع GSAP. لوحة واحدة في كل مرة، أو عدة لوحات مع <code>multiExpand</code>.',
    'How do I subscribe?': 'كيف أشترك؟',
    'Choose a plan on the Subscribe page; you can cancel any time.': 'اختر خطة من صفحة الاشتراك، ويمكنك الإلغاء في أي وقت.',
    'Can I read offline?': 'هل يمكنني القراءة دون اتصال؟',
    'Yes, in the app: save articles for later.': 'نعم، في التطبيق: احفظ المقالات لقراءتها لاحقًا.',
    'How do I report a mistake?': 'كيف أبلّغ عن خطأ؟',
    'Use the "Report an error" link under any article.': 'استخدم رابط «الإبلاغ عن خطأ» أسفل أي مقال.',
    '<code>[{ id, title, icon?, content, expanded? }]</code>.': '<code>[{ id, title, icon?, content, expanded? }]</code>.',
    'Allow several open panels.': 'السماح بفتح عدة لوحات.',

    // ── Tooltip / Toast ──
    'A small label on hover. <code>start</code> / <code>end</code> follow the writing direction. Keep tooltips for extra hints: the information should not live only in them.':
      'تسمية صغيرة عند التمرير. <code>start</code> / <code>end</code> يتبعان اتجاه الكتابة. استخدم التلميحات للإرشادات الإضافية فقط، فلا ينبغي أن تكون المعلومة فيها وحدها.',
    'Returns a function that removes it.': 'تُرجع دالة تزيله.',
    'Returns a handle with <code>dispose</code>.': 'تُرجع مقبضًا فيه <code>dispose</code>.',
    'A short message at the inline-end corner (bottom-right in LTR, bottom-left in RTL) that disappears on its own. Colours come from the theme.':
      'رسالة قصيرة في زاوية نهاية السطر (أسفل اليمين في الاتجاه من اليسار إلى اليمين، وأسفل اليسار في الاتجاه من اليمين إلى اليسار) تختفي من تلقاء نفسها. الألوان من السمة.',
    Types: 'الأنواع',
    info: 'معلومة',
    success: 'نجاح',
    warning: 'تحذير',
    error: 'خطأ',
    '<code>info</code>, <code>success</code>, <code>warning</code> or <code>error</code>. The message is inserted as text.': '<code>info</code> أو <code>success</code> أو <code>warning</code> أو <code>error</code>. تُدرج الرسالة نصًا.',
    'Same, from C#.': 'الشيء نفسه، من C#.',

    // ── Article cards ──
    'Article cards and grids': 'بطاقات المقالات والشبكات',
    'Cards for stories, and the grids that lay out a front page. The whole card is clickable through its title link, and other links inside it stay usable.':
      'بطاقات للقصص، والشبكات التي تنظّم الصفحة الرئيسية. البطاقة كلها قابلة للنقر عبر رابط عنوانها، وتبقى الروابط الأخرى داخلها قابلة للاستخدام.',
    Variants: 'الأنماط',
    'Default, row (image beside the text) and overlay (text on the image).': 'افتراضي، وصفّي (الصورة بجانب النص)، ومتراكب (النص فوق الصورة).',
    Science: 'علوم',
    'Night-sky survey spots a comet visible in March': 'مسح للسماء الليلية يرصد مذنبًا يُرى في مارس',
    'Lina Haddad': 'لينا حداد',
    '2h ago': 'قبل ساعتين',
    'Northbridge striker signs four-year extension': 'مهاجم نورثبريدج يجدد عقده أربع سنوات',
    'Election night: every district as it comes in': 'ليلة الانتخابات: نتائج كل دائرة فور وصولها',
    'Hero grid': 'شبكة الواجهة',
    'The first child is the lead story (2×2 on desktop, full width on tablets, stacked on phones).': 'العنصر الأول هو القصة الرئيسية (2×2 على الحاسوب، بعرض كامل على الأجهزة اللوحية، ومكدّس على الهواتف).',
    Climate: 'مناخ',
    'The quiet engineers rebuilding a river delta': 'المهندسون الصامتون الذين يعيدون بناء دلتا نهر',
    Politics: 'سياسة',
    'Coalition talks resume': 'استئناف محادثات الائتلاف',
    Health: 'صحة',
    'Clinics extend weekend hours': 'العيادات تمدد ساعات عطلة نهاية الأسبوع',
    Economy: 'اقتصاد',
    'Ports bet on electric ferries': 'الموانئ تراهن على العبّارات الكهربائية',
    Education: 'تعليم',
    'A four-day timetable trial': 'تجربة جدول دراسي من أربعة أيام',
    'Most read': 'الأكثر قراءة',
    'A numbered list; the accent colour comes from <code>--mud-accent</code>.': 'قائمة مرقّمة؛ ولون التمييز يأتي من <code>--mud-accent</code>.',
    'Coastal rail line reopens': 'إعادة افتتاح خط السكة الحديدية الساحلي',
    'A comet visible in March': 'مذنب يُرى في مارس',
    'Our streets were designed for cars': 'شوارعنا صُمّمت للسيارات',
    'Card; modifiers <code>--lead</code>, <code>--row</code>, <code>--overlay</code>. Parts: <code>__media</code>, <code>__body</code>, <code>__title</code>, <code>__excerpt</code>.':
      'بطاقة؛ والمعدّلات <code>--lead</code> و<code>--row</code> و<code>--overlay</code>. والأجزاء: <code>__media</code> و<code>__body</code> و<code>__title</code> و<code>__excerpt</code>.',
    'Section label, byline / time line, badges.': 'تسمية القسم، وسطر الكاتب / الوقت، والشارات.',
    'Front-page grid, auto-fill grid (<code>--mud-card-min</code>), main + aside (<code>--mud-split-aside</code>).':
      'شبكة الصفحة الرئيسية، وشبكة ملء تلقائي (<code>--mud-card-min</code>)، وعمود رئيسي + جانبي (<code>--mud-split-aside</code>).',
    'Section with an accent-underlined title.': 'قسم بعنوان يعلوه خط تمييز.',
    'Per-section accent colour and headline font.': 'لون تمييز وخط عناوين لكل قسم.',

    // ── Ticker ──
    'Breaking-news ticker': 'شريط الأخبار العاجلة',
    'Headlines scrolling with GSAP. It pauses on hover and keyboard focus, has a pause button, runs the other way in RTL, and becomes a hand-scrolled strip with reduced motion.':
      'عناوين تتحرك بـ GSAP. تتوقف عند التمرير أو التركيز بلوحة المفاتيح، وفيها زر إيقاف، وتتحرك في الاتجاه المعاكس عند الكتابة من اليمين إلى اليسار، وتصبح شريطًا يُمرَّر يدويًا عند تقليل الحركة.',
    'Breaking news': 'أخبار عاجلة',
    Breaking: 'عاجل',
    'Coastal rail line reopens two weeks early': 'إعادة افتتاح خط السكة الساحلي قبل موعده بأسبوعين',
    'Car-free weekends for the old harbour': 'عطلات نهاية أسبوع بلا سيارات في الميناء القديم',
    'Northbridge striker signs extension': 'مهاجم نورثبريدج يجدد عقده',
    'Container; <code>data-speed</code> in px per second (default 70).': 'الحاوية؛ و<code>data-speed</code> بالبكسل في الثانية (الافتراضي 70).',
    'Label, clipping area, the moving list.': 'التسمية، ومنطقة القص، والقائمة المتحركة.',
    'Optional pause / play button (the script sets its label and <code>aria-pressed</code>).': 'زر إيقاف / تشغيل اختياري (يضبط النص البرمجي تسميته و<code>aria-pressed</code>).',

    // ── Live scores ──
    'Live scores and match card': 'النتائج المباشرة وبطاقة المباراة',
    'A scrollable score strip and a match card. When Blazor re-renders a new score, <code>data-mud="score-strip"</code> flashes it.':
      'شريط نتائج قابل للتمرير وبطاقة مباراة. عندما يعرض Blazor نتيجة جديدة، يُبرزها <code>data-mud="score-strip"</code>.',
    'Score strip': 'شريط النتائج',
    'Press the button to change a score, as a Blazor re-render would.': 'اضغط الزر لتغيير نتيجة، كما لو أعاد Blazor العرض.',
    'Simulate a goal': 'محاكاة هدف',
    'Premier League': 'الدوري الممتاز',
    "Live 72'": "مباشر 72'",
    Northbridge: 'نورثبريدج',
    'Harbour City': 'هاربر سيتي',
    "Okafor 23'": "أوكافور 23'",
    "Lindqvist 51'": "ليندكفيست 51'",
    "Okafor 66' (pen)": "أوكافور 66' (ركلة جزاء)",
    'Riverside Park': 'ملعب ريفرسايد',
    'Match centre': 'مركز المباراة',
    'Snapping horizontal strip of <code>.mud-score-chip</code>s.': 'شريط أفقي ينطبق على عناصر <code>.mud-score-chip</code>.',
    '<code>live</code> (pulsing dot), <code>ht</code>, <code>ft</code>, <code>upcoming</code>.': '<code>live</code> (نقطة نابضة)، <code>ht</code>، <code>ft</code>، <code>upcoming</code>.',
    'Match card: <code>__header</code>, <code>__teams</code>, <code>__team</code>, <code>__score</code> or <code>__kickoff</code>, <code>__events</code>, <code>__footer</code>.':
      'بطاقة المباراة: <code>__header</code> و<code>__teams</code> و<code>__team</code> و<code>__score</code> أو <code>__kickoff</code> و<code>__events</code> و<code>__footer</code>.',
    'Score numbers and team crests.': 'أرقام النتيجة وشعارات الفرق.',

    // ── League table ──
    'Standings with qualification zones, the followed team highlighted, a form guide, and a team column that stays visible while the numbers scroll on phones.':
      'ترتيب بمناطق التأهل، وإبراز الفريق المتابَع، ودليل للنتائج الأخيرة، وعمود للفرق يبقى ظاهرًا أثناء تمرير الأرقام على الهواتف.',
    Standings: 'الترتيب',
    Team: 'الفريق',
    Form: 'المستوى',
    Westmoor: 'ويستمور',
    Fernhill: 'فيرنهيل',
    'Scrolls sideways when narrow.': 'يُمرَّر أفقيًا عندما يضيق.',
    '<code>champions</code>, <code>europe</code>, <code>playoff</code>, <code>relegation</code>: a coloured edge on the position cell.': '<code>champions</code> و<code>europe</code> و<code>playoff</code> و<code>relegation</code>: حافة ملوّنة على خلية المركز.',
    'The followed team.': 'الفريق المتابَع.',
    'Sticky team column, position, points, columns hidden on phones.': 'عمود الفرق الثابت، والمركز، والنقاط، والأعمدة المخفية على الهواتف.',
    'W / D / L form guide.': 'دليل النتائج: فوز / تعادل / خسارة.',

    // ── Gallery ──
    'Gallery and lightbox': 'المعرض والعارض',
    'A masonry gallery; with <code>data-mud="lightbox"</code> the images open full screen with keyboard, swipe and focus handling. Without the script the links just open the image.':
      'معرض بتخطيط البناء؛ ومع <code>data-mud="lightbox"</code> تُفتح الصور بملء الشاشة مع دعم لوحة المفاتيح والسحب والتركيز. ودون النص البرمجي تفتح الروابط الصورة فقط.',
    Masonry: 'تخطيط البناء',
    'Click an image, then use the arrow keys or swipe; Esc closes.': 'انقر صورة ثم استخدم مفاتيح الأسهم أو اسحب؛ وEsc للإغلاق.',
    'Collection 2026': 'مجموعة 2026',
    'Columns: 1 → 4 by width, or set <code>--mud-masonry-cols</code>.': 'الأعمدة: من 1 إلى 4 حسب العرض، أو اضبط <code>--mud-masonry-cols</code>.',
    "The link's <code>href</code> is the full image; <code>data-caption</code> or the <code>figcaption</code> is the caption (inserted as text).":
      'قيمة <code>href</code> في الرابط هي الصورة الكاملة؛ و<code>data-caption</code> أو <code>figcaption</code> هو التعليق (يُدرج نصًا).',

    // ── Mega-nav ──
    'Site header and mega-nav': 'ترويسة الموقع والقائمة الكبرى',
    'The public-site masthead and navigation. Panels open on hover or with the arrow button; below 1024px the nav folds behind a menu button and panels open inline. The Blazor <code>PublicLayout</code> renders exactly this.':
      'ترويسة الموقع العام وقائمته. تُفتح اللوحات عند التمرير أو بزر السهم؛ وتحت عرض 1024px تُطوى القائمة خلف زر القائمة وتُفتح اللوحات ضمن السطر. ويعرض <code>PublicLayout</code> في Blazor هذا تمامًا.',
    Header: 'الترويسة',
    'Open "Sport" with its arrow; Esc closes it and returns focus.': 'افتح «رياضة» بسهمها؛ وEsc يغلقها ويعيد التركيز.',
    'The Daily <b>Mud</b>': 'ذا ديلي <b>مَد</b>',
    'Sign in': 'تسجيل الدخول',
    Main: 'الرئيسية',
    'Sport sections': 'أقسام الرياضة',
    Football: 'كرة القدم',
    Transfers: 'الانتقالات',
    More: 'المزيد',
    Tennis: 'التنس',
    'Formula 1': 'الفورمولا 1',
    'Header parts.': 'أجزاء الترويسة.',
    "The nav. Don't render <code>aria-expanded</code> or <code>data-open</code>: the script owns them.": 'القائمة. لا تعرض <code>aria-expanded</code> أو <code>data-open</code>: فالنص البرمجي يتولاهما.',
    'Menu button for small screens.': 'زر القائمة للشاشات الصغيرة.',

    // ── Reveal ──
    'Scroll reveal and reading progress': 'الظهور عند التمرير وتقدّم القراءة',
    'GSAP entrance animations when content scrolls into view, and a reading-progress bar. Content is only hidden once the script runs, and never with reduced motion.':
      'حركات ظهور GSAP عندما يدخل المحتوى مجال الرؤية، وشريط لتقدّم القراءة. لا يُخفى المحتوى إلا بعد تشغيل النص البرمجي، ولا يُخفى أبدًا عند تقليل الحركة.',
    Reveal: 'الظهور',
    'Scroll this page: the tiles animate in one after another (they appear at once with reduced motion).': 'مرّر هذه الصفحة: تظهر المربعات واحدًا تلو الآخر (وتظهر دفعة واحدة عند تقليل الحركة).',
    staggered: 'متتابع',
    by: 'بفاصل',
    '<code>fade-up</code> (default), <code>fade</code>, <code>zoom</code>, <code>slide-start</code>, <code>slide-end</code> (mirrored in RTL).': '<code>fade-up</code> (الافتراضي)، <code>fade</code>، <code>zoom</code>، <code>slide-start</code>، <code>slide-end</code> (تنعكس في الاتجاه من اليمين إلى اليسار).',
    'Animate the children in turn; delay in seconds.': 'تحريك العناصر الأبناء بالتتابع؛ والتأخير بالثواني.',
    'A <code>.mud-reading-progress</code> bar; <code>data-target</code> tracks one element instead of the page.': 'شريط <code>.mud-reading-progress</code>؛ و<code>data-target</code> يتتبع عنصرًا واحدًا بدل الصفحة.',

    // ── Dock page ──
    "The IDE docking workspace (see the full <a href=\"#/dock\">VS 2026 Dock</a> view). Drag tabs onto a block's centre to merge, onto an edge to split; drag the empty tab bar to move a block; ⋯ for more.":
      'مساحة عمل الإرساء على طريقة بيئات التطوير (اطّلع على عرض <a href="#/dock">إرساء VS 2026</a> كاملًا). اسحب التبويبات إلى وسط كتلة لدمجها، أو إلى حافة لتقسيمها؛ واسحب شريط التبويبات الفارغ لنقل كتلة؛ و⋯ للمزيد.',
    'Two blocks': 'كتلتان',
    Notes: 'ملاحظات',
    List: 'قائمة',
    'Drag this tab next to "List" or onto its edges.': 'اسحب هذا التبويب بجانب «قائمة» أو إلى حوافها.',
    'Merge in the centre': 'الدمج في الوسط',
    'Split on an edge': 'التقسيم على حافة',
    'Double-click the tab bar to maximize': 'انقر نقرًا مزدوجًا على شريط التبويبات للتكبير',
    'A new block.': 'كتلة جديدة.',
    '<code>[{ key, title, icon?, allowMultiple?, document?, render(panel, ctx) }]</code>.': '<code>[{ key, title, icon?, allowMultiple?, document?, render(panel, ctx) }]</code>.',
    'Returns <code>{ root, left?, right? }</code>; or <code>DockModel.layoutFrom(saved)</code>.': 'تُرجع <code>{ root, left?, right? }</code>؛ أو <code>DockModel.layoutFrom(saved)</code>.',
    'Save / restore the layout in localStorage.': 'حفظ / استعادة التخطيط في localStorage.',
    'Panels are Blazor components mounted as JS root components. See the README, "MudDock from Blazor".': 'اللوحات مكوّنات Blazor تُركّب بوصفها مكوّنات جذر لـ JS. راجع ملف README، قسم «MudDock from Blazor».',

    // ── Data table ──
    'Global search, column filters, multi-column sorting (Shift+click), paging and selection, over rows in the browser or from your API. Server-side queries are exactly what <code>[AsParameters] PaginationFilter</code> binds, and the API answers with an Ardalis specification, so both modes return the same rows.':
      'بحث شامل، وتصفية بالأعمدة، وفرز بعدة أعمدة (Shift+نقر)، وتقسيم إلى صفحات، وتحديد، على صفوف في المتصفح أو من واجهتك البرمجية. استعلامات الخادم هي تمامًا ما يربطه <code>[AsParameters] PaginationFilter</code>، وتجيب الواجهة البرمجية بمواصفة Ardalis، فيُرجع النمطان الصفوف نفسها.',
    'Client side': 'في المتصفح',
    '250 rows filtered, sorted and paged in the browser. Open <strong>Filters</strong> for per-column conditions; each active filter shows as a removable chip.':
      '250 صفًا تُصفّى وتُفرز وتُقسّم إلى صفحات في المتصفح. افتح <strong>عوامل التصفية</strong> لشروط كل عمود؛ ويظهر كل عامل نشط شريحةً قابلة للإزالة.',
    Articles: 'المقالات',
    'Articles (server)': 'المقالات (الخادم)',
    Title: 'العنوان',
    Section: 'القسم',
    Views: 'المشاهدات',
    Rating: 'التقييم',
    Featured: 'مميّز',
    'Server side': 'على الخادم',
    'The same table, with the data from an API. Below it is the request each search, filter, sort or page change sends. Here a pretend API answers it (with half a second of latency); against the real backend, point <code>server.url</code> at an endpoint like the one in the next example.':
      'الجدول نفسه، لكن بياناته من واجهة برمجية. أسفله الطلب الذي يُرسل مع كل بحث أو تصفية أو فرز أو تغيير صفحة. تجيب عنه هنا واجهة محاكاة (بتأخير نصف ثانية)؛ ومع الخادم الحقيقي وجّه <code>server.url</code> إلى نقطة نهاية مثل التي في المثال التالي.',
    '.NET: endpoint and specification': '.NET: نقطة النهاية والمواصفة',
    'The endpoint binds the query with <code>[AsParameters]</code>. <code>Query.SearchBy(filter)</code> applies the keyword <em>and</em> the column filters (<code>Filters=Field|op|value</code>), and <code>Query.PaginateBy(filter)</code> orders and pages. <code>RestrictTo</code> limits searching, filtering and sorting to the listed columns.':
      'تربط نقطة النهاية الاستعلام بـ <code>[AsParameters]</code>. ويطبّق <code>Query.SearchBy(filter)</code> الكلمة المفتاحية <em>و</em>عوامل تصفية الأعمدة (<code>Filters=Field|op|value</code>)، ويتولى <code>Query.PaginateBy(filter)</code> الترتيب والتقسيم إلى صفحات. ويقصر <code>RestrictTo</code> البحث والتصفية والفرز على الأعمدة المذكورة.',
    'The table raises <code>query</code> with a ready <code>PaginationFilter</code>; your component calls the API with its authorised client and answers with <code>setPage</code>. Answers to queries that were replaced in the meantime are ignored.':
      'يطلق الجدول الحدث <code>query</code> مع <code>PaginationFilter</code> جاهز؛ فيستدعي مكوّنك الواجهة البرمجية بعميله المخوَّل ويجيب بـ <code>setPage</code>. وتُتجاهل الإجابات عن استعلامات استُبدلت في الأثناء.',
    '<code>[{ key, field?, title?, type?, sortable?, filterable?, searchable?, align?, width?, format?, render?, options? }]</code>. <code>field</code> is the name sent to the server (its property name; matched ignoring case).':
      '<code>[{ key, field?, title?, type?, sortable?, filterable?, searchable?, align?, width?, format?, render?, options? }]</code>. و<code>field</code> هو الاسم المرسل إلى الخادم (اسم خاصيته، دون اعتبار لحالة الأحرف).',
    '<code>string</code> (searched by the keyword), <code>number</code>, <code>date</code>, <code>boolean</code>, <code>enum</code> (with <code>options</code>). It decides the filter control, operators, alignment and formatting.':
      '<code>string</code> (تبحث فيه الكلمة المفتاحية)، <code>number</code>، <code>date</code>، <code>boolean</code>، <code>enum</code> (مع <code>options</code>). ويحدد عنصر التصفية والعوامل والمحاذاة والتنسيق.',
    'A function, or a preset: <code>number</code>, <code>integer</code>, <code>percent</code>, <code>currency:EUR</code>, <code>date</code>, <code>datetime</code>, <code>boolean</code>. Values are inserted as text.':
      'دالة، أو إعداد جاهز: <code>number</code>، <code>integer</code>، <code>percent</code>، <code>currency:EUR</code>، <code>date</code>، <code>datetime</code>، <code>boolean</code>. وتُدرج القيم نصًا.',
    'Custom cell: a <em>trusted</em> HTML string or a DOM node. Escape any user content yourself.': 'خلية مخصّصة: نص HTML <em>موثوق</em> أو عقدة DOM. عالج أي محتوى للمستخدم بنفسك.',
    'Rows for client mode.': 'الصفوف لنمط المتصفح.',
    '<code>{ url, headers?, credentials?, debounce? }</code> (GET with the PaginationFilter query string, reads PagedResponse), or <code>{ fetch(query, signal) }</code>. Older requests are aborted.':
      '<code>{ url, headers?, credentials?, debounce? }</code> (طلب GET بسلسلة استعلام PaginationFilter، ويقرأ PagedResponse)، أو <code>{ fetch(query, signal) }</code>. وتُلغى الطلبات الأقدم.',
    'Row id field (default <code>id</code>); <code>none</code>, <code>single</code> or <code>multiple</code> (selection survives paging).': 'حقل معرّف الصف (الافتراضي <code>id</code>)؛ و<code>none</code> أو <code>single</code> أو <code>multiple</code> (يبقى التحديد عند تغيير الصفحة).',
    'Paging and the starting keyword / filters / order.': 'التقسيم إلى صفحات والكلمة المفتاحية / عوامل التصفية / الترتيب عند البدء.',
    'Accessible name and looks; on phones rows become labelled cards (default on).': 'الاسم المتاح والمظهر؛ وعلى الهواتف تصبح الصفوف بطاقات مسمّاة (مفعّل افتراضيًا).',
    'Callbacks.': 'دوال الاستدعاء.',
    'Replace the rows (client mode).': 'استبدال الصفوف (نمط المتصفح).',
    'Drive it from code.': 'التحكم به من الشيفرة.',
    'Selection.': 'التحديد.',
    'Mount and remove.': 'التركيب والإزالة.',
    'The client-side engine.': 'محرك المتصفح.',
    'URLSearchParams for <code>[AsParameters] PaginationFilter</code>.': 'URLSearchParams لـ <code>[AsParameters] PaginationFilter</code>.',
    'The same as a JSON object (POST body, Blazor HttpClient).': 'الشيء نفسه كائنَ JSON (متن POST، أو HttpClient في Blazor).',
    'Reads <code>PagedResponse&lt;T&gt;</code>.': 'يقرأ <code>PagedResponse&lt;T&gt;</code>.',
    '<code>contains</code>, <code>eq</code>, <code>neq</code>, <code>startswith</code>, <code>endswith</code>, <code>isnull</code>, <code>notnull</code> (ignore case).': '<code>contains</code>، <code>eq</code>، <code>neq</code>، <code>startswith</code>، <code>endswith</code>، <code>isnull</code>، <code>notnull</code> (دون اعتبار لحالة الأحرف).',
    '<code>eq</code>, <code>neq</code>, <code>gt</code>, <code>gte</code>, <code>lt</code>, <code>lte</code>, <code>isnull</code>, <code>notnull</code>. Plain dates are UTC midnight.': '<code>eq</code>، <code>neq</code>، <code>gt</code>، <code>gte</code>، <code>lt</code>، <code>lte</code>، <code>isnull</code>، <code>notnull</code>. والتواريخ المجردة منتصف الليل بالتوقيت العالمي.',
    '<code>eq</code>; enums also <code>neq</code> and <code>in</code> (comma list).': '<code>eq</code>؛ وللتعدادات أيضًا <code>neq</code> و<code>in</code> (قائمة مفصولة بفواصل).',
    'Options as above (format as a preset name). <code>serverSide: true</code> raises <code>query</code> { requestId, query, filter }; answer with <code>setPage(requestId, items, totalCount)</code> or <code>failPage(requestId, message)</code>.':
      'الخيارات كما سبق (والتنسيق باسم إعداد جاهز). و<code>serverSide: true</code> يطلق <code>query</code> { requestId, query, filter }؛ فأجب بـ <code>setPage(requestId, items, totalCount)</code> أو <code>failPage(requestId, message)</code>.',
    '<code>query</code>, <code>rowclick</code> (row, when <code>rowClick: true</code>), <code>selection</code> (keys).': '<code>query</code>، <code>rowclick</code> (الصف، عند <code>rowClick: true</code>)، <code>selection</code> (المفاتيح).',
    '<code>setData</code>, <code>setPage</code>, <code>failPage</code>, <code>reload</code>, <code>setQuery</code>, <code>getQuery</code>, <code>getSelection</code>, <code>clearSelection</code>, <code>dispose</code>.': '<code>setData</code>، <code>setPage</code>، <code>failPage</code>، <code>reload</code>، <code>setQuery</code>، <code>getQuery</code>، <code>getSelection</code>، <code>clearSelection</code>، <code>dispose</code>.',
    Business: 'أعمال',
    Opinion: 'رأي',
    'demo.dt.title': 'العنوان',
    'demo.dt.section': 'القسم',
    'demo.dt.author': 'الكاتب',
    'demo.dt.views': 'المشاهدات',
    'demo.dt.rating': 'التقييم',
    'demo.dt.featured': 'مميّز',
    'demo.dt.published': 'تاريخ النشر',
    'demo.dt.caption': 'المقالات',
    'demo.dt.captionServer': 'المقالات (من الخادم)',
    'demo.dt.opened': 'تم فتح «{title}»',

    // ── data table: editing ──
    'demo.dt.titleHelp': 'جرّب «test» لترى خطأ تحقق من الخادم.',
    'demo.dt.duplicate': 'يوجد مقال بهذا العنوان بالفعل.',
    'demo.dt.created': 'تم إنشاء «{title}»',
    'demo.dt.updated': 'تم حفظ «{title}»',
    'demo.dt.deleted': 'تم حذف «{title}»',
    'demo.dt.feature': 'تمييز',
    'demo.dt.featuredToast': 'أصبح «{title}» مميّزًا',
    'demo.dt.share': 'إرسال إلى النشرة',
    'demo.dt.archive': 'أرشفة',
    'demo.dt.sent': 'سيُرسل «{title}» في نشرة الغد',
    'demo.dt.manage': 'إدارة',
    'demo.dt.preview': 'معاينة',
    'demo.dt.write': 'كتابة مقال',
    'demo.dt.newArticle': 'مقال جديد',
    'demo.dt.editArticle': 'تعديل المقال',
    'demo.dt.confirmDelete': 'هل تريد حذف «{title}»؟ لا يمكن التراجع عن ذلك.',
    'demo.dt.previewing': 'معاينة «{title}»',
    'demo.form.name': 'الاسم الكامل',
    'demo.form.email': 'البريد الإلكتروني',
    'demo.form.team': 'الفريق',
    'demo.form.age': 'العمر',
    'demo.form.message': 'الرسالة',
    'demo.form.terms': 'أوافق على قواعد الموقع',
    'demo.form.send': 'إرسال',
    'demo.form.sent': 'شكرًا يا {name}!',
    'Create, edit and delete': 'الإنشاء والتعديل والحذف',
    MudEditForm: 'MudEditForm',
    'A <strong>New</strong> button and an actions column: <strong>Edit</strong> and <strong>New</strong> open an EditForm in a dialog (validated as you type; saving takes half a second here), <strong>Delete</strong> asks first. The extra actions are your own: <em>Feature</em> shows only on rows that are not featured, <em>Archive</em> is disabled on featured rows. Switch how the actions are shown:':
      'زر <strong>جديد</strong> وعمود إجراءات: <strong>تعديل</strong> و<strong>جديد</strong> يفتحان EditForm في حوار (يُتحقق منه أثناء الكتابة؛ والحفظ يستغرق نصف ثانية هنا)، و<strong>حذف</strong> يطلب التأكيد أولًا. والإجراءات الإضافية من صنعك: <em>تمييز</em> يظهر فقط في الصفوف غير المميّزة، و<em>أرشفة</em> معطّل في الصفوف المميّزة. بدّل طريقة عرض الإجراءات:',
    'Show actions as': 'عرض الإجراءات كـ',
    'Icon buttons': 'أزرار أيقونات',
    'Text buttons': 'أزرار نصية',
    Menu: 'قائمة',
    'A custom column with edit and delete icon buttons': 'عمود مخصّص بأزرار أيقونات للتعديل والحذف',
    'No actions column here: the first column renders its own icon buttons. Any element with <code>data-dt-action="edit"</code>, <code>"delete"</code> or your own id runs that action on its row, so the buttons need no event wiring (and Blazor markup can use the same attribute).':
      'لا يوجد عمود إجراءات هنا: العمود الأول يعرض أزرار أيقوناته بنفسه. أي عنصر يحمل <code>data-dt-action="edit"</code> أو <code>"delete"</code> أو معرّفًا من اختيارك يشغّل ذلك الإجراء على صفه، فلا تحتاج الأزرار إلى ربط أحداث (ويمكن لعلامات Blazor استخدام الخاصية نفسها).',
    'EditForm on its own': 'EditForm وحده',
    '<code>MudEditForm</code> is also a component by itself: fields, a model, rules, and an async submit that can return field errors from the server. <code>openEditDialog()</code> puts one in a dialog.':
      '<code>MudEditForm</code> مكوّن قائم بذاته أيضًا: حقول، ونموذج بيانات، وقواعد، وإرسال غير متزامن يمكنه إرجاع أخطاء الحقول من الخادم. و<code>openEditDialog()</code> يضعه في حوار.',
    'Blazor: create, edit and delete': 'Blazor: الإنشاء والتعديل والحذف',
    "The dialog and its EditForm run in the browser; saving goes to .NET. The table raises <code>create</code>, <code>update</code> or <code>delete</code> with a <code>requestId</code>; answer with <code>completeEdit(requestId, savedRow)</code>, or <code>failEdit(requestId, message, errors)</code> to keep the form open with the server's messages (a ValidationProblemDetails <code>Errors</code> dictionary fits as it is). Custom actions raise <code>action</code>.":
      'يعمل الحوار ونموذج EditForm في المتصفح، ويذهب الحفظ إلى ‎.NET. يطلق الجدول <code>create</code> أو <code>update</code> أو <code>delete</code> مع <code>requestId</code>؛ فأجب بـ <code>completeEdit(requestId, savedRow)</code>، أو <code>failEdit(requestId, message, errors)</code> لإبقاء النموذج مفتوحًا مع رسائل الخادم (قاموس <code>Errors</code> من ValidationProblemDetails يناسب كما هو). والإجراءات المخصّصة تطلق <code>action</code>.',
    '<code>true</code> or <code>{ label, icon }</code>: a New button that opens the edit form.': '<code>true</code> أو <code>{ label, icon }</code>: زر «جديد» يفتح نموذج التعديل.',
    "An actions column: <code>'edit'</code>, <code>'delete'</code> and <code>{ id, label, icon?, color?, show?(row), disabled?(row), onClick?(row, table) }</code>, shown as <code>icons</code>, <code>buttons</code> or a <code>menu</code>.":
      "عمود إجراءات: <code>'edit'</code> و<code>'delete'</code> و<code>{ id, label, icon?, color?, show?(row), disabled?(row), onClick?(row, table) }</code>، يُعرض كـ <code>icons</code> أو <code>buttons</code> أو <code>menu</code>.",
    '<code>{ fields?, title?: { create, edit }, columns?, maxWidth? }</code>: MudEditForm fields; by default one per editable column (<code>editable: false</code> leaves a column out; <code>required</code> and <code>editor</code> on a column refine its field).':
      '<code>{ fields?, title?: { create, edit }, columns?, maxWidth? }</code>: حقول MudEditForm؛ افتراضيًا حقل لكل عمود قابل للتعديل (<code>editable: false</code> يستبعد العمود؛ و<code>required</code> و<code>editor</code> على العمود يضبطان حقله).',
    'Save (async). Return the saved row, or <code>{ errors }</code> (or throw) to keep the form open. Without them, client mode edits its own rows and <code>server.url</code> calls POST / PUT / DELETE.':
      'الحفظ (غير متزامن). أرجع الصف المحفوظ، أو <code>{ errors }</code> (أو ارمِ خطأ) لإبقاء النموذج مفتوحًا. ومن دونها يعدّل وضع العميل صفوفه بنفسه، ويستدعي <code>server.url</code> ‏POST / PUT / DELETE.',
    'A confirmation (or a function giving its text), custom actions without their own <code>onClick</code>, and a callback after every change.':
      'تأكيد (أو دالة تعطي نصه)، وإجراءات مخصّصة بلا <code>onClick</code> خاص بها، واستدعاء بعد كل تغيير.',
    'The edit form and delete, from code; <code>runAction(id, row | key)</code> runs any action.': 'نموذج التعديل والحذف من الشيفرة؛ و<code>runAction(id, row | key)</code> يشغّل أي إجراء.',
    'Change rows in client mode without a form.': 'تغيير الصفوف في وضع العميل دون نموذج.',
    '<code>[{ key, label, type?, required?, min?, max?, step?, minLength?, maxLength?, pattern?, options?, placeholder?, helper?, span?, validate?(value, model) }]</code>. Types: text, textarea, number, email, url, tel, password, date, datetime-local, time, color, select, radio, checkbox, switch, hidden.':
      '<code>[{ key, label, type?, required?, min?, max?, step?, minLength?, maxLength?, pattern?, options?, placeholder?, helper?, span?, validate?(value, model) }]</code>. الأنواع: text، textarea، number، email، url، tel، password، date، datetime-local، time، color، select، radio، checkbox، switch، hidden.',
    '<code>onSubmit(model)</code> may be async; return <code>{ errors }</code> or throw to show server errors.': '<code>onSubmit(model)</code> قد تكون غير متزامنة؛ أرجع <code>{ errors }</code> أو ارمِ خطأ لعرض أخطاء الخادم.',
    '<code>getModel</code>, <code>setModel</code>, <code>validate</code>, <code>setErrors(errors, message)</code>, <code>clearErrors</code>, <code>reset</code>, <code>submit</code>, <code>isDirty</code>, <code>focus</code>, <code>dispose</code>.':
      '<code>getModel</code>، <code>setModel</code>، <code>validate</code>، <code>setErrors(errors, message)</code>، <code>clearErrors</code>، <code>reset</code>، <code>submit</code>، <code>isDirty</code>، <code>focus</code>، <code>dispose</code>.',
    'The form in a dialog (resolves with the saved model, or null), and a yes / no question (resolves true or false).': 'النموذج في حوار (يُرجع النموذج المحفوظ أو null)، وسؤال نعم / لا (يُرجع true أو false).',
    '<code>query</code>, <code>rowclick</code> (row, when <code>rowClick: true</code>), <code>selection</code> (keys), <code>create</code> / <code>update</code> / <code>delete</code> ({ requestId, model | key }), <code>action</code> ({ action, key, row }), <code>changed</code>.':
      '<code>query</code>، <code>rowclick</code> (الصف، عند <code>rowClick: true</code>)، <code>selection</code> (المفاتيح)، <code>create</code> / <code>update</code> / <code>delete</code> ({ requestId, model | key })، <code>action</code> ({ action, key, row })، <code>changed</code>.',
    '<code>setData</code>, <code>setPage</code>, <code>failPage</code>, <code>reload</code>, <code>setQuery</code>, <code>getQuery</code>, <code>getSelection</code>, <code>clearSelection</code>, <code>openCreate</code>, <code>openEdit</code>, <code>deleteRow</code>, <code>completeEdit</code>, <code>failEdit</code>, <code>addRow</code>, <code>updateRow</code>, <code>removeRow</code>, <code>dispose</code>.':
      '<code>setData</code>، <code>setPage</code>، <code>failPage</code>، <code>reload</code>، <code>setQuery</code>، <code>getQuery</code>، <code>getSelection</code>، <code>clearSelection</code>، <code>openCreate</code>، <code>openEdit</code>، <code>deleteRow</code>، <code>completeEdit</code>، <code>failEdit</code>، <code>addRow</code>، <code>updateRow</code>، <code>removeRow</code>، <code>dispose</code>.',
    '<code>dotnet</code> (default: saving goes to .NET as above), <code>rest</code> (POST / PUT / DELETE on <code>server.url</code>) or <code>client</code> (rows in the browser only).':
      '<code>dotnet</code> (افتراضيًا: يذهب الحفظ إلى ‎.NET كما سبق)، أو <code>rest</code> (‏POST / PUT / DELETE على <code>server.url</code>)، أو <code>client</code> (الصفوف في المتصفح فقط).',
  },
  patterns: [
    [/^Handle methods: (.+?)\. Events? \(OnMudEvent\): (.+)\.$/, (_, m, e) => `دوال المقبض: ${m}. الأحداث (OnMudEvent): ${tr(e)}.`],
    [/^Handle methods: (.+?)\. Event: (.+)\.$/, (_, m, e) => `دوال المقبض: ${m}. الحدث: ${tr(e)}.`],
    [/^Started by <code>autoInit<\/code> \(the Default layout runs it on every page\), or one element at a time with (<code>mud\.behavior\(".+?", element\)<\/code>) from Blazor\.(.*)$/,
      (_, call, tail) => `يبدأ عبر <code>autoInit</code> (يشغّله التخطيط الافتراضي في كل صفحة)، أو لعنصر واحد في كل مرة عبر ${call} من Blazor.${STARTED_TAIL[tail] ?? tail}`],
    [/^Study No\. (\d+)$/, 'دراسة رقم $1'],
    [/^Anchor: (start|end|top|bottom)$/, (_, a) => `الموضع: ${{ start: 'البداية', end: 'النهاية', top: 'الأعلى', bottom: 'الأسفل' }[a]}`],
    [/^This drawer is anchored to <strong>(start|end|top|bottom)<\/strong>\. Click outside or the ✕ to close\.$/,
      (_, a) => `هذا الدرج مثبّت في <strong>${{ start: 'البداية', end: 'النهاية', top: 'الأعلى', bottom: 'الأسفل' }[a]}</strong>. انقر خارجه أو على ✕ للإغلاق.`],
    [/^Tooltip on (start|end|top|bottom)$/, (_, a) => `تلميح في ${{ start: 'البداية', end: 'النهاية', top: 'الأعلى', bottom: 'الأسفل' }[a]}`],
    [/^This is a (info|success|warning|error) toast$/, (_, k) => `هذا إشعار ${{ info: 'معلومات', success: 'نجاح', warning: 'تحذير', error: 'خطأ' }[k]}`],
    [/^Opened “(.+)”$/, 'تم فتح «$1»'],
  ],
};
