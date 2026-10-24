import { useEffect, useMemo } from "react";
import type { ComponentProps } from "react";
import { Instance } from "@react-three/drei";
import { CanvasTexture, SRGBColorSpace } from "three";
import type { ThreeElements } from "@react-three/fiber";

export function Block({
  color = "#e7e4df",
  size,
  ...props
}: Omit<ComponentProps<typeof Instance>, "color" | "scale"> & {
  color?: string;
  size: [number, number, number];
}) {
  return <Instance {...props} scale={size} color={color} />;
}

// Local canvas lettering: no downloaded fonts, textures, models or CDN dependencies.
export function Sign({
  text,
  sub = "",
  color = "#f6f2e9",
  ink = "#263442",
  width = 2,
  height = 0.55,
  ...props
}: ThreeElements["mesh"] & {
  text: string;
  sub?: string;
  color?: string;
  ink?: string;
  width?: number;
  height?: number;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 76px Arial, sans-serif";
    ctx.fillText(text, 512, sub ? 100 : 132, 970);
    if (sub) {
      ctx.font = "500 28px Arial, sans-serif";
      ctx.fillText(sub, 512, 190, 970);
    }
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    return map;
  }, [text, sub, color, ink]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh {...props}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

export function Fan({
  radius = 0.16,
  color = "#8586a5",
}: {
  radius?: number;
  color?: string;
}) {
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh>
        <cylinderGeometry args={[radius, radius, 0.045, 16]} />
        <meshStandardMaterial color="#26313c" />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => (
        <group key={i} rotation={[0, (i * Math.PI * 2) / 7, 0]}>
          <Block
            size={[radius * 0.38, 0.025, radius * 0.67]}
            position={[0, 0.03, radius * 0.42]}
            rotation={[0, 0.5, 0]}
            color={color}
          />
        </group>
      ))}
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[radius * 0.25, radius * 0.25, 0.04, 12]} />
        <meshStandardMaterial color="#c2c9d0" metalness={0.5} roughness={0.4} />
      </mesh>
    </group>
  );
}

export function Hardware({ kind }: { kind: string }) {
  if (kind === "gpu")
    return (
      <group>
        <Block size={[1.25, 0.55, 0.12]} color="#34424f" />
        <group position={[-0.32, 0, 0.1]}>
          <Fan radius={0.22} />
        </group>
        <group position={[0.32, 0, 0.1]}>
          <Fan radius={0.22} />
        </group>
        <Block
          size={[0.75, 0.07, 0.08]}
          position={[0, -0.32, 0]}
          color="#d4b477"
        />
      </group>
    );
  if (kind === "cpu")
    return (
      <group rotation={[0.15, 0, 0]}>
        <Block size={[0.65, 0.65, 0.09]} color="#356b69" />
        <Block
          size={[0.46, 0.46, 0.11]}
          position={[0, 0, 0.06]}
          color="#c7cbd1"
        />
        {[-1, 1].map((x) => (
          <Block
            key={x}
            size={[0.09, 0.5, 0.025]}
            position={[x * 0.3, 0, 0.07]}
            color="#d5b778"
          />
        ))}
      </group>
    );
  if (kind === "ram")
    return (
      <group rotation={[0, 0, 0.15]}>
        {[-1, 1].map((n) => (
          <group key={n} position={[0, n * 0.16, 0]}>
            <Block size={[1, 0.22, 0.08]} color="#385e54" />
            <Block
              size={[0.9, 0.07, 0.1]}
              position={[0, -0.12, 0]}
              color="#d4b477"
            />
            {[-0.3, 0, 0.3].map((x) => (
              <Block
                key={x}
                size={[0.18, 0.14, 0.03]}
                position={[x, 0, 0.06]}
                color="#26323e"
              />
            ))}
          </group>
        ))}
      </group>
    );
  if (kind === "board")
    return (
      <group>
        <Block size={[0.95, 0.8, 0.07]} color="#354f5a" />
        <Block
          size={[0.3, 0.28, 0.08]}
          position={[-0.08, 0.12, 0.07]}
          color="#b9c0c5"
        />
        {[-0.24, -0.06, 0.12].map((y) => (
          <Block
            key={y}
            size={[0.47, 0.055, 0.07]}
            position={[0.05, y - 0.15, 0.07]}
            color="#26303c"
          />
        ))}
        {[0.23, 0.33].map((x) => (
          <Block
            key={x}
            size={[0.045, 0.42, 0.06]}
            position={[x, 0.14, 0.08]}
            color="#d2ad6b"
          />
        ))}
      </group>
    );
  if (kind === "builds")
    return (
      <group>
        <Block size={[0.6, 0.95, 0.5]} color="#334350" />
        <Block
          size={[0.47, 0.81, 0.02]}
          position={[0, 0, 0.26]}
          color="#95b5bd"
        />
        {[-0.22, 0.22].map((y) => (
          <group key={y} position={[0, y, 0.29]}>
            <Fan radius={0.15} color="#a9c9c6" />
          </group>
        ))}
      </group>
    );
  return (
    <group>
      <Block size={[0.8, 0.55, 0.13]} color="#596476" />
      <Sign text="NVMe" width={0.6} height={0.17} position={[0, 0, 0.08]} />
      <Block size={[0.5, 0.07, 0.08]} color="#d6ba76" position={[0, -0.3, 0]} />
    </group>
  );
}
