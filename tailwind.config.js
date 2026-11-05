/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0B1526', 900: '#122036', 800: '#1B2E4A', 700: '#2A4066' },
        paper: '#F6F7F9',
        accent: { DEFAULT: '#1D6FF2', dark: '#1559C7', soft: '#E8F0FE' },
        violet2: '#6D5DF6',
        teal2: '#0EA5A0',
      },
      fontFamily: {
        display: ['Sora', 'system-ui', 'sans-serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,21,38,.05), 0 8px 24px -12px rgba(11,21,38,.12)',
        lift: '0 2px 4px rgba(11,21,38,.06), 0 16px 40px -16px rgba(11,21,38,.18)',
      },
      borderRadius: { '4xl': '2rem' },
    },
  },
  plugins: [],
}
