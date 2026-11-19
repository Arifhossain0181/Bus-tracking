from rest_framework.settings import api_settings
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class AuthRateThrottle(AnonRateThrottle):
    """
    Limits authentication and registration attempts per client IP
    to prevent brute-force attacks and credential stuffing.
    """
    scope = 'auth'

    def get_rate(self):
        if getattr(self, 'rate', None):
            return self.rate
        rates = getattr(api_settings, 'DEFAULT_THROTTLE_RATES', {})
        return rates.get(self.scope, '15/minute')


class TelemetryRateThrottle(UserRateThrottle):
    """
    Limits real-time GPS telemetry packets per authenticated driver.
    Generous enough to allow standard 5-second updates (12/min) with bursts,
    while preventing denial-of-service packet flooding.
    """
    scope = 'telemetry'

    def get_rate(self):
        if getattr(self, 'rate', None):
            return self.rate
        rates = getattr(api_settings, 'DEFAULT_THROTTLE_RATES', {})
        return rates.get(self.scope, '60/minute')
