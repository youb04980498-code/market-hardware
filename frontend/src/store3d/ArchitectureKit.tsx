import { Block, Sign } from "./geometry";

/** Shared original city/campus architecture; decorative geometry has no business semantics. */
export function Roofline({
  width,
  depth,
  height,
  industrial = false,
}: {
  width: number;
  depth: number;
  height: number;
  industrial?: boolean;
}) {
  return (
    <group position={[0, height, 0]}>
      <Block
        size={[width + 0.5, 0.3, depth + 0.5]}
        position={[0, 0.12, 0]}
        color="#596e73"
      />
      <Block
        size={[width - 0.5, 0.12, depth - 0.5]}
        position={[0, 0.33, 0]}
        color="#99a7a2"
      />
      {[-1, 1].map((side) => (
        <Block
          key={side}
          size={[width + 0.45, 0.45, 0.16]}
          position={[0, 0.5, side * (depth / 2 + 0.16)]}
          color="#61777b"
        />
      ))}
      {[-1, 1].map((side) => (
        <Block
          key={side}
          size={[0.16, 0.45, depth + 0.5]}
          position={[side * (width / 2 + 0.16), 0.5, 0]}
          color="#61777b"
        />
      ))}
      <Block
        size={[Math.min(2.8, width / 3), 0.65, Math.min(2, depth / 3)]}
        position={[-width * 0.22, 0.74, -depth * 0.2]}
        color="#c4cdc5"
      />
      <Block
        size={[Math.min(2.4, width / 3), 0.12, Math.min(1.6, depth / 3)]}
        position={[-width * 0.22, 1.1, -depth * 0.2]}
        color="#7d9293"
      />
      {(industrial ? [-0.22, 0.17] : [0.17]).map((z) => (
        <group key={z} position={[width * 0.13, 0.48, depth * z]}>
          <Block size={[width * 0.34, 0.16, depth * 0.16]} color="#cdd8ce" />
          <Block
            size={[width * 0.3, 0.06, depth * 0.13]}
            position={[0, 0.12, 0]}
            color="#9dbfc0"
          />
        </group>
      ))}
    </group>
  );
}

export function CampusBuilding({
  width,
  depth,
  height = 4.6,
  title,
  subtitle,
  accent = "#a7bdb7",
  kind = "retail",
  open,
}: {
  width: number;
  depth: number;
  height?: number;
  title: string;
  subtitle: string;
  accent?: string;
  kind?: "retail" | "office" | "industrial" | "logistics";
  open: boolean;
}) {
  const industrial = kind === "industrial" || kind === "logistics";
  const columns = Math.max(3, Math.floor(width / 2.8));
  return (
    <>
      <Block
        size={[width + 0.6, 0.2, depth + 0.6]}
        position={[0, -0.04, 0]}
        color="#d9d4c4"
      />
      <Block
        size={[width, 0.08, depth]}
        position={[0, 0.08, 0]}
        color={industrial ? "#e0ddce" : "#eee7d7"}
      />
      <Block
        size={[width, height, 0.22]}
        position={[0, height / 2, -depth / 2]}
        color={accent}
      />
      <Block
        size={[0.22, height, depth]}
        position={[-width / 2, height / 2, 0]}
        color={accent}
      />
      <Block
        size={[width, 0.32, 0.4]}
        position={[0, height - 0.1, -depth / 2]}
        color="#526c73"
      />
      <Block
        size={[0.4, 0.32, depth]}
        position={[-width / 2, height - 0.1, 0]}
        color="#526c73"
      />
      {Array.from({ length: columns }, (_, i) => {
        const x = (i - (columns - 1) / 2) * (width / columns);
        return (
          <group key={i}>
            <Block
              size={[width / columns - 0.45, 1.1, 0.08]}
              position={[x, height - 1.1, -depth / 2 - 0.15]}
              color="#7e9da1"
            />
            <Block
              size={[0.12, height, 0.26]}
              position={[x, height / 2, -depth / 2 - 0.13]}
              color="#e6e4d8"
            />
          </group>
        );
      })}
      <Sign
        text={title}
        sub={subtitle}
        width={width * 0.8}
        height={0.85}
        position={[0, height - 0.85, -depth / 2 + 0.14]}
        color="#354f59"
        ink="#faf0dc"
      />
      {!open && (
        <>
          <Roofline
            width={width}
            depth={depth}
            height={height}
            industrial={industrial}
          />
          <Block
            size={[width, height, 0.18]}
            position={[0, height / 2, depth / 2]}
            color={accent}
          />
          <Block
            size={[0.18, height, depth]}
            position={[width / 2, height / 2, 0]}
            color={accent}
          />
          {Array.from({ length: columns }, (_, i) => {
            const x = (i - (columns - 1) / 2) * (width / columns);
            return (
              <group key={i}>
                <Block
                  size={[width / columns - 0.4, height - 1.5, 0.12]}
                  position={[x, (height - 1.5) / 2 + 0.15, depth / 2 + 0.12]}
                  color={industrial ? "#94a5a1" : "#9ebdc1"}
                />
                <Block
                  size={[0.13, height, 0.3]}
                  position={[x, height / 2, depth / 2 + 0.12]}
                  color="#e8e7dc"
                />
                {industrial &&
                  [0.7, 1.2, 1.7, 2.2].map((y) => (
                    <Block
                      key={y}
                      size={[width / columns - 0.45, 0.05, 0.14]}
                      position={[x, y, depth / 2 + 0.2]}
                      color="#cad1c5"
                    />
                  ))}
                <Block
                  size={[0.12, 1.6, depth / columns - 0.35]}
                  position={[
                    width / 2 + 0.13,
                    2.1,
                    (i - (columns - 1) / 2) * (depth / columns),
                  ]}
                  color="#90b0b5"
                />
              </group>
            );
          })}
          <Sign
            text={title}
            sub={subtitle}
            width={width * 0.86}
            height={1}
            position={[0, height - 0.65, depth / 2 + 0.25]}
            color="#354f59"
            ink="#faf0dc"
          />
          <Block
            size={[Math.min(width - 1, 5), 0.16, 1.3]}
            position={[0, height - 1.2, depth / 2 + 0.6]}
            color={industrial ? "#718789" : "#c9bba0"}
          />
          {!industrial && (
            <>
              <Block
                size={[1.8, 2.1, 0.16]}
                position={[0, 1.1, depth / 2 + 0.22]}
                color="#496771"
              />
              <Block
                size={[0.06, 1.8, 0.2]}
                position={[0, 1.1, depth / 2 + 0.33]}
                color="#dbdfd4"
              />
            </>
          )}
        </>
      )}
      {industrial &&
        [-0.3, 0.3].map((x) => (
          <group key={x} position={[width * x, 0, depth / 2 + 0.65]}>
            <Block
              size={[width * 0.24, 0.25, 1.3]}
              position={[0, 0.1, 0]}
              color="#89968c"
            />
            {[-1, 1].map((side) => (
              <Block
                key={side}
                size={[0.12, 0.75, 0.16]}
                position={[side * width * 0.1, 0.45, 0.3]}
                color="#d0b75f"
              />
            ))}
          </group>
        ))}
    </>
  );
}
