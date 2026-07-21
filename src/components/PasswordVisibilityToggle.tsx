interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

// Checkbox "Afficher le mot de passe" réutilisée sous chaque champ mot de
// passe (AuthPage : connexion + inscription partagent le même champ ;
// ResetPasswordPage : nouveau mot de passe + confirmation, chacun avec son
// propre état).
export function PasswordVisibilityToggle({ checked, onChange }: Props) {
  return (
    <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 cursor-pointer shrink-0"
        style={{ accentColor: '#f5c842' }}
      />
      <span className="text-[0.8rem] sm:text-[0.85rem]" style={{ color: '#a0aec0' }}>
        Afficher le mot de passe
      </span>
    </label>
  );
}
