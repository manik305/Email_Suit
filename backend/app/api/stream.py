"""
stream.py  –  /api/v1/stream
~~~~~~~~~~~~~~~~~~~~~~~~~~~
Server-Sent Events (SSE) streaming endpoint for real-time frontend updates.
"""
import json
import logging
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from app.event_bus import subscribe

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/events")
async def stream_events(request: Request):
    """
    Subscribes the client to real-time events via Server-Sent Events (SSE).
    Streams email dispatches, lead updates, campaign status changes, and heartbeats.
    """
    async def event_generator():
        # Initial greeting event
        yield f"event: connected\ndata: {json.dumps({'message': 'Connected to Email Suit Real-Time Event Stream'})}\n\n"
        
        async for item in subscribe():
            if await request.is_disconnected():
                break
            
            event_type = item.get("event", "message")
            event_data = json.dumps(item.get("data", {}))
            
            if event_type == "ping":
                # Standard SSE comment heartbeat to prevent reverse proxies from dropping idle connections
                yield ": keep-alive\n\n"
            else:
                yield f"event: {event_type}\ndata: {event_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disables proxy buffering in Nginx
        }
    )
