import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;
const lib = path.resolve(root, 'src');

// Three outputs from one config, picked with --mode:
//   lib    -> dist/mudtail.js         ES module for bundler consumers (gsap and lucide stay external)
//   blazor -> dist/mudtail.blazor.js  self-contained ES module for Blazor's JS.InvokeAsync("import", ...)
//   (none) -> the demo/showcase app in demo/ (dev server, or `build:demo` into dist-demo/)
export default defineConfig(({ mode }) => {
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
      alias: { mudtail: path.resolve(lib, 'index.js') },
    },
    build: {
      outDir: path.resolve(root, 'dist-demo'),
      emptyOutDir: true,
      rolldownOptions: {
        input: {
          index: path.resolve(root, 'demo/index.html'), // framework dashboard
          site: path.resolve(root, 'demo/site.html'), // public-site showcase
        },
      },
    },
    server: {
      port: 3000,
      fs: { allow: [root] },
    },
  };
});
