import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf8f0', 100: '#faecd6', 200: '#f4d5a3',
          300: '#ecb86a', 400: '#e39840', 500: '#d4820f',
          600: '#b8670a', 700: '#96500c', 800: '#7a4010',
          900: '#5c3317',
        }
      },
      screens: {
        'xs': '375px',
      }
    }
  },
  plugins: [],
}
export default config