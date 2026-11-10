// Components ▸ Image editor: the full editor on a generated photo, with a pretend API showing what is uploaded.
import { MudImageEditor, renderRecipe, createMudButton, showToast, t, formatNumber } from 'mudtail';
import { componentPage } from './page.js';

/** A generated landscape "photo" (no network, so the canvas stays exportable). */
function samplePhoto(w = 2400, h = 1600) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62);
  sky.addColorStop(0, '#1e3a8a');
  sky.addColorStop(0.55, '#f97316');
  sky.addColorStop(1, '#fde68a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const sun = ctx.createRadialGradient(w * 0.68, h * 0.5, 10, w * 0.68, h * 0.5, h * 0.22);
  sun.addColorStop(0, 'rgba(255,250,220,1)');
  sun.addColorStop(0.3, 'rgba(255,214,120,0.9)');
  sun.addColorStop(1, 'rgba(255,170,80,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);
  const ridge = (base, amp, color, seed) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 20) ctx.lineTo(x, base + Math.sin(x / (180 + seed * 40) + seed) * amp + Math.sin(x / 63 + seed * 3) * amp * 0.25);
    ctx.lineTo(w, h);
    ctx.fill();
  };
  ridge(h * 0.52, 60, '#7c2d12cc', 1);
  ridge(h * 0.58, 45, '#431407', 2);
  const sea = ctx.createLinearGradient(0, h * 0.62, 0, h);
  sea.addColorStop(0, '#0e7490');
  sea.addColorStop(1, '#082f49');
  ctx.fillStyle = sea;
  ctx.fillRect(0, h * 0.64, w, h * 0.36);
  ctx.fillStyle = 'rgba(255, 225, 160, 0.55)';
  for (let i = 0; i < 70; i++) ctx.fillRect(w * 0.6 + Math.sin(i * 7.3) * w * 0.07, h * 0.66 + i * 7, 80 + Math.cos(i) * 60, 3);
  // A boat and a lighthouse to crop around.
  ctx.fillStyle = '#111827';
  ctx.beginPath(); ctx.moveTo(w * 0.28, h * 0.74); ctx.lineTo(w * 0.36, h * 0.74); ctx.lineTo(w * 0.345, h * 0.765); ctx.lineTo(w * 0.295, h * 0.765); ctx.fill();
  ctx.fillRect(w * 0.318, h * 0.64, 6, h * 0.1);
  ctx.beginPath(); ctx.moveTo(w * 0.321, h * 0.645); ctx.lineTo(w * 0.35, h * 0.73); ctx.lineTo(w * 0.321, h * 0.73); ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(w * 0.86, h * 0.4, 46, h * 0.24);
  ctx.fillStyle = '#dc2626';
  for (let i = 0; i < 4; i++) ctx.fillRect(w * 0.86, h * 0.42 + i * h * 0.06, 46, h * 0.025);
  return c.toDataURL('image/jpeg', 0.92);
}

export const IMAGE_EDITOR_PAGE = {
  id: 'image-editor', label: 'Image editor', icon: 'image',
  render: () => componentPage({
    title: 'Image editor', kinds: ['JS', 'Blazor', '.NET'],
    lead: 'A Photoshop-style editor in the browser: crop with aspect ratios, rotate, straighten and flip, zoom and pan, light and colour adjustments, filters, a histogram, drawing, text and shapes, undo / redo and before / after. It resizes, creates every size your site needs (thumbnail, card, article, hero…) in WebP, JPEG or PNG, and sends them to your API as a form or as a binary stream. Edits stay non-destructive until you export.',
    examples: [
      {
        title: 'The editor',
        description: 'Try the tools on the left (keys in brackets), the panels on the right, scroll to zoom and hold <strong>Compare</strong> for the original. <strong>Save</strong> sends the sizes to a pretend API here; the request it would make is shown below the editor.',
        code: `
          import { MudImageEditor } from 'mudtail';

          const editor = new MudImageEditor({
            src: '/media/harbour.jpg',                 // URL (CORS-enabled), File, Blob or <img>
            height: '680px',
            format: 'webp', quality: 0.86,
            sizes: [
              { name: 'thumbnail', width: 160, height: 160, fit: 'cover' },
              { name: 'card', width: 640, height: 360, fit: 'cover' },
              { name: 'article', width: 1200, fit: 'width' },
              { name: 'hero', width: 1920, height: 1080, fit: 'cover' },
            ],
            upload: { url: '/api/v1/media/images', mode: 'multipart', fieldName: 'files' },
            // or mode: 'stream': one request per size, the body is the image bytes (Content-Type: image/webp)
            onUpload: (result) => …,
          });
          host.appendChild(editor.getElement());

          // From code
          editor.crop('16:9'); editor.rotate(1); editor.adjust({ contrast: 15, vibrance: 20 }); editor.applyPreset('warm');
          const blob = await editor.exportImage({ format: 'jpeg', quality: 0.9 });
          const files = await editor.exportSizes();      // [{ name, width, height, type, size, blob, url }]`,
        mount(el) {
          const request = document.createElement('pre');
          request.className = 'cp-request';
          request.setAttribute('aria-label', 'Request');
          request.textContent = t('demo.ie.noRequest', {}, 'Press Save: the request appears here.');
          const editor = new MudImageEditor({
            src: samplePhoto(),
            fileName: 'harbour-sunset',
            height: '680px',
            onSave: async (files) => {
              // A pretend API: what multipart upload would send, and a little latency.
              const lines = [
                'POST /api/v1/media/images',
                'Content-Type: multipart/form-data',
                '',
                ...files.map((f) => `files: ${f.fileName}  (${f.type}, ${formatNumber(f.width)} × ${formatNumber(f.height)}, ${formatNumber(Math.round(f.size / 1024))} KB)`),
                'meta: [{ name, fileName, width, height, type, size }, …]',
                'recipe: (store it with the original; renderRecipe(original, recipe) makes these files again)',
                JSON.stringify(editor.getRecipe({ files }), null, 2),
              ];
              request.textContent = lines.join('\n');
              await new Promise((r) => setTimeout(r, 700));
              return { ok: true, status: 201 };
            },
            onError: (e) => showToast(e.message, 'error'),
          });
          el.append(editor.getElement(), request);
          return () => editor.dispose();
        },
      },
      {
        title: 'Recipes: regenerate the same files later',
        description: 'A recipe records the original (size, type, SHA-256), every operation and the sizes to make. Store it next to the original; <code>renderRecipe(original, recipe)</code> replays it with the same code the editor exports with, so the files come out the same, for example after you add a size, or to rebuild a lost file. <code>editor.applyRecipe(recipe)</code> reopens the edit in the editor. Below, a stored recipe is replayed twice on the original and the bytes are compared.',
        code: `
          import { renderRecipe } from 'mudtail';

          // Saving: the recipe comes with every upload (multipart part "recipe"), or editor.getRecipe()
          const recipe = editor.getRecipe();              // plain JSON: store it in a column (nvarchar(max) / jsonb)

          // Later: the same files again, from the original and the stored recipe
          const { files, warnings } = await renderRecipe('/media/originals/harbour.jpg', recipe, { verify: 'warn' });
          // files: [{ name, fileName, width, height, type, size, blob }], warnings: [] when it is the same original

          // Add a size to every stored image: change the recipe's output, render again
          recipe.output.sizes.push({ name: 'social', width: 1200, height: 630, fit: 'cover' });
          const { files: withSocial } = await renderRecipe(originalUrl, recipe, { sizes: ['social'] });

          // Or edit it again in the editor
          await editor.open(originalUrl);
          await editor.applyRecipe(recipe);               // { ok, warnings }`,
        mount(el) {
          const original = samplePhoto();
          const recipe = {
            type: 'mudtail.image-recipe', version: 1, createdAt: '2026-11-10T09:30:00.000Z',
            source: { name: 'harbour-sunset', width: 2400, height: 1600, type: 'image/jpeg' },
            edit: {
              quarter: 0, angle: 0, flipH: false, flipV: false, background: null, preset: 'warm',
              adjust: { temperature: 35, saturation: 10, exposure: 4, vignette: 25 },
              annotations: [{ type: 'text', text: 'Harbour at dusk', x: 140, y: 330, size: 110, color: '#ffffff', font: 'Georgia, serif', bold: true }],
              crop: { x: 0, y: 225, width: 2400, height: 1350 },
              resize: null,
            },
            output: { format: 'webp', quality: 0.86, fileName: 'harbour-sunset', sizes: [
              { name: 'thumbnail', width: 160, height: 160, fit: 'cover' }, { name: 'card', width: 640, height: 360, fit: 'cover' }, { name: 'social', width: 1200, height: 630, fit: 'cover' },
            ] },
          };
          const pre = document.createElement('pre');
          pre.className = 'cp-request';
          pre.textContent = JSON.stringify(recipe, null, 2);
          const list = document.createElement('ul');
          list.className = 'cp-recipe-files';
          const status = document.createElement('p');
          status.className = 'cp-tree-log';
          status.setAttribute('role', 'status');
          const urls = [];
          const run = createMudButton({ text: t('demo.ie.regenerate', {}, 'Regenerate the files from the recipe'), onClick: async () => {
            run.disabled = true;
            status.textContent = t('demo.ie.rendering', {}, 'Rendering…');
            try {
              const first = await renderRecipe(original, recipe);
              const second = await renderRecipe(original, recipe);
              const same = await Promise.all(first.files.map(async (f, i) => {
                const [a, b] = await Promise.all([f.blob.arrayBuffer(), second.files[i].blob.arrayBuffer()]);
                return a.byteLength === b.byteLength && new Uint8Array(a).every((v, k) => v === new Uint8Array(b)[k]);
              }));
              urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
              list.innerHTML = first.files.map((f) => { const url = URL.createObjectURL(f.blob); urls.push(url); return `<li><img src="${url}" alt=""><span><strong>${f.fileName}</strong><small>${formatNumber(f.width)} × ${formatNumber(f.height)} · ${formatNumber(Math.round(f.size / 1024))} KB</small></span></li>`; }).join('');
              status.textContent = same.every(Boolean)
                ? t('demo.ie.identical', { count: formatNumber(first.files.length) }, 'Rendered twice: all {count} files are byte-for-byte identical.')
                : t('demo.ie.different', {}, 'Rendered twice: some files differ.');
            } catch (e) {
              status.textContent = e.message;
            } finally {
              run.disabled = false;
            }
          } });
          const row = document.createElement('div');
          row.className = 'cp-row';
          row.append(run);
          el.append(row, status, list, pre);
          return () => urls.forEach((u) => URL.revokeObjectURL(u));
        },
      },
      {
        title: '.NET: store the recipe',
        language: 'C#',
        description: 'Keep the original untouched and the recipe next to it. Regenerating runs where MudTail runs (the browser or Blazor WebAssembly): load the original and the recipe, call <code>renderRecipe</code>, and upload the files again.',
        code: `
          public sealed class MediaImage
          {
              public Guid Id { get; set; }
              public string OriginalPath { get; set; } = "";      // the untouched upload
              public string? Sha256 { get; set; }                 // = recipe.source.sha256
              public string RecipeJson { get; set; } = "{}";      // the recipe, as sent (nvarchar(max) / jsonb)
              public int RecipeVersion { get; set; } = 1;
              public List<MediaVariant> Variants { get; set; } = []; // thumbnail, card, … (path, width, height, bytes)
          }

          // In the multipart endpoint: [FromForm] string recipe
          using var doc = JsonDocument.Parse(recipe);
          if (doc.RootElement.GetProperty("type").GetString() != "mudtail.image-recipe") return Results.BadRequest();
          image.RecipeJson = recipe;
          image.Sha256 = doc.RootElement.GetProperty("source").GetProperty("sha256").GetString();

          // Blazor: regenerate without the editor UI
          var result = await _editor.InvokeAsync<JsonElement>("renderRecipe", originalUrl, image.RecipeJson);
          foreach (var file in result.GetProperty("files").EnumerateArray())
          {
              await using var js = await _editor.InvokeAsync<IJSStreamReference>("getFile", file.GetProperty("name").GetString());
              // … upload the stream as before
          }`,
      },
      {
        title: '.NET: receive the images',
        language: 'C#',
        description: 'Two ways to receive the files: a multipart form (all sizes in one request, with a <code>meta</code> JSON part), or a stream per size (<code>mode: \'stream\'</code>) read straight from the request body, never buffered in memory.',
        code: `
          // Multipart: upload: { url: '/api/v1/media/images', mode: 'multipart' }
          group.MapPost("/images", async (IFormFileCollection files, [FromForm] string meta, IMediaStore store, CancellationToken ct) =>
          {
              var saved = new List<string>();
              foreach (var file in files)                                   // harbour-sunset-thumbnail.webp, …
              {
                  if (!file.ContentType.StartsWith("image/")) return Results.BadRequest();
                  await using var stream = file.OpenReadStream();
                  saved.Add(await store.SaveAsync(file.FileName, file.ContentType, stream, ct));
              }
              return Results.Created("/api/v1/media/images", saved);
          }).DisableAntiforgery().WithMetadata(new RequestSizeLimitAttribute(50_000_000));

          // Stream: upload: { url: '/api/v1/media/images/{name}', mode: 'stream' }  (one PUT/POST per size)
          group.MapPost("/images/{size}", async (string size, HttpRequest request, IMediaStore store, CancellationToken ct) =>
          {
              var fileName = Uri.UnescapeDataString(request.Headers["X-File-Name"].ToString());
              var url = await store.SaveAsync(fileName, request.ContentType ?? "application/octet-stream", request.Body, ct);
              return Results.Created(url, new { size, url });
          });`,
      },
      {
        title: 'Blazor',
        language: 'Razor / C#',
        description: 'The editor runs in the browser; the bytes come back to .NET as a stream (<code>IJSStreamReference</code>), so your component can store them with its own authorised <code>HttpClient</code>. With <code>saveWith = "dotnet"</code> the Save button raises <code>save</code> with the file list.',
        code: `
          _editor = await _mud.InvokeAsync<IJSObjectReference>("create", "imageEditor", _host, new
          {
              src = imageUrl, height = "680px", format = "webp", saveWith = "dotnet",
              sizes = new object[] { new { name = "thumbnail", width = 160, height = 160, fit = "cover" }, new { name = "article", width = 1200, fit = "width" } },
          }, _self);

          [JSInvokable]
          public async Task OnMudEvent(string name, JsonElement payload)
          {
              if (name != "save") return;
              foreach (var file in payload.EnumerateArray())
              {
                  var size = file.GetProperty("name").GetString()!;
                  await using var js = await _editor!.InvokeAsync<IJSStreamReference>("getFile", size);
                  await using var stream = await js.OpenReadStreamAsync(maxAllowedSize: 20_000_000);
                  using var content = new StreamContent(stream);
                  content.Headers.ContentType = new(file.GetProperty("type").GetString()!);
                  await Http.PostAsync($"api/v1/media/images/{size}", content);       // or save it any other way
              }
          }

          // Or one image: await _editor.InvokeAsync<IJSStreamReference>("exportImage", "jpeg", 0.9);`,
      },
    ],
    api: [
      { title: 'Options', rows: [
        ['src, fileName', 'The image (URL, data URL, File, Blob or <code>&lt;img&gt;</code>) and the base name for exported files. URLs on another site need CORS, or the canvas cannot be exported.'],
        ['sizes', '<code>[{ name, width?, height?, fit }]</code>; <code>fit</code>: <code>cover</code> (crop to fill), <code>contain</code>, <code>width</code>, <code>height</code>, <code>inside</code> (never upscale), <code>fill</code>.'],
        ['format, quality', '<code>webp</code> (default), <code>jpeg</code>, <code>png</code> or <code>avif</code> (where the browser can encode it); quality 0–1.'],
        ['upload', '<code>{ url, method, mode: \'multipart\' | \'stream\', fieldName, headers, withCredentials, data }</code>. Multipart sends every size plus <code>meta</code> and <code>edit</code> JSON; stream sends one request per size with the bytes as the body and <code>X-File-Name</code>, <code>X-Image-Size</code>, <code>X-Image-Width</code>, <code>X-Image-Height</code> headers. <code>{name}</code> in the URL is replaced.'],
        ['onSave, onUpload, onExport, onChange, onOpen, onError', 'Your own saving instead of <code>upload</code>, and callbacks.'],
        ['height, previewSize, tools', 'The editor height; the working preview\'s longest side (exports are always full size); which tools to show.'],
      ] },
      { title: 'Methods', rows: [
        ['open(src), getState(), setState(state), undo(), redo(), reset()', 'Images and the edit (a plain object you can store and restore).'],
        ['crop(rect | ratio), rotate(±1), flip(\'h\' | \'v\'), straighten(deg), resize({ width, height })', 'Transforms.'],
        ['adjust(values), applyPreset(name)', 'Adjustments (exposure, brightness, contrast, highlights, shadows, temperature, tint, saturation, vibrance, hue, vignette, grain, sharpen, blur, grayscale, sepia, invert) and presets.'],
        ['exportImage(options), exportSizes(options), upload(files?), download(name?)', 'Output.'],
        ['setTool(id), zoomTo(z), zoomIn(), zoomOut(), zoomFit(), zoomActual(), dispose()', 'View and lifetime.'],
      ] },
      { title: 'Keyboard', rows: [
        ['V, C, B, H, T, U, O, A, I', 'Move, crop, brush, highlighter, text, rectangle, ellipse, arrow, eyedropper.'],
        ['Ctrl+Z, Ctrl+Y (Ctrl+Shift+Z)', 'Undo, redo.'],
        ['+, −, 0, 1, Space+drag', 'Zoom in, out, fit, actual pixels; pan with any tool.'],
        ['Enter, Esc, [ ]', 'Apply or cancel the crop; brush size.'],
      ] },
      { title: 'Blazor', rows: [
        ['create("imageEditor", host, options, dotNetRef)', 'Handle methods: open, getState, setState, undo, redo, reset, setTool, rotate, flip, straighten, adjust, applyPreset, crop, resize, zoomFit, exportImage, exportSizes, getFile, upload, download, dispose.'],
        ['Events', '<code>opened</code>, <code>change</code>, <code>exported</code>, <code>uploaded</code>, <code>save</code> (with <code>saveWith: "dotnet"</code>), <code>error</code>.'],
      ] },
    ],
  }),
};
