# 🚌 UBus - Real-Time Bus Tracking & Management System

A production-ready Django + Bootstrap + Streamlit application for university bus tracking and fleet management.

![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)
![Django](https://img.shields.io/badge/Django-4.2-green.svg)
![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-purple.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

---

## 📋 Features

### 🗺️ Real-Time Tracking
- Live bus locations on interactive map (Leaflet.js)
- GPS-based ETA calculations with Haversine formula
- 5-second location update intervals
- Route visualization with stop markers

### 👥 Multi-Role Authentication
- **Students/Users**: View schedules, track buses, submit feedback
- **Drivers**: Update locations, report issues, view assignments
- **Administrators**: Manage users, buses, routes, and schedules
- **Authority**: Access analytics, reports, and system oversight

### 📅 Schedule Management
- Route creation with ordered stops
- Flexible scheduling (daily, weekday, weekend)
- Schedule exceptions for holidays
- Stop-level ETA tracking

### ⚠️ Issue Reporting
- Driver issue submission with attachments
- Issue categories: mechanical, traffic, emergency, accident, weather
- Priority levels and status tracking
- Admin resolution workflow

### 🔔 Notifications
- Targeted notifications for users, drivers, routes
- Priority levels (info, warning, urgent)
- Dismiss/read tracking

### 📊 Analytics & Reports
- Route analytics, performance metrics, and export
- User feedback and issue analysis

### 📈 Streamlit Dashboard
- Visual analytics dashboard for authority/management

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- pip (Python package manager)

### Backend Setup

```bash
# Navigate to backend directory
cd bus_tracking/backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py makemigrations accounts buses schedules issues notifications reports
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Run development server
python manage.py runserver
```

### Streamlit App Setup

```bash
# Navigate to streamlit directory
cd bus_tracking/streamlit_app

# Install dependencies
pip install -r requirements.txt

# Run Streamlit app
streamlit run app.py
```

---

## 📁 Project Structure

```
bus_tracking/
├── backend/
│   ├── core/                 # Django settings & URLs
│   │   ├── settings.py
│   │   ├── urls.py
│   │   ├── wsgi.py
│   │   └── asgi.py
│   ├── accounts/             # User authentication & profiles
│   │   ├── models.py         # User, DriverProfile
│   │   ├── views.py
│   │   ├── decorators.py     # Role-based access control
│   │   └── templates/
│   ├── buses/                # Bus management & tracking
│   │   ├── models.py         # Bus, BusLocation, ETACalculation
│   │   ├── views.py
│   │   ├── api_views.py      # REST API endpoints
│   │   └── templates/
│   ├── schedules/            # Routes & scheduling
│   │   ├── models.py         # Route, Stop, Schedule
│   │   ├── views.py
│   │   ├── api_views.py
│   │   └── templates/
│   ├── issues/               # Issue reporting system
│   │   ├── models.py         # Issue, IssueComment
│   │   ├── views.py
│   │   ├── api_views.py
│   │   └── templates/
│   ├── notifications/        # Notification system
│   │   ├── models.py         # Notification, UserNotification
│   │   ├── views.py
│   │   ├── api_views.py
│   │   └── templates/
│   ├── reports/              # Analytics & reporting
│   │   ├── models.py         # TripLog, UserFeedback, RouteAnalytics
│   │   ├── views.py
│   │   ├── api_views.py
│   │   └── templates/
│   ├── locations/            # Location management
│   │   ├── models.py
│   │   ├── views.py
│   │   ├── api_views.py
│   │   └── templates/
│   ├── templates/            # Base templates
│   │   └── base.html
│   ├── manage.py
│   └── requirements.txt
└── streamlit_app/
    ├── app.py                # Streamlit analytics dashboard
    └── requirements.txt
```

---

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the backend directory:

```env
SECRET_KEY=your-secret-key-here
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_URL=sqlite:///db.sqlite3
```

### Key Settings (core/settings.py)

| Setting | Default | Description |
|---------|---------|-------------|
| `GPS_UPDATE_INTERVAL` | 5 | Seconds between GPS updates |
| `ETA_CALCULATION_BUFFER` | 1.2 | Buffer multiplier for ETA |
| `DEFAULT_BUS_SPEED` | 25 | Default speed in km/h |

---

## 📱 API Endpoints

### Authentication
- `POST /api/auth/login/` - Obtain token
- `POST /api/auth/logout/` - Logout
- `POST /api/auth/register/` - Register new user

### Buses
- `GET /api/buses/` - List buses
- `GET /api/buses/locations/` - Real-time locations
- `POST /api/buses/assign/` - Assign driver to bus

### Schedules
- `GET /api/schedules/` - List schedules
- `GET /api/schedules/today/` - Today's schedules
- `GET /api/schedules/route/{id}/` - Schedules for route

### Issues
- `GET /api/issues/` - List issues
- `POST /api/issues/report/` - Report issue
- `POST /api/issues/{id}/resolve/` - Resolve issue

### Notifications
- `GET /api/notifications/` - List notifications
- `GET /api/notifications/unread/` - Unread notifications
- `POST /api/notifications/{id}/read/` - Mark as read

### Reports
- `GET /api/reports/analytics/` - Route analytics
- `GET /api/reports/performance/` - Performance metrics
- `GET /api/reports/export/` - Export data

---

## 🗄️ Database Models

- **accounts.User**: Custom user model with roles (student, driver, admin, authority)
- **buses.Bus**: Bus details, current location, assignments
- **schedules.Route, Stop, Schedule, Trip**: Route and schedule management
- **issues.Issue**: Issue reporting and tracking
- **notifications.Notification**: System/user notifications
- **reports.TripLog, UserFeedback, RouteAnalytics**: Analytics and feedback

---

## 🧪 Testing

```bash
# Run all tests
python manage.py test
```

---

## 🚀 Deployment

### Production Checklist
1. Set `DEBUG=False`
2. Generate secure `SECRET_KEY`
3. Configure production database (PostgreSQL recommended)
4. Set up static file serving (WhiteNoise)
5. Configure HTTPS
6. Set `ALLOWED_HOSTS`

### Procfile (for Railway/Heroku)
```
web: cd bus_tracking/backend && python manage.py migrate && gunicorn core.wsgi:application --bind 0.0.0.0:$PORT
```

### Docker Deployment

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8000"]
```

### Streamlit Cloud
1. Push `streamlit_app/` to GitHub
2. Connect to Streamlit Cloud
3. Deploy from repository

---

## 📄 License

This project is licensed under the MIT License.

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

---

## 📞 Support

For support, open an issue or contact the maintainer.
