import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, Plugin } from "vite"

const basePath = "/open-simperfi/"

const enforceTrailingSlash = (): Plugin => {
  const middleware = (req: { url?: string }, res: any, next: () => void) => {
    const rawUrl = req.url || ""
    const [pathname, search = ""] = rawUrl.split("?")
    const targetPath = basePath.slice(0, -1)

    if (pathname === targetPath) {
      const location = `${basePath}${search ? `?${search}` : ""}`
      res.statusCode = 301
      res.setHeader("Location", location)
      res.end()
      return
    }

    next()
  }

  return {
    name: "simperfi-enforce-trailing-slash",
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

export default defineConfig({
  base: basePath,
  plugins: [react(), enforceTrailingSlash()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
