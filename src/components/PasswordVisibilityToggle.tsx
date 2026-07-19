interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

// Checkbox "Afficher le mot de passe" réutilisée sous chaque champ mot de
// passe (AuthPage : connexion + inscription partagent le même champ ;
// ResetPasswordPage : nouveau mot de passe + confirmation, chacun avec son
// propre état). Couleur dorée #f9a825 volontairement distincte du bleu
// "or" (#2563EB) utilisé partout ailleurs sur ces pages.
export function PasswordVisibilityToggle({ checked, onChange }: Props) {
  return (
    <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 cursor-pointer shrink-0"
        style={{ accentColor: '#f9a825' }}
      />
      <span className="text-[0.8rem] sm:text-[0.85rem]" style={{ color: '#b0b8d4' }}>
        Afficher le mot de passe
      </span>
    </label>
  );
}
