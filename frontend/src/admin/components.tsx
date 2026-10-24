import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  RefreshCw,
  X,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  TriangleAlert,
  Inbox,
} from "lucide-react";
import { dateTime, integer, statusLabels } from "./data";
import type { Meta } from "../api/analytics";
export function PageHeader({
  title,
  subtitle,
  tag,
  children,
}: {
  title: string;
  subtitle: string;
  tag: string;
  children?: ReactNode;
}) {
  return (
    <header className="command-header">
      <div>
        <p className="eyebrow">{tag}</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="command-actions">{children}</div>
    </header>
  );
}
export function Refresh({
  onClick,
  loading = false,
}: {
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button className="admin-button" onClick={onClick} disabled={loading}>
      <RefreshCw size={15} className={loading ? "spin" : ""} />
      Actualiser
    </button>
  );
}
export function Kpi({
  label,
  value,
  note,
  href,
  icon,
}: {
  label: string;
  value: ReactNode;
  note: ReactNode;
  href?: string;
  icon?: ReactNode;
}) {
  const content = (
    <>
      <div className="kpi-label">
        {label}
        {icon || (href && <ArrowUpRight size={16} />)}
      </div>
      <strong className="metric">{value ?? "—"}</strong>
      <small>{note}</small>
    </>
  );
  return href ? (
    <Link className="kpi-card" to={href}>
      {content}
    </Link>
  ) : (
    <article className="kpi-card">{content}</article>
  );
}
export function Panel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"command-panel " + className}>
      <header className="panel-title">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
export function Badge({ value, tone }: { value: string; tone?: string }) {
  const type =
    tone ||
    ([
      "PAID",
      "SUCCEEDED",
      "DELIVERED",
      "READY",
      "APPROVED",
      "RESOLVED",
      "ok",
    ].includes(value)
      ? "good"
      : ["FAILED", "PAYMENT_FAILED", "critical", "down"].includes(value)
        ? "bad"
        : ["PENDING", "STOCK_RESERVED", "ACTIVE", "warning"].includes(value)
          ? "warn"
          : "neutral");
  return (
    <span className={"status-badge " + type}>
      <span aria-hidden="true" />
      {statusLabels[value] || value}
    </span>
  );
}
export function Freshness({
  meta,
  at,
  error,
}: {
  meta?: Meta;
  at?: string;
  error?: string;
}) {
  return (
    <div
      className={
        "data-freshness " +
        (meta?.stale || error
          ? "is-stale"
          : !meta && !at
            ? "freshness-pending"
            : "")
      }
    >
      <span className="status-dot" />
      <span>
        {error
          ? "Actualisation interrompue · dernières données conservées"
          : meta?.stale
            ? "Projection ancienne · à vérifier"
            : !meta && !at
              ? "Lecture en cours"
              : "Dernière lecture réussie"}{" "}
        · {dateTime(meta?.last_refresh_at || at)}
      </span>
      {meta && <span>Version {meta.release_id.slice(0, 8)}</span>}
    </div>
  );
}
export function ResourceState({
  loading,
  data,
  error,
  retry,
  empty,
}: {
  loading?: boolean;
  data?: unknown;
  error?: string;
  retry?: () => void;
  empty?: boolean;
}) {
  return (
    <>
      {error && (
        <div className="command-error" role="alert">
          <TriangleAlert size={18} />
          <div>
            <strong>Impossible d’actualiser</strong>
            <p>{error}</p>
          </div>
          {retry && <button onClick={retry}>Réessayer</button>}
        </div>
      )}
      {loading && !data && (
        <div
          className="loading-skeleton"
          role="status"
          aria-label="Chargement des données"
        >
          <i />
          <i />
          <i />
        </div>
      )}
      {!loading && !error && empty && (
        <div className="command-empty">
          <Inbox size={25} />
          <strong>Aucun résultat</strong>
          <p>Essayez une autre période ou modifiez les filtres.</p>
        </div>
      )}
    </>
  );
}
export function Tabs({
  tabs,
  value,
  onChange,
  label = "Vues",
}: {
  tabs: { id: string; label: string; count?: number }[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  return (
    <div className="command-tabs" role="group" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          aria-pressed={value === t.id}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count != null && <span>{integer(t.count)}</span>}
        </button>
      ))}
    </div>
  );
}
export function Pagination({
  page,
  total,
  size = 10,
  onChange,
}: {
  page: number;
  total: number;
  size?: number;
  onChange: (p: number) => void;
}) {
  return (
    <nav className="command-pagination" aria-label="Pagination">
      <span>
        {total
          ? `${(page - 1) * size + 1}–${Math.min(page * size, total)}`
          : "0"}{" "}
        sur {integer(total)} résultats
      </span>
      <div>
        <button disabled={page === 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft size={14} />
          Précédent
        </button>
        <span>Page {page}</span>
        <button
          disabled={page * size >= total}
          onClick={() => onChange(page + 1)}
        >
          Suivant
          <ChevronRight size={14} />
        </button>
      </div>
    </nav>
  );
}
export function Drawer({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="detail-drawer"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <header>
        <div>
          <p className="eyebrow">DÉTAIL & INVESTIGATION</p>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button autoFocus aria-label="Fermer le détail" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div className="drawer-content">{children}</div>
    </dialog>
  );
}
export function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value ?? "Non disponible"}</strong>
    </div>
  );
}
export function ShareList({
  rows,
  format,
  onSelect,
}: {
  rows: { label: string; value: number; id?: string }[];
  format: (v: number) => string;
  onSelect?: (id: string) => void;
}) {
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  return (
    <div className="share-list">
      {rows.map((r) => {
        const pct = total > 0 ? (r.value / total) * 100 : undefined;
        const body = (
          <>
            <span>{r.label}</span>
            <strong>{format(r.value)}</strong>
            <small>
              {pct == null
                ? "—"
                : pct > 0 && pct < 0.1
                  ? "<0,1 %"
                  : pct.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) +
                    " %"}
            </small>
            <i aria-hidden="true">
              <b
                style={{ width: `${Math.max(0, Math.min(100, pct || 0))}%` }}
              />
            </i>
          </>
        );
        return onSelect ? (
          <button
            key={r.id || r.label}
            onClick={() => onSelect(r.id || r.label)}
          >
            {body}
          </button>
        ) : (
          <div key={r.id || r.label}>{body}</div>
        );
      })}
    </div>
  );
}
export type Range = { from: string; to: string };
export const periodQuery = (r: Range) =>
  new URLSearchParams(
    Object.fromEntries(Object.entries(r).filter(([, v]) => v)),
  ).toString();
const ymd = (d: Date) => d.toISOString().slice(0, 10);
export function DateRange({
  value,
  onChange,
}: {
  value: Range;
  onChange: (r: Range) => void;
}) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(value),
    [month, setMonth] = useState(
      () => (value.from || ymd(new Date())).slice(0, 7) + "-01",
    );
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const outside = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("mousedown", outside);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("mousedown", outside);
    };
  }, [open]);
  const start = new Date(month + "T00:00:00Z");
  const lead = (start.getUTCDay() + 6) % 7;
  const dates = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(i - lead + 1);
    return ymd(d);
  });
  function preset(days: number) {
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    end.setUTCDate(end.getUTCDate() + 1);
    const from = new Date(end);
    from.setUTCDate(from.getUTCDate() - days);
    onChange({ from: ymd(from), to: ymd(end) });
    setOpen(false);
  }
  return (
    <div className="range-control" ref={root}>
      <button
        className="admin-button"
        aria-expanded={open}
        onClick={() => {
          setDraft(value);
          setMonth((value.from || ymd(new Date())).slice(0, 7) + "-01");
          setOpen(!open);
        }}
      >
        <CalendarDays size={16} />
        {value.from ? `${value.from} → ${value.to || "…"}` : "Toutes les dates"}
        <span>UTC</span>
      </button>
      {open && (
        <div className="range-popover" aria-label="Choisir la période">
          <div className="range-presets">
            {[1, 7, 30, 90].map((n) => (
              <button key={n} onClick={() => preset(n)}>
                {n === 1 ? "Aujourd’hui" : `${n} derniers jours`}
              </button>
            ))}
            <button
              onClick={() => {
                onChange({ from: "", to: "" });
                setOpen(false);
              }}
            >
              Toutes les dates
            </button>
          </div>
          <div className="calendar">
            <div className="calendar-title">
              <button
                aria-label="Mois précédent"
                onClick={() => {
                  const d = new Date(start);
                  d.setUTCMonth(d.getUTCMonth() - 1);
                  setMonth(ymd(d));
                }}
              >
                <ChevronLeft size={16} />
              </button>
              <div className="calendar-month-controls">
                <select
                  aria-label="Mois du calendrier"
                  value={month.slice(5, 7)}
                  onChange={(e) =>
                    setMonth(month.slice(0, 5) + e.target.value + "-01")
                  }
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i} value={String(i + 1).padStart(2, "0")}>
                      {new Date(Date.UTC(2026, i, 1)).toLocaleDateString(
                        "fr-FR",
                        { month: "long", timeZone: "UTC" },
                      )}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Année du calendrier"
                  value={month.slice(0, 4)}
                  onChange={(e) => setMonth(e.target.value + month.slice(4))}
                >
                  {Array.from({ length: 111 }, (_, i) => (
                    <option key={i}>{2020 + i}</option>
                  ))}
                </select>
              </div>
              <button
                aria-label="Mois suivant"
                onClick={() => {
                  const d = new Date(start);
                  d.setUTCMonth(d.getUTCMonth() + 1);
                  setMonth(ymd(d));
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="calendar-grid">
              {["L", "M", "M", "J", "V", "S", "D"].map((w, i) => (
                <small key={i}>{w}</small>
              ))}
              {dates.map((d) => (
                <button
                  key={d}
                  className={
                    (d.slice(0, 7) !== month.slice(0, 7) ? "outside " : "") +
                    (draft.from === d || draft.to === d ? "chosen " : "") +
                    (draft.from && draft.to && d > draft.from && d < draft.to
                      ? "between"
                      : "")
                  }
                  aria-label={d}
                  aria-pressed={d === draft.from || d === draft.to}
                  onClick={() =>
                    setDraft(
                      !draft.from || draft.to || d < draft.from
                        ? { from: d, to: "" }
                        : { from: draft.from, to: d },
                    )
                  }
                >
                  {Number(d.slice(-2))}
                </button>
              ))}
            </div>
            <p className="small">Début inclus · fin exclue · UTC</p>
            <p>
              {draft.from || "Début"} → {draft.to || "Fin"}
            </p>
            <button
              className="admin-button primary"
              disabled={!draft.from || !draft.to || draft.from >= draft.to}
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
            >
              Appliquer la période
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
