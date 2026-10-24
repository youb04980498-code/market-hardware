import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { GraphicsLifecycle } from "./GraphicsLifecycle";
let canvas: HTMLCanvasElement;
vi.mock("@react-three/fiber", () => ({
  useThree: (select: (state: unknown) => unknown) =>
    select({ gl: { domElement: canvas } }),
}));
beforeEach(() => {
  canvas = document.createElement("canvas");
});
afterEach(cleanup);
describe("renderer lifetime", () => {
  it("reports a real loss but ignores intentional disposal after leaving a view", () => {
    const lost = vi.fn();
    const mounted = render(<GraphicsLifecycle onLost={lost} />);
    const event = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(event);
    expect(lost).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    mounted.unmount();
    canvas.dispatchEvent(new Event("webglcontextlost"));
    expect(lost).toHaveBeenCalledTimes(1);
  });
  it("cleans up the legacy listener when an existing development page upgrades", () => {
    const lost = vi.fn();
    canvas.addEventListener("webglcontextlost", lost);
    const mounted = render(<GraphicsLifecycle onLost={lost} />);
    mounted.unmount();
    canvas.dispatchEvent(new Event("webglcontextlost"));
    expect(lost).not.toHaveBeenCalled();
  });
});
