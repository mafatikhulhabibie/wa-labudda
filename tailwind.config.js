/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./public/**/*.{html,js}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        wg: {
          bg0: 'rgb(var(--wg-bg0) / <alpha-value>)',
          bg1: 'rgb(var(--wg-bg1) / <alpha-value>)',
          text: 'rgb(var(--wg-text) / <alpha-value>)',
          muted: 'rgb(var(--wg-muted) / <alpha-value>)',
          accent: 'rgb(var(--wg-accent) / <alpha-value>)',
          'accent-dim': 'rgb(var(--wg-accent-dim) / <alpha-value>)',
          danger: '#f87171',
          warn: '#fbbf24',
          info: '#38bdf8',
        },
        wa: {
          bg: '#111b21',
          panel: '#202c33',
          'panel-hover': '#2a3942',
          'chat-bg': '#0b141a',
          accent: '#00a884',
          'accent-dark': '#008069',
          muted: '#8696a0',
        },
      },
      boxShadow: {
        wg: '0 24px 80px rgba(0, 0, 0, 0.45)',
        'wa-msg': '0 1px 0.5px rgba(11, 20, 26, 0.13)',
      },
      borderRadius: {
        wg: '16px',
      },
      keyframes: {
        'btn-spin': {
          to: { transform: 'rotate(360deg)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'btn-spin': 'btn-spin 0.7s linear infinite',
        'toast-in': 'toast-in 0.28s ease',
      },
    },
  },
  plugins: [],
};
