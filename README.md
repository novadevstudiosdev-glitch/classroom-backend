# Classroom API

Backend de una plataforma educativa SaaS. Permite a docentes crear clases, lecciones y minijuegos, y a alumnos completarlos ganando XP y subiendo de nivel.

## Stack

- **Framework:** NestJS 10 + TypeScript
- **Base de datos:** PostgreSQL (Supabase) + TypeORM
- **Cache / Blacklist:** Redis (Upstash)
- **Auth:** JWT (access + refresh token) + Google OAuth
- **Email:** Resend
- **Documentación:** Swagger / OpenAPI
- **Tests:** Jest + Supertest (E2E con DB real)

## Requisitos

- Node.js 20+
- npm
- Cuenta en [Supabase](https://supabase.com) (DB)
- Cuenta en [Upstash](https://upstash.com) (Redis) — opcional, el logout funciona sin Redis pero el token no se invalida

## Setup

```bash
# 1. Clonar e instalar dependencias
git clone <repo-url>
cd classroom-backend
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 3. Levantar en desarrollo
npm run start:dev
```

La API queda disponible en `http://localhost:3000/api`
Swagger en `http://localhost:3000/api/docs`
Si configurás `SWAGGER_PASSWORD`, Swagger queda protegido con Basic Auth (usuario `SWAGGER_USER`, por defecto `swagger`).

## Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Connection string de Supabase |
| `JWT_SECRET` | Secret para firmar access tokens |
| `JWT_EXPIRES_IN` | Duración del access token (ej: `1h`) |
| `JWT_REFRESH_SECRET` | Secret para refresh tokens |
| `JWT_REFRESH_EXPIRES_IN` | Duración del refresh token (ej: `7d`) |
| `REDIS_URL` | URL de Upstash Redis (opcional) |
| `RESEND_API_KEY` | API key de Resend para emails |
| `FRONTEND_URL` | URL del frontend para CORS y redirects OAuth |
| `GOOGLE_CLIENT_ID` | Client ID de Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Client secret de Google OAuth |
| `GOOGLE_CALLBACK_URL` | Callback URL registrada en Google Cloud Console |
| `API_PREFIX` | Prefijo global (default: `api`) |
| `SWAGGER_ENABLED` | Habilitar Swagger (`true`/`false`) |
| `SWAGGER_USER` | Usuario de Basic Auth para Swagger (default: `swagger`) |
| `SWAGGER_PASSWORD` | Clave de Basic Auth para Swagger |

Ver `.env.example` para la lista completa.

## Scripts

```bash
npm run start:dev     # Desarrollo con hot-reload
npm run start:prod    # Producción (requiere build previo)
npm run build         # Compilar TypeScript
npm run test:e2e      # Tests E2E (requiere DB configurada)
npm run seed:minigames # Seed inicial de minijuegos
```

## Módulos

| Módulo | Descripción |
|---|---|
| `auth` | Registro, login, OAuth, JWT, verificación de email |
| `teachers` | Perfil del docente |
| `students` | Perfil del alumno, XP y niveles |
| `parents` | Perfil del padre, vinculación con alumnos |
| `classrooms` | Gestión de clases, códigos de invitación |
| `lessons` | Lecciones con ejercicios, asignación a clases |
| `exercises` | 5 tipos: múltiple opción, completar, V/F, relacionar, ordenar |
| `progress` | Progreso del alumno por lección, estrellas y XP |
| `sessions` | Sesiones de juego del alumno |
| `minigames` | Catálogo de minijuegos disponibles |
| `minigame-instances` | Instancias de minijuegos creadas por docentes |
| `health` | Health check de DB y Redis (`GET /api/health`) |

## Tests

12 suites E2E, 140 tests. Corren contra la DB real (sin mocks).

```bash
npm run test:e2e
```

## Arquitectura de respuestas

Todas las respuestas usan el mismo formato:

```json
// Éxito
{ "statusCode": 200, "message": "success", "data": { ... } }

// Error
{ "statusCode": 404, "message": "Recurso no encontrado.", "data": null }
```

## Auth

Endpoints protegidos requieren el header:
```
Authorization: Bearer <access_token>
```

Al hacer logout (`POST /api/auth/logout`), el token queda invalidado en Redis de forma inmediata.
