// Rendering the outputs of an edit: one function used by the editor's export and by renderRecipe(), so a recipe
// replayed later gives the same files as the editor did.

import { mimeType, extension } from './pipeline.js';
import { compose, cropCanvas, renderSize, toBlob, flatten, loadSource } from './render.js';
import { normalizeRecipe, normalizeEdit, normalizeOutput, scaleEdit, matchSource, fingerprint, RecipeError } from './recipe.js';

/** The fit used for an explicit resize: both sides → exactly that size; one side → keep the proportions. */
export function resizeSpec(resize) {
  if (!resize) return null;
  return { width: resize.width || null, height: resize.height || null, fit: resize.width && resize.height ? 'fill' : resize.width ? 'width' : 'height' };
}

/** The edited image at full resolution: transform, adjustments, drawings, crop. */
export function renderEdited(source, edit) {
  const canvas = compose(source, edit, 1);
  return edit.crop ? cropCanvas(canvas, edit.crop) : canvas;
}

/**
 * Renders the outputs of an edit: "original" (the edited image, resized when the edit says so) and every size,
 * made from the full-resolution crop. Resolves to [{ name, fileName, width, height, type, size, blob }].
 */
export async function renderOutputs(source, edit, output, { fileName = output.fileName ?? 'image' } = {}) {
  const full = renderEdited(source, edit);
  const resize = resizeSpec(edit.resize);
  const main = resize ? renderSize(full, resize) : full;
  const jpeg = mimeType(output.format) === 'image/jpeg';
  const background = jpeg ? edit.background ?? '#ffffff' : null;
  const list = [];
  if (output.includeOriginal !== false) list.push({ name: 'original', canvas: main });
  for (const s of output.sizes) list.push({ name: s.name, canvas: renderSize(full, s, background) });
  const files = [];
  for (const { name, canvas } of list) {
    const blob = await toBlob(jpeg ? flatten(canvas, edit.background ?? '#ffffff') : canvas, output.format, output.quality);
    files.push({ name, fileName: `${fileName}-${name}.${extension(blob.type || mimeType(output.format))}`, width: canvas.width, height: canvas.height, type: blob.type, size: blob.size, blob });
  }
  return files;
}

/**
 * Replays a recipe on the original image and resolves to { files, recipe, warnings }.
 *   original  URL, data URL, File / Blob or <img> (the same original the recipe was made from)
 *   options.verify   'warn' (default): render and report problems; 'strict': refuse a different file or proportions
 *   options.sizes    only these size names (default: all of the recipe's)
 * warnings: 'different-file' (SHA-256 differs), 'different-resolution' (scaled), 'different-proportions'.
 */
export async function renderRecipe(original, recipeInput, { verify = 'warn', sizes = null, includeOriginal = null } = {}) {
  const recipe = normalizeRecipe(recipeInput);
  let blob = original instanceof Blob ? original : null;
  if (!blob && typeof original === 'string') {
    try { const res = await fetch(original); if (res.ok) blob = await res.blob(); } catch { /* fall back to loading it as an image */ }
  }
  const source = await loadSource(blob ?? original);
  const sha256 = blob ? await fingerprint(blob) : null;
  const { scale, warnings } = matchSource(recipe, { width: source.width, height: source.height, sha256 });
  if (verify === 'strict' && (warnings.includes('different-file') || warnings.includes('different-proportions'))) {
    throw new RecipeError('This is not the original the recipe was made for.', warnings);
  }
  const edit = scaleEdit(normalizeEdit(recipe.edit), scale);
  const output = normalizeOutput({
    ...recipe.output,
    sizes: sizes ? recipe.output.sizes.filter((s) => sizes.includes(s.name)) : recipe.output.sizes,
    includeOriginal: includeOriginal ?? recipe.output.includeOriginal,
  });
  const files = await renderOutputs(source, edit, output, { fileName: recipe.output.fileName ?? safeBase(recipe.source.name) });
  return { files, recipe, warnings };
}

function safeBase(name) {
  return String(name ?? 'image').replace(/\.[a-z0-9]+$/i, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
}
