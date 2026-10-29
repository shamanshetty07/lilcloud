import { rmSync } from "node:fs";
import tailwind from "bun-plugin-tailwind";

rmSync("./dist", { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: ["./src/index.html"],
  outdir: "./dist",
  minify: true,
  plugins: [tailwind],
  env: "BUN_PUBLIC_*",
});
if (!result.success) { for (const l of result.logs) console.error(l); process.exit(1); }
console.log(`built ${result.outputs.length} files to dist/`);
