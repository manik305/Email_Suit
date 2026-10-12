"""
event_bus.py
~~~~~~~~~~~~
Dual-mode Event Bus for real-time notification streaming:
- Uses Redis Pub/Sub if REDIS_URL is configured and reachable.
- Falls back gracefully to in-process asyncio.Queue for local testing with ZERO external dependencies.
"""
import asyncio
import json
import logging
import os
from typing import AsyncGenerator, Set, Dict, Any

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "")
CHANNEL_NAME = "emailsuit:events"

# In-memory local subscribers (set of asyncio.Queue)
_subscribers: Set[asyncio.Queue] = set()
_redis_client = None
_redis_listener_task = None


async def _get_redis():
    global _redis_client
    if not REDIS_URL:
        return None
    if _redis_client is None:
        try:
            import redis.asyncio as aioredis
            _redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
            await _redis_client.ping()
            logger.info("Connected to Redis at %s for event streaming.", REDIS_URL)
        except Exception as exc:
            logger.warning("Redis unavailable (%s). Falling back to in-memory event bus.", exc)
            _redis_client = None
    return _redis_client


async def publish_event(event_type: str, data: Dict[str, Any]) -> None:
    """
    Publish an event to all connected clients.
    """
    payload = {
        "event": event_type,
        "data": data,
        "timestamp": asyncio.get_event_loop().time()
    }
    raw_payload = json.dumps(payload)

    # 1. Distribute to in-memory queues (local process SSE connections)
    dead_queues = set()
    for q in list(_subscribers):
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            dead_queues.add(q)
        except Exception:
            dead_queues.add(q)
            
    for dq in dead_queues:
        _subscribers.discard(dq)

    # 2. Distribute to Redis if connected (for multi-worker microservices)
    r = await _get_redis()
    if r:
        try:
            await r.publish(CHANNEL_NAME, raw_payload)
        except Exception as exc:
            logger.warning("Failed to publish to Redis: %s", exc)


async def subscribe() -> AsyncGenerator[Dict[str, Any], None]:
    """
    Yields events as they arrive for an active SSE stream.
    """
    q = asyncio.Queue(maxsize=100)
    _subscribers.add(q)
    try:
        while True:
            try:
                event = await asyncio.wait_for(q.get(), timeout=20.0)
                yield event
            except asyncio.TimeoutError:
                # Periodic keep-alive heartbeat ping
                yield {"event": "ping", "data": {"status": "alive"}}
    finally:
        _subscribers.discard(q)
