import { afterEach, vi } from "vitest";
import { emit, installFakeBackend, invoke, listen } from "./tauri";

afterEach(() => installFakeBackend(null));

it("invoke uses the fake backend when one is installed", async () => {
  installFakeBackend({ hello: (args: { name: string }) => `hi ${args.name}` });
  expect(await invoke("hello", { name: "Noah" })).toBe("hi Noah");
});

it("invoke still rejects outside Tauri with no fake installed", async () => {
  await expect(invoke("hello")).rejects.toThrow(/not running in Shelf/);
});

it("a fake backend's missing command rejects with its name", async () => {
  installFakeBackend({});
  await expect(invoke("nope")).rejects.toThrow(/nope/);
});

it("a handler that throws rejects, as a real command would", async () => {
  installFakeBackend({
    bad: () => {
      throw "offline";
    },
  });
  await expect(invoke("bad")).rejects.toBe("offline");
});

it("events reach listeners through the fake backend until they stop listening", async () => {
  installFakeBackend({});
  const heard = vi.fn();
  const stop = await listen("ping", heard);
  await emit("ping", 7);
  expect(heard).toHaveBeenCalledWith(7);
  stop();
  await emit("ping", 8);
  expect(heard).toHaveBeenCalledTimes(1);
});
