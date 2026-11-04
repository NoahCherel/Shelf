import { defineWidget } from "../../core/widget";
import { Tile } from "../../design/parts/Tile";

export default defineWidget<string>({
  id: "_sample",
  name: "Sample",
  description: "Only exists in tests.",
  category: "system",
  width: 1,
  sample: "hello",
  Tile: ({ data }) => <Tile width={1}>{data}</Tile>,
});
