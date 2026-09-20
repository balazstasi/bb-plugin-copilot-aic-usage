// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { UsageBadge } from "../src/UsageBadge";
import { emptyUsage, USAGE_CHANGED } from "../src/model";
import { liveUsage, threadId } from "./fixtures";

afterEach(cleanup);
describe("header usage UI", () => {
  it("shows exact AIC and required details on hover and keyboard focus", () => {
    const view = render(<UsageBadge usage={liveUsage()} />);
    const button = view.getByRole("button");
    expect(button.textContent).toBe("10.831717 AIC");
    fireEvent.mouseEnter(button.parentElement!);
    const tooltip = view.getByRole("tooltip");
    expect(tooltip.textContent).toContain("Premium requests8");
    expect(tooltip.textContent).toContain("23%");
    expect(tooltip.textContent).toContain("2026-10-01");
    fireEvent.keyDown(button, { key: "Escape" });
    expect(view.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(button);
    expect(view.getByRole("tooltip")).toBeTruthy();
  });
  it("shows unavailable/stale states and hides unsupported providers", () => {
    const view = render(<UsageBadge usage={emptyUsage("missing-identity")} />);
    expect(view.getByRole("button").textContent).toBe("— AIC");
    fireEvent.focus(view.getByRole("button"));
    expect(view.getByRole("tooltip").textContent).toContain(
      "exact Copilot session identity",
    );
    view.rerender(
      <UsageBadge
        usage={{ ...liveUsage(), status: "stale", reason: "inactive-session" }}
      />,
    );
    expect(view.getByRole("button").textContent).toContain("stale");
    view.rerender(
      <UsageBadge usage={emptyUsage("unsupported-provider", false)} />,
    );
    expect(view.queryByRole("button")).toBeNull();
  });
  it("registers the supported slot and refetches on scoped realtime without refresh", async () => {
    const app = await loadPluginApp(() => import("../app"));
    expect(app.threadHeaderActions).toHaveLength(1);
    let current = liveUsage();
    const slot = renderSlot(
      app.threadHeaderActions[0]!,
      { threadId, projectId: "proj_test", isCompactViewport: false },
      {
        rpc: { usage: () => current },
        realtimeConnectionState: "connected",
      },
    );
    await slot.findByText("10.831717 AIC");
    current = { ...current, aic: "12.000000001" };
    await slot.behavior.emitRealtime(USAGE_CHANGED, { threadId: "thr_other" });
    expect(slot.queryByText("12.000000001 AIC")).toBeNull();
    await slot.behavior.emitRealtime(USAGE_CHANGED, { threadId });
    await slot.findByText("12.000000001 AIC");
    await slot.behavior.setRealtimeConnectionState("reconnecting");
    await slot.findByText("12.000000001 AIC · stale");
    slot.lifecycle.unmount();
  });
});
