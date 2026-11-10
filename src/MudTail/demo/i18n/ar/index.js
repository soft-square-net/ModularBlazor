// Arabic catalog for the demo, keyed by the English source text. One file per area of the demo.
// Later parts win on a duplicate key; duplicates here mean the same thing in every place.
import shell from './shell.js';
import ide from './ide.js';
import components from './components.js';
import forms from './forms.js';
import site from './site.js';
import feedback from './feedback.js';
import tree from './tree.js';
import statHero from './statHero.js';
import imageEditor from './imageEditor.js';

const parts = [shell, ide, components, forms, site, feedback, tree, statHero, imageEditor];

export const messages = Object.assign({}, ...parts.map((p) => p.messages));
export const patterns = parts.flatMap((p) => p.patterns ?? []);
