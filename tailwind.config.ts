import type { Config } from 'tailwindcss'

export default {
  content: ['./src/popup/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        vora: {
          400: '#9B5DE5',
          500: '#7B2CBF',
          700: '#3C096C',
          ink: '#1A0B2E',
        },
        paper: '#FFFFFF',
        mist: '#F5F0FF',
        stone: {
          200: '#E5E0EC',
          500: '#6B6577',
          900: '#1F1B2E',
        },
        status: {
          listening: '#9B5DE5',
          thinking: '#FFB347',
          executing: '#4ADE80',
          error: '#EF4444',
          confirming: '#7B2CBF',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        caption: ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.02em', fontWeight: '500' }],
        small: ['0.875rem', { lineHeight: '1.5' }],
        body: ['1rem', { lineHeight: '1.5' }],
        h2: ['1.375rem', { lineHeight: '1.25', fontWeight: '600' }],
        h1: ['1.75rem', { lineHeight: '1.2', fontWeight: '600' }],
      },
      spacing: {
        '4.5': '1.125rem',
      },
      borderRadius: {
        pill: '999px',
      },
      keyframes: {
        'mic-pulse': {
          '0%, 100%': { transform: 'scale(1.00)', opacity: '1' },
          '50%': { transform: 'scale(1.04)', opacity: '0.9' },
        },
        'mic-pulse-reduced': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'confirm-bounce': {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.08)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'mic-pulse': 'mic-pulse 1.6s ease-in-out infinite',
        'mic-pulse-reduced': 'mic-pulse-reduced 1.6s ease-in-out infinite',
        'confirm-bounce': 'confirm-bounce 420ms ease-out forwards',
      },
      boxShadow: {
        'vora-btn': '0 0 0 6px rgba(155, 93, 229, 0.18)',
        'vora-btn-active': '0 0 0 8px rgba(155, 93, 229, 0.28)',
      },
    },
  },
  plugins: [],
} satisfies Config
