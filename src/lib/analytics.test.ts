import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emailGateDone, setEmailGateDone } from "./analytics";

describe("analytics emailGate", () => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };

  beforeEach(() => {
    store.clear();
    // @ts-expect-error test mock
    globalThis.localStorage = mockStorage;
  });

  afterEach(() => {
    // @ts-expect-error test mock
    delete globalThis.localStorage;
  });

  it("returns false initially when gate is not set", () => {
    expect(emailGateDone()).toBe(false);
  });

  it("returns true after setEmailGateDone('submitted')", () => {
    setEmailGateDone("submitted");
    expect(emailGateDone()).toBe(true);
    expect(mockStorage.getItem("gbs-email-gate")).toBe("submitted");
  });

  it("returns true after setEmailGateDone('skipped')", () => {
    setEmailGateDone("skipped");
    expect(emailGateDone()).toBe(true);
    expect(mockStorage.getItem("gbs-email-gate")).toBe("skipped");
  });

  it("gracefully returns false when localStorage is undefined", () => {
    // @ts-expect-error test mock
    delete globalThis.localStorage;
    expect(emailGateDone()).toBe(false);
  });
});
