import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";

/** A deliberate renderer disposal must never invalidate the next environment. */
export function GraphicsLifecycle({ onLost }: { onLost: () => void }) {
  const gl = useThree((state) => state.gl);
  useLayoutEffect(() => {
    let active = true;
    const canvas = gl.domElement;
    // Also remove the previous onCreated listener when upgrading an open Vite session.
    canvas.removeEventListener("webglcontextlost", onLost);
    const lost = (event: Event) => {
      event.preventDefault();
      if (active) onLost();
    };
    canvas.addEventListener("webglcontextlost", lost);
    return () => {
      active = false;
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextlost", onLost);
    };
  }, [gl, onLost]);
  return null;
}
