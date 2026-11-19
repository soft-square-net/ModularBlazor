import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    // 1. Output directly to Blazor's static assets folder
    // outDir: resolve(__dirname, 'wwwroot/js'),
    outDir: resolve(__dirname, '../wwwroot/js'),

    // 2. Empty the output folder before building so old files don't linger
    emptyOutDir: true,

    // 3. Configure Vite to bundle your code as a library module
    lib: {
      entry: resolve(__dirname, 'src/app.ts'),
      formats: ['es'], // Forces ES Module export for Blazor IJSObjectReference
      fileName: () => 'app.js' // The exact name of the file Blazor will load
    },

    // 4. Optional: Generates source maps so you can debug your TypeScript files in the browser
    sourcemap: true
  }
});
