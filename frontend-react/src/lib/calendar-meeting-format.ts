/** Plantilla copiable para la descripción del evento (parseada en calendar_event_dossiers.py). */
export const CALENDAR_MEETING_FORMAT_EXAMPLE = `Empresa: OXCCU
Contacto 1: James Girling
Cargo 1: CEO
Email 1: james@oxccu.com
Contacto 2: María López
Cargo 2: CTO
Email 2: maria@oxccu.com
País 2: Chile`;

export const CALENDAR_MEETING_SUBJECT_EXAMPLES = [
  "Reunión comercial — Tesla",
  "Reunión con Acme Corp",
] as const;

/** Detecta «Contacto:», «Contacto 1:», «Nombre:», etc. (alineado con calendar_event_dossiers.py). */
const PERSON_HINT_RE =
  /(?:contacto|nombre|name|contact)\s*(?:\d+\s*)?:|(?:reuni[oó]n|meeting)\s+con\s+/i;

export function descriptionHasPersonHint(descripcion: string | undefined | null): boolean {
  const d = (descripcion || "").trim();
  if (!d) return false;
  return PERSON_HINT_RE.test(d);
}
