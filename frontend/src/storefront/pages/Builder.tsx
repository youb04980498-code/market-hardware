import { Cpu } from "lucide-react";
import { Link } from "react-router-dom";
export default function Builder() {
  return (
    <div className="container page builder-page">
      <span className="pill">PHASE 7 · À VENIR</span>
      <Cpu size={48} />
      <h1>
        Un PC pensé pour vous.
        <br />
        <em>Chaque pièce à sa place.</em>
      </h1>
      <p>
        Le configurateur utilisera les prix actuels, le stock réel et des
        preuves de compatibilité validées. Son service n'est pas encore
        disponible.
      </p>
      <div className="builder-controls panel">
        <label>
          Budget indicatif (€)
          <input type="number" min="0" step="50" defaultValue="1200" />
        </label>
        <label>
          Votre usage
          <select defaultValue="gaming">
            <option value="gaming">Gaming</option>
            <option value="creation">Création</option>
            <option value="office">Bureautique</option>
          </select>
        </label>
        <button disabled>Génération indisponible</button>
      </div>
      <div className="builder-slots">
        {[
          "Composants",
          "Preuves de compatibilité",
          "Nomenclature et budget",
        ].map((s) => (
          <section className="panel" key={s}>
            <h2>{s}</h2>
            <p>En attente de l'API Phase 7.</p>
          </section>
        ))}
      </div>
      <Link className="button primary" to="/shop">
        Explorer les composants disponibles
      </Link>
    </div>
  );
}
