export function State({
  loading,
  error,
  empty,
  retry,
}: {
  loading?: boolean;
  error?: string;
  empty?: boolean;
  retry?: () => void;
}) {
  if (loading)
    return (
      <div className="state" role="status">
        <span className="loader" />
        Chargement des données…
      </div>
    );
  if (error)
    return (
      <div className="state error" role="alert">
        <p>{error}</p>
        {retry && <button onClick={retry}>Réessayer</button>}
      </div>
    );
  if (empty)
    return (
      <div className="state">
        <h2>Aucun résultat</h2>
        <p>Modifiez vos filtres ou revenez plus tard.</p>
      </div>
    );
  return null;
}
