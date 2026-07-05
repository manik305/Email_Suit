import os
import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from dotenv import load_dotenv
from .. import models

load_dotenv()

logger = logging.getLogger(__name__)
router = APIRouter()

GMAIL_USER = os.getenv("GMAIL_USER", "test@gmail.com")

class MeetingRequest(BaseModel):
    title: str
    date: str          # ISO date string like "2026-04-15"
    time_slot: str     # Time like "14:00"
    duration_minutes: int = 30
    attendee_email: Optional[str] = None
    description: Optional[str] = None
    sender_email: Optional[str] = None
    project_id: Optional[str] = None

@router.post("/schedule")
async def schedule_meeting(request: MeetingRequest):
    try:
        # Extract date and time robustly
        date_str = request.date[:10]
        time_str = request.time_slot.strip()
        if len(time_str) > 5:
            time_str = time_str[:5]
            
        meeting_date = datetime.strptime(date_str, "%Y-%m-%d")
        meeting_time = datetime.strptime(time_str, "%H:%M")
        
        scheduled_dt = meeting_date.replace(
            hour=meeting_time.hour,
            minute=meeting_time.minute
        )
        
        # Prevent scheduling in the past
        # Treat as local time comparison
        if scheduled_dt < datetime.now():
            raise HTTPException(status_code=400, detail="Cannot schedule a meeting in the past.")
        
        meet_code = uuid.uuid4().hex[:12]
        meet_link = f"https://meet.google.com/{meet_code[:3]}-{meet_code[3:7]}-{meet_code[7:]}"
        
        meeting = models.Meeting(
            title=request.title,
            date=date_str,
            time=time_str,
            attendee_email=request.attendee_email or "",
            meet_link=meet_link,
            sender_email=request.sender_email,
            project_id=request.project_id,
        )
        await meeting.insert()

        # Send invitation email using active email configuration if available
        if request.attendee_email:
            try:
                active_config = None
                if request.sender_email:
                    active_config = await models.EmailConfig.find_one(sender_address=request.sender_email)
                if not active_config:
                    active_config = await models.EmailConfig.find_one(is_active=True)
                
                if active_config:
                    from ..email_service import send_email
                    subject = f"Meeting Scheduled: {request.title}"
                    body = (
                        f"Hi there,\n\n"
                        f"A meeting has been scheduled with you.\n\n"
                        f"Details:\n"
                        f"Subject: {request.title}\n"
                        f"Date: {date_str}\n"
                        f"Time: {time_str}\n"
                        f"Video Call Link: {meet_link}\n\n"
                        f"Looking forward to our conversation!\n"
                        f"Best regards,\n"
                        f"{active_config.sender_name or active_config.sender_address}"
                    )
                    await send_email(config=active_config, to_address=request.attendee_email, subject=subject, body=body)
                    logger.info("Sent meeting invite from %s to %s", active_config.sender_address, request.attendee_email)
            except Exception as mail_exc:
                logger.error("Failed to send meeting invite email: %s", mail_exc)

        return meeting
        
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid date/time format. Use YYYY-MM-DD for date and HH:MM for time."
        )

@router.get("/list")
async def list_meetings(project_id: Optional[str] = None):
    if project_id:
        meetings = await models.Meeting.find(project_id=project_id).to_list()
    else:
        meetings = await models.Meeting.find_all().to_list()
    return {"meetings": meetings, "total": len(meetings)}

@router.get("/available-slots")
async def get_available_slots(date: str, project_id: Optional[str] = None):
    date_str = date[:10]
    
    # Retrieve all booked meetings for this date
    try:
        if project_id:
            booked_meetings = await models.Meeting.find(date=date_str, project_id=project_id).to_list()
        else:
            booked_meetings = await models.Meeting.find(date=date_str).to_list()
        booked_slots = {m.time for m in booked_meetings}
    except Exception as e:
        logger.error("Error retrieving booked meetings: %s", e)
        booked_slots = set()

    # Check if date is today
    now = datetime.now()
    is_today = (now.strftime("%Y-%m-%d") == date_str)

    all_slots = []
    # Slots from 9:00 AM to 5:00 PM (17:00)
    for hour in range(9, 18):
        for minute in [0, 30]:
            if hour == 17 and minute > 0:
                continue # End at 17:00
            slot = f"{hour:02d}:{minute:02d}"
            
            # Determine if slot is in the past (if date is today)
            is_available = True
            if is_today:
                if hour < now.hour or (hour == now.hour and minute <= now.minute):
                    is_available = False
            
            # If already booked, mark as unavailable (filled)
            if slot in booked_slots:
                is_available = False
                
            all_slots.append({"time": slot, "available": is_available})
            
    return {"date": date_str, "slots": all_slots}

class MeetingEditRequest(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    time_slot: Optional[str] = None
    attendee_email: Optional[str] = None
    description: Optional[str] = None
    sender_email: Optional[str] = None
    project_id: Optional[str] = None

@router.patch("/{meeting_id}")
async def update_meeting(meeting_id: str, request: MeetingEditRequest):
    meeting = await models.Meeting.get(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    if request.title is not None:
        meeting.title = request.title
    if request.date is not None:
        meeting.date = request.date[:10]
    if request.time_slot is not None:
        meeting.time = request.time_slot.strip()
    if request.attendee_email is not None:
        meeting.attendee_email = request.attendee_email or ""
    if request.description is not None:
        meeting.description = request.description
    if request.sender_email is not None:
        meeting.sender_email = request.sender_email
    if request.project_id is not None:
        meeting.project_id = request.project_id
        
    await meeting.save()
    return meeting

@router.delete("/{meeting_id}")
async def delete_meeting(meeting_id: str):
    meeting = await models.Meeting.get(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    await meeting.delete()
    return {"success": True, "message": "Meeting deleted successfully"}
