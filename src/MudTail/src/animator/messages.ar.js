// MudTail Animator: Arabic texts for the Studio's chrome and the player's controls. Keys missing here fall back to English.

const a = (key) => `animator.${key}`;

export const ANIMATOR_AR = Object.fromEntries(Object.entries({
  // player
  'player.role': 'رسوم متحركة', 'player.prev': 'الشريحة السابقة', 'player.next': 'الشريحة التالية', 'player.playPause': 'تشغيل أو إيقاف مؤقت',
  'player.position': 'الموضع', 'player.restart': 'إعادة التشغيل',
  // top bar
  sceneName: 'اسم المشهد', unsaved: 'تغييرات غير محفوظة', open: 'مشهد جديد أو فتح مشهد…', import: 'استيراد ملف مشهد…', save: 'حفظ (Ctrl+S)',
  export: 'تصدير وتضمين…', undo: 'تراجع (Ctrl+Z)', redo: 'إعادة (Ctrl+Y)', views: 'طرق العرض', toStart: 'إلى البداية', play: 'تشغيل (مسافة)', pause: 'إيقاف مؤقت (مسافة)',
  toEnd: 'إلى النهاية', loop: 'تكرار التشغيل', preview: 'معاينة', previewHint: 'شغّل المشهد في المشغّل الحقيقي مع المحفّز والشرائح والتفاعلات', gsap: 'إضافات GSAP في الاستوديو', time: 'الوقت',
  'status.ready': 'جاهز · المسافة للتشغيل · Ctrl+Z للتراجع · Del للحذف · الأسهم للتحريك', 'status.undo': 'تم التراجع: {label}', 'status.redo': 'تمت الإعادة: {label}',
  'toast.saved': 'تم حفظ "{name}"', 'toast.copied': 'تم النسخ', 'toast.imported': 'تم استيراد "{name}"',
  // stage
  'stage.base': 'التصميم الأساسي', 'stage.override': 'تعديلات خاصة بـ {view}', 'stage.snap': 'المحاذاة التلقائية', 'stage.zoomIn': 'تكبير', 'stage.zoomOut': 'تصغير',
  'stage.zoomFit': 'ملاءمة النافذة', 'stage.actual': 'الحجم الفعلي (100%)', 'stage.rotate': 'تدوير (Shift: كل 15°)', 'stage.origin': 'نقطة التحويل',
  // timeline
  'tl.title': 'الخط الزمني', 'tl.addLabel': 'إضافة علامة عند رأس التشغيل', 'tl.addClip': 'إضافة حركة للطبقة المحددة', 'tl.snap': 'المحاذاة للشبكة والعلامات والمقاطع',
  'tl.hint': 'اسحب المقاطع لنقلها والحواف لتمديدها · انقر مرتين على صف للإضافة', 'tl.zoom': 'تكبير الخط الزمني', 'tl.zoomIn': 'تكبير', 'tl.zoomOut': 'تصغير',
  'tl.show': 'إظهار', 'tl.hide': 'إخفاء', 'tl.lock': 'قفل', 'tl.unlock': 'فتح القفل', 'tl.empty': 'أضف طبقات من المكتبة ثم حركات هنا.', 'tl.labelName': 'اسم العلامة', 'tl.end': 'نهاية المشهد',
  // inspector
  'ins.design': 'التصميم', 'ins.animate': 'الحركة', 'ins.interact': 'التفاعل', 'ins.scene': 'المشهد', 'ins.geometry': 'الموضع والتحويل', 'ins.look': 'المظهر',
  'ins.align': 'محاذاة إلى المسرح', 'ins.duplicate': 'تكرار (Ctrl+D)', 'ins.delete': 'حذف', 'ins.up': 'إلى الأمام', 'ins.down': 'إلى الخلف', 'ins.group': 'تجميع', 'ins.ungroup': 'فك التجميع',
  'ins.clips': 'الحركات على {name}', 'ins.addClip': 'إضافة حركة', 'ins.add': 'إضافة عند رأس التشغيل', 'ins.presets': 'حركات جاهزة (عند رأس التشغيل)', 'ins.noClips': 'لا توجد حركات بعد: اختر حركة جاهزة أو أضف واحدة.',
  'ins.timing': 'التوقيت', 'ins.ease': 'منحنى السرعة', 'ins.type': 'النوع', 'ins.start': 'البداية (ث)', 'ins.duration': 'المدة (ث)', 'ins.repeat': 'التكرار', 'ins.forever': 'تكرار دائم',
  'ins.yoyo': 'ذهاب وإياب', 'ins.repeatDelay': 'تأخير التكرار (ث)', 'ins.fromTo': 'من ← إلى', 'ins.values': 'القيم', 'ins.stagger': 'التتابع', 'ins.plays': 'يعمل في',
  'ins.interactions': 'التفاعلات', 'ins.addInteraction': 'إضافة تفاعل', 'ins.draggable': 'قابل للسحب (Draggable + InertiaPlugin)', 'ins.playback': 'التشغيل في المشغّل',
  'ins.views': 'طرق العرض (متجاوب)', 'ins.labels': 'العلامات', 'ins.name': 'الاسم', 'ins.background': 'الخلفية', 'ins.length': 'المدة (ث)', 'ins.speed': 'السرعة', 'ins.mode': 'الوضع',
  'ins.trigger': 'يبدأ', 'ins.fit': 'الملاءمة', 'ins.controls': 'إظهار أزرار التحكم', 'ins.addView': 'إضافة طريقة عرض', 'ins.addLabel': 'إضافة علامة عند رأس التشغيل', 'ins.remove': 'إزالة',
  // library
  'lib.add': 'إضافة', 'lib.assets': 'الملفات', 'lib.layers': 'الطبقات', 'lib.basics': 'نصوص وكتل', 'lib.heading': 'عنوان', 'lib.paragraph': 'فقرة', 'lib.counter': 'رقم', 'lib.button': 'زر',
  'lib.group': 'مجموعة', 'lib.shapes': 'أشكال (قابلة للتحوّل)', 'lib.icons': 'أيقونات (خطوط قابلة للرسم)', 'lib.media': 'وسائط', 'lib.image': 'صورة', 'lib.video': 'فيديو', 'lib.audio': 'صوت',
  'lib.url': 'من رابط', 'lib.pasteSvg': 'لصق SVG', 'lib.canvas': 'تأثيرات اللوحة', 'lib.drop': 'أفلت الصور أو SVG أو الفيديو أو الصوت هنا، أو انقر للاختيار', 'lib.noAssets': 'لا توجد ملفات بعد.',
  // io
  'io.openTitle': 'مشهد جديد أو فتح مشهد', 'io.templates': 'ابدأ من', 'io.saved': 'المحفوظ في هذا المتصفح', 'io.importFile': 'استيراد ملف…', 'io.exportTitle': 'تصدير وتضمين "{name}"',
  'io.copyJson': 'نسخ JSON', 'io.downloadHtml': 'تنزيل صفحة HTML', 'io.copy': 'نسخ', 'io.previewTitle': 'معاينة "{name}"', 'io.restart': 'إعادة', 'io.auto': 'تلقائي (حسب العرض)',
}).map(([k, v]) => [a(k), v]));
