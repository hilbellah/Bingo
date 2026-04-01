/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#1a3a5c',
          'blue-dark': '#0a1628',
          'blue-mid': '#132744',
          gold: '#c5a55a',
          'gold-light': '#d4b96e',
          'gold-pale': '#f5edd6',
          cream: '#faf7f0',
          light: '#f0f4f8',
        },
        seat: {
          vacant: '#43a047',
          held: '#f9a825',
          sold: '#757575',
          selected: '#1565c0',
          disabled: '#e0e0e0',
        }
      },
      fontSize: {
        'base': ['16px', '24px'],
        'lg': ['18px', '28px'],
        'xl': ['20px', '30px'],
        '2xl': ['24px', '32px'],
        '3xl': ['30px', '36px'],
        '4xl': ['36px', '42px'],
        '5xl': ['48px', '54px'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
      }
    }
  },
  plugins: []
};
