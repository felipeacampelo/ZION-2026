/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          DEFAULT: '#1a2e1a',
          50: '#f2f5f2',
          100: '#e0e8e0',
          200: '#c1d1c1',
          300: '#93ad93',
          400: '#5d815d',
          500: '#3b5f3b',
          600: '#2a4a2a',
          700: '#1e3a1e',
          800: '#1a2e1a',
          900: '#0f1f0f',
          950: '#071007',
        },
        gold: {
          DEFAULT: '#c9a84c',
          50: '#f9f5e8',
          100: '#f3ead1',
          200: '#e8d5a3',
          300: '#dcc075',
          400: '#d3b158',
          500: '#c9a84c',
          600: '#a88b3a',
          700: '#876f2e',
          800: '#665322',
          900: '#453716',
          950: '#2e240f',
        },
        cream: {
          DEFAULT: '#faf7f2',
          50: '#fdfcfa',
          100: '#faf7f2',
          200: '#f5efe6',
          300: '#ede3d5',
          400: '#e0d1bf',
          500: '#d1bea5',
          600: '#bda487',
          700: '#a48b6e',
          800: '#8a7358',
          900: '#6e5c46',
        },
      },
      fontFamily: {
        sans: ['"angie-sans"', '"Inter"', 'system-ui', 'sans-serif'],
        display: ['"bc-vajgar"', '"Inter"', 'sans-serif'],
      },
      animation: {
        'fade-up': 'fadeUp 0.7s ease-out forwards',
        'fade-in': 'fadeIn 0.7s ease-out forwards',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
