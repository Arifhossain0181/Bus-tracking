import os
from pathlib import Path
from dotenv import load_dotenv
import dj_database_url

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-change-this-in-production-key-12345')

DEBUG = os.getenv('DEBUG', 'True').lower() == 'true'

ALLOWED_HOSTS = [
    h.strip()
    for h in os.getenv(
        'ALLOWED_HOSTS',
        '*,localhost,127.0.0.1,ubus.dsr.iubat.ac.bd,.iubat.ac.bd'
    ).split(',')
    if h.strip()
]
# Ensure production domain is always present in ALLOWED_HOSTS
for host in ['localhost', '127.0.0.1', 'ubus.dsr.iubat.ac.bd']:
    if host not in ALLOWED_HOSTS and '*' not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(host)

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'accounts',
    'buses',
    'schedules',
    'issues',
    'notifications',
    'reports',
    'locations',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'
ASGI_APPLICATION = 'core.asgi.application'

# Database configuration
if os.getenv('DATABASE_URL'):
    DATABASES = {
        'default': dj_database_url.config(conn_max_age=600, ssl_require=True)
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': os.getenv('DB_ENGINE', 'django.db.backends.sqlite3'),
            'NAME': os.getenv('DB_NAME', BASE_DIR / 'db.sqlite3'),
            'USER': os.getenv('DB_USER', ''),
            'PASSWORD': os.getenv('DB_PASSWORD', ''),
            'HOST': os.getenv('DB_HOST', ''),
            'PORT': os.getenv('DB_PORT', ''),
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

AUTH_USER_MODEL = 'accounts.User'

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = os.getenv('STATIC_ROOT', BASE_DIR / 'staticfiles')
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

MEDIA_URL = '/media/'
MEDIA_ROOT = os.getenv('MEDIA_ROOT', BASE_DIR / 'media')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': os.getenv('THROTTLE_ANON_RATE', '120/minute'),
        'user': os.getenv('THROTTLE_USER_RATE', '600/minute'),
        'auth': os.getenv('THROTTLE_AUTH_RATE', '15/minute'),
        'telemetry': os.getenv('THROTTLE_TELEMETRY_RATE', '60/minute'),
        'routing': os.getenv('THROTTLE_ROUTING_RATE', '30/minute'),
    },
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}

# Production security headers and cookie flags
if not DEBUG:
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = 'DENY'
    SESSION_COOKIE_SECURE = os.getenv('SESSION_COOKIE_SECURE', 'True').lower() == 'true'
    CSRF_COOKIE_SECURE = os.getenv('CSRF_COOKIE_SECURE', 'True').lower() == 'true'

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        'CORS_ALLOWED_ORIGINS',
        'http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000,https://ubus.dsr.iubat.ac.bd'
    ).split(',')
    if origin.strip()
]
if 'https://ubus.dsr.iubat.ac.bd' not in CORS_ALLOWED_ORIGINS:
    CORS_ALLOWED_ORIGINS.append('https://ubus.dsr.iubat.ac.bd')

CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        'CSRF_TRUSTED_ORIGINS',
        'http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000,https://ubus.dsr.iubat.ac.bd'
    ).split(',')
    if origin.strip()
]
if 'https://ubus.dsr.iubat.ac.bd' not in CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS.append('https://ubus.dsr.iubat.ac.bd')

# Feedback/Authority: Admin email for feedback delivery
ADMIN_EMAIL = os.getenv('ADMIN_EMAIL', 'admin@localhost')

GPS_UPDATE_INTERVAL = 5
ETA_CALCULATION_BUFFER = 1.2

# Cloudinary storage settings (for free persistent media)
if os.getenv('CLOUDINARY_URL'):
    INSTALLED_APPS += ['cloudinary', 'cloudinary_storage']
    DEFAULT_FILE_STORAGE = 'cloudinary_storage.storage.MediaCloudinaryStorage'
    CLOUDINARY_STORAGE = {
        'CLOUD_NAME': os.getenv('CLOUDINARY_CLOUD_NAME'),
        'API_KEY': os.getenv('CLOUDINARY_API_KEY'),
        'API_SECRET': os.getenv('CLOUDINARY_API_SECRET'),
    }

# Routing engine configuration (Task 017 & Road Routing Fallback)
VALHALLA_URL = os.getenv('VALHALLA_URL', 'http://localhost:8002')
VALHALLA_TIMEOUT = float(os.getenv('VALHALLA_TIMEOUT', '10.0'))
OSRM_URL = os.getenv('OSRM_URL', 'https://router.project-osrm.org')
OSRM_TIMEOUT = float(os.getenv('OSRM_TIMEOUT', '10.0'))
ROUTING_PROVIDER = os.getenv('ROUTING_PROVIDER', 'valhalla')
ROUTING_FALLBACK_OSRM = os.getenv('ROUTING_FALLBACK_OSRM', 'True').lower() in ('true', '1')
