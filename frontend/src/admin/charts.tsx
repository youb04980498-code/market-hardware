import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { money } from "../shared/utils";
import { integer } from "./data";
function niceTicks(max: number) {
  if (!(max > 0)) return [0, 1];
  const raw = max / 4,
    pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) =>
    Number((i * step).toFixed(6)),
  );
}
export function OrdersChart({
  rows,
  hourly = false,
}: {
  rows: { label: string; count: number }[];
  hourly?: boolean;
}) {
  const ticks = niceTicks(Math.max(0, ...rows.map((r) => r.count)));
  const Chart = hourly ? BarChart : AreaChart;
  return (
    <>
      <div
        className="chart-stage"
        role="img"
        aria-label="Évolution des commandes ; valeurs exactes dans le tableau dépliable"
      >
        <ResponsiveContainer width="100%" height="100%">
          <Chart
            data={rows}
            accessibilityLayer
            margin={{ top: 10, right: 15, bottom: 5, left: -12 }}
          >
            <defs>
              <linearGradient id="orders-fill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--accent)"
                  stopOpacity={0.16}
                />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              minTickGap={45}
              tickFormatter={(v) => (hourly ? v : String(v).slice(5))}
            />
            <YAxis
              allowDecimals={false}
              ticks={ticks}
              domain={[0, ticks[ticks.length - 1]]}
            />
            <Tooltip formatter={(v) => [integer(Number(v)), "Commandes"]} />
            {hourly ? (
              <Bar
                dataKey="count"
                name="Commandes"
                fill="var(--accent)"
                maxBarSize={42}
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
            ) : (
              <Area
                type="linear"
                dataKey="count"
                name="Commandes"
                stroke="var(--accent)"
                strokeWidth={2}
                fill="url(#orders-fill)"
                isAnimationActive={false}
              />
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
      <details>
        <summary>Valeurs des commandes</summary>
        <div className="command-table">
          <table>
            <thead>
              <tr>
                <th>Période UTC</th>
                <th className="numeric">Commandes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td className="numeric">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
export function RevenueChart({
  rows,
  metric = "net_cents",
}: {
  rows: {
    period: string;
    gross_cents: number;
    refunded_cents: number;
    net_cents: number;
  }[];
  metric?: "net_cents" | "gross_cents" | "refunded_cents";
}) {
  return (
    <>
      <div
        className="chart-stage"
        role="img"
        aria-label="Évolution du chiffre d’affaires ; montants exacts disponibles dans le tableau"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            accessibilityLayer
            margin={{ top: 10, right: 15, bottom: 5, left: 5 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis dataKey="period" minTickGap={45} />
            <YAxis
              domain={[0, "auto"]}
              tickFormatter={(v) =>
                new Intl.NumberFormat("fr-FR", { notation: "compact" }).format(
                  Number(v) / 100,
                ) + " €"
              }
              width={68}
              tickCount={5}
            />
            <Tooltip formatter={(v) => money(Number(v))} />
            <Legend />
            <Line
              type="linear"
              dataKey={metric}
              name={
                metric === "net_cents"
                  ? "CA net"
                  : metric === "gross_cents"
                    ? "CA brut"
                    : "Remboursements"
              }
              stroke={
                metric === "refunded_cents" ? "var(--danger)" : "var(--money)"
              }
              dot={false}
              strokeWidth={2.2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details>
        <summary>Valeurs du graphique</summary>
        <div className="command-table">
          <table>
            <thead>
              <tr>
                <th>Période</th>
                <th className="numeric">Brut</th>
                <th className="numeric">Remboursé</th>
                <th className="numeric">Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.period}>
                  <td>{r.period}</td>
                  <td className="numeric">{money(r.gross_cents)}</td>
                  <td className="numeric">{money(r.refunded_cents)}</td>
                  <td className="numeric">{money(r.net_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
export function MetricBars({
  rows,
  unit,
}: {
  rows: { name: string; value: number }[];
  unit: string;
}) {
  return (
    <div
      className="chart-stage"
      role="img"
      aria-label={`Mesures par service en ${unit}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          accessibilityLayer
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis dataKey="name" minTickGap={8} />
          <YAxis domain={[0, "auto"]} tickCount={4} />
          <Tooltip
            formatter={(v) => [
              Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 3 }) +
                " " +
                unit,
              "Mesure",
            ]}
          />
          <Bar
            dataKey="value"
            fill="var(--accent)"
            maxBarSize={36}
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
