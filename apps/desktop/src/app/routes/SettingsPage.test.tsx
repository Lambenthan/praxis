import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { SettingsPage } from "./SettingsPage";
import { SettingRow } from "@/features/settings/SettingRow";

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe("SettingRow primitive", () => {
  it("groups label + description for a11y and renders the control", () => {
    render(
      <SettingRow
        label="Theme"
        description="Pick light or dark."
        control={<button>toggle</button>}
      />,
    );
    const group = screen.getByRole("group", { name: "Theme" });
    expect(group).toHaveAccessibleDescription("Pick light or dark.");
    expect(within(group).getByRole("button", { name: "toggle" })).toBeInTheDocument();
  });

  it("renders a wide control in the below slot", () => {
    render(<SettingRow label="Default model" below={<div>picker</div>} />);
    expect(screen.getByText("picker")).toBeInTheDocument();
  });
});

describe("SettingsPage two-pane nav", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* jsdom */
    }
  });

  it("shows a labelled settings nav with General active by default", () => {
    renderPage();
    const nav = screen.getByRole("navigation", { name: "Settings" });
    const general = within(nav).getByTestId("settings-tab-general");
    expect(general).toHaveAttribute("aria-current", "page");
    // The General section renders the Theme row.
    expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();
  });

  it("switches the right pane when a nav tab is clicked", async () => {
    renderPage();
    const nav = screen.getByRole("navigation", { name: "Settings" });

    await userEvent.click(within(nav).getByTestId("settings-tab-permissions"));
    expect(within(nav).getByTestId("settings-tab-permissions")).toHaveAttribute(
      "aria-current",
      "page",
    );
    // Permissions section shows its approval-mode radiogroup.
    expect(await screen.findByRole("radiogroup", { name: "Approval mode" })).toBeInTheDocument();

    await userEvent.click(within(nav).getByTestId("settings-tab-about"));
    // About section shows the version row and third-party licenses entry.
    expect(screen.getByTestId("settings-third-party-licenses")).toBeInTheDocument();
  });
});
