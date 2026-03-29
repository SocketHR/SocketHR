/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: '#f7f4ef',
        'paper-card': '#fffcf8',
        'paper-line': '#e7e0d6',
        ink: '#1c1917',
        'ink-muted': '#57534e',
        'ink-faint': '#78716c',
        accent: '#8b4a3c',
        'accent-hover': '#723d32',
        'accent-soft': '#f3ebe8',
      },
      fontFamily: {
        display: ['"Syne"', 'system-ui', 'sans-serif'],
        adv: ['"DM Sans"', 'system-ui', 'sans-serif'],
        paper: ['Literata', 'Georgia', 'serif'],
        ui: ['Figtree', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
