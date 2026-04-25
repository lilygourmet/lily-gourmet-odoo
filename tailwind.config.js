/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        fraunces: ['Fraunces', 'serif'],
        sans: ['Geist', 'sans-serif'],
        mono: ['Geist Mono', 'monospace'],
      },
      colors: {
        ink: {
          DEFAULT: '#1a0f0a',
          soft: '#4a3a30',
          mute: '#8a7a70',
        },
        cream: {
          DEFAULT: '#faf6f0',
          warm: '#f4ece0',
          deep: '#ebe0cf',
        },
        bordeaux: {
          DEFAULT: '#6b1f2a',
          deep: '#4a1219',
          soft: '#8d2f3c',
        },
        gold: {
          DEFAULT: '#b8893c',
          soft: '#d4a95c',
          pale: '#f0deb8',
        },
        warn: {
          DEFAULT: '#f2c94c',
          bg: '#fef4d0',
          ink: '#5c4418',
        },
        chocolate: '#3d2418',
        ok: '#4a7a3a',
        line: '#e5d8c3',
      },
    },
  },
  plugins: [],
}