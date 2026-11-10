// Arabic: the Image editor component page.
export default {
  messages: {
    'Image editor': 'محرر الصور',
    'A Photoshop-style editor in the browser: crop with aspect ratios, rotate, straighten and flip, zoom and pan, light and colour adjustments, filters, a histogram, drawing, text and shapes, undo / redo and before / after. It resizes, creates every size your site needs (thumbnail, card, article, hero…) in WebP, JPEG or PNG, and sends them to your API as a form or as a binary stream. Edits stay non-destructive until you export.':
      'محرر بأسلوب فوتوشوب داخل المتصفح: القص بنسب الأبعاد، والتدوير والتسوية والقلب، والتكبير والتحريك، وضبط الإضاءة والألوان، والمرشّحات، والمدرّج التكراري، والرسم والنصوص والأشكال، والتراجع والإعادة، والمقارنة بالأصل. ويغيّر الحجم، وينشئ كل الأحجام التي يحتاجها موقعك (مصغّرة، بطاقة، مقال، واجهة…) بصيغ WebP أو JPEG أو PNG، ويرسلها إلى واجهتك البرمجية كنموذج أو كتدفق ثنائي. وتبقى التعديلات غير إتلافية حتى التصدير.',
    'The editor': 'المحرر',
    'Try the tools on the left (keys in brackets), the panels on the right, scroll to zoom and hold <strong>Compare</strong> for the original. <strong>Save</strong> sends the sizes to a pretend API here; the request it would make is shown below the editor.':
      'جرّب الأدوات الجانبية (الاختصارات بين قوسين)، واللوحات المقابلة، ومرّر للتكبير، واضغط مطوّلًا على <strong>المقارنة</strong> لرؤية الأصل. و<strong>حفظ</strong> يرسل الأحجام إلى واجهة برمجية تجريبية هنا؛ ويظهر الطلب الذي كان سيُرسل أسفل المحرر.',
    'demo.ie.noRequest': 'اضغط «حفظ»: يظهر الطلب هنا.',
    'Recipes: regenerate the same files later': 'الوصفات: إعادة إنشاء الملفات نفسها لاحقًا',
    'A recipe records the original (size, type, SHA-256), every operation and the sizes to make. Store it next to the original; <code>renderRecipe(original, recipe)</code> replays it with the same code the editor exports with, so the files come out the same, for example after you add a size, or to rebuild a lost file. <code>editor.applyRecipe(recipe)</code> reopens the edit in the editor. Below, a stored recipe is replayed twice on the original and the bytes are compared.':
      'تسجّل الوصفة الصورة الأصلية (الحجم، والنوع، وSHA-256)، وكل عملية، والأحجام المطلوبة. احفظها بجانب الأصل؛ و<code>renderRecipe(original, recipe)</code> يعيد تنفيذها بالشيفرة نفسها التي يصدّر بها المحرر، فتخرج الملفات نفسها، مثلًا بعد إضافة حجم أو لإعادة بناء ملف مفقود. و<code>editor.applyRecipe(recipe)</code> يعيد فتح التعديل في المحرر. وفي الأسفل تُعاد وصفة محفوظة مرتين على الأصل وتُقارن البايتات.',
    'Regenerate the files from the recipe': 'إعادة إنشاء الملفات من الوصفة',
    'demo.ie.regenerate': 'إعادة إنشاء الملفات من الوصفة',
    'demo.ie.rendering': 'جارٍ الإنشاء…',
    'demo.ie.identical': 'أُنشئت مرتين: كل الملفات ({count}) متطابقة بايتًا ببايت.',
    'demo.ie.different': 'أُنشئت مرتين: بعض الملفات مختلفة.',
    '.NET: store the recipe': '‎.NET: حفظ الوصفة',
    'Keep the original untouched and the recipe next to it. Regenerating runs where MudTail runs (the browser or Blazor WebAssembly): load the original and the recipe, call <code>renderRecipe</code>, and upload the files again.':
      'أبقِ الأصل دون تعديل والوصفة بجانبه. تجري إعادة الإنشاء حيث يعمل MudTail (المتصفح أو Blazor WebAssembly): حمّل الأصل والوصفة، واستدعِ <code>renderRecipe</code>، ثم ارفع الملفات من جديد.',
    '.NET: receive the images': '‎.NET: استقبال الصور',
    "Two ways to receive the files: a multipart form (all sizes in one request, with a <code>meta</code> JSON part), or a stream per size (<code>mode: 'stream'</code>) read straight from the request body, never buffered in memory.":
      "طريقتان لاستقبال الملفات: نموذج متعدد الأجزاء (كل الأحجام في طلب واحد، مع جزء JSON باسم <code>meta</code>)، أو تدفق لكل حجم (<code>mode: 'stream'</code>) يُقرأ مباشرة من جسم الطلب دون تخزينه في الذاكرة.",
    'The editor runs in the browser; the bytes come back to .NET as a stream (<code>IJSStreamReference</code>), so your component can store them with its own authorised <code>HttpClient</code>. With <code>saveWith = "dotnet"</code> the Save button raises <code>save</code> with the file list.':
      'يعمل المحرر في المتصفح، وتعود البايتات إلى ‎.NET كتدفق (<code>IJSStreamReference</code>)، فيحفظها مكوّنك عبر <code>HttpClient</code> المصرّح له. ومع <code>saveWith = "dotnet"</code> يطلق زر الحفظ الحدث <code>save</code> بقائمة الملفات.',
    'The image (URL, data URL, File, Blob or <code>&lt;img&gt;</code>) and the base name for exported files. URLs on another site need CORS, or the canvas cannot be exported.':
      'الصورة (رابط، أو رابط بيانات، أو File، أو Blob، أو <code>&lt;img&gt;</code>) والاسم الأساسي للملفات المصدّرة. وتحتاج الروابط من موقع آخر إلى CORS، وإلا تعذّر تصدير اللوحة.',
    '<code>[{ name, width?, height?, fit }]</code>; <code>fit</code>: <code>cover</code> (crop to fill), <code>contain</code>, <code>width</code>, <code>height</code>, <code>inside</code> (never upscale), <code>fill</code>.':
      '<code>[{ name, width?, height?, fit }]</code>؛ و<code>fit</code>: <code>cover</code> (قص للملء)، <code>contain</code>، <code>width</code>، <code>height</code>، <code>inside</code> (دون تكبير)، <code>fill</code>.',
    '<code>webp</code> (default), <code>jpeg</code>, <code>png</code> or <code>avif</code> (where the browser can encode it); quality 0–1.':
      '<code>webp</code> (افتراضيًا)، أو <code>jpeg</code>، أو <code>png</code>، أو <code>avif</code> (حيث يستطيع المتصفح ترميزها)؛ والجودة 0–1.',
    "<code>{ url, method, mode: 'multipart' | 'stream', fieldName, headers, withCredentials, data }</code>. Multipart sends every size plus <code>meta</code> and <code>edit</code> JSON; stream sends one request per size with the bytes as the body and <code>X-File-Name</code>, <code>X-Image-Size</code>, <code>X-Image-Width</code>, <code>X-Image-Height</code> headers. <code>{name}</code> in the URL is replaced.":
      "<code>{ url, method, mode: 'multipart' | 'stream', fieldName, headers, withCredentials, data }</code>. متعدد الأجزاء يرسل كل الأحجام مع JSON باسم <code>meta</code> و<code>edit</code>؛ والتدفق يرسل طلبًا لكل حجم، جسمه البايتات، مع الترويسات <code>X-File-Name</code> و<code>X-Image-Size</code> و<code>X-Image-Width</code> و<code>X-Image-Height</code>. ويُستبدل <code>{name}</code> في الرابط.",
    'Your own saving instead of <code>upload</code>, and callbacks.': 'حفظك الخاص بدل <code>upload</code>، والاستدعاءات.',
    "The editor height; the working preview's longest side (exports are always full size); which tools to show.": 'ارتفاع المحرر؛ وأطول ضلع للمعاينة (التصدير دائمًا بالحجم الكامل)؛ والأدوات المعروضة.',
    'Images and the edit (a plain object you can store and restore).': 'الصور والتعديل (كائن بسيط يمكنك حفظه واستعادته).',
    'Transforms.': 'التحويلات.',
    'Adjustments (exposure, brightness, contrast, highlights, shadows, temperature, tint, saturation, vibrance, hue, vignette, grain, sharpen, blur, grayscale, sepia, invert) and presets.':
      'التعديلات (التعريض، السطوع، التباين، المناطق الفاتحة، الظلال، حرارة اللون، الصبغة، التشبّع، الحيوية، تدرّج اللون، تعتيم الأطراف، الحبيبات، الحدّة، التمويه، الأبيض والأسود، البنّي العتيق، عكس الألوان) والإعدادات الجاهزة.',
    'Output.': 'الناتج.',
    'View and lifetime.': 'العرض ودورة الحياة.',
    'Move, crop, brush, highlighter, text, rectangle, ellipse, arrow, eyedropper.': 'تحريك، قص، فرشاة، قلم تمييز، نص، مستطيل، شكل بيضاوي، سهم، قطّارة.',
    'Undo, redo.': 'تراجع، إعادة.',
    'Zoom in, out, fit, actual pixels; pan with any tool.': 'تكبير، تصغير، ملاءمة، الحجم الفعلي؛ والتحريك بأي أداة.',
    'Apply or cancel the crop; brush size.': 'تطبيق القص أو إلغاؤه؛ وحجم الفرشاة.',
    '<code>opened</code>, <code>change</code>, <code>exported</code>, <code>uploaded</code>, <code>save</code> (with <code>saveWith: "dotnet"</code>), <code>error</code>.':
      '<code>opened</code>، <code>change</code>، <code>exported</code>، <code>uploaded</code>، <code>save</code> (مع <code>saveWith: "dotnet"</code>)، <code>error</code>.',
  },
};
