# Car Tracker Frontend

React (Vite) UI for the car tracker pipeline. Talks to a FastAPI backend
implementing the contract in `../docs/superpowers/specs/2026-09-10-web-frontend-design.md`.

## Run

    npm install
    npm run dev

Defaults to a backend at `http://localhost:8000`. Override with:

    VITE_API_BASE=http://localhost:9000 npm run dev

## Backend requirements

- Must implement `POST /upload`, `POST /jobs`, `GET /jobs/{id}`, `GET /jobs/{id}/result` exactly as specced.
- Must enable CORS for the Vite dev origin (`http://localhost:5173` by default) — e.g. FastAPI's `CORSMiddleware`.
