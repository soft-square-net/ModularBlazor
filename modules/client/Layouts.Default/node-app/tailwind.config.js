/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,js,razor,scss}"],
  darkMode: ['class', '[data-theme="dark"]'], // Direct binding to your dark token sets
  theme: {
    extend: {
      colors: {
        md: {
          primary: 'var(--md-sys-color-primary)',
          'on-primary': 'var(--md-sys-color-on-primary)',
          surface: 'var(--md-sys-color-surface)',
          'on-surface': 'var(--md-sys-color-on-surface)',
        }
      }
    },
  },
  plugins: [],
}
