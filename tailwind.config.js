/** @type {import('tailwindcss').Config} */
export default {
  content: ['./public/**/*.{html,js}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        wg: {
          bg0: '#0a0f14',
          bg1: '#0f1620',
          text: '#e8eef5',
          muted: '#8b9cb0',
          accent: '#25d366',
          'accent-dim': '#1aa34e',
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
