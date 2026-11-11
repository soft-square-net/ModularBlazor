import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;
const lib = path.resolve(root, 'src');

// The outputs of one config, picked with --mode:
//   lib    -> dist/mudtail.js         ES module for bundler consumers (gsap and lucide stay external)
//   blazor -> dist/mudtail.blazor.js  self-contained ES module for Blazor's JS.InvokeAsync("import", ...)
//   animator -> dist/mudtail.animator.js  the Animator Studio plugin (GSAP plugins inside, GSAP core from MudTail)
//   animator-player -> dist/mudtail.animator.player.js  the same plugin without the Studio, for sites that only play scenes
//   (none) -> the demo/showcase app in demo/ (dev server, or `build:demo` into dist-demo/)
export default defineConfig(({ mode }) => {
  if (mode === 'animator' || mode === 'animator-player') {
    const playerOnly = mode === 'animator-player';
    // A plugin module: loadPlugin('./mudtail.animator.js') at runtime, or import 'mudtail/animator' in a bundler.
    // It never imports GSAP's core (it uses ctx.gsap), so only the GSAP plugins it registers are bundled.
    return {
      publicDir: false,
      build: {
        outDir: 'dist',
        emptyOutDir: false,
        sourcemap: true,
        target: 'es2022',
        lib: {
          entry: path.resolve(lib, playerOnly ? 'animator/player-index.js' : 'animator/index.js'),
          formats: ['es'],
          fileName: () => (playerOnly ? 'mudtail.animator.player.js' : 'mudtail.animator.js'),
        },
        rolldownOptions: { external: [/^gsap$/] },
      },
    };
  }

  if (mode === 'lib' || mode === 'blazor') {
    const isBlazor = mode === 'blazor';
    return {
      publicDir: false,
      build: {
        outDir: 'dist',
        emptyOutDir: false, // the two library builds and the CSS build share dist/
        sourcemap: true,
        target: 'es2022',
        lib: {
          entry: isBlazor ? path.resolve(lib, 'blazor.js') : path.resolve(lib, 'index.js'),
          formats: ['es'],
          fileName: () => (isBlazor ? 'mudtail.blazor.js' : 'mudtail.js'),
        },
        rolldownOptions: {
          external: isBlazor ? [] : [/^gsap($|\/)/, /^lucide($|\/)/],
        },
      },
    };
  }

  return {
    root: path.resolve(root, 'demo'),
    plugins: [tailwindcss()],
    resolve: {
      // The demo uses the library only through its public entry, like any consumer would.
      alias: [
        { find: /^mudtail\/animator\/player$/, replacement: path.resolve(lib, 'animator/player-index.js') },
        { find: /^mudtail\/animator$/, replacement: path.resolve(lib, 'animator/index.js') },
        { find: /^mudtail$/, replacement: path.resolve(lib, 'index.js') },
      ],
    },
    build: {
      outDir: path.resolve(root, 'dist-demo'),
      emptyOutDir: true,
      rolldownOptions: {
        input: {
          index: path.resolve(root, 'demo/index.html'), // framework dashboard
          site: path.resolve(root, 'demo/site.html'), // public-site showcase
          animator: path.resolve(root, 'demo/animator.html'), // GSAP Animator Studio (full screen)
        },
      },
    },
    server: {
      port: 3000,
      fs: { allow: [root] },
    },
  };
});
