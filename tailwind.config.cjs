/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx,vue}'
  ],
  theme: {
    extend: {},
  },
  safelist: [
    'text-gray-900',
    'antialiased'
  ],
  plugins: [],
}
