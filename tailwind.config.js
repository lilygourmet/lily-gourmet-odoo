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
      // Arrondis adoucis globalement (look « premium » homogène, sans toucher les composants).
      borderRadius: {
        DEFAULT: '0.375rem',
        md: '0.5rem',
        lg: '0.7rem',
        xl: '0.95rem',
        '2xl': '1.2rem',
      },
      // Ombres plus douces et chaleureuses (teinte brune légère) — homogènes sur toute l'app.
      boxShadow: {
        sm: '0 1px 2px rgba(60,30,20,.05)',
        DEFAULT: '0 2px 8px rgba(80,40,30,.06)',
        md: '0 4px 16px rgba(90,40,30,.07)',
        lg: '0 12px 30px rgba(80,40,30,.10)',
        xl: '0 18px 40px rgba(75,35,28,.12)',
        '2xl': '0 22px 55px rgba(70,30,25,.16)',
      },
      colors: {
        ink: {
          DEFAULT: '#1a0f0a',
          soft: '#4a3a30',
          mute: '#8a7a70',
        },
        cream: {
          DEFAULT: '#fcfbf8',
          warm: '#ffffff',
          deep: '#f1eadd',
        },
        bordeaux: {
          DEFAULT: '#993556',
          deep: '#7a2a44',
          soft: '#b35069',
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
        success: {
          DEFAULT: '#2f6b2f',
          bg: '#eaf3de',
        },
        danger: {
          DEFAULT: '#a32d2d',
          bg: '#fcebeb',
        },
        line: '#e5d8c3',
      },
    },
  },
  plugins: [],
}