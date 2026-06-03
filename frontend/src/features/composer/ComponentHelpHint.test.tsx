/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ComponentHelpHint } from "@/features/composer/ComponentHelpHint";

afterEach(() => cleanup());

describe("ComponentHelpHint", () => {
  it("renders nothing without description", () => {
    const { container } = render(<ComponentHelpHint />);
    expect(container.textContent).toBe("");
  });

  it("opens popover with description text", () => {
    render(<ComponentHelpHint description="Peak is the most recent qualifying bar." />);
    fireEvent.click(screen.getByRole("button", { name: "Component help" }));
    expect(screen.getByRole("dialog", { name: "Component help" }).textContent).toContain(
      "Peak is the most recent qualifying bar.",
    );
  });
});
