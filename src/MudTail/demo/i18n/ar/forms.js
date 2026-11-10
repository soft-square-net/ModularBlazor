// Arabic: Components ▸ Forms pages, the live messages their examples produce, and the autocomplete countries.
const STRENGTH = { 'Very Weak': 'ضعيفة جدًا', Weak: 'ضعيفة', Medium: 'متوسطة', Strong: 'قوية', 'Very Strong': 'قوية جدًا' };

export default {
  messages: {
    // ── shared field API rows ──
    'Wraps label, field and helper text; stacks them with spacing.': 'يحيط بالتسمية والحقل والنص المساعد، ويرصّها بمسافات.',
    'The label. Add <code>&lt;span class="mud-required"&gt;*&lt;/span&gt;</code> for required fields.': 'التسمية. أضف <code>&lt;span class="mud-required"&gt;*&lt;/span&gt;</code> للحقول المطلوبة.',
    'The bordered box. Modifiers: <code>mud-input-error</code>, <code>mud-input-success</code>, <code>mud-input-wrapper--dense</code>. A disabled input greys it out.':
      'الإطار المحدّد. المعدّلات: <code>mud-input-error</code> و<code>mud-input-success</code> و<code>mud-input-wrapper--dense</code>. والحقل المعطّل يُظهره باهتًا.',
    'The input / textarea / select itself.': 'حقل الإدخال / منطقة النص / القائمة نفسها.',
    'Icons or text inside the box, before / after the value (they swap sides in RTL).': 'أيقونات أو نص داخل الإطار، قبل القيمة / بعدها (يتبادلان الجهة في الاتجاه من اليمين إلى اليسار).',
    'Hint under the field; <code>.error</code> / <code>.success</code> colour it.': 'تلميح أسفل الحقل؛ و<code>.error</code> / <code>.success</code> يلوّنانه.',

    // ── Text field ──
    'A labelled single-line input. Everything is markup and CSS, so a Razor component can render it directly and bind it with <code>@bind</code>.':
      'حقل إدخال من سطر واحد بتسمية. كل شيء ترميز وCSS، فيمكن لمكوّن Razor عرضه مباشرة وربطه بـ <code>@bind</code>.',
    Basic: 'أساسي',
    'Label, field and an optional hint. Associate the label with <code>for</code> / <code>id</code>.': 'تسمية وحقل وتلميح اختياري. اربط التسمية بالحقل عبر <code>for</code> / <code>id</code>.',
    'Full name': 'الاسم الكامل',
    'e.g. Lina Haddad': 'مثال: لينا حداد',
    'As it should appear on your profile.': 'كما يجب أن يظهر في ملفك الشخصي.',
    Adornments: 'الإضافات',
    'Icons or units inside the field. Start and end follow the writing direction.': 'أيقونات أو وحدات داخل الحقل. البداية والنهاية تتبعان اتجاه الكتابة.',
    Email: 'البريد الإلكتروني',
    'you@example.com': 'you@example.com',
    Weight: 'الوزن',
    kg: 'كغ',
    Validation: 'التحقق',
    "Live email validation with the library's <code>validateEmail()</code>: the wrapper and helper text switch between error and success.":
      'تحقق فوري من البريد الإلكتروني بالدالة <code>validateEmail()</code> من المكتبة: يتبدل الإطار والنص المساعد بين الخطأ والنجاح.',
    'Work email': 'بريد العمل',
    'Type an email': 'اكتب بريدًا إلكترونيًا',
    'We never share it.': 'لن نشاركه أبدًا.',
    'Looks good.': 'يبدو صحيحًا.',
    'Email is required': 'البريد الإلكتروني مطلوب',
    'Please enter a valid email address': 'يُرجى إدخال بريد إلكتروني صالح',
    'States and density': 'الحالات والكثافة',
    Disabled: 'معطّل',
    'Read only for now': 'للقراءة فقط حاليًا',
    Dense: 'مضغوط',
    'Compact field for toolbars and tables': 'حقل مضغوط لأشرطة الأدوات والجداول',

    // ── Password ──
    'A password field with a reveal button. Add <code>data-mud="password-toggle"</code> to the wrapper: the button works without any interop and the field is hidden again when the behaviour is disposed.':
      'حقل كلمة مرور بزر إظهار. أضف <code>data-mud="password-toggle"</code> إلى الإطار: يعمل الزر دون أي تكامل برمجي، ويُخفى الحقل مجددًا عند التخلص من السلوك.',
    'With reveal button': 'مع زر الإظهار',
    'Strength meter': 'مقياس القوة',
    "Uses the library's <code>evaluatePasswordStrength()</code>.": 'يستخدم الدالة <code>evaluatePasswordStrength()</code> من المكتبة.',
    'New password': 'كلمة المرور الجديدة',
    'At least 8 characters.': '8 أحرف على الأقل.',
    'On the <code>.mud-input-wrapper</code>. Switches the input between password and text.': 'على <code>.mud-input-wrapper</code>. يبدّل الحقل بين كلمة مرور ونص.',
    'The button inside the wrapper (<code>.mud-input-toggle</code>). The script sets its <code>aria-pressed</code> and <code>aria-label</code>.': 'الزر داخل الإطار (<code>.mud-input-toggle</code>). يضبط النص البرمجي <code>aria-pressed</code> و<code>aria-label</code> له.',
    'Optional icons; the right one shows for the current state.': 'أيقونات اختيارية؛ تظهر المناسبة منها للحالة الحالية.',
    '<code>mud.behavior("password-toggle", wrapperRef)</code> attaches it to one field; <code>autoInit</code> does it for all.': '<code>mud.behavior("password-toggle", wrapperRef)</code> يربطه بحقل واحد؛ و<code>autoInit</code> يربطه بالجميع.',

    // ── Number ──
    'Numeric input with tabular figures, units as adornments, and range checking with <code>validateNumericRange()</code>.': 'حقل رقمي بأرقام جدولية، ووحدات كإضافات، وتحقق من المدى عبر <code>validateNumericRange()</code>.',
    'Range and currency': 'المدى والعملة',
    'Checks 1–100 and shows the value formatted with <code>formatCurrency()</code>.': 'يتحقق من المدى 1–100 ويعرض القيمة منسّقة بـ <code>formatCurrency()</code>.',
    Seats: 'المقاعد',

    // ── Text area ──
    'Multi-line input. Use a <code>textarea.mud-input-slot</code> inside the wrapper; it resizes vertically.': 'إدخال متعدد الأسطر. استخدم <code>textarea.mud-input-slot</code> داخل الإطار؛ ويتغير حجمه عموديًا.',
    'With character count': 'مع عدّاد الأحرف',
    Summary: 'الملخص',
    'What is the story about?': 'عمّ تتحدث القصة؟',

    // ── Select ──
    'The native <code>&lt;select&gt;</code>, themed. Keyboard, screen readers and mobile pickers keep working, and Blazor binds it with <code>@bind</code>.':
      'عنصر <code>&lt;select&gt;</code> الأصلي بتنسيق السمة. تبقى لوحة المفاتيح وقارئات الشاشة ومنتقيات الهاتف تعمل، ويربطه Blazor بـ <code>@bind</code>.',
    'Single and multiple': 'مفرد ومتعدد',
    Tags: 'الوسوم',
    Athletics: 'ألعاب القوى',
    'Ctrl / ⌘-click to pick several.': 'انقر مع Ctrl / ⌘ لاختيار عدة عناصر.',
    Locked: 'مقفل',
    'Adds the chevron and makes room for it. Works with <code>multiple</code> (no chevron).': 'يضيف السهم ويفسح له مكانًا. ويعمل مع <code>multiple</code> (دون سهم).',

    // ── Date & time ──
    'Date, time and colour': 'التاريخ والوقت واللون',
    'Native pickers in MudTail fields. They follow dark mode through <code>color-scheme</code>.': 'منتقيات أصلية داخل حقول MudTail. تتبع الوضع الداكن عبر <code>color-scheme</code>.',
    Pickers: 'المنتقيات',
    'Publish date': 'تاريخ النشر',
    'Kick-off': 'انطلاق المباراة',
    'Embargo until': 'حظر النشر حتى',
    'Section colour': 'لون القسم',

    // ── File ──
    'The native file input with its button styled as a MudTail button. In Blazor use <code>&lt;InputFile class="mud-input-slot"&gt;</code> inside the wrapper.':
      'حقل الملفات الأصلي مع زر بتنسيق أزرار MudTail. في Blazor استخدم <code>&lt;InputFile class="mud-input-slot"&gt;</code> داخل الإطار.',
    'Cover image': 'صورة الغلاف',
    'JPG or PNG, up to 5 MB.': 'JPG أو PNG، حتى 5 م.ب.',
    Attachments: 'المرفقات',

    // ── Checkbox ──
    'Native checkboxes in the theme colour. Group them in a <code>fieldset.mud-choice-group</code> with a legend.': 'مربعات اختيار أصلية بلون السمة. اجمعها في <code>fieldset.mud-choice-group</code> مع عنوان.',
    Group: 'مجموعة',
    Newsletters: 'النشرات البريدية',
    'Morning briefing': 'الموجز الصباحي',
    'Culture weekly': 'ثقافة الأسبوع',
    'Members only (disabled)': 'للأعضاء فقط (معطّل)',
    'Select all (indeterminate)': 'تحديد الكل (غير محدد)',
    'The parent box shows a dash when only some children are checked.': 'يُظهر المربع الأب شرطة عندما يُحدَّد بعض الأبناء فقط.',
    Permissions: 'الصلاحيات',
    All: 'الكل',
    Read: 'قراءة',
    Write: 'كتابة',
    'A <code>&lt;label&gt;</code> around the input and its text.': 'عنصر <code>&lt;label&gt;</code> يحيط بالحقل ونصه.',
    'Lays choices out in a row; add <code>--column</code> for a column.': 'يرتّب الخيارات في صف؛ وأضف <code>--column</code> لعرضها في عمود.',

    // ── Radio ──
    'One choice from a few. Give the radios the same <code>name</code> and put them in a <code>fieldset.mud-choice-group</code>.': 'اختيار واحد من بضعة خيارات. امنح الأزرار <code>name</code> نفسه وضعها في <code>fieldset.mud-choice-group</code>.',
    'Row and column': 'صف وعمود',
    Layout: 'التخطيط',
    List: 'قائمة',
    Delivery: 'التوصيل',
    'Every morning': 'كل صباح',
    'Weekly digest': 'ملخص أسبوعي',
    'Breaking only (disabled)': 'العاجل فقط (معطّل)',

    // ── Switch ──
    'An on / off setting that applies straight away. It is a checkbox underneath, so it is keyboard and screen-reader friendly; the thumb slides the other way in RTL.':
      'إعداد تشغيل / إيقاف يُطبَّق فورًا. هو مربع اختيار في جوهره، فيعمل مع لوحة المفاتيح وقارئات الشاشة؛ وينزلق المؤشر في الاتجاه المعاكس عند الكتابة من اليمين إلى اليسار.',
    Settings: 'الإعدادات',
    'Live score alerts': 'تنبيهات النتائج المباشرة',
    'Autoplay videos': 'تشغيل الفيديو تلقائيًا',
    'Beta features (disabled)': 'الميزات التجريبية (معطّلة)',
    'A <code>&lt;label&gt;</code> holding the checkbox, the track and the text. Add <code>role="switch"</code> to the input.': 'عنصر <code>&lt;label&gt;</code> يضم مربع الاختيار والمسار والنص. أضف <code>role="switch"</code> إلى الحقل.',
    'The visual switch.': 'المفتاح المرئي.',

    // ── Slider ──
    'A range input in the theme colour. Wrap it in <code>.mud-slider-field</code> with an <code>&lt;output&gt;</code> to show the value.': 'حقل مدى بلون السمة. ضعه في <code>.mud-slider-field</code> مع <code>&lt;output&gt;</code> لإظهار القيمة.',
    'With value': 'مع القيمة',
    Volume: 'مستوى الصوت',
    'Stepped (0–10)': 'بخطوات (0–10)',
    'The <code>input[type=range]</code>.': 'العنصر <code>input[type=range]</code>.',
    'Puts the slider and its <code>&lt;output&gt;</code> side by side.': 'يضع المنزلق و<code>&lt;output&gt;</code> جنبًا إلى جنب.',

    // ── Autocomplete ──
    'A text field that suggests matches as you type, with keyboard navigation. Created in JavaScript; from Blazor use <code>create("autocomplete", host, options, dotNetRef)</code>, which raises <code>select</code>.':
      'حقل نصي يقترح نتائج مطابقة أثناء الكتابة، مع التنقل بلوحة المفاتيح. يُنشأ بـ JavaScript؛ ومن Blazor استخدم <code>create("autocomplete", host, options, dotNetRef)</code> الذي يطلق <code>select</code>.',
    Countries: 'الدول',
    Country: 'الدولة',
    'Field label.': 'تسمية الحقل.',
    'Placeholder text.': 'النص الإرشادي.',
    'Strings to search.': 'النصوص التي يُبحث فيها.',
    'Called when a suggestion is picked.': 'تُستدعى عند اختيار اقتراح.',
    'An AbortSignal; aborting it removes the document listener.': 'إشارة AbortSignal؛ وإلغاؤها يزيل مستمع المستند.',
    'United States': 'الولايات المتحدة',
    'United Kingdom': 'المملكة المتحدة',
    Germany: 'ألمانيا',
    France: 'فرنسا',
    Japan: 'اليابان',
    Canada: 'كندا',
    Australia: 'أستراليا',
    Egypt: 'مصر',
    'United Arab Emirates': 'الإمارات العربية المتحدة',
    Netherlands: 'هولندا',
    Sweden: 'السويد',
    Switzerland: 'سويسرا',
    Singapore: 'سنغافورة',
    Brazil: 'البرازيل',
    India: 'الهند',

    // ── Input group ──
    'Joins text, fields, selects and buttons into one control: <code>.mud-input-group</code> squares the inner corners and shares the borders. The rounded ends follow the writing direction.':
      'يجمع النصوص والحقول والقوائم والأزرار في عنصر تحكم واحد: <code>.mud-input-group</code> يجعل الزوايا الداخلية حادّة ويشارك الحدود. والأطراف المستديرة تتبع اتجاه الكتابة.',
    'Text addons': 'إضافات نصية',
    Website: 'الموقع الإلكتروني',
    Price: 'السعر',
    Username: 'اسم المستخدم',
    'With buttons and a select': 'مع أزرار وقائمة اختيار',
    'Search the archive': 'البحث في الأرشيف',
    Keywords: 'كلمات مفتاحية',
    Search: 'بحث',
    'Find in': 'البحث في',
    'All sections': 'كل الأقسام',
    'Headline or author': 'العنوان أو الكاتب',
    Invite: 'دعوة',
    'Copy link': 'نسخ الرابط',
    'Row container; its direct children are joined.': 'حاوية صفّية؛ يُضم أبناؤها المباشرون معًا.',
    'A text or icon segment.': 'جزء نصي أو أيقونة.',
    'Any mix of <code>.mud-input-addon</code>, <code>.mud-input-wrapper</code> (input or select) and <code>.mud-button-root</code>.': 'أي مزيج من <code>.mud-input-addon</code> و<code>.mud-input-wrapper</code> (حقل أو قائمة) و<code>.mud-button-root</code>.',
  },
  patterns: [
    [/^Selected: (.+)$/, 'المختار: $1'],
    [/^Total: (.+)$/, 'الإجمالي: $1'],
    [/^Strength: (.+)$/, (_, s) => `القوة: ${STRENGTH[s] ?? s}`],
    [/^Seats must not exceed (\d+)$/, 'يجب ألا يتجاوز عدد المقاعد $1'],
    [/^Seats must be at least (\d+)$/, 'يجب ألا يقل عدد المقاعد عن $1'],
    [/^Seats must be a valid number$/, 'يجب أن يكون عدد المقاعد رقمًا صالحًا'],
    [/^× \$12\.50$/, '× ‎$12.50'],
  ],
};
