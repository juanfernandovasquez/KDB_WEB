# Data Contracts (frontend)

Resumen de esquemas e interfaces generadas para los modelos del frontend.

## Archivos creados
- `types.d.ts` — Interfaces TypeScript para Company, PageData, HeroSlide, Story, About, TeamMember, ServiceItem, Subscription.
- `schemas/*.json` — JSON Schemas para validación (company, hero_slide, story, about, team_member, service_item, subscription).
- `examples/*.json` — Ejemplos de payload para pruebas y mocks.
- `examples/publication.json` — Ejemplo de publicación.

### Nuevos endpoints
- GET /api/publications → Lista de publicaciones (con `category`).
- GET /api/publications/{id} → Publicación específica.
- POST /api/publications → Crear publicación (body con `title`,`slug`, `excerpt`, `content_html`, `category_id`, `published_at` **opcional**; si se omite, el servidor asigna la fecha actual en `YYYY-MM-DD`).
- PUT /api/publications/{id} → Actualizar publicación.
- DELETE /api/publications/{id} → Eliminar publicación.
- GET/POST /api/categories → Listar/crear categorías.
- DELETE /api/categories/{id} → Eliminar categoría.

### UI
- `publicaciones.html` — Página pública que consume `/api/publications`.
- Panel admin (`/admin`) — Nueva sección **Publicaciones** con CRUD básico para publicaciones y categorías.

## Uso recomendado
- Para desarrollo con TypeScript: importar `types.d.ts` para tipar respuestas (ej. `const data: PageData = await apiClient.getPage('home')`).

- Para validación runtime: usar `ajv` con los schemas en `schemas/`.

Ejemplo (pseudo-código):

```js
import Ajv from 'ajv';
import pageSchema from '../schemas/page.json';
const ajv = new Ajv();
const validate = ajv.compile(pageSchema);
const valid = validate(resp);
if (!valid) console.warn('Invalid page data', validate.errors);
```

## Siguientes pasos sugeridos
- Integrar validación en los puntos de entrada del frontend (hero init, services render, etc.).
- Convertir `types.d.ts` a `types.ts` y usarlo en componentes/ módulos si el proyecto se migra a TypeScript.
- Reiniciar el backend para que se creen las nuevas tablas (`py backend/app.py`) y probar los endpoints de publicaciones:
  - `GET /api/publications`
  - `POST /api/publications` (payload similar a `examples/publication.json`)
  - Comprueba la sección *Publicaciones* en `/admin`.

