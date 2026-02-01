# Seguridad inicial (baseline)

Checklist para despliegues iniciales y mantenimiento basico.

## Infraestructura
- HTTPS activo con Certbot y auto-renovacion.
- Nginx con headers de seguridad (HSTS, XFO, XCTO, Referrer-Policy, CSP basica).
- Bloqueo de probes comunes (`/.env`, `/.git`, etc.).
- Rate limiting en Nginx para `/auth/*`, `/subscribe`, `/api/contact`.
- Backups automaticos de SQLite con retencion (7 dias).

## Aplicacion
- Bootstrap admin protegido por token en produccion.
- Rate limiting en backend para auth, subscribe y contact.
- Sesion admin con cookie HttpOnly + SameSite.

## Verificaciones rapidas
- `curl -I https://kdb.pe` (200 + headers)
- `curl -I https://kdb.pe/.env` (404)
- `sudo nginx -t` (ok)
- `sudo systemctl status kdbweb --no-pager` (active)

## Proximos pasos (cuando el proyecto crezca)
- CSRF en el panel admin.
- UFW / fail2ban.
- Staging con subdominio.
- Monitoreo y alertas (uptime + logs).
