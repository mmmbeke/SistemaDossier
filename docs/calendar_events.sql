-- Tabla calendar_events (automatización). Ejecutar si aún no existe en PostgreSQL.
-- También se crea con DATABASE_AUTO_CREATE_TABLES=1 al arrancar la API en desarrollo.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS calendar_events (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    calendar_integration_id UUID        NOT NULL REFERENCES calendar_integrations(id) ON DELETE CASCADE,
    organization_id     UUID            NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id             UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    external_event_id   VARCHAR(500)    NOT NULL,
    title               VARCHAR(500),
    starts_at           TIMESTAMPTZ     NOT NULL,
    ends_at             TIMESTAMPTZ,
    meeting_url         TEXT,
    external_attendees  JSONB           NOT NULL DEFAULT '[]',
    dossier_scheduled_at TIMESTAMPTZ,
    processing_status   VARCHAR(20)     NOT NULL DEFAULT 'detected'
                        CHECK (processing_status IN ('detected', 'scheduled', 'processing', 'completed', 'skipped', 'failed')),
    skip_reason         TEXT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (calendar_integration_id, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_user ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_scheduled ON calendar_events(dossier_scheduled_at)
    WHERE processing_status = 'scheduled';
