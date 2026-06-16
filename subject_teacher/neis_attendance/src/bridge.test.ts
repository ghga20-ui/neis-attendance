import { beforeEach, describe, expect, it } from "vitest";
import { getApi } from "./bridge";

describe("bridge", () => {
  beforeEach(() => {
    delete window.pywebview;
  });

  it("falls back to the mock API in a browser", async () => {
    const api = await getApi();
    const settings = JSON.parse(await api.get_settings());
    expect(settings).toHaveProperty("region");
  });

  it("returns sample today slots from the mock", async () => {
    const api = await getApi();
    const slots = JSON.parse(await api.get_today_slots("2026-04-20"));
    expect(Array.isArray(slots)).toBe(true);
  });
});
