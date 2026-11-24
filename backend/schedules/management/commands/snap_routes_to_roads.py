import logging
from decimal import Decimal
from django.core.management.base import BaseCommand
from schedules.models import Route, RouteRevision, Stop
from schedules.routing.service import generate_route_geometry

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Generates and publishes genuine road-following geometry for routes based on their ordered stops."

    def add_arguments(self, parser):
        parser.add_argument(
            '--route-id',
            type=int,
            help='Specific route ID to snap to roads (defaults to all routes)',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force regeneration even if route already has multi-point road geometry',
        )

    def handle(self, *args, **options):
        route_id = options.get('route_id')
        force = options.get('force', False)

        routes = Route.objects.all()
        if route_id:
            routes = routes.filter(id=route_id)

        if not routes.exists():
            self.stdout.write(self.style.WARNING("No routes found to process."))
            return

        for route in routes:
            active_rev = route.active_revision
            existing_coords = []
            if active_rev and active_rev.geometry:
                existing_coords = active_rev.geometry.get('coordinates', [])

            if len(existing_coords) > 10 and not force:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Route {route.id} ('{route.name}') already has road-following geometry ({len(existing_coords)} points). Use --force to regenerate."
                    )
                )
                continue

            stops = list(route.stops.order_by('order'))
            waypoints = []
            if len(stops) >= 2:
                waypoints = [(float(s.latitude), float(s.longitude)) for s in stops]
            elif len(existing_coords) >= 2:
                # Use endpoints from existing geometry: GeoJSON [lng, lat] -> Routing (lat, lng)
                waypoints = [(float(pt[1]), float(pt[0])) for pt in existing_coords]

            # Deduplicate sequential or identical waypoints
            deduped_waypoints = []
            for wp in waypoints:
                if not deduped_waypoints or (abs(wp[0] - deduped_waypoints[-1][0]) > 0.0001 or abs(wp[1] - deduped_waypoints[-1][1]) > 0.0001):
                    deduped_waypoints.append(wp)

            if len(deduped_waypoints) < 2:
                self.stdout.write(
                    self.style.WARNING(f"Skipping route {route.id} ('{route.name}'): requires at least 2 distinct stop coordinates (found {len(deduped_waypoints)})")
                )
                continue

            self.stdout.write(f"Calculating road route for '{route.name}' (ID: {route.id}) via {len(deduped_waypoints)} waypoints...")

            try:
                result = generate_route_geometry(waypoints=deduped_waypoints)
                coords = result.geometry.get('coordinates', [])
                dist_km = getattr(result, 'distance_km', Decimal('5.0'))
                duration_mins = getattr(result, 'duration_mins', 15)

                new_rev = RouteRevision.objects.create(
                    route=route,
                    status=RouteRevision.STATUS_DRAFT,
                    geometry=result.geometry,
                    distance_km=dist_km,
                    duration_mins=duration_mins,
                    metadata={
                        "source": "snap_routes_to_roads",
                        "waypoint_count": len(waypoints),
                        "coordinate_count": len(coords),
                    },
                    change_summary=f"Automated road alignment ({len(coords)} points, {dist_km} km)",
                )
                published = route.publish_revision(new_rev)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Successfully published revision {published.revision_number} for route {route.id} ('{route.name}') with {len(coords)} road coordinates ({dist_km} km, ~{duration_mins} min)."
                    )
                )
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f"Failed to generate route geometry for route {route.id}: {e}")
                )
