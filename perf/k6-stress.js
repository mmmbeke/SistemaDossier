/**
 * Estres lectura - k6 (30-100 VUs)
 * k6 run -e API_TOKEN=... perf/k6-stress.js
 * k6 run -e API_TOKEN=... -e VUS=100 -e DURATION=2m perf/k6-stress.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.API_BASE || "http://127.0.0.1:8000";
const TOKEN = __ENV.API_TOKEN || "";
const VUS = Number(__ENV.VUS || 30);
const DURATION = __ENV.DURATION || "1m";

export const options = {
  scenarios: {
    stress_read: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: VUS },
        { duration: DURATION, target: VUS },
        { duration: "15s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500", "p(99)<1000"],
  },
};

export function setup() {
  if (!TOKEN) {
    throw new Error("Define API_TOKEN");
  }
}

export default function () {
  const headers = { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" };

  check(http.get(`${BASE}/health`), { "health 200": (r) => r.status === 200 });
  check(http.get(`${BASE}/dossiers?limit=20`, { headers }), {
    "dossiers 200": (r) => r.status === 200,
  });
  check(
    http.get(`${BASE}/dossier-generation-jobs?active_only=true`, { headers }),
    { "jobs 200": (r) => r.status === 200 },
  );

  sleep(0.3 + Math.random() * 0.7);
}
