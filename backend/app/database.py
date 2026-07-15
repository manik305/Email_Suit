import os
import logging
import json
import asyncpg
from typing import List, Optional, Any, Dict, Type, TypeVar
from pydantic import BaseModel, Field
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Fallback to Supabase connection string format
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")

# Global asyncpg pool connection
db_pool: Optional[asyncpg.Pool] = None

async def init_db() -> None:
    """Initialize the PostgreSQL connection pool and execute schema if not initialized."""
    global db_pool
    try:
        # Use Transaction Mode pooler (port 6543) with no persistent idle connections.
        # max_inactive_connection_lifetime evicts stale connections before Supabase
        # silently drops them (~300s idle timeout on their load balancer).
        # statement_cache_size=0 is REQUIRED for pgbouncer/Supabase Transaction Mode
        # (prepared statements are not supported in transaction pooling mode).
        db_pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=1,
            max_size=50,
            command_timeout=30,
            max_inactive_connection_lifetime=60,  # evict idle connections after 60s
            statement_cache_size=0,               # required for pgbouncer transaction mode
        )
        logger.info("✅ Connected to Supabase PostgreSQL database.")
        
        # Run schema.sql if exists to auto-create tables
        schema_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "schema.sql")
        if os.path.exists(schema_path):
            with open(schema_path, "r", encoding="utf-8") as f:
                schema_sql = f.read()
            # Normalize line endings to Unix format to guarantee replacement matching
            schema_sql = schema_sql.replace("\r\n", "\n")
            if "supabase.co" in DATABASE_URL or "supabase.com" in DATABASE_URL:
                # Remove local-development auth schema/table helper creation since Supabase auth is system-managed
                schema_sql = schema_sql.replace("CREATE SCHEMA IF NOT EXISTS auth;", "")
                schema_sql = schema_sql.replace(
                    "CREATE TABLE IF NOT EXISTS auth.users (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    email VARCHAR(255) UNIQUE,\n    raw_user_meta_data JSONB\n);",
                    ""
                )
                schema_sql = schema_sql.replace(
                    "CREATE OR REPLACE TRIGGER on_auth_user_created\n  AFTER INSERT ON auth.users\n  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();",
                    ""
                )
                schema_sql = schema_sql.replace(
                    "CREATE TRIGGER on_auth_user_created\n  AFTER INSERT ON auth.users\n  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();",
                    ""
                )
            async with db_pool.acquire() as conn:
                # Clean up legacy features tables
                await conn.execute("""
                    DROP TABLE IF EXISTS public.social_posts CASCADE;
                    DROP TABLE IF EXISTS public.social_channels CASCADE;
                    DROP TABLE IF EXISTS public.voice_agents CASCADE;
                """)
                # Optional: Entire database tables reset if DELETE_DB environment variable is enabled
                if os.getenv("DELETE_DB", "False").lower() in ("true", "1", "yes"):
                    logger.info("🗑️ DELETE_DB environment variable is enabled. Dropping all tables for database reset...")
                    await conn.execute("""
                        DROP TABLE IF EXISTS public.recipients CASCADE;
                        DROP TABLE IF EXISTS public.campaigns CASCADE;
                        DROP TABLE IF EXISTS public.email_configs CASCADE;
                        DROP TABLE IF EXISTS public.meetings CASCADE;
                        DROP TABLE IF EXISTS public.profiles CASCADE;
                        DROP TABLE IF EXISTS public.social_posts CASCADE;
                        DROP TABLE IF EXISTS public.social_channels CASCADE;
                        DROP TABLE IF EXISTS public.voice_agents CASCADE;
                    """)
                # Run schema.sql first to ensure all tables exist
                await conn.execute(schema_sql)
                # Alter existing profiles table to ensure compatibility with local credentials auth
                await conn.execute("""
                    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
                    ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
                    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hashed_password VARCHAR(255);
                    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE NOT NULL;
                    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS otp VARCHAR(50);
                    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP WITH TIME ZONE;
                    ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS name VARCHAR(255);
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS target_region VARCHAR(100) DEFAULT 'US' NOT NULL;
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS follow_up_templates JSONB;
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS mails_per_minute INTEGER DEFAULT 2;
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS daily_fresh_limit INTEGER DEFAULT 100;
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS max_contacts_per_company INTEGER DEFAULT 1;
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0;
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS diagnostic_error TEXT;
                    ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP WITH TIME ZONE;
                    ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMP WITH TIME ZONE;
                    ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS open_count INTEGER DEFAULT 0 NOT NULL;
                    ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0 NOT NULL;
                    ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS send_at TIMESTAMP WITH TIME ZONE;
                    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS sender_email VARCHAR(255);
                    CREATE TABLE IF NOT EXISTS public.recipient_events (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        recipient_id UUID REFERENCES public.recipients(id) ON DELETE CASCADE,
                        event_type VARCHAR(50) NOT NULL,
                        link_url TEXT,
                        ip_address VARCHAR(100),
                        user_agent TEXT,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
                    );
                    ALTER TABLE public.email_configs ADD COLUMN IF NOT EXISTS daily_limit INTEGER DEFAULT 500 NOT NULL;
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS email_config_pool JSONB DEFAULT '[]';
                    CREATE TABLE IF NOT EXISTS public.email_config_daily_quota (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        email_config_id UUID REFERENCES public.email_configs(id) ON DELETE CASCADE,
                        quota_date DATE NOT NULL,
                        emails_sent INTEGER DEFAULT 0 NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
                        UNIQUE(email_config_id, quota_date)
                    );
                    CREATE INDEX IF NOT EXISTS idx_quota_config_date ON public.email_config_daily_quota(email_config_id, quota_date);

                    -- Project-Level Management Migration
                    CREATE TABLE IF NOT EXISTS public.projects (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        name VARCHAR(255) NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS public.project_members (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
                        project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
                        role VARCHAR(50) DEFAULT 'member' NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
                        UNIQUE(user_id, project_id)
                    );
                    ALTER TABLE public.email_configs ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
                    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS icp_titles JSONB DEFAULT '[]';
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS icp_departments JSONB DEFAULT '[]';
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS icp_industries JSONB DEFAULT '[]';
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS icp_regions JSONB DEFAULT '[]';
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS icp_active BOOLEAN DEFAULT FALSE;
                    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS campaign_type VARCHAR(50) DEFAULT 'cold' NOT NULL;

                    -- Activity Logs (Admin Audit Trail)
                    CREATE TABLE IF NOT EXISTS public.activity_logs (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
                        campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
                        user_email VARCHAR(255),
                        action VARCHAR(100) NOT NULL,
                        category VARCHAR(50) NOT NULL,
                        severity VARCHAR(20) DEFAULT 'info',
                        summary TEXT NOT NULL,
                        details JSONB DEFAULT '{}',
                        ip_address VARCHAR(100),
                        user_agent TEXT,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS idx_activity_logs_project ON public.activity_logs(project_id);
                    CREATE INDEX IF NOT EXISTS idx_activity_logs_campaign ON public.activity_logs(campaign_id);
                    CREATE INDEX IF NOT EXISTS idx_activity_logs_category ON public.activity_logs(category);
                    CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON public.activity_logs(created_at DESC);

                    -- Enable RLS on all existing public tables
                    ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
                    ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
                    ALTER TABLE public.email_configs ENABLE ROW LEVEL SECURITY;
                    ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
                    ALTER TABLE public.recipients ENABLE ROW LEVEL SECURITY;
                    ALTER TABLE public.recipient_events ENABLE ROW LEVEL SECURITY;
                    ALTER TABLE public.email_config_daily_quota ENABLE ROW LEVEL SECURITY;
                    ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
                    ALTER TABLE public.dnc_list ENABLE ROW LEVEL SECURITY;
                    ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

                    -- Security Definer Helper Functions (to prevent infinite policy recursion)
                    CREATE OR REPLACE FUNCTION public.is_admin()
                    RETURNS BOOLEAN AS $$
                      SELECT EXISTS (
                        SELECT 1 FROM public.profiles
                        WHERE id = auth.uid() AND role = 'admin'
                      );
                    $$ LANGUAGE sql SECURITY DEFINER;

                    CREATE OR REPLACE FUNCTION public.is_project_member(project_id UUID)
                    RETURNS BOOLEAN AS $$
                      SELECT EXISTS (
                        SELECT 1 FROM public.project_members
                        WHERE user_id = auth.uid() AND project_id = $1
                      );
                    $$ LANGUAGE sql SECURITY DEFINER;

                    CREATE OR REPLACE FUNCTION public.is_project_manager(project_id UUID)
                    RETURNS BOOLEAN AS $$
                      SELECT EXISTS (
                        SELECT 1 FROM public.project_members
                        WHERE user_id = auth.uid() AND project_id = $1 AND role = 'manager'
                      );
                    $$ LANGUAGE sql SECURITY DEFINER;

                    CREATE OR REPLACE FUNCTION public.is_campaign_member(campaign_id UUID)
                    RETURNS BOOLEAN AS $$
                      SELECT EXISTS (
                        SELECT 1 FROM public.campaigns c
                        WHERE c.id = campaign_id AND (public.is_project_member(c.project_id) OR public.is_admin())
                      );
                    $$ LANGUAGE sql SECURITY DEFINER;

                    CREATE OR REPLACE FUNCTION public.is_recipient_member(recipient_id UUID)
                    RETURNS BOOLEAN AS $$
                      SELECT EXISTS (
                        SELECT 1 FROM public.recipients r
                        WHERE r.id = recipient_id AND (public.is_campaign_member(r.campaign_id) OR public.is_admin())
                      );
                    $$ LANGUAGE sql SECURITY DEFINER;

                    CREATE OR REPLACE FUNCTION public.is_email_config_member(config_id UUID)
                    RETURNS BOOLEAN AS $$
                      SELECT EXISTS (
                        SELECT 1 FROM public.email_configs c
                        WHERE c.id = config_id AND (public.is_project_member(c.project_id) OR public.is_admin())
                      );
                    $$ LANGUAGE sql SECURITY DEFINER;

                    -- RLS Policies for Profiles
                    DROP POLICY IF EXISTS profiles_read_policy ON public.profiles;
                    CREATE POLICY profiles_read_policy ON public.profiles
                      FOR SELECT TO authenticated
                      USING (auth.uid() = id OR public.is_admin());

                    DROP POLICY IF EXISTS profiles_write_policy ON public.profiles;
                    CREATE POLICY profiles_write_policy ON public.profiles
                      FOR ALL TO authenticated
                      USING (auth.uid() = id OR public.is_admin());

                    -- RLS Policies for Projects
                    DROP POLICY IF EXISTS projects_read_policy ON public.projects;
                    CREATE POLICY projects_read_policy ON public.projects
                      FOR SELECT TO authenticated
                      USING (public.is_project_member(id) OR public.is_admin());

                    DROP POLICY IF EXISTS projects_write_policy ON public.projects;
                    CREATE POLICY projects_write_policy ON public.projects
                      FOR ALL TO authenticated
                      USING (public.is_project_manager(id) OR public.is_admin());

                    -- RLS Policies for Project Members
                    DROP POLICY IF EXISTS members_read_policy ON public.project_members;
                    CREATE POLICY members_read_policy ON public.project_members
                      FOR SELECT TO authenticated
                      USING (public.is_project_member(project_id) OR public.is_admin());

                    DROP POLICY IF EXISTS members_write_policy ON public.project_members;
                    CREATE POLICY members_write_policy ON public.project_members
                      FOR ALL TO authenticated
                      USING (public.is_project_manager(project_id) OR public.is_admin());

                    -- RLS Policies for Campaigns
                    DROP POLICY IF EXISTS campaigns_policy ON public.campaigns;
                    CREATE POLICY campaigns_policy ON public.campaigns
                      FOR ALL TO authenticated
                      USING (public.is_project_member(project_id) OR public.is_admin());

                    -- RLS Policies for Email Configs
                    DROP POLICY IF EXISTS email_configs_read_policy ON public.email_configs;
                    CREATE POLICY email_configs_read_policy ON public.email_configs
                      FOR SELECT TO authenticated
                      USING (public.is_project_member(project_id) OR public.is_admin());

                    DROP POLICY IF EXISTS email_configs_write_policy ON public.email_configs;
                    CREATE POLICY email_configs_write_policy ON public.email_configs
                      FOR ALL TO authenticated
                      USING (public.is_project_manager(project_id) OR public.is_admin());

                    -- RLS Policies for Recipients
                    DROP POLICY IF EXISTS recipients_policy ON public.recipients;
                    CREATE POLICY recipients_policy ON public.recipients
                      FOR ALL TO authenticated
                      USING (public.is_campaign_member(campaign_id) OR public.is_admin());

                    -- RLS Policies for Recipient Events
                    DROP POLICY IF EXISTS recipient_events_policy ON public.recipient_events;
                    CREATE POLICY recipient_events_policy ON public.recipient_events
                      FOR ALL TO authenticated
                      USING (public.is_recipient_member(recipient_id) OR public.is_admin());

                    -- RLS Policies for Email Config Daily Quota Tracker
                    DROP POLICY IF EXISTS quota_policy ON public.email_config_daily_quota;
                    CREATE POLICY quota_policy ON public.email_config_daily_quota
                      FOR ALL TO authenticated
                      USING (public.is_email_config_member(email_config_id) OR public.is_admin());

                    -- RLS Policies for Meetings
                    DROP POLICY IF EXISTS meetings_policy ON public.meetings;
                    CREATE POLICY meetings_policy ON public.meetings
                      FOR ALL TO authenticated
                      USING (public.is_project_member(project_id) OR public.is_admin());

                    -- RLS Policies for DNC List
                    DROP POLICY IF EXISTS dnc_policy ON public.dnc_list;
                    CREATE POLICY dnc_policy ON public.dnc_list
                      FOR ALL TO authenticated
                      USING (public.is_project_member(project_id) OR public.is_admin());

                    -- RLS Policies for Activity Logs
                    DROP POLICY IF EXISTS logs_read_policy ON public.activity_logs;
                    CREATE POLICY logs_read_policy ON public.activity_logs
                      FOR SELECT TO authenticated
                      USING (public.is_project_member(project_id) OR public.is_admin());

                    DROP POLICY IF EXISTS logs_insert_policy ON public.activity_logs;
                    CREATE POLICY logs_insert_policy ON public.activity_logs
                      FOR INSERT TO authenticated
                      WITH CHECK (true); -- Allow app to insert logs dynamically

                    DROP POLICY IF EXISTS logs_admin_policy ON public.activity_logs;
                    CREATE POLICY logs_admin_policy ON public.activity_logs
                      FOR ALL TO authenticated
                      USING (public.is_admin());

                    -- Event Trigger to automatically enable RLS on all future tables
                    CREATE OR REPLACE FUNCTION public.auto_enable_rls_on_create()
                    RETURNS EVENT_TRIGGER
                    LANGUAGE plpgsql
                    SECURITY DEFINER
                    AS $$
                    DECLARE
                        obj record;
                    BEGIN
                        FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands() WHERE command_tag = 'CREATE TABLE'
                        LOOP
                            IF obj.schema_name = 'public' THEN
                                EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', obj.schema_name, obj.object_name);
                            END IF;
                        END LOOP;
                    END;
                    $$;

                    DROP EVENT TRIGGER IF EXISTS trg_auto_enable_rls;
                    CREATE EVENT TRIGGER trg_auto_enable_rls
                    ON ddl_command_end
                    WHEN TAG IN ('CREATE TABLE')
                    EXECUTE FUNCTION public.auto_enable_rls_on_create();
                """)

                # Ensure default project exists for legacy compatibility
                default_project_id = await conn.fetchval("SELECT id FROM public.projects LIMIT 1")
                if not default_project_id:
                    default_project_id = await conn.fetchval(
                        "INSERT INTO public.projects (name) VALUES ($1) RETURNING id",
                        "Default Project"
                    )
                await conn.execute("UPDATE public.campaigns SET project_id = $1 WHERE project_id IS NULL", default_project_id)
                await conn.execute("UPDATE public.email_configs SET project_id = $1 WHERE project_id IS NULL", default_project_id)
                await conn.execute("UPDATE public.meetings SET project_id = $1 WHERE project_id IS NULL", default_project_id)
                
                # Sanitize recipient emails by trimming trailing commas, semicolons, quotes, and spaces
                await conn.execute("UPDATE public.recipients SET email = TRIM(BOTH ' ,;\"''' FROM email)")

                # Grant all existing users access to the default project
                all_user_ids = await conn.fetch("SELECT id FROM public.profiles")
                for u in all_user_ids:
                    await conn.execute(
                        "INSERT INTO public.project_members (user_id, project_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
                        u["id"], default_project_id, "manager"
                    )
                logger.info("✅ Database schema initialized and legacy tables dropped successfully.")
                
                # Trigger Neo4j entire database sync asynchronously in background task
                import asyncio
                from app.neo4j_sync import sync_entire_database_to_neo4j
                asyncio.create_task(sync_entire_database_to_neo4j())
        
        # Auto-seed database with demo data if empty
        async with db_pool.acquire() as conn:
            user_count = await conn.fetchval("SELECT COUNT(*) FROM public.profiles")
            if user_count == 0:
                logger.info("🌱 Seeding database with demo data...")
                import bcrypt
                hashed_pwd = bcrypt.hashpw(b"SecurePassword123", bcrypt.gensalt()).decode('utf-8')
                
                # Insert admin profile
                user_id = await conn.fetchval(
                    "INSERT INTO public.profiles (email, hashed_password, role, is_verified) VALUES ($1, $2, $3, $4) RETURNING id",
                    "architect@emailsaas.com", hashed_pwd, "admin", True
                )

                # Create seed project
                project_id = await conn.fetchval(
                    "INSERT INTO public.projects (name) VALUES ($1) RETURNING id",
                    "Default Outreach Project"
                )

                # Link user as project manager
                await conn.execute(
                    "INSERT INTO public.project_members (user_id, project_id, role) VALUES ($1, $2, $3)",
                    user_id, project_id, "manager"
                )
                
                # Read SMTP & IMAP values from environment (or defaults)
                env_smtp_host = os.getenv("SMTP_HOST", "smtp-relay.gmail.com")
                env_smtp_port = int(os.getenv("SMTP_PORT", "587"))
                env_smtp_user = os.getenv("SMTP_USERNAME", "outreach@digioclick.com")
                env_smtp_pass = os.getenv("SMTP_PASSWORD", "app-password-placeholder")
                env_smtp_tls = os.getenv("SMTP_USE_TLS", "True").lower() in ("true", "1", "yes")

                env_imap_host = os.getenv("IMAP_HOST", "imap.gmail.com")
                env_imap_port = int(os.getenv("IMAP_PORT", "993"))
                env_imap_user = os.getenv("IMAP_USERNAME", "outreach@digioclick.com")
                env_imap_pass = os.getenv("IMAP_PASSWORD", "app-password-placeholder")
                env_imap_ssl = os.getenv("IMAP_USE_SSL", "True").lower() in ("true", "1", "yes")

                # Insert mock email config linked to project
                config_id = await conn.fetchval(
                    """
                    INSERT INTO public.email_configs 
                    (name, provider, sender_address, sender_name, smtp_host, smtp_port, smtp_username, smtp_password, smtp_use_tls,
                     imap_host, imap_port, imap_username, imap_password, imap_use_ssl, is_active, project_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                    RETURNING id
                    """,
                    "Default Outbound SMTP", "smtp", env_smtp_user, "Outreach Manager",
                    env_smtp_host, env_smtp_port, env_smtp_user, env_smtp_pass, env_smtp_tls,
                    env_imap_host, env_imap_port, env_imap_user, env_imap_pass, env_imap_ssl,
                    True, project_id
                )
                
                # Insert mock campaign linked to project
                campaign_id = await conn.fetchval(
                    """
                    INSERT INTO public.campaigns
                    (name, target_segment, schedule, status, email_config_id, subject, body_template, timezone, project_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING id
                    """,
                    "Digio Click Outbound Launch", "Tech Startups", "Once", "draft", config_id,
                    "Grow your outreach with Digio Click CRM 🚀",
                    "Hi {name},\n\nWe noticed {company_name} is growing rapidly. Are you looking to scale your cold outreach?\n\nBest,\nOutreach Team",
                    "America/New_York", project_id
                )
                
                # Insert mock recipients
                recipients_data = [
                    (
                        "john.doe@company.com", "John", "Doe", "john.alt@personal.com",
                        "Senior Developer", "Engineering", "Company Inc", "https://company.com",
                        "linkedin.com/in/johndoe", "Software", "California", "90210", "United States",
                        "pending", campaign_id
                    ),
                    (
                        "jane.smith@enterprise.com", "Jane", "Smith", "jane.alt@personal.com",
                        "Product Manager", "Product", "Enterprise Corp", "https://enterprise.com",
                        "linkedin.com/in/janesmith", "Technology", "New York", "10001", "United States",
                        "pending", campaign_id
                    )
                ]
                for r in recipients_data:
                    await conn.execute(
                        """
                        INSERT INTO public.recipients
                        (email, first_name, last_name, alternative_email, title, department, company_name, website, linkedin_url, industry, state, zip_code, country, status, campaign_id)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                        """,
                        *r
                    )
                logger.info("🌱 Seeding database completed successfully.")
    except Exception as exc:
        logger.error("❌ Failed to connect to Supabase PostgreSQL: %s", exc)
        raise exc

async def close_db() -> None:
    """Close the PostgreSQL connection pool."""
    global db_pool
    if db_pool:
        await db_pool.close()
        logger.info("Disconnected from PostgreSQL database.")

T = TypeVar('T', bound='PostgresModel')

class PostgresModel(BaseModel):
    """
    Base class providing Beanie-like active record ORM methods over PostgreSQL.
    """
    id: Optional[str] = None # UUID stored as string in memory

    class Settings:
        name = "" # Table name to override

    @classmethod
    def get_table_name(cls) -> str:
        if hasattr(cls, "Settings") and getattr(cls.Settings, "name"):
            return cls.Settings.name
        return cls.__name__.lower() + "s"

    @classmethod
    async def get(cls: Type[T], id_val: Any) -> Optional[T]:
        """Fetch a single record by ID."""
        if not db_pool:
            raise RuntimeError("Database pool not initialized.")
        
        id_str = str(id_val) if id_val is not None else ""
        if not id_str:
            return None
            
        # Validate UUID format
        try:
            from uuid import UUID
            UUID(id_str)
        except ValueError:
            return None

        table = cls.get_table_name()
        query = f"SELECT * FROM {table} WHERE id = $1"
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(query, id_str)
            if row:
                return cls.from_row(row)
        return None

    @classmethod
    async def find_one(cls: Type[T], *args, **kwargs) -> Optional[T]:
        """Simple find_one mapping dictionary keys to WHERE clauses."""
        if not db_pool:
            raise RuntimeError("Database pool not initialized.")
        table = cls.get_table_name()
        
        # Parse simple pydantic-like expressions or keyword args
        where_clauses = []
        values = []
        
        # Check if first arg is an expression like User.email == email
        # For simplicity, we parse kwargs
        idx = 1
        for k, v in kwargs.items():
            where_clauses.append(f"{k} = ${idx}")
            values.append(v)
            idx += 1
            
        where_str = " AND ".join(where_clauses) if where_clauses else "TRUE"
        query = f"SELECT * FROM {table} WHERE {where_str} LIMIT 1"
        
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(query, *values)
            if row:
                return cls.from_row(row)
        return None

    @classmethod
    def find(cls: Type[T], *args, **kwargs) -> 'QuerySet[T]':
        """Return a QuerySet builder for chaining find queries."""
        return QuerySet(cls, kwargs)

    @classmethod
    def find_all(cls: Type[T]) -> 'QuerySet[T]':
        """Return a QuerySet builder to fetch all rows."""
        return QuerySet(cls, {})

    @classmethod
    async def count(cls) -> int:
        """Return total row count for this table."""
        if not db_pool:
            return 0
        table = cls.get_table_name()
        query = f"SELECT COUNT(*) FROM {table}"
        async with db_pool.acquire() as conn:
            return await conn.fetchval(query)

    async def insert(self: T) -> T:
        """Insert this model instance as a new row in Postgres."""
        if not db_pool:
            raise RuntimeError("Database pool not initialized.")
        table = self.get_table_name()
        
        data = self.model_dump(exclude={"id"})
        columns = []
        values = []
        placeholders = []
        
        idx = 1
        for k, v in data.items():
            columns.append(k)
            # Serialize dict/list to json string for JSONB/TEXT[] columns
            if isinstance(v, (dict, list)):
                values.append(json.dumps(v))
            else:
                if k.endswith("_id") and v == "":
                    v = None
                if k in ("send_at", "next_follow_up_at", "created_at", "otp_expires_at") and isinstance(v, str) and v:
                    try:
                        v = datetime.fromisoformat(v.replace("Z", "+00:00"))
                    except ValueError:
                        pass
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

    async def save(self: T) -> T:
        """Update or insert this model instance."""
        if not self.id:
            return await self.insert()
            
        table = self.get_table_name()
        data = self.model_dump(exclude={"id"})
        
        set_clauses = []
        values = []
        idx = 1
        for k, v in data.items():
            set_clauses.append(f"{k} = ${idx}")
            if isinstance(v, (dict, list)):
                values.append(json.dumps(v))
            else:
                if k.endswith("_id") and v == "":
                    v = None
                if k in ("send_at", "next_follow_up_at", "created_at", "otp_expires_at") and isinstance(v, str) and v:
                    try:
                        v = datetime.fromisoformat(v.replace("Z", "+00:00"))
                    except ValueError:
                        pass
                values.append(v)
            idx += 1
            
        values.append(self.id)
        set_str = ", ".join(set_clauses)
        query = f"UPDATE {table} SET {set_str} WHERE id = ${idx}"
        
        async with db_pool.acquire() as conn:
            await conn.execute(query, *values)
        return self

    async def delete(self) -> None:
        """Delete this record from the database."""
        if not self.id:
            return
        table = self.get_table_name()
        query = f"DELETE FROM {table} WHERE id = $1"
        async with db_pool.acquire() as conn:
            await conn.execute(query, self.id)

    async def update(self, update_dict: Dict[str, Any]) -> None:
        """Perform raw update operations on the record fields."""
        # Simple parser for $set keys
        payload = update_dict.get("$set", update_dict)
        for k, v in payload.items():
            if hasattr(self, k):
                setattr(self, k, v)
        await self.save()

    @classmethod
    def from_row(cls: Type[T], row: asyncpg.Record) -> T:
        """Hydrate a Pydantic model instance from an asyncpg Record row."""
        d = dict(row)
        # Parse fields that are stored as UUID, JSON/JSONB, arrays, etc.
        for k, v in d.items():
            if isinstance(v, (dict, list)) and k in cls.model_fields:
                # parsed json
                pass
            elif isinstance(v, str) and (v.startswith("{") or v.startswith("[")) and k in cls.model_fields:
                try:
                    d[k] = json.loads(v)
                except ValueError:
                    pass
            # convert uuid instances to strings
            if hasattr(v, "hex"):
                d[k] = str(v)
            elif isinstance(v, datetime):
                field = cls.model_fields.get(k)
                if field:
                    ann = field.annotation
                    if ann is str or (hasattr(ann, "__args__") and str in ann.__args__):
                        d[k] = v.isoformat()
        return cls(**d)


class QuerySet:
    """
    Lightweight query builder to support Beanie-like `.find().to_list()` flows.
    """
    def __init__(self, model_cls, filters: Dict[str, Any]):
        self.model_cls = model_cls
        self.filters = filters
        self.sort_field = None
        self.limit_val = None

    def sort(self, sort_field: str) -> 'QuerySet':
        self.sort_field = sort_field
        return self

    def limit(self, limit: int) -> 'QuerySet':
        self.limit_val = limit
        return self

    async def count(self) -> int:
        if not db_pool:
            return 0
        table = self.model_cls.get_table_name()
        where_clauses = []
        values = []
        idx = 1
        
        for k, v in self.filters.items():
            where_clauses.append(f"{k} = ${idx}")
            values.append(v)
            idx += 1
            
        where_str = " AND ".join(where_clauses) if where_clauses else "TRUE"
        query = f"SELECT COUNT(*) FROM {table} WHERE {where_str}"
        
        async with db_pool.acquire() as conn:
            return await conn.fetchval(query, *values)

    async def to_list(self) -> List[Any]:
        if not db_pool:
            return []
        table = self.model_cls.get_table_name()
        where_clauses = []
        values = []
        idx = 1
        
        for k, v in self.filters.items():
            where_clauses.append(f"{k} = ${idx}")
            values.append(v)
            idx += 1
            
        where_str = " AND ".join(where_clauses) if where_clauses else "TRUE"
        
        order_str = ""
        if self.sort_field:
            field = self.sort_field.strip("-")
            direction = "DESC" if self.sort_field.startswith("-") else "ASC"
            order_str = f" ORDER BY {field} {direction}"
            
        limit_str = ""
        if self.limit_val is not None:
            limit_str = f" LIMIT {self.limit_val}"
            
        query = f"SELECT * FROM {table} WHERE {where_str}{order_str}{limit_str}"
        
        async with db_pool.acquire() as conn:
            rows = await conn.fetch(query, *values)
            return [self.model_cls.from_row(r) for r in rows]
