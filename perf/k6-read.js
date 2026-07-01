/**
 * Prueba de rendimiento (lectura) — k6
 *
 * Uso:
 *   k6 run -e API_TOKEN=tu_jwt perf/k6-read.js
 *   k6 run -e API_BASE=http://127.0.0.1:8000 -e API_TOKEN=... perf/k6-read.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.API_BASE || "http://127.0.0.1:8000";
const TOKEN = __ENV.API_TOKEN || "";

export const options = {
  scenarios: {
    smoke: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || 5),
      duration: __ENV.DURATION || "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<2000"],
  },
};

export function setup() {
  if (!TOKEN) {
    throw new Error("Define API_TOKEN con un JWT válido (login en /auth/login).");
  }
}

export default function () {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/json",
  };

  const health = http.get(`${BASE}/health`);
  check(health, { "health 200": (r) => r.status === 200 });

  const dossiers = http.get(`${BASE}/dossiers?limit=20`, { headers });
  check(dossiers, {
    "dossiers 200": (r) => r.status === 200,
  });

  const jobs = http.get(`${BASE}/dossier-generation-jobs?active_only=true`, { headers });
  check(jobs, { "jobs 200": (r) => r.status === 200 });

  sleep(1);
}
