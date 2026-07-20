import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Sidebar } from "./Sidebar";
import { mockProject } from "@/lib/mock";

// Shows the live route so a click that navigates is observable.
function LocationProbe() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

const renderSidebar = () =>
  render(
    <MemoryRouter initialEntries={["/live"]}>
      <Sidebar project={mockProject} />
      <LocationProbe />
    </MemoryRouter>,
  );

describe("Sidebar gear menu", () => {
  // Regression: the menu is portalled to document.body, so it is not a DOM
  // descendant of the gear container. A close-on-outside handler that fired on
  // mousedown and only checked the gear container treated a click INSIDE the
  // menu as "outside" — it unmounted the menu before the item's click landed,
  // so every item (Settings / Setup / Report) was dead. A real user click is
  // mousedown → mouseup → click; userEvent.click reproduces that sequence.
  it("navigates when a menu item is clicked (menu does not self-dismiss first)", async () => {
    const user = userEvent.setup();
    renderSidebar();

    // Open the menu (the gear button carries the Settings aria-label).
    const gears = screen.getAllByLabelText("Settings");
    await user.click(gears[gears.length - 1]);

    // The Setup item is now in the portalled menu.
    await user.click(screen.getByText("Setup"));

    expect(screen.getByTestId("path").textContent).toBe("/setup");
  });
});
