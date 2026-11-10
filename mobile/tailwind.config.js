/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  // Light theme only (V1). 'class' stops NativeWind on web from fighting the fixed light colour scheme.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // One meaning per colour, used everywhere in the app.
        profit: { DEFAULT: '#15803D', light: '#DCFCE7' },   // green: profit & paid
        received: { DEFAULT: '#1D4ED8', light: '#DBEAFE' }, // blue: money received
        pending: { DEFAULT: '#C2410C', light: '#FFEDD5' },  // orange: money pending
        expense: { DEFAULT: '#B91C1C', light: '#FEE2E2' },  // red: expenses & losses
        brand: { DEFAULT: '#166534', dark: '#14532D' },
        ink: { DEFAULT: '#111827', soft: '#4B5563', faint: '#6B7280' },
        line: '#E5E7EB',
        section: '#F5F6F7',
      },
    },
  },
  plugins: [],
};
