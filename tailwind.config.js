export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        'bleu': '#0a0e2e',
        'bleu-clair': '#1a237e',
        'or': '#2563EB',
      },
      fontFamily: {
        'arabe': ['Noto Naskh Arabic', 'serif'],
        'latin': ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
