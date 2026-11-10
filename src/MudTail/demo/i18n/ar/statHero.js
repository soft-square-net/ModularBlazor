// Arabic: the Stat hero card (component page and the public site's speed section).
export default {
  messages: {
    'Stat hero card': 'بطاقة الإحصاءات البارزة',
    'A "how we compare" block for the public site: an eyebrow, a headline and a lead over a card of horizontal bars, one highlighted with a gradient and a large value. The bars grow in when the card scrolls into view. Use it for page speed, reader trust, match statistics, ticket sales or exhibition visitors.':
      'كتلة «كيف نقارن» للموقع العام: عنوان تمهيدي وعنوان رئيسي ومقدمة فوق بطاقة من الأشرطة الأفقية، أحدها مميّز بتدرّج لوني وقيمة كبيرة. تمتد الأشرطة عند ظهور البطاقة أثناء التمرير. استخدمها لسرعة الصفحات، أو ثقة القرّاء، أو إحصاءات المباريات، أو مبيعات التذاكر، أو زوار المعارض.',
    'Dark hero (markup)': 'بطاقة داكنة (بالعلامات)',
    'The markup a Razor page writes. <code>--mud-stat-value</code> sets each bar; <code>is-highlight</code> marks the one to stand out; <code>data-mud="stat-bars"</code> animates them.':
      'العلامات التي تكتبها صفحة Razor. ‏<code>--mud-stat-value</code> يحدّد كل شريط؛ و<code>is-highlight</code> يميّز الشريط البارز؛ و<code>data-mud="stat-bars"</code> يحرّكها.',
    'Best-in-class speed': 'الأسرع في فئتها',
    'The fastest front page in the region': 'أسرع صفحة أولى في المنطقة',
    'Every page is built from Blazor WebAssembly modules and MudTail, so it opens fast on any phone.': 'كل صفحة مبنية من وحدات Blazor WebAssembly وMudTail، فتفتح بسرعة على أي هاتف.',
    'Every page is built from Blazor WebAssembly modules and MudTail, so it opens fast on any phone. Readers stay with the story, not the loading screen.':
      'كل صفحة مبنية من وحدات Blazor WebAssembly وMudTail، فتفتح بسرعة على أي هاتف. ويبقى القرّاء مع القصة، لا مع شاشة التحميل.',
    '% of page visits that load in under two seconds': 'نسبة زيارات الصفحات التي تُحمَّل في أقل من ثانيتين',
    'The Daily Mud': 'ذا ديلي مَد',
    'Regional dailies': 'الصحف اليومية الإقليمية',
    'National papers': 'الصحف الوطنية',
    'News aggregators': 'مجمّعات الأخبار',
    Tabloids: 'الصحف الشعبية',
    '<a href="#">View the full dataset</a> · Fictional figures for this showcase.': '<a href="#">عرض البيانات كاملة</a> · أرقام خيالية لهذا العرض.',
    '<a href="#">View the full dataset</a> · Fictional figures for this showcase, in the style of a <a href="#">reader panel</a> and the <a href="#">regional media index</a>.':
      '<a href="#">عرض البيانات كاملة</a> · أرقام خيالية لهذا العرض، على غرار <a href="#">لجنة قرّاء</a> و<a href="#">مؤشر الإعلام الإقليمي</a>.',
    'Match statistics (JavaScript, page theme)': 'إحصاءات المباراة (JavaScript، بسمة الصفحة)',
    '<code>createStatCard()</code> builds the same markup from data. <code>dark: false</code> follows the page theme (try dark mode); each bar can take its own gradient (<code>from</code> / <code>to</code>) and colour (<code>fill</code>), and <code>sort</code> puts the largest first.':
      '<code>createStatCard()</code> يبني العلامات نفسها من البيانات. و<code>dark: false</code> يتبع سمة الصفحة (جرّب الوضع الداكن)؛ ويمكن لكل شريط أن يأخذ تدرّجه (<code>from</code> / <code>to</code>) ولونه (<code>fill</code>)، و<code>sort</code> يضع الأكبر أولًا.',
    'Matchday 12': 'الجولة 12',
    'Northbridge ran the midfield': 'نورثبريدج سيطر على خط الوسط',
    'Northbridge completed more passes than any side this season, and won 2–1.': 'أكمل نورثبريدج تمريرات أكثر من أي فريق هذا الموسم، وفاز 2–1.',
    'Pass accuracy': 'دقة التمرير',
    'League average': 'متوسط الدوري',
    'Source: <a href="#">match data</a>': 'المصدر: <a href="#">بيانات المباراة</a>',
    'Compact card, plain numbers': 'بطاقة مضغوطة بأرقام عادية',
    "Without a title it is just the card, for an article or a sidebar. <code>format: 'number'</code> writes the value as a number; <code>max</code> sets the scale.":
      "من دون عنوان تكون بطاقة فقط، لمقال أو شريط جانبي. و<code>format: 'number'</code> يكتب القيمة رقمًا؛ و<code>max</code> يحدّد المقياس.",
    'Visitors this weekend (thousands)': 'الزوار في عطلة نهاية الأسبوع (بالآلاف)',
    'City Gallery': 'معرض المدينة',
    'Harbour Museum': 'متحف الميناء',
    'Sculpture garden': 'حديقة المنحوتات',
    'The block; <code>--dark</code> for the deep navy look with a glow (otherwise it follows the page theme). Head: <code>__head</code>, <code>__eyebrow</code>, <code>__title</code>, <code>__lead</code>.':
      'الكتلة؛ و<code>--dark</code> للمظهر الكحلي العميق مع توهّج (وإلا فهي تتبع سمة الصفحة). الرأس: <code>__head</code>، <code>__eyebrow</code>، <code>__title</code>، <code>__lead</code>.',
    'The card: <code>__caption</code> (a <code>&lt;figcaption&gt;</code>), <code>.mud-stat-bars</code> (an <code>&lt;ol&gt;</code>), <code>__source</code>; <code>--compact</code>.':
      'البطاقة: <code>__caption</code> (عنصر <code>&lt;figcaption&gt;</code>)، و<code>.mud-stat-bars</code> (عنصر <code>&lt;ol&gt;</code>)، و<code>__source</code>؛ و<code>--compact</code>.',
    'A row: <code>__label</code>, <code>__track</code> &gt; <code>__fill</code> (with <code>__icon</code>) + <code>__value</code>. <code>is-highlight</code>: gradient and large value.':
      'صف: <code>__label</code>، <code>__track</code> &gt; <code>__fill</code> (مع <code>__icon</code>) + <code>__value</code>. و<code>is-highlight</code>: تدرّج لوني وقيمة كبيرة.',
    '<code>--mud-stat-value</code>, <code>--mud-stat-max</code> (100), <code>--mud-stat-from</code> / <code>--mud-stat-to</code> (the gradient), <code>--mud-stat-fill</code>, <code>--mud-stat-label-width</code>.':
      '<code>--mud-stat-value</code>، <code>--mud-stat-max</code> (100)، <code>--mud-stat-from</code> / <code>--mud-stat-to</code> (التدرّج)، <code>--mud-stat-fill</code>، <code>--mud-stat-label-width</code>.',
    'createStatCard(options)': 'createStatCard(options)',
    'Texts; <code>source</code> is trusted HTML (links).': 'النصوص؛ و<code>source</code> HTML موثوق (روابط).',
    '<code>[{ label, value, display?, icon?, highlight?, from?, to?, fill? }]</code>.': '<code>[{ label, value, display?, icon?, highlight?, from?, to?, fill? }]</code>.',
    '<code>format</code>: <code>percent</code> (default), <code>number</code> or a function. Returns <code>{ element, dispose }</code>.':
      '<code>format</code>: <code>percent</code> (افتراضيًا)، أو <code>number</code>، أو دالة. تُرجع <code>{ element, dispose }</code>.',
  },
};
