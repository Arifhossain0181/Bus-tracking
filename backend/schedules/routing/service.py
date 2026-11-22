import hashlib
import json
import logging
from typing import List, Tuple, Dict, Any, Optional

from django.core.cache import cache

from .contracts import (
    RoutingRequest,
    RoutingResult,
    RoutingValidationError,
    RoutingProviderError,
)
from .providers import RoutingProvider, get_routing_provider

logger = logging.getLogger(__name__)

ROUTING_CACHE_TTL_SECONDS = 300  # 5 minutes


def _compute_cache_key(provider_name: str, request: RoutingRequest) -> str:
    """Computes a deterministic, collision-resistant cache key for a routing request."""
    canonical = {
        "provider": provider_name,
        "waypoints": request.waypoints,
        "profile": request.profile,
        "avoid_tolls": request.avoid_tolls,
        "u_turn_penalty": request.u_turn_penalty,
        "costing_options": request.costing_options,
    }
    dumped = json.dumps(canonical, sort_keys=True)
    digest = hashlib.sha256(dumped.encode("utf-8")).hexdigest()
    return f"ubus:routing_preview:{digest}"


def generate_route_geometry(
    waypoints: List[Tuple[float, float]],
    profile: str = "bus",
    avoid_tolls: bool = False,
    u_turn_penalty: int = 300,
    route_id: Optional[int] = None,
    costing_options: Optional[Dict[str, Any]] = None,
    provider: Optional[RoutingProvider] = None,
    no_cache: bool = False,
) -> RoutingResult:
    """
    Main entry point for generating road-following route geometry.
    
    Validates input coordinates, checks server-side cache, delegates to the
    configured routing provider, and caches successful results.
    
    This function is strictly a route calculation service and never modifies
    Route or RouteRevision database records.
    """
    request = RoutingRequest(
        waypoints=waypoints,
        profile=profile,
        avoid_tolls=avoid_tolls,
        u_turn_penalty=u_turn_penalty,
        route_id=route_id,
        costing_options=costing_options or {},
    )

    resolved_provider = provider or get_routing_provider()
    provider_name = getattr(resolved_provider, "base_url", "valhalla")

    cache_key = _compute_cache_key(provider_name, request)

    if not no_cache:
        try:
            cached_result = cache.get(cache_key)
            if cached_result and isinstance(cached_result, RoutingResult):
                logger.debug("Routing cache hit for key: %s", cache_key)
                return cached_result
        except Exception as e:
            logger.warning("Cache retrieval error in routing service: %s", e)

    # Execute route generation
    result = resolved_provider.route(request)

    # Cache successful result
    if not no_cache:
        try:
            cache.set(cache_key, result, timeout=ROUTING_CACHE_TTL_SECONDS)
        except Exception as e:
            logger.warning("Cache storage error in routing service: %s", e)

    return result
