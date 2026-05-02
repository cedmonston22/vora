# Tech Stack

## Stack Overview

| Layer | Technology | Notes |
|---|---|---|
| Frontend | <!-- e.g. Next.js 14 (App Router) --> | |
| Styling | <!-- e.g. Tailwind CSS --> | |
| Auth | <!-- e.g. Supabase Auth --> | |
| Database | <!-- e.g. Postgres via Supabase --> | |
| Storage | | |
| Background Jobs | | |
| Payments | | |
| Deployment | | |

## Package Preferences

<!-- Declare preferred libraries for common needs so Kiro never reaches for the wrong one. -->

- Date handling: 
- HTTP client: 
- Form handling: 
- State management: 
- Testing: 

## API Route Conventions

- Validate all inputs with a schema library before processing
- Return structured error objects: `{ error: string, code: string }`
- Never return raw database errors to the client
- Log full errors server-side with context

## Environment Variables

All required env vars documented in `.env.example`. Never hardcode values.

## Error Handling Philosophy

<!-- Describe your error handling approach so Kiro is consistent. -->
