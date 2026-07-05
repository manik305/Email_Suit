from typing import List, Optional, Dict, Any
from datetime import datetime
from app.database import PostgresModel
from pydantic import BaseModel, Field, EmailStr

# Dummy Indexed helper for backwards compatibility
def Indexed(cls, *args, **kwargs):
    return cls

# ─── Recipient ────────────────────────────────────────────────────────────────

class Recipient(PostgresModel):
    email: str
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    alternative_email: Optional[str] = None
    title: Optional[str] = None  # corresponds to 'title' / designation in DB
    department: Optional[str] = None
    company_name: Optional[str] = None
    website: Optional[str] = None
    linkedin_url: Optional[str] = None # corresponds to linkedin_url in DB
    industry: Optional[str] = None
    sub_industry: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    zip_code: Optional[str] = None  # corresponds to 'zip_code' / pin_code in DB
    country: Optional[str] = None
    region: Optional[str] = None
    status: str = "pending"  # pending, sent, bounced, replied
    campaign_id: Optional[str] = None
    follow_up_count: int = 0
    max_follow_ups: int = 0
    next_follow_up_at: Optional[datetime] = None
    opened_at: Optional[datetime] = None
    clicked_at: Optional[datetime] = None
    open_count: int = 0
    click_count: int = 0
    send_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Backwards compatibility properties for designation/pin_code/linkedin_id
    @property
    def designation(self) -> Optional[str]:
        return self.title
    @designation.setter
    def designation(self, val: Optional[str]):
        self.title = val

    @property
    def pin_code(self) -> Optional[str]:
        return self.zip_code
    @pin_code.setter
    def pin_code(self, val: Optional[str]):
        self.zip_code = val

    @property
    def linkedin_id(self) -> Optional[str]:
        return self.linkedin_url
    @linkedin_id.setter
    def linkedin_id(self, val: Optional[str]):
        self.linkedin_url = val

    class Settings:
        name = "recipients"


# ─── EmailConfig (per-campaign SMTP + IMAP) ───────────────────────────────────

class SmtpSettings(BaseModel):
    """SMTP delivery settings stored inside EmailConfig.settings_json."""
    host: str = "smtp-relay.gmail.com"
    port: int = 587
    username: str
    password: str          # stored encrypted in production; plaintext here for MVP
    use_tls: bool = True   # True → STARTTLS on port 587


class ImapSettings(BaseModel):
    """IMAP inbox-read settings stored inside EmailConfig.imap_json."""
    host: str = "imap.gmail.com"
    port: int = 993
    username: str
    password: str
    use_ssl: bool = True   # True → SSL on port 993


class EmailConfig(PostgresModel):
    """
    Holds outbound (SMTP) and inbound (IMAP) credentials for a single
    email account / G Suite account that a campaign sends from.
    """
    name: str = "Default"           # human-readable label, e.g. "Sales Gmail"
    provider: str = "smtp"          # google | microsoft | smtp | other
    sender_address: str             # the From: address
    sender_name: Optional[str] = None

    # SMTP – stored as a nested dict so we can swap SmtpSettings in/out
    smtp: SmtpSettings

    # IMAP – optional; required to read campaign inbox
    imap: Optional[ImapSettings] = None

    is_active: bool = True
    daily_limit: int = 500       # max emails per day via SMTP relay for this account
    project_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "email_configs"

    @classmethod
    def from_row(cls, row: Any) -> 'EmailConfig':
        """Inflate flat DB columns into nested SMTP and IMAP structures."""
        d = dict(row)
        if "smtp_host" in d:
            d["smtp"] = {
                "host": d.get("smtp_host"),
                "port": d.get("smtp_port"),
                "username": d.get("smtp_username"),
                "password": d.get("smtp_password"),
                "use_tls": d.get("smtp_use_tls", True),
            }
        if "imap_host" in d and d.get("imap_host") and d.get("imap_username") and d.get("imap_password"):
            d["imap"] = {
                "host": d.get("imap_host"),
                "port": d.get("imap_port"),
                "username": d.get("imap_username"),
                "password": d.get("imap_password"),
                "use_ssl": d.get("imap_use_ssl", True),
            }
        else:
            d["imap"] = None
        
        # Convert UUID instances to strings
        for k, v in list(d.items()):
            if hasattr(v, "hex"):
                d[k] = str(v)
        return cls(**d)

    async def insert(self) -> 'EmailConfig':
        """Flatten nested SMTP and IMAP structures into database columns on insert."""
        from app.database import db_pool
        import json
        if not db_pool:
            raise RuntimeError("Database pool not initialized.")
        table = self.get_table_name()
        
        data = self.model_dump(exclude={"id"})
        if "smtp" in data and data["smtp"]:
            smtp = data.pop("smtp")
            data["smtp_host"] = smtp.get("host")
            data["smtp_port"] = smtp.get("port")
            data["smtp_username"] = smtp.get("username")
            data["smtp_password"] = smtp.get("password")
            data["smtp_use_tls"] = smtp.get("use_tls")
        if "imap" in data and data["imap"]:
            imap = data.pop("imap")
            data["imap_host"] = imap.get("host")
            data["imap_port"] = imap.get("port")
            data["imap_username"] = imap.get("username")
            data["imap_password"] = imap.get("password")
            data["imap_use_ssl"] = imap.get("use_ssl")
        else:
            data.pop("imap", None)
            data["imap_host"] = None
            data["imap_port"] = None
            data["imap_username"] = None
            data["imap_password"] = None
            data["imap_use_ssl"] = None

        columns = []
        values = []
        placeholders = []
        idx = 1
        for k, v in data.items():
            columns.append(k)
            if isinstance(v, (dict, list)):
                values.append(json.dumps(v))
            else:
                values.append(v)
            placeholders.append(f"${idx}")
            idx += 1
            
        cols_str = ", ".join(columns)
        placeholders_str = ", ".join(placeholders)
        query = f"INSERT INTO {table} ({cols_str}) VALUES ({placeholders_str}) RETURNING id"
        
        async with db_pool.acquire() as conn:
            inserted_id = await conn.fetchval(query, *values)
            self.id = str(inserted_id)
        return self

    async def save(self) -> 'EmailConfig':
        """Flatten nested SMTP and IMAP structures into database columns on update/save."""
        if not self.id:
            return await self.insert()
            
        from app.database import db_pool
        import json
        table = self.get_table_name()
        data = self.model_dump(exclude={"id"})
        if "smtp" in data and data["smtp"]:
            smtp = data.pop("smtp")
            data["smtp_host"] = smtp.get("host")
            data["smtp_port"] = smtp.get("port")
            data["smtp_username"] = smtp.get("username")
            data["smtp_password"] = smtp.get("password")
            data["smtp_use_tls"] = smtp.get("use_tls")
        if "imap" in data and data["imap"]:
            imap = data.pop("imap")
            data["imap_host"] = imap.get("host")
            data["imap_port"] = imap.get("port")
            data["imap_username"] = imap.get("username")
            data["imap_password"] = imap.get("password")
            data["imap_use_ssl"] = imap.get("use_ssl")
        else:
            data.pop("imap", None)
            data["imap_host"] = None
            data["imap_port"] = None
            data["imap_username"] = None
            data["imap_password"] = None
            data["imap_use_ssl"] = None

        set_clauses = []
        values = []
        idx = 1
        for k, v in data.items():
            set_clauses.append(f"{k} = ${idx}")
            if isinstance(v, (dict, list)):
                values.append(json.dumps(v))
            else:
                values.append(v)
            idx += 1
            
        values.append(self.id)
        set_str = ", ".join(set_clauses)
        query = f"UPDATE {table} SET {set_str} WHERE id = ${idx}"
        
        async with db_pool.acquire() as conn:
            await conn.execute(query, *values)
        return self


# ─── Campaign ─────────────────────────────────────────────────────────────────

class Campaign(PostgresModel):
    name: str
    target_segment: Optional[str] = None
    schedule: Optional[str] = "Once"  # Daily, Weekly, Once
    status: str = "draft"             # draft, active, completed, paused

    # FK → EmailConfig._id  (set when campaign is created or updated)
    email_config_id: Optional[str] = None

    # Email content / template
    subject: Optional[str] = None
    body_template: Optional[str] = None  # plain text; {name}, {company} etc.
    follow_up_templates: Optional[List[str]] = None

    # Scheduled send time as ISO-8601 string e.g. "2026-05-20T09:00:00"
    send_at: Optional[str] = None
    timezone: Optional[str] = "America/New_York"
    target_region: str = "US"
    created_by: Optional[str] = None

    mails_per_minute: int = 2
    daily_fresh_limit: int = 100
    max_contacts_per_company: int = 1
    consecutive_failures: int = 0
    diagnostic_error: Optional[str] = None
    email_config_pool: Optional[List[str]] = []   # additional sending accounts for rotation
    project_id: Optional[str] = None
    icp_titles: Optional[List[str]] = None
    icp_departments: Optional[List[str]] = None
    icp_industries: Optional[List[str]] = None
    icp_regions: Optional[List[str]] = None
    icp_active: Optional[bool] = False

    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "campaigns"


# ─── Project ──────────────────────────────────────────────────────────────────

class Project(PostgresModel):
    name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "projects"


# ─── ProjectMember ────────────────────────────────────────────────────────────

class ProjectMember(PostgresModel):
    user_id: str
    project_id: str
    role: str = "member" # "manager" | "member"
    created_at: datetime = Field(default_factory=datetime.utcnow)

    _user_email: Optional[str] = None

    @property
    def user_email(self) -> Optional[str]:
        return getattr(self, "_user_email", None)

    @user_email.setter
    def user_email(self, val: Optional[str]):
        self._user_email = val

    class Settings:
        name = "project_members"


# ─── Meeting ──────────────────────────────────────────────────────────────────

class Meeting(PostgresModel):
    title: str
    date: str
    time: str
    attendee_email: str
    meet_link: Optional[str] = None
    sender_email: Optional[str] = None
    project_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "meetings"


# ─── EmailConfigDailyQuota ────────────────────────────────────────────────────

class EmailConfigDailyQuota(PostgresModel):
    """
    Tracks how many emails each EmailConfig account has sent today.
    Keyed by (email_config_id, quota_date) with an atomic upsert counter.
    """
    email_config_id: str
    quota_date: Any  # Can be date or str
    emails_sent: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "email_config_daily_quota"

    @classmethod
    async def get_or_create_today(cls, email_config_id: str) -> 'EmailConfigDailyQuota':
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).date()
        quota = await cls.find_one(email_config_id=email_config_id, quota_date=today)
        if not quota:
            quota = cls(
                email_config_id=email_config_id,
                quota_date=today,
                emails_sent=0
            )
            try:
                await quota.insert()
            except Exception:
                # Concurrent insert fallback
                quota = await cls.find_one(email_config_id=email_config_id, quota_date=today)
                if not quota:
                    raise
        return quota

    async def increment(self, n: int = 1) -> None:
        from app.database import db_pool
        if not db_pool:
            raise RuntimeError("Database pool not initialized.")
        table = self.get_table_name()
        query = f"UPDATE {table} SET emails_sent = emails_sent + $1 WHERE id = $2 RETURNING emails_sent"
        async with db_pool.acquire() as conn:
            new_val = await conn.fetchval(query, n, self.id)
            self.emails_sent = new_val


# ─── VoiceAgent ───────────────────────────────────────────────────────────────

class VoiceAgent(PostgresModel):
    name: str
    provider: str = "vapi"  # vapi, twilio
    agent_id: str
    phone_number: Optional[str] = None
    status: str = "active"
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "voice_agents"


# ─── SocialChannel ────────────────────────────────────────────────────────────

class PageMetadata(BaseModel):
    page_id: str
    page_name: str
    page_handle: Optional[str] = None
    avatar_url: Optional[str] = None

class SocialChannel(PostgresModel):
    platform: str                    # "facebook", "instagram", "linkedin", "twitter"
    page_number: str                 # Target page ID / account number input by user
    metadata: PageMetadata
    access_token: str
    refresh_token: Optional[str] = None
    token_expires_at: Optional[datetime] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "social_channels"


# ─── SocialPost ───────────────────────────────────────────────────────────────

class PlatformContent(BaseModel):
    text: str
    media_ids: List[str] = []

class SocialPost(PostgresModel):
    platform: str                     # Main primary platform fallback (e.g. facebook)
    content: str                      # Main primary content fallback
    media_urls: List[str] = []
    scheduled_for: Optional[datetime] = None
    status: str = "draft"             # draft, scheduled, published, failed
    
    # Extended Multi-Channel features
    target_platforms: List[str] = []
    channel_ids: List[str] = []
    platform_overrides: Dict[str, PlatformContent] = {}
    
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "social_posts"


# ─── User ─────────────────────────────────────────────────────────────────────

class User(PostgresModel):
    email: str
    hashed_password: Optional[str] = None
    role: str = "agent"  # admin | agent
    is_verified: bool = False
    otp: Optional[str] = None
    otp_expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "profiles"


# ─── RecipientEvent ───────────────────────────────────────────────────────────

class RecipientEvent(PostgresModel):
    recipient_id: str
    event_type: str  # 'open' | 'click'
    link_url: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "recipient_events"

