export type UserRole = 'admin' | 'authority' | 'driver' | 'student' | 'faculty' | 'staff';

export interface DriverProfile {
  id: number;
  license_number: string;
  license_expiry?: string | null;
  emergency_contact?: string | null;
  years_experience?: number | null;
  is_available: boolean;
  current_shift_start?: string | null;
  current_shift_end?: string | null;
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: UserRole;
  role_display?: string;
  phone?: string;
  address?: string;
  nid_number?: string;
  employee_id?: string;
  university_id?: string;
  profile_picture?: string | null;
  profile_picture_url?: string | null;
  is_active: boolean;
  is_active_driver?: boolean;
  approval_status: 'pending' | 'approved' | 'rejected';
  approval_status_display?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at?: string;
  driver_profile?: DriverProfile | null;
  pending_registrations_count?: number;
}

export interface BusLocation {
  id: number;
  bus: number;
  latitude: number | string;
  longitude: number | string;
  accuracy?: number | null;
  speed?: number | string | null;
  heading?: number | string | null;
  is_accurate?: boolean;
  timestamp: string;
}

export interface BusAssignment {
  id: number;
  bus: number;
  bus_number: string;
  driver: number;
  driver_name: string;
  driver_username: string;
  route: number;
  route_name: string;
  date: string;
  shift_start?: string | null;
  shift_end?: string | null;
  is_active: boolean;
  started_at?: string | null;
  ended_at?: string | null;
  created_at?: string;
}

export interface BusTripSummary {
  id: number;
  name: string;
  trip_number: number;
  formatted_trip_number?: string;
  departure_time: string | null;
  arrival_time: string | null;
  is_active: boolean;
}

export interface BusLatestEta {
  stop_id: number;
  stop_name: string;
  calculated_eta: string;
  remaining_minutes: number;
  distance_km: number;
  is_delayed: boolean;
  delay_minutes: number;
}

export interface Bus {
  id: number;
  bus_number: string;
  license_plate: string;
  bus_type: 'long' | 'shuttle';
  bus_type_display?: string;
  capacity: number;
  model?: string;
  year?: number | string;
  is_active: boolean;
  current_route?: number | null;
  route_name?: string | null;
  current_trip?: number | null;
  latest_location?: BusLocation | null;
  latest_eta?: BusLatestEta | null;
  active_assignment?: BusAssignment | null;
  active_journey?: {
    id: number;
    driver_id: number;
    driver_name: string;
    status: 'active' | 'completed' | 'aborted';
    start_time?: string | null;
  } | null;
  latest_journey?: {
    id: number;
    status: 'active' | 'completed' | 'aborted';
    start_time?: string | null;
    end_time?: string | null;
  } | null;
  recent_locations?: BusLocation[];
  recent_assignments?: BusAssignment[];
  current_route_trips?: BusTripSummary[];
  created_at?: string;
  updated_at?: string;
}

export interface Stop {
  id: number;
  route?: number;
  name: string;
  latitude: string | number;
  longitude: string | number;
  order: number;
  scheduled_time: string;
  average_wait_time?: number;
  is_major_stop: boolean;
}

export interface TripStopTime {
  id: number;
  trip: number;
  stop: number;
  stop_name: string;
  arrival_time: string;
  departure_time: string;
  order: number;
}

export interface Trip {
  id: number;
  route?: number;
  name: string;
  trip_number: number;
  formatted_trip_number?: string;
  departure_time: string;
  arrival_time: string;
  is_active: boolean;
  order: number;
  stop_times?: TripStopTime[];
}

export interface RouteRevision {
  id: number;
  route: number;
  revision_number: number;
  status: 'draft' | 'published' | 'archived';
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  } | null;
  distance_km: number | string | null;
  duration_mins: number | null;
  metadata?: Record<string, unknown> | null;
  change_summary?: string;
  created_by?: number | null;
  created_by_name?: string | null;
  created_at: string;
  published_at?: string | null;
}

export interface RouteAssignmentSummary {
  id: number;
  bus_id: number;
  bus_number: string;
  driver_id: number;
  driver_name: string;
  driver_is_live: boolean;
}

export interface RouteItem {
  id: number;
  name: string;
  description?: string;
  route_type: 'shuttle' | 'metro' | 'long';
  route_type_display?: string;
  color: string;
  is_active: boolean;
  is_published: boolean;
  total_distance_km?: number | string;
  estimated_duration_mins?: number | string;
  service_days?: string;
  service_days_display?: string;
  custom_days?: string;
  origin_name?: string;
  destination_name?: string;
  active_revision?: RouteRevision | null;
  active_geometry?: { type: 'LineString'; coordinates: [number, number][] } | null;
  revisions_count?: number;
  stops: Stop[];
  trips: Trip[];
  stops_count?: number;
  trips_count?: number;
  active_assignments: RouteAssignmentSummary[];
  created_at?: string;
  updated_at?: string;
}

export interface DriverLocationStatus {
  is_sharing: boolean;
  is_active: boolean;
  has_active_journey: boolean;
  journey_id?: number | null;
  bus_number?: string | null;
  route_name?: string | null;
  journey_start?: string | null;
  last_updated?: string | null;
  session_started?: string | null;
}

export interface ActiveDriverLocation {
  driver_id: number;
  driver_name: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  last_updated: string;
  is_active: boolean;
  bus_id?: number;
  bus_number?: string;
  route_name?: string;
  route_id?: number;
  journey_id?: number;
  journey_start?: string;
}

export interface Journey {
  id: number;
  driver_id: number;
  driver_name: string;
  bus_id: number;
  bus_number: string;
  route_id: number;
  route_name: string;
  status: 'active' | 'completed' | 'aborted';
  start_time: string;
  end_time?: string | null;
  duration_minutes?: number | null;
}

export interface JourneyPath {
  journey_id: number;
  driver: string;
  bus_number: string;
  route_name: string;
  start_time: string;
  end_time?: string | null;
  status: string;
  path: { lat: number; lng: number; timestamp: string }[];
}

export interface IssueComment {
  id: number;
  user: number;
  user_name: string;
  comment: string;
  created_at: string;
}

export interface Issue {
  id: number;
  issue_type: string;
  issue_type_display?: string;
  description: string;
  reported_by: number;
  reported_by_name: string;
  bus?: number | null;
  bus_number?: string | null;
  route?: number | null;
  route_name?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  status: string;
  status_display?: string;
  priority: string;
  assigned_to?: number | null;
  resolution_notes?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  comments: IssueComment[];
}

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  priority: 'info' | 'warning' | 'danger' | 'success';
  target: string;
  target_route?: number | null;
  route_name?: string | null;
  created_by?: number | null;
  created_by_name?: string;
  is_active: boolean;
  expires_at?: string | null;
  created_at: string;
}

export interface UnreadNotification {
  notification_id: number;
  title: string;
  message: string;
  priority: 'info' | 'warning' | 'danger' | 'success';
  created_at: string;
}
