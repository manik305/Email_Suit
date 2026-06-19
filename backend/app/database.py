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
        db_pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=2,
            max_size=10,
            command_timeout=60
        )
        logger.info("✅ Connected to Supabase PostgreSQL database.")
        
        # Run schema.sql if exists to auto-create tables
        schema_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "schema.sql")
        if os.path.exists(schema_path):
            with open(schema_path, "r", encoding="utf-8") as f:
                schema_sql = f.read()
            # Normalize line endings to Unix format to guarantee replacement matching
            schema_sql = schema_sql.replace("\r\n", "\n")
            if "supabase.co" in DATABASE_URL:
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
                    ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP WITH TIME ZONE;
                    ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMP WITH TIME ZONE;
                    ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS open_count INTEGER DEFAULT 0 NOT NULL;
                    ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0 NOT NULL;
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
                """)
                logger.info("✅ Database schema initialized and legacy tables dropped successfully.")
        
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
                
                # Read SMTP & IMAP values from environment (or defaults)
                env_smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
                env_smtp_port = int(os.getenv("SMTP_PORT", "587"))
                env_smtp_user = os.getenv("SMTP_USERNAME", "outreach@digioclick.com")
                env_smtp_pass = os.getenv("SMTP_PASSWORD", "app-password-placeholder")
                env_smtp_tls = os.getenv("SMTP_USE_TLS", "True").lower() in ("true", "1", "yes")

                env_imap_host = os.getenv("IMAP_HOST", "imap.gmail.com")
                env_imap_port = int(os.getenv("IMAP_PORT", "993"))
                env_imap_user = os.getenv("IMAP_USERNAME", "outreach@digioclick.com")
                env_imap_pass = os.getenv("IMAP_PASSWORD", "app-password-placeholder")
                env_imap_ssl = os.getenv("IMAP_USE_SSL", "True").lower() in ("true", "1", "yes")

                # Insert mock email config
                config_id = await conn.fetchval(
                    """
                    INSERT INTO public.email_configs 
                    (name, provider, sender_address, sender_name, smtp_host, smtp_port, smtp_username, smtp_password, smtp_use_tls,
                     imap_host, imap_port, imap_username, imap_password, imap_use_ssl, is_active)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                    RETURNING id
                    """,
                    "Default Outbound SMTP", "smtp", env_smtp_user, "Outreach Manager",
                    env_smtp_host, env_smtp_port, env_smtp_user, env_smtp_pass, env_smtp_tls,
                    env_imap_host, env_imap_port, env_imap_user, env_imap_pass, env_imap_ssl,
                    True
                )
                
                # Insert mock campaign
                campaign_id = await conn.fetchval(
                    """
                    INSERT INTO public.campaigns
                    (name, target_segment, schedule, status, email_config_id, subject, body_template, timezone)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING id
                    """,
                    "Digio Click Outbound Launch", "Tech Startups", "Once", "draft", config_id,
                    "Grow your outreach with Digio Click CRM 🚀",
                    "Hi {name},\n\nWe noticed {company_name} is growing rapidly. Are you looking to scale your cold outreach?\n\nBest,\nOutreach Team",
                    "America/New_York"
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
