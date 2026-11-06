import { readFileSync } from "node:fs";

it("the end-to-end run puts back everything of the owner's that it could change", () => {
  const script = readFileSync("src/test/e2e.sh", "utf8");
  const lists = [...script.matchAll(/^for f in ([^;]+); do/gm)].map((m) => m[1]);
  expect(lists).toHaveLength(2);
  for (const list of lists) {
    for (const name of ["layout", "settings", "dock-pins", "start-image"]) expect(list.split(" ")).toContain(name);
  }
});
