// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { UsageBadge } from "../src/UsageBadge";
import { emptyUsage, USAGE_CHANGED } from "../src/model";
import { liveUsage, threadId } from "./fixtures";

afterEach(cleanup);
describe("header usage UI", () => {
  it.each([
    ["1", "1 AIC"],
    ["1.123123", "1 AIC"],
    ["1.49", "1 AIC"],
    ["1.5", "2 AIC"],
    ["1.51", "2 AIC"],
    ["0.000000001", "0 AIC"],
    ["999999999999999999999.5", "1000000000000000000000 AIC"],
  ])("rounds %s AIC to the nearest natural number", (aic, expected) => {
    const view = render(<UsageBadge usage={{ ...liveUsage(), aic }} />);
    expect(view.getByRole("button").textContent).toBe(expected);
  });

  it("shows whole-number AIC and required details on hover and keyboard focus", () => {
    const view = render(<UsageBadge usage={liveUsage()} />);
    const button = view.getByRole("button");
    expect(button.textContent).toBe("11 AIC");
    expect(button.textContent).not.toContain("32");
    fireEvent.mouseEnter(button.parentElement!);
    const dialog = view.getByRole("dialog");
    expect(dialog.textContent).toContain("Used today on this host32 AIC");
    expect(dialog.textContent).toContain(
      "Premium used this month69 / 90 (77%)",
    );
    expect(dialog.textContent).toContain("Monthly reset (UTC)2026-10-01");
    expect(dialog.textContent).not.toContain("Premium requests this session");
    expect(dialog.textContent).not.toContain("Premium remaining");
    expect(dialog.textContent).not.toContain("Usage after quota");
    const details = dialog.querySelector("details")!;
    const disclosure = view.getByText("Details");
    fireEvent.blur(button, { relatedTarget: disclosure });
    expect(view.getByRole("dialog")).toBeTruthy();
    expect(details.open).toBe(false);
    fireEvent.click(disclosure);
    expect(details.open).toBe(true);
    expect(details.textContent).toContain("does not publish remaining AIC");
    fireEvent.click(disclosure);
    expect(details.open).toBe(false);
    fireEvent.keyDown(button, { key: "Escape" });
    expect(view.queryByRole("dialog")).toBeNull();
    fireEvent.focus(button);
    expect(view.getByRole("dialog")).toBeTruthy();
  });
  it("shows unavailable/stale states and hides unsupported providers", () => {
    const view = render(<UsageBadge usage={emptyUsage("missing-identity")} />);
    expect(view.getByRole("button").textContent).toBe("— AIC");
    fireEvent.focus(view.getByRole("button"));
    expect(view.getByRole("dialog").textContent).toContain(
      "exact Copilot session identity",
    );
    view.rerender(
      <UsageBadge
        usage={{ ...liveUsage(), status: "stale", reason: "connection-lost" }}
      />,
    );
    expect(view.getByRole("button").textContent).toContain("stale");
    view.rerender(
      <UsageBadge usage={emptyUsage("unsupported-provider", false)} />,
    );
    expect(view.queryByRole("button")).toBeNull();
  });
  it("explains an unavailable daily total inside Details", () => {
    const view = render(
      <UsageBadge
        usage={{
          ...liveUsage(),
          todayAic: null,
          todayReason: "unreadable-session",
        }}
      />,
    );
    fireEvent.focus(view.getByRole("button"));
    fireEvent.click(view.getByText("Details"));
    expect(view.getByRole("dialog").textContent).toContain(
      "a session file cannot be read",
    );
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
    await slot.findByText("11 AIC");
    current = { ...current, aic: "12.51" };
    await slot.behavior.emitRealtime(USAGE_CHANGED, { threadId: "thr_other" });
    expect(slot.queryByText("13 AIC")).toBeNull();
    await slot.behavior.emitRealtime(USAGE_CHANGED, { threadId });
    await slot.findByText("13 AIC");
    await slot.behavior.setRealtimeConnectionState("reconnecting");
    await slot.findByText("13 AIC · stale");
    slot.lifecycle.unmount();
  });
});
