"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import DossierDetailView from "./DossierDetailView";
import { getApiBaseUrl, getStoredAccessToken } from "@/lib/dossier-api";
import { getDossierById } from "@/lib/mock-dossiers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function DossierDetailPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const mock = id ? getDossierById(id) : undefined;
  const isUuid = Boolean(id && UUID_RE.test(id));

  const [apiJson, setApiJson] = useState<unknown>(null);
  const [apiState, setApiState] = useState<"idle" | "loading" | "ok" | "err">(() =>
    !mock && isUuid ? "loading" : "idle",
  );

  useEffect(() => {
    if (mock || !isUuid) return;
    const token = getStoredAccessToken();
    if (!token) {
      setApiState("err");
      return;
    }
    setApiState("loading");
    fetch(`${getApiBaseUrl()}/dossiers/${id}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
      .then(async (r) => {
        if (!r.ok) {
          setApiState("err");
          setApiJson(null);
          return;
        }
        setApiJson(await r.json());
        setApiState("ok");
      })
      .catch(() => {
        setApiState("err");
        setApiJson(null);
      });
  }, [id, mock, isUuid]);

  if (mock) {
    return <DossierDetailView dossier={mock} />;
  }

  if (!id || !isUuid) {
    notFound();
  }

  if (apiState === "loading") {
    return (
      <div className="p-8 text-sm" style={{ color: "var(--text-muted)" }}>
        Cargando dossier…
      </div>
    );
  }

  if (apiState === "err" || !apiJson) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-8">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No se pudo cargar el dossier (¿iniciaste sesión y existe en tu organización?).
        </p>
        <Link
          href="/dashboard/dossiers"
          className="text-sm font-medium underline"
          style={{ color: "var(--accent-from)" }}
        >
          Volver al listado
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
        Dossier (PostgreSQL)
      </h1>
      <pre
        className="overflow-auto rounded-lg border p-4 text-xs"
        style={{
          borderColor: "var(--border-default)",
          backgroundColor: "var(--bg-surface)",
          color: "var(--text-muted)",
        }}
      >
        {JSON.stringify(apiJson, null, 2)}
      </pre>
      <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
        Vista JSON: cuando `dossier_data` cumpla el schema del producto, se puede reutilizar
        `DossierDetailView` con un mapeo desde la API.
      </p>
    </div>
  );
}
