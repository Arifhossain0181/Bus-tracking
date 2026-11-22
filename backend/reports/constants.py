"""
Operational Constants for UBus Analytics & Reporting.
"""

# Punctuality threshold in minutes:
# A trip is defined as On-Time if actual departure delay does not exceed 5 minutes.
# Trips with departure delay > 5 minutes are classified as Delayed.
ON_TIME_TOLERANCE_MINUTES = 5

# Route duration tolerance buffer in minutes for routes without timetable departure slots:
DURATION_BUFFER_MINUTES = 10
