import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
  () =>
    ({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {}
    }) as unknown as CanvasRenderingContext2D
);

afterEach(() => cleanup());
