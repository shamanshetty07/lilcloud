import index from "./index.html";

// dev server; every path serves the SPA so client-side routes survive a refresh
Bun.serve({
  port: Number(process.env.FRONTEND_PORT ?? 3001),
  routes: { "/*": index },
  development: { hmr: true, console: true },
});
console.log(`lilcloud frontend on http://localhost:${process.env.FRONTEND_PORT ?? 3001}`);
