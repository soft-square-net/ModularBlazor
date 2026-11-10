import { defineConfig } from 'vite';
import { resolve, relative } from 'path';
import { globSync } from 'glob';

// 1. Grab style entries: every src/framework/*.css or *.scss that is not a partial (_name)
const scssInputs = globSync(['src/framework/**/*.{css,scss}'], {
  ignore: ['**/_*', '**/node_modules/**'],
  cwd: import.meta.dirname // Scope safely to current directory
});

const inputs = {
  // 2. Treat your Blazor JS Interop module as the primary entry point
  'module': resolve(import.meta.dirname, 'src/js/module.ts')
};

scssInputs.forEach(file => {
  const absolutePath = resolve(import.meta.dirname, file);
  // Creates clean relative structural naming matching your src/ framework layout
  const relativePath = relative(resolve(import.meta.dirname, 'src'), absolutePath).replace(/\.s?css$/, '');
  inputs[relativePath] = absolutePath;
});

export default defineConfig({
  build: {
    // 3. Targets your Blazor app's static assets directory cleanly
    outDir: resolve(import.meta.dirname, '../wwwroot'),
    emptyOutDir: false, // Set to false if Blazor holds other static assets here to prevent deletion

    cssMinify: 'lightningcss', 
    sourcemap: true,
    
    rollupOptions: {
      input: inputs,
      // moduleHost calls the entry's exports (default/init, dispose). An app build drops entry exports by
      // default, which tree-shakes module.js down to nothing.
      preserveEntrySignatures: 'exports-only',
      output: {
        // Formats your TypeScript interop module for Blazor's IJSRuntime (IJSObjectReference)
        format: 'es',
        
        // Handles Compiled JavaScript outputs (like module.js)
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'module') {
            return 'js/module.js';
          }
          return 'js/chunks/[name].js';
        },
        
        // Directs your custom Material SCSS styles safely to your CSS directory
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            // Strips nested framework directory tags to output clean root level files if desired
            const cleanName = assetInfo.name.replace('framework/', '');
            return `css/${cleanName.replace('.css', '.min.css')}`;
          }
          return 'assets/[name]-[hash][extname]';
        }
      }
    }
  }
});
