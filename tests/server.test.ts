import { afterEach, describe, expect, it } from "vitest";
import {
  createFakePluginHost,
  makeThreadResponse,
  experimental_scanPublicSdkOnly,
} from "@get-bb/plugin-sdk/testing";
import plugin from "../server";
import { threadId, sessionA, sessionB, liveUsage } from "./fixtures";

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});
function setup(
  providerId = "acp-copilot",
  identity = sessionA,
  failHost = false,
) {
  let current = identity;
  const fake = createFakePluginHost({
    pluginId: "copilot-aic-usage",
    experimental_hostEntry: true,
    sdk: {
      threads: {
        get: async () =>
          ({
            ...makeThreadResponse({ id: threadId, providerId }),
            environment: { hostId: "host-remote" },
          }) as never,
        events: {
          list: async () =>
            current
              ? ([
                  {
                    type: "thread/identity",
                    seq: 5,
                    data: { providerThreadId: current },
                  },
                ] as never)
              : [],
        },
      },
    },
    experimental_callHostRpc: async () => {
      if (failHost) throw new Error("private host failure detail");
      return liveUsage();
    },
  });
  plugin(fake.bb);
  disposers.push(() => fake.harness.lifecycle.dispose());
  return {
    ...fake,
    setIdentity: (id: string) => {
      current = id;
    },
  };
}
describe("server routing and realtime", () => {
  it("routes to the environment host and fetches only two identity records", async () => {
    const { harness } = setup();
    expect(await harness.behavior.callRpc("usage", { threadId })).toMatchObject(
      { aic: "10.831717" },
    );
    expect(harness.inspection.experimental_hostRpcCalls[0]).toMatchObject({
      hostId: "host-remote",
      method: "read",
      input: { threadId, sessionId: sessionA },
    });
    expect(
      harness.inspection.sdk.callsTo("threads.events.list")[0],
    ).toMatchObject([
      { threadId, types: ["thread/identity"], order: "desc", limit: "2" },
    ]);
    await harness.behavior.experimental_emitHostSignal(
      "host-remote",
      "changed",
      { threadId, sessionId: sessionA },
    );
    expect(harness.inspection.realtimeSignals).toHaveLength(1);
    expect(JSON.stringify(harness.inspection.realtimeSignals)).not.toContain(
      "10.831717",
    );
  });
  it("supports the marketplace GitHub Copilot provider", async () => {
    const { harness } = setup("acp-gh-copilot");
    expect(await harness.behavior.callRpc("usage", { threadId })).toMatchObject(
      {
        supported: true,
        aic: "10.831717",
      },
    );
    expect(harness.inspection.experimental_hostRpcCalls[0]).toMatchObject({
      input: { threadId, sessionId: sessionA },
    });
  });
  it("ignores another host or obsolete session signals", async () => {
    const { harness, setIdentity } = setup();
    await harness.behavior.callRpc("usage", { threadId });
    setIdentity(sessionB);
    await harness.behavior.callRpc("usage", { threadId });
    await harness.behavior.experimental_emitHostSignal(
      "wrong-host",
      "changed",
      { threadId, sessionId: sessionB },
    );
    await harness.behavior.experimental_emitHostSignal(
      "host-remote",
      "changed",
      { threadId, sessionId: sessionA },
    );
    expect(harness.inspection.realtimeSignals).toEqual([]);
    await harness.behavior.experimental_emitHostSignal(
      "host-remote",
      "changed",
      { threadId, sessionId: sessionB },
    );
    expect(harness.inspection.realtimeSignals).toHaveLength(1);
  });
  it("does not read host files for other providers or a missing identity", async () => {
    for (const [provider, identity, reason] of [
      ["codex", sessionA, "unsupported-provider"],
      ["acp-copilot", "", "missing-identity"],
    ]) {
      const { harness } = setup(provider, identity);
      expect(
        await harness.behavior.callRpc("usage", { threadId }),
      ).toMatchObject({ aic: null, reason });
      expect(harness.inspection.experimental_hostRpcCalls).toEqual([]);
    }
  });
  it("validates RPC inputs without echoing arbitrary input", async () => {
    const { harness } = setup();
    await expect(
      harness.behavior.callRpc("usage", { threadId: "../secret" }),
    ).rejects.toThrow();
    await expect(
      harness.behavior.callRpc("usage", { threadId, path: "/secret" }),
    ).rejects.toThrow();
    expect(harness.inspection.experimental_hostRpcCalls).toEqual([]);
  });
  it("hides the badge if the provider cannot be established", async () => {
    const { harness } = setup();
    harness.inspection.sdk.stub("threads.get", async () => {
      throw new Error("missing thread");
    });
    expect(await harness.behavior.callRpc("usage", { threadId })).toMatchObject(
      { supported: false, aic: null },
    );
  });
  it("returns a bounded unavailable state when a remote host fails", async () => {
    const { harness } = setup("acp-copilot", sessionA, true);
    const result = await harness.behavior.callRpc("usage", { threadId });
    expect(result).toMatchObject({
      status: "unavailable",
      reason: "host-unavailable",
      aic: null,
    });
    expect(JSON.stringify(result)).not.toContain("private host failure");
  });
  it("uses only the public SDK", () => {
    const scan = experimental_scanPublicSdkOnly(process.cwd(), {
      allow: [
        /^vitest(?:\/config)?$/,
        /^@testing-library\/react$/,
        /^react(?:\/jsx-runtime)?$/,
      ],
    });
    expect(scan.violations).toEqual([]);
    expect(scan.privateDependencies).toEqual([]);
  });
});
