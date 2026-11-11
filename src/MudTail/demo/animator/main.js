// GSAP Animator Studio, full screen: the animator plugin's studio component, as a Blazor page would create it.
import '../i18n/index.js'; // first: sets the language (and direction) before anything renders
import '../../src/styles/mudtail.scss';
import '../styles/demo.css';
import { initTheme, use, createComponent } from 'mudtail';
import animator from 'mudtail/animator';

initTheme();
use(animator);

const params = new URLSearchParams(location.search);
const root = document.getElementById('root');
const studio = createComponent('animator-studio', root, {
  template: params.get('template') || undefined, // ?template=cartoon starts from a template instead of the last draft
  warnOnLeave: true,
  title: 'MudTail Animator',
}, {
  save: ({ name }) => console.info(`[demo] "save" event for "${name}": a Blazor page would store the JSON through its API here.`),
});

window.mudStudio = studio; // for poking at it from the console
