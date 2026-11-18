# 🚌 UBus - University Bus Tracking & Management System

A full-stack university bus tracking and fleet management platform separated cleanly into:
- **`backend/`** — Pure Python + Django + Django REST Framework API
- **`frontend/`** — Next.js (App Router, TypeScript, Tailwind CSS, Leaflet)

---

## 📁 Project Structure

```text
university-bus-management-system/
├── backend/                     # Python / Django REST API
│   ├── core/                    # Settings, CORS, URL routing
│   ├── accounts/                # Auth (Token), Users, Drivers, Pending Approvals, Authority Feedback
│   ├── buses/                   # Fleet CRUD, Bus Assignments, Live Locations, ETAs
│   ├── schedules/               # Route Builder (Shuttle/Metro/Long Road), Stops, Trips, Schedules
│   ├── locations/               # Driver Journey start/end/delay, Live GPS & Path History
│   ├── issues/                  # Issue Reporting, Comments, Admin Assign & Resolve
│   ├── notifications/           # Targeted Alerts, Unread & Dismiss Tracking
│   ├── reports/                 # Analytics, Punctuality, Driver Logs, User Feedback & Export
│   ├── manage.py
│   └── requirements.txt
└── frontend/                    # Next.js Frontend
    ├── src/
    │   ├── app/                 # App Router pages (Auth, Dashboards, Live Map, Routes, Buses, Reports...)
    │   ├── components/          # AppShell, AuthProvider, RouteBuilderForm, Leaflet Map views
    │   └── lib/                 # Typed API client & TypeScript models
    ├── package.json
    └── next.config.ts
```

---

## 🚀 Quick Start

### 1. Run the Django Backend (`http://localhost:8000`)

```bash
# Activate virtual environment (Windows PowerShell)
.\.venv\Scripts\Activate.ps1

cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8000
```

Django Admin is available at `http://localhost:8000/admin/`, and the API root is at `http://localhost:8000/`.

### 2. Run the Next.js Frontend (`http://localhost:3000`)

```bash
cd frontend
npm install
# Configure API base URL if different from http://localhost:8000
# copy .env.local.example .env.local
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## 🔑 Key API Endpoints (`/api/...`)

- **Auth & Accounts**: `/api/auth/login/`, `/api/auth/register/`, `/api/auth/logout/`, `/api/auth/me/`, `/api/auth/profile/`, `/api/auth/dashboard/`, `/api/auth/users/`, `/api/auth/drivers/`, `/api/auth/pending/`, `/api/auth/authority-feedback/`
- **Buses**: `/api/buses/`, `/api/buses/<id>/`, `/api/buses/locations/`, `/api/buses/etas/`, `/api/buses/assignments/`, `/api/buses/assignments/options/`, `/api/buses/<id>/clear-assignment/`
- **Schedules & Routes**: `/api/schedules/routes/`, `/api/schedules/routes/<id>/`, `/api/schedules/routes/<id>/publish/`, `/api/schedules/routes/<id>/eta/`, `/api/schedules/grouped/`, `/api/schedules/today/`
- **Live Locations & Journeys**: `/api/locations/journey/start/`, `/api/locations/journey/end/`, `/api/locations/journey/delay/`, `/api/locations/journeys/`, `/api/locations/journey/<id>/path/`, `/api/locations/location/update/`, `/api/locations/location/active/`, `/api/locations/location/status/`
- **Issues**: `/api/issues/`, `/api/issues/create/`, `/api/issues/<id>/`, `/api/issues/<id>/update/`, `/api/issues/<id>/comments/`, `/api/issues/<id>/assign/`, `/api/issues/<id>/resolve/`
- **Notifications**: `/api/notifications/`, `/api/notifications/unread/`, `/api/notifications/<id>/dismiss/`, `/api/notifications/read-all/`
- **Reports**: `/api/reports/overview/`, `/api/reports/analytics/`, `/api/reports/performance/`, `/api/reports/driver-incidents/`, `/api/reports/driver-logs/`, `/api/reports/feedback-summary/`, `/api/reports/feedback/submit/`, `/api/reports/export/`
