# SmartRide AI

A student-friendly full-stack ride-planning MVP inspired by ride apps.

## Stack
- Frontend: React + Vite + React Router + Leaflet
- Backend: Node.js + Express + JWT
- Database: MongoDB (optional; the app runs in demo mode without it)
- Routing/geocoding: OpenStreetMap Nominatim + OSRM public services
- No Google Maps API

## Run

### Backend
```bash
cd backend
npm install
npm run dev
```

Create `backend/.env` from `.env.example`.

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open the URL shown by Vite.

## Demo mode
If MongoDB is not configured, registration/login and ride history use in-memory demo data. This is intentional so the project can run immediately for a college demo.

## Important
Public OpenStreetMap/Nominatim/OSRM services have usage policies and are not intended for heavy production traffic. For a real deployment, use a properly hosted routing/geocoding service or self-host the required infrastructure.
