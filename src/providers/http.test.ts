import { vi } from "vitest";
import { invoke } from "../core/tauri";
import { httpGet } from "./http";

vi.mock("../core/tauri", () => ({ invoke: vi.fn() }));

it("names an untrusted certificate in plain words", async () => {
  vi.mocked(invoke).mockRejectedValue("certificate");
  await expect(httpGet({ url: "https://api.example.com" })).rejects.toEqual({
    kind: "other",
    message: "Your network checks secure connections, and Windows doesn't trust it. Your IT team can add its certificate.",
  });
});

it("a dropped connection is offline", async () => {
  vi.mocked(invoke).mockRejectedValue("offline");
  await expect(httpGet({ url: "https://api.example.com" })).rejects.toMatchObject({ kind: "offline" });
});
