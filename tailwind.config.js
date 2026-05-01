/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#00FF88',
        'primary-dark': '#00CC6A',
        surface: '#1A1A1A',
        'surface-2': '#242424',
        'surface-3': '#2E2E2E',
        border: '#3A3A3A',
        muted: '#888888',
        danger: '#FF4444',
        warning: '#FFB344',
      },
    },
  },
  plugins: [],
};
