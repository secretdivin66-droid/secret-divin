-- ============================================================
-- Secret Divin — Nom/prénom obligatoires à l'inscription
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Le formulaire d'inscription passe désormais first_name/last_name dans
-- les metadata utilisateur (options.data de supabase.auth.signUp). Cette
-- migration ajoute la colonne last_name manquante à profiles et met à jour
-- le trigger handle_new_user() pour les enregistrer automatiquement dans
-- le profil dès la création du compte (avant même la confirmation email :
-- le compte auth.users existe déjà à cet instant, seule la connexion est
-- bloquée tant que l'email n'est pas confirmé).
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name text;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_first_name text := NEW.raw_user_meta_data->>'first_name';
  v_last_name text := NEW.raw_user_meta_data->>'last_name';
  v_display_name text := NULLIF(trim(concat_ws(' ', v_first_name, v_last_name)), '');
BEGIN
  INSERT INTO profiles (user_id, email, display_name, first_name, last_name)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(v_display_name, split_part(NEW.email, '@', 1)),
      v_first_name,
      v_last_name
    );
  INSERT INTO user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  INSERT INTO user_credits (user_id, balance, total_purchased)
    VALUES (NEW.id, 0, 0);
  INSERT INTO formation_modules (user_id, module_id, is_unlocked)
    VALUES (NEW.id, 1, true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
