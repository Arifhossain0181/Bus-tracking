"""
Seed script to populate realistic bus schedule data
Run: python manage.py shell < seed_data.py
"""

from schedules.models import Route, Stop, Trip, TripStopTime, Schedule
from buses.models import Bus

# Clear existing data (optional - uncomment if needed)
# TripStopTime.objects.all().delete()
# Trip.objects.all().delete()
# Stop.objects.all().delete()
# Route.objects.all().delete()

print("Creating routes...")

# Route 1: Long Route - Campus to City Center
route1 = Route.objects.get_or_create(
    name="Campus - City Center Express",
    defaults={
        'description': 'Main express route connecting the university campus to the city center with major transit hubs',
        'route_type': 'long',
        'color': '#1976D2',
        'is_active': True,
        'is_published': True,
        'total_distance_km': 15.5,
        'estimated_duration_mins': 45
    }
)[0]
print(f"  Created: {route1.name}")

# Route 2: Shuttle - Campus Loop
route2 = Route.objects.get_or_create(
    name="Campus Loop Shuttle",
    defaults={
        'description': 'Internal campus shuttle serving main buildings and parking areas',
        'route_type': 'shuttle',
        'color': '#4CAF50',
        'is_active': True,
        'is_published': True,
        'total_distance_km': 3.2,
        'estimated_duration_mins': 15
    }
)[0]
print(f"  Created: {route2.name}")

# Route 3: Long Route - Campus to Airport
route3 = Route.objects.get_or_create(
    name="Campus - Airport Link",
    defaults={
        'description': 'Direct service to the regional airport with limited stops',
        'route_type': 'long',
        'color': '#9C27B0',
        'is_active': True,
        'is_published': True,
        'total_distance_km': 28.0,
        'estimated_duration_mins': 55
    }
)[0]
print(f"  Created: {route3.name}")

# Route 4: Shuttle - Medical Center
route4 = Route.objects.get_or_create(
    name="Medical Center Shuttle",
    defaults={
        'description': 'Shuttle service between main campus and university medical center',
        'route_type': 'shuttle',
        'color': '#F44336',
        'is_active': True,
        'is_published': True,
        'total_distance_km': 4.8,
        'estimated_duration_mins': 18
    }
)[0]
print(f"  Created: {route4.name}")

print("\nCreating stops for Campus - City Center Express...")
stops_route1 = [
    ('Main Library', 40.7589, -73.9851, True),
    ('Student Union', 40.7572, -73.9834, True),
    ('Engineering Building', 40.7555, -73.9812, False),
    ('Sports Complex', 40.7538, -73.9790, False),
    ('West Gate', 40.7521, -73.9768, True),
    ('Metro Station A', 40.7490, -73.9720, True),
    ('Downtown Mall', 40.7458, -73.9678, False),
    ('Central Business District', 40.7425, -73.9635, True),
    ('City Hall', 40.7393, -73.9595, True),
    ('Central Station', 40.7360, -73.9552, True),
]

for i, (name, lat, lon, is_major) in enumerate(stops_route1, 1):
    Stop.objects.get_or_create(
        route=route1,
        name=name,
        defaults={
            'latitude': lat,
            'longitude': lon,
            'order': i,
            'is_major_stop': is_major,
            'average_wait_time': 3 if is_major else 2
        }
    )
print(f"  Created {len(stops_route1)} stops")

print("\nCreating stops for Campus Loop Shuttle...")
stops_route2 = [
    ('Main Library', 40.7589, -73.9851, True),
    ('Science Building', 40.7595, -73.9835, False),
    ('Arts Center', 40.7605, -73.9820, False),
    ('Dormitory Complex A', 40.7615, -73.9805, True),
    ('Cafeteria', 40.7610, -73.9790, False),
    ('Parking Lot B', 40.7600, -73.9775, True),
    ('Recreation Center', 40.7590, -73.9785, False),
    ('Administration Building', 40.7580, -73.9800, True),
]

for i, (name, lat, lon, is_major) in enumerate(stops_route2, 1):
    Stop.objects.get_or_create(
        route=route2,
        name=name,
        defaults={
            'latitude': lat,
            'longitude': lon,
            'order': i,
            'is_major_stop': is_major,
            'average_wait_time': 2
        }
    )
print(f"  Created {len(stops_route2)} stops")

print("\nCreating stops for Campus - Airport Link...")
stops_route3 = [
    ('Main Library', 40.7589, -73.9851, True),
    ('West Gate', 40.7521, -73.9768, True),
    ('Highway Junction', 40.7400, -73.9600, False),
    ('Airport Terminal 1', 40.6892, -74.0445, True),
    ('Airport Terminal 2', 40.6880, -74.0460, True),
]

for i, (name, lat, lon, is_major) in enumerate(stops_route3, 1):
    Stop.objects.get_or_create(
        route=route3,
        name=name,
        defaults={
            'latitude': lat,
            'longitude': lon,
            'order': i,
            'is_major_stop': is_major,
            'average_wait_time': 3 if is_major else 2
        }
    )
print(f"  Created {len(stops_route3)} stops")

print("\nCreating stops for Medical Center Shuttle...")
stops_route4 = [
    ('Main Library', 40.7589, -73.9851, True),
    ('Health Sciences Building', 40.7610, -73.9870, True),
    ('Medical Research Center', 40.7635, -73.9895, False),
    ('University Hospital Main', 40.7660, -73.9920, True),
    ('Hospital Parking', 40.7675, -73.9940, False),
]

for i, (name, lat, lon, is_major) in enumerate(stops_route4, 1):
    Stop.objects.get_or_create(
        route=route4,
        name=name,
        defaults={
            'latitude': lat,
            'longitude': lon,
            'order': i,
            'is_major_stop': is_major,
            'average_wait_time': 2
        }
    )
print(f"  Created {len(stops_route4)} stops")

print("\nCreating trips for Campus - City Center Express...")
from datetime import time

# Morning trips
trip_data_route1 = [
    ('Morning Express 1', 'morning', time(6, 30), time(7, 15), 1),
    ('Morning Express 2', 'morning', time(7, 0), time(7, 45), 2),
    ('Morning Express 3', 'morning', time(7, 30), time(8, 15), 3),
    ('Morning Express 4', 'morning', time(8, 0), time(8, 45), 4),
    ('Morning Express 5', 'morning', time(8, 30), time(9, 15), 5),
    ('Morning Express 6', 'morning', time(9, 0), time(9, 45), 6),
    # Afternoon trips
    ('Afternoon Express 1', 'afternoon', time(12, 0), time(12, 45), 7),
    ('Afternoon Express 2', 'afternoon', time(12, 30), time(13, 15), 8),
    ('Afternoon Express 3', 'afternoon', time(13, 0), time(13, 45), 9),
    ('Afternoon Express 4', 'afternoon', time(14, 0), time(14, 45), 10),
    ('Afternoon Express 5', 'afternoon', time(15, 0), time(15, 45), 11),
    # Evening trips
    ('Evening Express 1', 'evening', time(17, 0), time(17, 45), 12),
    ('Evening Express 2', 'evening', time(17, 30), time(18, 15), 13),
    ('Evening Express 3', 'evening', time(18, 0), time(18, 45), 14),
    ('Evening Express 4', 'evening', time(18, 30), time(19, 15), 15),
    ('Evening Express 5', 'evening', time(19, 0), time(19, 45), 16),
]

for name, trip_type, dep, arr, order in trip_data_route1:
    Trip.objects.get_or_create(
        route=route1,
        name=name,
        defaults={
            'trip_type': trip_type,
            'departure_time': dep,
            'arrival_time': arr,
            'is_active': True,
            'order': order
        }
    )
print(f"  Created {len(trip_data_route1)} trips")

print("\nCreating trips for Campus Loop Shuttle (every 15 mins)...")
trip_data_route2 = []
for hour in range(7, 21):  # 7am to 9pm
    for minute in [0, 15, 30, 45]:
        trip_num = (hour - 7) * 4 + (minute // 15) + 1
        trip_type = 'morning' if hour < 12 else ('afternoon' if hour < 17 else 'evening')
        trip_data_route2.append((
            f'Loop {trip_num}',
            trip_type,
            time(hour, minute),
            time(hour, (minute + 15) % 60) if minute != 45 else time(hour + 1, 0) if hour < 20 else time(21, 0),
            trip_num
        ))

for name, trip_type, dep, arr, order in trip_data_route2[:20]:  # Limit to first 20 for demo
    Trip.objects.get_or_create(
        route=route2,
        name=name,
        defaults={
            'trip_type': trip_type,
            'departure_time': dep,
            'arrival_time': arr,
            'is_active': True,
            'order': order
        }
    )
print(f"  Created 20 trips (sample)")

print("\nCreating trips for Campus - Airport Link...")
trip_data_route3 = [
    ('Airport Morning 1', 'morning', time(5, 30), time(6, 25), 1),
    ('Airport Morning 2', 'morning', time(7, 0), time(7, 55), 2),
    ('Airport Morning 3', 'morning', time(8, 30), time(9, 25), 3),
    ('Airport Morning 4', 'morning', time(10, 0), time(10, 55), 4),
    ('Airport Afternoon 1', 'afternoon', time(12, 0), time(12, 55), 5),
    ('Airport Afternoon 2', 'afternoon', time(14, 0), time(14, 55), 6),
    ('Airport Afternoon 3', 'afternoon', time(16, 0), time(16, 55), 7),
    ('Airport Evening 1', 'evening', time(18, 0), time(18, 55), 8),
    ('Airport Evening 2', 'evening', time(20, 0), time(20, 55), 9),
]

for name, trip_type, dep, arr, order in trip_data_route3:
    Trip.objects.get_or_create(
        route=route3,
        name=name,
        defaults={
            'trip_type': trip_type,
            'departure_time': dep,
            'arrival_time': arr,
            'is_active': True,
            'order': order
        }
    )
print(f"  Created {len(trip_data_route3)} trips")

print("\nCreating trips for Medical Center Shuttle...")
trip_data_route4 = [
    ('Medical Morning 1', 'morning', time(6, 0), time(6, 18), 1),
    ('Medical Morning 2', 'morning', time(6, 30), time(6, 48), 2),
    ('Medical Morning 3', 'morning', time(7, 0), time(7, 18), 3),
    ('Medical Morning 4', 'morning', time(7, 30), time(7, 48), 4),
    ('Medical Morning 5', 'morning', time(8, 0), time(8, 18), 5),
    ('Medical Morning 6', 'morning', time(8, 30), time(8, 48), 6),
    ('Medical Morning 7', 'morning', time(9, 0), time(9, 18), 7),
    ('Medical Afternoon 1', 'afternoon', time(12, 0), time(12, 18), 8),
    ('Medical Afternoon 2', 'afternoon', time(13, 0), time(13, 18), 9),
    ('Medical Afternoon 3', 'afternoon', time(14, 0), time(14, 18), 10),
    ('Medical Afternoon 4', 'afternoon', time(15, 0), time(15, 18), 11),
    ('Medical Afternoon 5', 'afternoon', time(16, 0), time(16, 18), 12),
    ('Medical Evening 1', 'evening', time(17, 0), time(17, 18), 13),
    ('Medical Evening 2', 'evening', time(18, 0), time(18, 18), 14),
    ('Medical Evening 3', 'evening', time(19, 0), time(19, 18), 15),
]

for name, trip_type, dep, arr, order in trip_data_route4:
    Trip.objects.get_or_create(
        route=route4,
        name=name,
        defaults={
            'trip_type': trip_type,
            'departure_time': dep,
            'arrival_time': arr,
            'is_active': True,
            'order': order
        }
    )
print(f"  Created {len(trip_data_route4)} trips")

print("\nCreating buses...")
# Bus model uses 'model' field, 'bus_type' choices are 'long'/'shuttle'
buses_data = [
    ('UB-001', 'Express Coach 2024', 45, 'long', route1),
    ('UB-002', 'Express Coach 2024', 45, 'long', route1),
    ('UB-003', 'City Liner 2023', 45, 'long', route1),
    ('UB-004', 'Mini Shuttle 2024', 20, 'shuttle', route2),
    ('UB-005', 'Mini Shuttle 2024', 20, 'shuttle', route2),
    ('UB-006', 'Airport Coach 2023', 35, 'long', route3),
    ('UB-007', 'Airport Coach 2023', 35, 'long', route3),
    ('UB-008', 'Medical Van 2024', 25, 'shuttle', route4),
    ('UB-009', 'Medical Van 2024', 25, 'shuttle', route4),
    ('UB-010', 'Backup Bus 2022', 40, 'long', None),
]

for bus_num, model_name, capacity, bus_type, route in buses_data:
    bus, created = Bus.objects.get_or_create(
        bus_number=bus_num,
        defaults={
            'model': model_name,
            'capacity': capacity,
            'bus_type': bus_type,
            'current_route': route,
            'is_active': True,
            'license_plate': f'ABC-{bus_num[-3:]}',
        }
    )
    if created:
        print(f"  Created bus: {bus_num} - {model_name}")
    else:
        print(f"  Bus already exists: {bus_num}")

print("\nCreating weekly schedules...")
days = ['mon', 'tue', 'wed', 'thu', 'fri']
weekend = ['sat', 'sun']

# Route 1 schedules (weekdays)
for route, days_list in [(route1, days), (route2, days), (route3, days), (route4, days)]:
    trips = Trip.objects.filter(route=route)
    for day in days_list:
        for trip in trips[:5]:  # Sample of trips
            Schedule.objects.get_or_create(
                route=route,
                day_of_week=day,
                departure_time=trip.departure_time,
                defaults={
                    'arrival_time': trip.arrival_time,
                    'is_active': True
                }
            )

print("  Created weekday schedules")

# Weekend schedules (reduced)
for route in [route1, route2]:
    trips = Trip.objects.filter(route=route)
    for day in weekend:
        for trip in trips[:3]:  # Fewer weekend trips
            Schedule.objects.get_or_create(
                route=route,
                day_of_week=day,
                departure_time=trip.departure_time,
                defaults={
                    'arrival_time': trip.arrival_time,
                    'is_active': True
                }
            )

print("  Created weekend schedules")

print("\n✓ Seed data completed successfully!")
print(f"  Routes: {Route.objects.count()}")
print(f"  Stops: {Stop.objects.count()}")
print(f"  Trips: {Trip.objects.count()}")
print(f"  Schedules: {Schedule.objects.count()}")
print(f"  Buses: {Bus.objects.count()}")
