"""In-process TTL cache for tool results. No Redis in this stack yet --
matches the existing in-process precedents elsewhere in the backend
(_ledger_locks, _statement_jobs). Per-uvicorn-worker only: fine for a single
worker deployment, a known limitation if that ever changes.

Cache keys are built by tools/base.py's run_tool(), which always folds in
the calling org's id -- individual tools never build their own cache key,
so a tool can't accidentally leak one org's cached result to another.
"""

import cachetools

_SHORT_CACHE = cachetools.TTLCache(maxsize=2000, ttl=30)
_MEDIUM_CACHE = cachetools.TTLCache(maxsize=2000, ttl=180)

_CACHES: dict[str, cachetools.TTLCache] = {
    "short": _SHORT_CACHE,
    "medium": _MEDIUM_CACHE,
}


def cache_get(tier: str, key: str):
    cache = _CACHES.get(tier)
    if cache is None:
        return None
    return cache.get(key)


def cache_set(tier: str, key: str, value) -> None:
    cache = _CACHES.get(tier)
    if cache is None:
        return
    cache[key] = value
