from typing import List
from fastapi import APIRouter, HTTPException, Depends, status
from app import models, schemas
from app.api.auth import get_current_user_email

router = APIRouter()

async def _get_current_user_profile(email: str) -> models.User:
    user = await models.User.find_one(email=email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user profile not found."
        )
    return user

async def _get_project_or_404(project_id: str) -> models.Project:
    project = await models.Project.get(project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found."
        )
    return project

async def _assert_admin(user: models.User):
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted to Admins and Super Admins."
        )

async def _assert_project_access(user: models.User, project_id: str):
    if user.role == "admin":
        return
    # Check project membership
    member = await models.ProjectMember.find_one(user_id=user.id, project_id=project_id)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this project."
        )


@router.get("/", response_model=List[schemas.ProjectOut])
async def list_projects(current_user_email: str = Depends(get_current_user_email)):
    """List all projects available to the user."""
    user = await _get_current_user_profile(current_user_email)
    if user.role == "admin":
        return await models.Project.find_all().sort("-created_at").to_list()
    
    # Non-admin users only see assigned projects
    memberships = await models.ProjectMember.find(user_id=user.id).to_list()
    project_ids = [m.project_id for m in memberships]
    
    projects = []
    for pid in project_ids:
        p = await models.Project.get(pid)
        if p:
            projects.append(p)
    return projects


@router.post("/", response_model=schemas.ProjectOut, status_code=201)
async def create_project(
    payload: schemas.ProjectCreate,
    current_user_email: str = Depends(get_current_user_email)
):
    """Create a new project. Restricted to Admins."""
    user = await _get_current_user_profile(current_user_email)
    await _assert_admin(user)
    
    project = models.Project(name=payload.name)
    await project.insert()
    
    # Auto-assign creator as manager
    member = models.ProjectMember(
        user_id=user.id,
        project_id=project.id,
        role="manager"
    )
    await member.insert()
    
    return project


@router.get("/{project_id}", response_model=schemas.ProjectOut)
async def get_project(
    project_id: str,
    current_user_email: str = Depends(get_current_user_email)
):
    """Get a single project's details."""
    user = await _get_current_user_profile(current_user_email)
    await _assert_project_access(user, project_id)
    return await _get_project_or_404(project_id)


@router.patch("/{project_id}", response_model=schemas.ProjectOut)
async def update_project(
    project_id: str,
    payload: schemas.ProjectUpdate,
    current_user_email: str = Depends(get_current_user_email)
):
    """Update a project's details (restricted to Admins)."""
    user = await _get_current_user_profile(current_user_email)
    await _assert_admin(user)
    project = await _get_project_or_404(project_id)
    
    update_data = payload.model_dump(exclude_none=True)
    if update_data:
        await project.update({"$set": update_data})
    return project


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    current_user_email: str = Depends(get_current_user_email)
):
    """Delete a project (restricted to Admins)."""
    user = await _get_current_user_profile(current_user_email)
    await _assert_admin(user)
    project = await _get_project_or_404(project_id)
    await project.delete()


# ─── Project Members Management ───────────────────────────────────────────────

@router.get("/{project_id}/members", response_model=List[schemas.ProjectMemberOut])
async def list_project_members(
    project_id: str,
    current_user_email: str = Depends(get_current_user_email)
):
    """List all members/users assigned to a project."""
    user = await _get_current_user_profile(current_user_email)
    await _assert_project_access(user, project_id)
    members = await models.ProjectMember.find(project_id=project_id).to_list()
    if members:
        user_ids = [m.user_id for m in members]
        from app.database import db_pool
        from uuid import UUID
        uuid_user_ids = []
        for uid in user_ids:
            try:
                uuid_user_ids.append(UUID(uid))
            except ValueError:
                pass
        if uuid_user_ids:
            async with db_pool.acquire() as conn:
                rows = await conn.fetch(
                    "SELECT id, email FROM public.profiles WHERE id = ANY($1)",
                    uuid_user_ids
                )
            user_email_map = {str(r["id"]): r["email"] for r in rows}
            for m in members:
                m.user_email = user_email_map.get(m.user_id, "Unknown User")
        else:
            for m in members:
                m.user_email = "Unknown User"
    return members


@router.post("/{project_id}/members", response_model=schemas.ProjectMemberOut, status_code=201)
async def add_project_member(
    project_id: str,
    payload: schemas.ProjectMemberAdd,
    current_user_email: str = Depends(get_current_user_email)
):
    """Grant a user access to a project (restricted to Admins)."""
    user = await _get_current_user_profile(current_user_email)
    await _assert_admin(user)
    await _get_project_or_404(project_id)
    
    target_email = payload.email.lower().strip()
    target_user = await models.User.find_one(email=target_email)
    if not target_user:
        # Create a placeholder user profile so they have access when they sign up later
        from app.api.auth import hash_pwd
        target_user = models.User(
            email=target_email,
            hashed_password=hash_pwd("placeholder-password-123"),
            role="agent",
            is_verified=False
        )
        await target_user.insert()
        
    # Check if membership already exists
    existing = await models.ProjectMember.find_one(
        user_id=target_user.id,
        project_id=project_id
    )
    if existing:
        existing.user_email = target_user.email
        return existing
        
    member = models.ProjectMember(
        user_id=target_user.id,
        project_id=project_id,
        role=payload.role
    )
    await member.insert()
    member.user_email = target_user.email
    return member


@router.delete("/{project_id}/members/{user_id}", status_code=204)
async def remove_project_member(
    project_id: str,
    user_id: str,
    current_user_email: str = Depends(get_current_user_email)
):
    """Revoke a user's access to a project (restricted to Admins)."""
    user = await _get_current_user_profile(current_user_email)
    await _assert_admin(user)
    await _get_project_or_404(project_id)
    
    member = await models.ProjectMember.find_one(user_id=user_id, project_id=project_id)
    if member:
        await member.delete()


@router.get("/{project_id}/report")
async def download_project_report(
    project_id: str,
    current_user_email: str = Depends(get_current_user_email)
):
    """Generate and download a comprehensive Word Document (.docx) report for the project's campaigns, structure, and leads engagement."""
    from fastapi.responses import StreamingResponse
    import io
    from docx import Document
    from datetime import datetime
    
    user = await _get_current_user_profile(current_user_email)
    await _assert_project_access(user, project_id)
    project = await _get_project_or_404(project_id)
    
    # 1. Fetch campaigns and related details
    campaigns = await models.Campaign.find(project_id=project_id).to_list()
    
    # 2. Build the Document
    doc = Document()
    
    # Title
    doc.add_heading(f"Executive Campaign Report", 0)
    doc.add_paragraph(f"Project Name: {project.name}")
    doc.add_paragraph(f"Project Created At: {project.created_at.strftime('%Y-%m-%d %H:%M:%S')} UTC")
    doc.add_paragraph(f"Report Generated On: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} UTC")
    doc.add_paragraph(f"Generated By: {current_user_email}")
    
    doc.add_heading("1. Campaigns Summary", level=1)
    
    # Add summary table
    table = doc.add_table(rows=1, cols=6)
    table.style = 'Light Shading Accent 1'
    hdr_cells = table.rows[0].cells
    hdr_cells[0].text = 'Campaign Name'
    hdr_cells[1].text = 'Status'
    hdr_cells[2].text = 'Total Leads'
    hdr_cells[3].text = 'Total Sent'
    hdr_cells[4].text = 'Open Rate'
    hdr_cells[5].text = 'Click Rate'
    
    for campaign in campaigns:
        # Get recipients
        recipients = await models.Recipient.find(campaign_id=str(campaign.id)).to_list()
        total_leads = len(recipients)
        sent_leads = len([r for r in recipients if r.status in ("sent", "opened", "clicked", "replied")])
        opened_leads = len([r for r in recipients if r.open_count > 0])
        clicked_leads = len([r for r in recipients if r.click_count > 0])
        
        open_rate = f"{(opened_leads / sent_leads * 100):.1f}%" if sent_leads > 0 else "0.0%"
        click_rate = f"{(clicked_leads / sent_leads * 100):.1f}%" if sent_leads > 0 else "0.0%"
        
        row_cells = table.add_row().cells
        row_cells[0].text = campaign.name
        row_cells[1].text = campaign.status.upper()
        row_cells[2].text = str(total_leads)
        row_cells[3].text = str(sent_leads)
        row_cells[4].text = open_rate
        row_cells[5].text = click_rate
        
    doc.add_paragraph("\n")
    doc.add_heading("2. Detailed Campaign Breakdown", level=1)
    
    for idx, campaign in enumerate(campaigns):
        doc.add_heading(f"2.{idx+1} Campaign: {campaign.name}", level=2)
        
        # Linked Configuration Details
        mailer_details = "None"
        if campaign.email_config_id:
            config = await models.EmailConfig.get(campaign.email_config_id)
            if config:
                mailer_details = f"{config.name} ({config.sender_address} via {config.provider})"
                
        doc.add_paragraph(f"Linked Mailer: {mailer_details}")
        doc.add_paragraph(f"Target Region: {campaign.target_region or 'All Regions'}")
        doc.add_paragraph(f"Timezone: {campaign.timezone or 'UTC'}")
        doc.add_paragraph(f"Schedule: {campaign.schedule or 'Immediate'}")
        doc.add_paragraph(f"Mails per Minute: {campaign.mails_per_minute or 'No Limit'}")
        doc.add_paragraph(f"Daily fresh limit: {campaign.daily_fresh_limit or 'No Limit'}")
        
        # Email Template Details
        doc.add_heading("Email Template & Structure", level=3)
        doc.add_paragraph(f"Subject Line: {campaign.subject or 'No subject configured.'}")
        doc.add_paragraph("Body Template:")
        doc.add_paragraph(campaign.body_template or "No body template configured.")
        
        # Retrieve recipients
        recipients = await models.Recipient.find(campaign_id=str(campaign.id)).to_list()
        
        # Leads categorization
        hot_leads = [r for r in recipients if r.click_count > 0 or r.open_count > 2]
        cold_leads = [r for r in recipients if r.status in ("sent", "opened") and r.open_count == 0 and r.click_count == 0]
        
        doc.add_paragraph(f"Hot Leads (Clicked or Opened >2 times): {len(hot_leads)}")
        doc.add_paragraph(f"Cold Leads (Sent but no opens/clicks): {len(cold_leads)}")
        
        # 2.1. Open List
        opened_recipients = [r for r in recipients if r.open_count > 0]
        doc.add_heading("Recipient Open List (Engagement History)", level=3)
        if len(opened_recipients) == 0:
            doc.add_paragraph("No recipients have opened this campaign yet.")
        else:
            t_opens = doc.add_table(rows=1, cols=5)
            t_opens.style = 'Table Grid'
            hdr = t_opens.rows[0].cells
            hdr[0].text = 'Email'
            hdr[1].text = 'Name'
            hdr[2].text = 'Company'
            hdr[3].text = 'Title'
            hdr[4].text = 'Open Count'
            for r in opened_recipients:
                cells = t_opens.add_row().cells
                cells[0].text = r.email
                cells[1].text = r.name or ''
                cells[2].text = r.company_name or ''
                cells[3].text = r.title or ''
                cells[4].text = str(r.open_count)
                
        doc.add_paragraph("\n")
        
        # 2.2. Click List
        clicked_recipients = [r for r in recipients if r.click_count > 0]
        doc.add_heading("Recipient Click List (Link Engagement)", level=3)
        if len(clicked_recipients) == 0:
            doc.add_paragraph("No links have been clicked in this campaign yet.")
        else:
            t_clicks = doc.add_table(rows=1, cols=5)
            t_clicks.style = 'Table Grid'
            hdr = t_clicks.rows[0].cells
            hdr[0].text = 'Email'
            hdr[1].text = 'Name'
            hdr[2].text = 'Company'
            hdr[3].text = 'Title'
            hdr[4].text = 'Click Count'
            for r in clicked_recipients:
                cells = t_clicks.add_row().cells
                cells[0].text = r.email
                cells[1].text = r.name or ''
                cells[2].text = r.company_name or ''
                cells[3].text = r.title or ''
                cells[4].text = str(r.click_count)
                
        doc.add_paragraph("\n")
        
    # 3. Stream back to client
    file_stream = io.BytesIO()
    doc.save(file_stream)
    file_stream.seek(0)
    
    clean_filename = "".join(c for c in project.name if c.isalnum() or c in (' ', '_', '-')).strip().replace(' ', '_')
    return StreamingResponse(
        file_stream,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename={clean_filename}_Executive_Report.docx"}
    )
