import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Box,
  ChevronRight,
  CircleHelp,
  Focus,
  Maximize2,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  ShoppingCart,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { departments, shoppers } from "./simulation";
import type { Selection } from "./simulation";
import "./store3d.css";
const StoreScene = lazy(() => import("./StoreScene"));

class SceneBoundary extends Component<
  { children: ReactNode; retry: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="mini-fallback" role="alert">
        <Box size={32} />
        <h2>The 3D view could not start</h2>
        <p>Check WebGL / hardware acceleration, then try again.</p>
        <button onClick={this.props.retry}>Try again</button>
      </div>
    ) : (
      this.props.children
    );
  }
}

export default function StorePrototype() {
  const [paused, setPaused] = useState(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  const [selection, setSelection] = useState<Selection>(null);
  const [reset, setReset] = useState(0);
  const [ready, setReady] = useState(false);
  const [lost, setLost] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [help, setHelp] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const onLost = useCallback(() => setLost(true), []);
  const retry = () => {
    setReady(false);
    setLost(false);
    setAttempt((n) => n + 1);
  };
  useEffect(
    () => () => {
      document.body.style.cursor = "auto";
    },
    [],
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => {
      if (media.matches) setPaused(true);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const department =
    selection?.kind === "shelf"
      ? departments.find((d) => d.id === selection.id)
      : undefined;
  const customer =
    selection?.kind === "customer"
      ? shoppers.find((s) => s.id === selection.id)
      : undefined;
  return (
    <div className={`mini-store ${expanded ? "mini-expanded" : ""}`}>
      <header className="mini-header">
        <Link
          to="/admin"
          className="mini-back"
          aria-label="Back to administration"
        >
          <ArrowLeft size={18} />
        </Link>
        <Link to="/admin" className="mini-brand">
          <Box size={24} />
          <span>
            MARKET<span>HARDWARE / LAB</span>
          </span>
        </Link>
        <span className="mini-header-divider" />
        <span className="mini-location">
          Experiments <ChevronRight size={13} />
          <strong>3D Store</strong>
        </span>
        <span className="mini-demo">
          <span />
          DEMO / SIMULATION
        </span>
        <Link to="/" className="mini-real-store">
          Real storefront <ArrowUpRight size={15} />
        </Link>
      </header>
      <main id="main" tabIndex={-1} className="mini-main">
        <section
          className="mini-viewport"
          aria-label="Interactive miniature electronics store"
        >
          <div
            className="mini-scene"
            role="group"
            data-testid="store-scene"
            aria-label="3D store: drag to orbit, right-drag to pan, scroll to zoom"
          >
            <SceneBoundary key={attempt} retry={retry}>
              <Suspense
                fallback={
                  <div className="mini-loading" role="status">
                    <span className="mini-spinner" />
                    Opening the store…
                  </div>
                }
              >
                {lost ? (
                  <div className="mini-fallback" role="alert">
                    <h2>The graphics connection was interrupted</h2>
                    <p>Your device may be low on graphics memory.</p>
                    <button onClick={retry}>Reload 3D scene</button>
                  </div>
                ) : (
                  <StoreScene
                    paused={paused}
                    reset={reset}
                    selection={selection}
                    onSelect={setSelection}
                    onReady={onReady}
                    onLost={onLost}
                  />
                )}
              </Suspense>
            </SceneBoundary>
          </div>
          <div className="mini-title">
            <div className="mini-eyebrow">
              <span />
              THE MINIATURE SERIES · 001
            </div>
            <h1>
              A little store.
              <br />
              <span>Big possibilities.</span>
            </h1>
            <p>Step inside our hardware playground.</p>
          </div>
          <div className="mini-view-label">
            <span className={paused ? "is-paused" : ""} />
            <span>{paused ? "Simulation paused" : "Simulation running"}</span>
            <span className="mini-view-divider" />
            <span>{ready ? "ISOMETRIC VIEW" : "PREPARING SCENE"}</span>
          </div>
          <div className="mini-north" aria-hidden="true">
            <span>N</span>
            <svg width="38" height="38" viewBox="0 0 38 38">
              <path d="M19 4L27 31L19 25L11 31Z" fill="#546b61" />
              <path d="M19 4V25L11 31Z" fill="#b7c6b9" />
            </svg>
          </div>
          <div
            className="mini-controls"
            role="group"
            aria-label="Scene controls"
          >
            <button
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Resume simulation" : "Pause simulation"}
            >
              {paused ? <Play size={17} /> : <Pause size={17} />}
              <span>{paused ? "Resume" : "Pause"}</span>
            </button>
            <span />
            <button
              onClick={() => setReset((n) => n + 1)}
              aria-label="Reset camera"
            >
              <RotateCcw size={17} />
              <span>Reset view</span>
            </button>
            <button
              onClick={() => setExpanded((p) => !p)}
              aria-label={expanded ? "Show information panel" : "Expand scene"}
              aria-pressed={expanded}
            >
              <Maximize2 size={17} />
            </button>
            <button
              onClick={() => setHelp((p) => !p)}
              aria-label="Camera controls help"
              aria-expanded={help}
            >
              <CircleHelp size={17} />
            </button>
          </div>
          {help && (
            <div className="mini-help">
              <button
                aria-label="Close camera help"
                onClick={() => setHelp(false)}
              >
                <X size={16} />
              </button>
              <strong>Make yourself at home</strong>
              <p>
                Left drag to orbit · Right drag to pan
                <br />
                Scroll or pinch to zoom.
              </p>
              <p>
                Click a display or shopper to explore. The lists in the side
                panel offer the same selection with a keyboard.
              </p>
            </div>
          )}
          <div className="mini-canvas-caption">
            <MousePointer2 size={14} />
            <span>Drag to explore · Click to discover</span>
          </div>
        </section>
        <aside className="mini-panel" aria-label="Simulation information">
          <div className="mini-panel-heading">
            <div className="mini-eyebrow">STORE EXPLORER</div>
            <h2>Welcome to the floor.</h2>
            <p>A tiny world built around your next upgrade.</p>
          </div>
          <div className="mini-stats">
            <div>
              <Users size={16} />
              <strong>09</strong>
              <span>Demo shoppers</span>
            </div>
            <div>
              <Box size={16} />
              <strong>06</strong>
              <span>Departments</span>
            </div>
          </div>
          <section className="mini-departments">
            <div className="mini-section-title">
              <h3>Explore departments</h3>
              <span>6 displays</span>
            </div>
            <div className="mini-department-grid">
              {departments.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelection({ kind: "shelf", id: d.id })}
                  aria-pressed={department?.id === d.id}
                >
                  <span style={{ background: d.color }} />
                  <span>{d.name}</span>
                  <ChevronRight size={13} />
                </button>
              ))}
            </div>
          </section>
          <section
            className="mini-inspector"
            aria-live="polite"
            aria-atomic="true"
          >
            {department ? (
              <>
                <div
                  className="mini-selection-icon"
                  style={{ background: department.color }}
                >
                  <Box size={21} />
                </div>
                <div className="mini-eyebrow">DISPLAY SELECTED</div>
                <h3>{department.name}</h3>
                <p>{department.description}</p>
                <span className="mini-detail-tag">
                  Visual demo · No live inventory
                </span>
              </>
            ) : customer ? (
              <>
                <div
                  className="mini-selection-icon"
                  style={{ background: customer.color }}
                >
                  <Users size={21} />
                </div>
                <div className="mini-eyebrow">
                  SIMULATED SHOPPER / {customer.id}
                </div>
                <h3>Meet {customer.name}.</h3>
                <span className="mini-state-tag">{customer.activity}</span>
                <p>
                  {customer.activity === "Cart"
                    ? "Taking a cart around the aisles. All contents are decorative."
                    : customer.activity === "Browsing"
                      ? "Exploring the displays and pausing to take a closer look."
                      : "Waiting at a demo register. No order or payment is being processed."}
                </p>
              </>
            ) : (
              <>
                <Focus size={26} />
                <h3>A closer look</h3>
                <p>
                  Select a display or a shopper in the scene to discover their
                  little corner of the store.
                </p>
              </>
            )}
          </section>
          <section className="mini-roster">
            <label htmlFor="mini-shopper">
              <Users size={15} />
              Meet the demo shoppers
            </label>
            <select
              id="mini-shopper"
              value={customer?.id ?? ""}
              onChange={(e) =>
                setSelection(
                  e.target.value
                    ? { kind: "customer", id: e.target.value }
                    : null,
                )
              }
            >
              <option value="">Choose a shopper</option>
              {shoppers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.activity}
                </option>
              ))}
            </select>
            <div className="mini-activity">
              <span>
                <i />4 browsing
              </span>
              <span>
                <ShoppingCart size={11} />2 with carts
              </span>
              <span>3 in queue</span>
            </div>
          </section>
          <div className="mini-disclaimer">
            <Sparkles size={17} />
            <p>
              <strong>A scene, not a live feed.</strong>Customers, carts and
              queues are simulated. They do not represent visitors, orders or
              stock. No business data is changed.
            </p>
          </div>
        </aside>
      </main>
      <footer className="mini-footer">
        <span>
          MARKET HARDWARE <span>/</span> INTERACTIVE RETAIL STUDY
        </span>
        <span>
          Procedural world · Prototype 01 <span className="mini-footer-dot" />
        </span>
      </footer>
    </div>
  );
}
