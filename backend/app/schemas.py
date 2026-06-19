from pydantic import BaseModel, EmailStr, ConfigDict, field_validator
from typing import List, Optional
from datetime import datetime


# ─── Nested setting schemas ────────────────────────────────────────────────────

class SmtpSettingsSchema(BaseModel):
    host: str = "smtp.gmail.com"
    port: int = 587
    username: str
    password: str
    use_tls: bool = True


class ImapSettingsSchema(BaseModel):
    host: str = "imap.gmail.com"
    port: int = 993
    username: str
    password: str
    use_ssl: bool = True


# ─── EmailConfig ──────────────────────────────────────────────────────────────

class EmailConfigCreate(BaseModel):
    name: str = "Default"
    provider: str = "smtp"
    sender_address: EmailStr
    sender_name: Optional[str] = None
    smtp: SmtpSettingsSchema
    imap: Optional[ImapSettingsSchema] = None
    is_active: bool = True


class EmailConfigUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    sender_address: Optional[EmailStr] = None
    sender_name: Optional[str] = None
    smtp: Optional[SmtpSettingsSchema] = None
    imap: Optional[ImapSettingsSchema] = None
    is_active: Optional[bool] = None


class EmailConfigOut(BaseModel):
    id: str
    name: str
    provider: str
    sender_address: str
    sender_name: Optional[str] = None
    is_active: bool
    created_at: datetime
    # Omit raw passwords from API responses — only expose metadata
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    imap_host: Optional[str] = None
    imap_port: Optional[int] = None

    model_config = ConfigDict(from_attributes=True, arbitrary_types_allowed=True)

    @field_validator('id', mode='before')
    @classmethod
    def coerce_object_id(cls, v):
        return str(v)


# ─── Recipient ────────────────────────────────────────────────────────────────

class RecipientBase(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    alternative_email: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    company_name: Optional[str] = None
    website: Optional[str] = None
    linkedin_id: Optional[str] = None
    industry: Optional[str] = None
    state: Optional[str] = None
    pin_code: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None
    status: str = "pending"


class RecipientCreate(RecipientBase):
    campaign_id: Optional[str] = None


class Recipient(RecipientBase):
    id: str
    campaign_id: Optional[str] = None
    opened_at: Optional[datetime] = None
    clicked_at: Optional[datetime] = None
    open_count: int = 0
    click_count: int = 0
    created_at: datetime
    model_config = ConfigDict(from_attributes=True, arbitrary_types_allowed=True)

    @field_validator('id', mode='before')
    @classmethod
    def coerce_object_id(cls, v):
        return str(v)



# ─── Campaign ─────────────────────────────────────────────────────────────────

class CampaignBase(BaseModel):
    name: str
    target_segment: Optional[str] = None
    schedule: Optional[str] = "Once"
    subject: Optional[str] = None
    body_template: Optional[str] = None
    follow_up_templates: Optional[List[str]] = None
    # ISO datetime string e.g. "2026-05-20T09:00:00" for scheduled sends
    send_at: Optional[str] = None
    timezone: Optional[str] = "America/New_York"
    target_region: Optional[str] = "US"
    created_by: Optional[str] = None


class CampaignCreate(CampaignBase):
    """
    Optionally bind an existing EmailConfig at creation time.
    If omitted the campaign is created without a mailer — the user
    can attach one later via PATCH /campaigns/{id}/config.
    """
    email_config_id: Optional[str] = None


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    target_segment: Optional[str] = None
    schedule: Optional[str] = None
    subject: Optional[str] = None
    body_template: Optional[str] = None
    follow_up_templates: Optional[List[str]] = None
    send_at: Optional[str] = None
    status: Optional[str] = None
    email_config_id: Optional[str] = None
    target_region: Optional[str] = None
    created_by: Optional[str] = None



class Campaign(CampaignBase):
    id: str
    status: str
    email_config_id: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True, arbitrary_types_allowed=True)

    @field_validator('id', mode='before')
    @classmethod
    def coerce_object_id(cls, v):
        return str(v)


class CampaignMetrics(BaseModel):
    totalEmailsSent: int
    openRate: float
    clickRate: float
    dataProcessedCount: int


# ─── IMAP message preview ─────────────────────────────────────────────────────

class InboxMessage(BaseModel):
    uid: str
    subject: str
    from_addr: str
    date: str
    snippet: str
    body: str = ""


class InboxResponse(BaseModel):
    campaign_id: str
    mailbox: str
    messages: List[InboxMessage]
