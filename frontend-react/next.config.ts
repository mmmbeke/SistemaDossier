import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** La raíz del sitio debe abrir inicio de sesión (sin landing intermedia). */
  async redirects() {
    return [{ source: "/", destination: "/login", permanent: false }];
  },
};

export default nextConfig;
