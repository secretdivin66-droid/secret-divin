export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Anciennes couleurs "bleu vif" — valeurs mises à jour vers la
        // nouvelle charte bleu marine + or, pour que tout ce qui utilise
        // déjà bg-bleu/bg-or/border-or/etc. suive automatiquement sans
        // devoir renommer chaque usage dans le code.
        'bleu': '#0a0f2e',
        'bleu-clair': '#0d1545',
        'or': '#f5c842',
        // Nouveaux noms explicites de la charte "divine", mêmes valeurs.
        'divine-dark': '#0a0f2e',
        'divine-card': '#0d1545',
        'divine-gold': '#f5c842',
        'divine-gold-dark': '#e8a020',
        'divine-blue': '#3b9ff5',
        'divine-border': 'rgba(245, 200, 66, 0.2)',
      },
      fontFamily: {
        'arabe': ['Noto Naskh Arabic', 'serif'],
        'latin': ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
