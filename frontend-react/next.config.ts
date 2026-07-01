import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Playwright y dev en 127.0.0.1 (Next bloquea HMR cross-origin por defecto). */
  allowedDevOrigins: ["127.0.0.1"],
  /** La raíz del sitio debe abrir inicio de sesión (sin landing intermedia). */
  async redirects() {
    return [{ source: "/", destination: "/login", permanent: false }];
  },
};

export default nextConfig;
