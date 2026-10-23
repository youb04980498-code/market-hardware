import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/session";
import { request } from "../../api/client";
export default function Login({ register = false }: { register?: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const { login } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const username = String(f.get("username"));
      const password = String(f.get("password"));
      if (register)
        await request(
          "/api/auth/register",
          {
            method: "POST",
            body: JSON.stringify({
              username,
              password,
              email: f.get("email"),
              first_name: f.get("first_name"),
              last_name: f.get("last_name"),
            }),
          },
          false,
        );
      await login(username, password);
      const target = params.get("redirect") ?? "/account";
      navigate(
        target.startsWith("/") && !target.startsWith("//")
          ? target
          : "/account",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-story">
        <p className="eyebrow">VOTRE ESPACE MARKET HARDWARE</p>
        <h1>
          {register
            ? "La prochaine pièce, c'est vous."
            : "Heureux de vous retrouver."}
        </h1>
        <p>
          Retrouvez vos commandes et préparez votre prochaine configuration.
        </p>
        <span className="auth-monogram">MH</span>
      </div>
      <section className="auth-form">
        <p className="eyebrow">{register ? "NOUVEAU COMPTE" : "BON RETOUR"}</p>
        <h2>{register ? "Créer votre compte" : "Se connecter"}</h2>
        <p className="muted">Vos identifiants du service Auth local.</p>
        <form onSubmit={(e) => void submit(e)}>
          {register && (
            <div className="form-row">
              <label>
                Prénom
                <input
                  name="first_name"
                  required
                  maxLength={80}
                  autoComplete="given-name"
                />
              </label>
              <label>
                Nom
                <input
                  name="last_name"
                  required
                  maxLength={80}
                  autoComplete="family-name"
                />
              </label>
            </div>
          )}
          <label>
            Identifiant
            <input
              name="username"
              required
              minLength={register ? 3 : 1}
              maxLength={120}
              autoComplete="username"
            />
          </label>
          {register && (
            <label>
              Email
              <input type="email" name="email" autoComplete="email" required />
            </label>
          )}
          <label>
            Mot de passe
            <input
              name="password"
              type={show ? "text" : "password"}
              required
              minLength={register ? 12 : 1}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
            />
          </label>
          {register && (
            <p className="small muted">
              12 caractères minimum. Le rôle client est attribué
              automatiquement.
            </p>
          )}
          <button
            type="button"
            className="text-button"
            onClick={() => setShow(!show)}
          >
            {show ? "Masquer" : "Afficher"} le mot de passe
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? "Connexion en cours…"
              : register
                ? "Créer mon compte"
                : "Se connecter"}
          </button>
        </form>
        <p>
          {register ? "Déjà inscrit ?" : "Première visite ?"}{" "}
          <Link to={register ? "/login" : "/register"}>
            {register ? "Se connecter" : "Créer un compte"}
          </Link>
        </p>
        <p className="small muted">
          Par sécurité, la session reste en mémoire et se termine au
          rechargement de l'application.
        </p>
      </section>
    </div>
  );
}
