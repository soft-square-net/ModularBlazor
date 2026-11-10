// Demo languages: English (the source) and Arabic. Import this module first in every demo entry point.
import { addDemoMessages, startDemoI18n } from './localize.js';
import { messages, patterns } from './ar/index.js';

addDemoMessages('ar', { messages, patterns });
startDemoI18n();

export { languageButton, switchDemoLocale, DEMO_LOCALES, localizeTree } from './localize.js';
