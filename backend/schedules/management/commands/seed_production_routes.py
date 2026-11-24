import logging
from decimal import Decimal
from django.core.management.base import BaseCommand
from schedules.models import Route, RouteRevision, Stop
from schedules.routing.service import generate_route_geometry

logger = logging.getLogger(__name__)

CHANDURA_STOPS = [
    ("Chandura", 24.0050, 90.2310),
    ("Baripara", 23.9980, 90.2380),
    ("Kabirpur", 23.9880, 90.2450),
    ("Zerane Bazar", 23.9700, 90.2580),
    ("EPZ", 23.9550, 90.2720),
    ("Baypal", 23.9480, 90.2790),
    ("Unique", 23.9410, 90.2850),
    ("Zamgora Bazar", 23.9350, 90.2910),
    ("Sarker Market", 23.9290, 90.2950),
    ("Norsinghpur", 23.9250, 90.2980),
    ("Zirabo", 23.9100, 90.3080),
    ("Ashulia", 23.8990, 90.3230),
    ("Dhour", 23.8890, 90.3450),
    ("Campus", 23.887558, 90.390307),
]

CAMPUS_AZAMPUR_STOPS = [
    ("Campus (IUBAT)", 23.887558, 90.390307),
    ("House Building", 23.874500, 90.398200),
    ("Azampur", 23.867865, 90.400398),
]


class Command(BaseCommand):
    help = "Seeds authentic stops and road-following geometry for Route 1 (Campus - Azampur) and Route 2 (Chandura)."

    def handle(self, *args, **options):
        # 1. Route 1: Campus - Azampur - Campus
        r1, created1 = Route.objects.get_or_create(
            name="Campus - Azampur - Campus",
            defaults={
                'route_type': 'shuttle',
                'origin_name': 'Campus',
                'destination_name': 'Azampur',
                'is_active': True,
                'is_published': True,
                'color': '#2563eb',
            }
        )
        self.stdout.write(f"Processing Route 1: '{r1.name}' (ID: {r1.id})...")
        # Update or create stops
        for idx, (name, lat, lng) in enumerate(CAMPUS_AZAMPUR_STOPS, start=1):
            Stop.objects.update_or_create(
                route=r1,
                order=idx,
                defaults={
                    'name': name,
                    'latitude': Decimal(str(lat)),
                    'longitude': Decimal(str(lng)),
                    'is_major_stop': (idx == 1 or idx == len(CAMPUS_AZAMPUR_STOPS)),
                }
            )
        
        # Generate genuine road geometry
        wps = [(lat, lng) for _, lat, lng in CAMPUS_AZAMPUR_STOPS]
        try:
            res = generate_route_geometry(waypoints=wps)
            coords = res.geometry.get('coordinates', [])
            dist_km = getattr(res, 'distance_km', Decimal('5.0'))
            duration_mins = getattr(res, 'duration_mins', 15)

            rev = RouteRevision.objects.create(
                route=r1,
                status=RouteRevision.STATUS_DRAFT,
                geometry=res.geometry,
                distance_km=dist_km,
                duration_mins=duration_mins,
                metadata={"source": "seed_production_routes", "stops": len(CAMPUS_AZAMPUR_STOPS)},
                change_summary=f"Authentic road route ({len(coords)} points, {dist_km} km)",
            )
            published = r1.publish_revision(rev)
            self.stdout.write(self.style.SUCCESS(
                f"Route 1 successfully published revision {published.revision_number} with {len(coords)} road points ({dist_km} km)!"
            ))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Failed to generate road route for Route 1: {e}"))

        # 2. Route 2: Chandura
        r2, created2 = Route.objects.get_or_create(
            name="Chandura",
            defaults={
                'route_type': 'long',
                'origin_name': 'Campus',
                'destination_name': 'Chandura',
                'is_active': True,
                'is_published': True,
                'color': '#2563eb',
            }
        )
        self.stdout.write(f"Processing Route 2: '{r2.name}' (ID: {r2.id})...")
        # Replace placeholder coordinates (23.8103, 90.4125) with authentic coordinates
        for idx, (name, lat, lng) in enumerate(CHANDURA_STOPS, start=1):
            Stop.objects.update_or_create(
                route=r2,
                order=idx,
                defaults={
                    'name': name,
                    'latitude': Decimal(str(lat)),
                    'longitude': Decimal(str(lng)),
                    'is_major_stop': (idx == 1 or idx == len(CHANDURA_STOPS)),
                }
            )

        wps2 = [(lat, lng) for _, lat, lng in CHANDURA_STOPS]
        try:
            res2 = generate_route_geometry(waypoints=wps2)
            coords2 = res2.geometry.get('coordinates', [])
            dist_km2 = getattr(res2, 'distance_km', Decimal('15.0'))
            duration_mins2 = getattr(res2, 'duration_mins', 45)

            rev2 = RouteRevision.objects.create(
                route=r2,
                status=RouteRevision.STATUS_DRAFT,
                geometry=res2.geometry,
                distance_km=dist_km2,
                duration_mins=duration_mins2,
                metadata={"source": "seed_production_routes", "stops": len(CHANDURA_STOPS)},
                change_summary=f"Authentic Chandura road route ({len(coords2)} points, {dist_km2} km)",
            )
            published2 = r2.publish_revision(rev2)
            self.stdout.write(self.style.SUCCESS(
                f"Route 2 successfully published revision {published2.revision_number} with {len(coords2)} road points ({dist_km2} km)!"
            ))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Failed to generate road route for Route 2: {e}"))
