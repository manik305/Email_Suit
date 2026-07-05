import sys
import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from app.database import init_db, close_db
from app.scheduler import start_scheduler, stop_scheduler
from app.api import auth, campaign, data, config, chat, meetings, tracking, project


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── startup ──
    await init_db()
    run_scheduler = os.getenv("RUN_SCHEDULER", "True").lower() in ("true", "1", "yes")
    if run_scheduler:
        start_scheduler()
    yield
    # ── shutdown ──
    if run_scheduler:
        stop_scheduler()
    await close_db()


app = FastAPI(title="SaaS Email Campaign API", lifespan=lifespan)

# CORS for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,     prefix="/api/v1/auth",      tags=["Authentication"])
app.include_router(campaign.router, prefix="/api/v1/campaigns",  tags=["Campaigns"])
app.include_router(data.router,     prefix="/api/v1/data",       tags=["Data"])
app.include_router(config.router,   prefix="/api/v1/config",     tags=["Email Configuration"])
app.include_router(chat.router,     prefix="/api/v1/chat",       tags=["Chat / AI Copilot"])
app.include_router(meetings.router, prefix="/api/v1/meetings",   tags=["Meeting Scheduler"])
app.include_router(tracking.router, prefix="/api/track",        tags=["Email Tracking"])
app.include_router(project.router,  prefix="/api/v1/projects",     tags=["Project Management"])


# Serve frontend static files
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
if not os.path.exists(frontend_dir):
    # Fallback for Docker environment where backend content is flat under /app/
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))

# Mount assets directory
assets_dir = os.path.join(frontend_dir, "assets")
if os.path.exists(assets_dir):
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

# Catch-all route to serve the React SPA
@app.get("/{catchall:path}")
async def serve_react_app(catchall: str):
    if catchall.startswith("api/v1") or catchall.startswith("docs") or catchall.startswith("openapi.json"):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="API route not found")
        
    file_path = os.path.join(frontend_dir, catchall)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
        
    index_path = os.path.join(frontend_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
        
    return {"message": "Welcome to the SaaS Email Campaign API"}
