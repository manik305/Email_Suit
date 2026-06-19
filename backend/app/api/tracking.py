import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Response, Request, Query
from fastapi.responses import RedirectResponse
from .. import models

logger = logging.getLogger(__name__)
router = APIRouter()

# 1x1 transparent GIF pixels
GIF_1X1 = b'GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;'

@router.get("/open/{recipient_id}")
async def track_open(recipient_id: str, request: Request):
    try:
        recipient = await models.Recipient.get(recipient_id)
        if not recipient:
            return Response(content=GIF_1X1, media_type="image/gif")

        # Fetch campaign target region
        target_region = "US"
        if recipient.campaign_id:
            campaign = await models.Campaign.get(recipient.campaign_id)
            if campaign and campaign.target_region:
                target_region = campaign.target_region

        # Capture request info
        ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent", "")

        # GDPR/ePrivacy Rule: Anonymize client identifying information for Europe (EU)
        if target_region == "EU":
            ip = "ANONYMIZED"
            user_agent = "ANONYMIZED_GDPR_COMPLIANT"

        # Log event
        event = models.RecipientEvent(
            recipient_id=recipient_id,
            event_type="open",
            ip_address=ip,
            user_agent=user_agent
        )
        await event.insert()

        # Update recipient counts
        recipient.open_count += 1
        if not recipient.opened_at:
            recipient.opened_at = datetime.now(timezone.utc)
            if recipient.status in ("pending", "sent"):
                # Track as clicked/viewed
                pass
        await recipient.save()

        logger.info("Email open tracked for recipient %s (Region: %s)", recipient.email, target_region)
    except Exception as e:
        logger.error("Error tracking open: %s", e)

    return Response(content=GIF_1X1, media_type="image/gif")


@router.get("/click/{recipient_id}")
async def track_click(recipient_id: str, request: Request, target: str = Query(...)):
    try:
        recipient = await models.Recipient.get(recipient_id)
        if recipient:
            # Fetch campaign target region
            target_region = "US"
            if recipient.campaign_id:
                campaign = await models.Campaign.get(recipient.campaign_id)
                if campaign and campaign.target_region:
                    target_region = campaign.target_region

            # Capture request info
            ip = request.client.host if request.client else None
            user_agent = request.headers.get("user-agent", "")

            # GDPR/ePrivacy Rule: Anonymize client identifying information for Europe (EU)
            if target_region == "EU":
                ip = "ANONYMIZED"
                user_agent = "ANONYMIZED_GDPR_COMPLIANT"

            event = models.RecipientEvent(
                recipient_id=recipient_id,
                event_type="click",
                link_url=target,
                ip_address=ip,
                user_agent=user_agent
            )
            await event.insert()

            recipient.click_count += 1
            if not recipient.clicked_at:
                recipient.clicked_at = datetime.now(timezone.utc)
            await recipient.save()

            logger.info("Link click tracked for recipient %s (Region: %s, Target: %s)", recipient.email, target_region, target)
    except Exception as e:
        logger.error("Error tracking click: %s", e)

    # Redirect to the target URL
    return RedirectResponse(url=target)
