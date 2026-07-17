# Neo4j Synchronization and Connectivity Module
import os
import logging
import asyncio
from typing import Optional, List
from neo4j import GraphDatabase
from app.models import Recipient, Campaign

logger = logging.getLogger(__name__)
_driver = None

def get_neo4j_driver():
    """Lazily initializes and returns the Neo4j GraphDatabase driver."""
    global _driver
    if _driver is not None:
        return _driver
    
    from dotenv import load_dotenv
    load_dotenv(override=True)
    
    uri = os.getenv("NEO4J_URI")
    user = os.getenv("NEO4J_USER")
    password = os.getenv("NEO4J_PASSWORD")
    
    if not uri or not user or not password:
        logger.warning("⚠️ Neo4j credentials are not configured in environment variables. Neo4j sync is disabled.")
        return None
    
    try:
        driver = GraphDatabase.driver(uri, auth=(user, password))
        driver.verify_connectivity()
        _driver = driver
        logger.info("✅ Connected to Neo4j Cloud Database successfully.")
        return _driver
    except Exception as e:
        logger.error("❌ Failed to connect to Neo4j database: %s", e)
        return None

def close_neo4j_driver():
    """Closes the Neo4j driver connection pool."""
    global _driver
    if _driver:
        _driver.close()
        _driver = None
        logger.info("Disconnected from Neo4j database.")

def _run_cypher_query(query: str, params: dict):
    """Executes a Cypher query synchronously on the Neo4j driver."""
    driver = get_neo4j_driver()
    if not driver:
        return
    with driver.session() as session:
        session.run(query, params)

async def run_cypher_query_async(query: str, params: dict):
    """Executes a Cypher query in a background thread to prevent blocking the main loop."""
    try:
        await asyncio.to_thread(_run_cypher_query, query, params)
    except Exception as e:
        logger.error("⚠️ Neo4j Cypher execution failed: %s", e)

async def sync_lead_response(
    recipient_id: str, 
    category: str, 
    response_text: str,
    reference_details: Optional[dict] = None
):
    """
    Updates the response category in PostgreSQL, then syncs the lead state
    and relationships to the Neo4j Graph database asynchronously.
    """
    # 1. Update PostgreSQL source of truth
    recipient = await Recipient.get(recipient_id)
    if not recipient:
        logger.error("Recipient %s not found in PostgreSQL.", recipient_id)
        return
    
    recipient.response_category = category
    recipient.response_text = response_text
    if category in ("hot", "cold", "lead", "negative", "reference"):
        recipient.status = "replied"
        recipient.next_follow_up_at = None
    elif category == "bounce":
        recipient.status = "bounced"
        recipient.next_follow_up_at = None
        
    await recipient.save()
    
    campaign = await Campaign.get(recipient.campaign_id)
    campaign_name = campaign.name if campaign else "Unknown Campaign"
    
    # 2. Prepare Neo4j Cypher sync parameters
    params = {
        "campaign_id": str(recipient.campaign_id),
        "campaign_name": campaign_name,
        "lead_id": str(recipient.id),
        "lead_email": recipient.email,
        "lead_name": f"{recipient.first_name or ''} {recipient.last_name or ''}".strip() or "Prospect",
        "lead_status": recipient.status,
        "response_category": category,
        "reply_text": response_text,
        "company_name": recipient.company_name or "",
        "department": recipient.department or "",
        "title": recipient.title or ""
    }
    
    # 3. Main Campaign -> Lead -> Response mapping query
    main_query = """
    MERGE (c:Campaign {pg_id: $campaign_id})
    ON CREATE SET c.name = $campaign_name
    
    MERGE (l:Lead {pg_id: $lead_id})
    SET l.email = $lead_email, 
        l.name = $lead_name, 
        l.status = $lead_status, 
        l.responseCategory = $response_category, 
        l.responseDate = datetime(),
        l.companyName = $company_name,
        l.department = $department,
        l.title = $title
        
    MERGE (c)-[:TARGETED]->(l)
    MERGE (l)-[:RESPONDED {category: $response_category, text: $reply_text, at: datetime()}]->(c)
    
    FOREACH (ignoreMe IN CASE WHEN $company_name IS NOT NULL AND $company_name <> "" THEN [1] ELSE [] END |
        MERGE (co:Company {name: $company_name})
        MERGE (l)-[:BELONGS_TO]->(co)
    )
    """
    
    # Fire main sync in background task
    asyncio.create_task(run_cypher_query_async(main_query, params))
    
    # 4. Handle Reference Lead mapping
    if category == "reference" and reference_details:
        ref_type = reference_details.get("reference_type")
        
        if ref_type == "direct":
            ref_email = reference_details.get("email")
            ref_name = reference_details.get("name") or "Referred Contact"
            if ref_email:
                # Add to Postgres database under the same campaign
                try:
                    new_recipient = Recipient(
                        email=ref_email,
                        first_name=ref_name.split()[0] if ref_name else "Referred",
                        last_name=ref_name.split()[1] if ref_name and len(ref_name.split()) > 1 else "Contact",
                        company_name=recipient.company_name,
                        campaign_id=recipient.campaign_id,
                        status="pending",
                        response_category="lead"
                    )
                    await new_recipient.save()
                    
                    # Sync referred lead relationship to Neo4j
                    ref_params = {
                        "original_id": str(recipient.id),
                        "ref_id": str(new_recipient.id),
                        "ref_email": ref_email,
                        "ref_name": ref_name,
                    }
                    ref_query = """
                    MATCH (original:Lead {pg_id: $original_id})
                    MERGE (ref:Lead {pg_id: $ref_id})
                    SET ref.email = $ref_email, ref.name = $ref_name, ref.status = 'pending'
                    MERGE (original)-[:REFERRED_DIRECTLY]->(ref)
                    """
                    asyncio.create_task(run_cypher_query_async(ref_query, ref_params))
                    logger.info("Direct referral lead %s created and mapped in Neo4j.", ref_email)
                except Exception as e:
                    logger.error("Failed to create direct reference recipient in Postgres: %s", e)
                    
        elif ref_type == "department":
            dept_name = reference_details.get("department")
            if dept_name and recipient.company_name:
                # Find other contacts in the same company belonging to that department
                try:
                    # Search contacts by company and department (case-insensitive)
                    company_recipients = await Recipient.find(company_name=recipient.company_name).to_list()
                    dept_contacts = [
                        r for r in company_recipients 
                        if r.department and dept_name.lower() in r.department.lower()
                    ]
                    
                    # Sort hierarchically based on standard title keywords
                    seniority_levels = ["cmo", "vp", "president", "director", "manager", "lead", "specialist"]
                    def get_seniority_index(contact: Recipient) -> int:
                        title = (contact.title or "").lower()
                        for idx, level in enumerate(seniority_levels):
                            if level in title:
                                return idx
                        return len(seniority_levels) # lowest priority
                    
                    dept_contacts = sorted(dept_contacts, key=get_seniority_index)
                    
                    # Log mapping edges in Neo4j for each matched department contact
                    for idx, contact in enumerate(dept_contacts):
                        dept_params = {
                            "original_id": str(recipient.id),
                            "dept_id": str(contact.id),
                            "dept_email": contact.email,
                            "dept_name": f"{contact.first_name or ''} {contact.last_name or ''}".strip() or "Dept Contact",
                            "seniority_rank": idx
                        }
                        dept_query = """
                        MATCH (original:Lead {pg_id: $original_id})
                        MERGE (dept_contact:Lead {pg_id: $dept_id})
                        SET dept_contact.email = $dept_email, dept_contact.name = $dept_name
                        MERGE (original)-[:REFERRED_TO_DEPARTMENT {rank: $seniority_rank}]->(dept_contact)
                        """
                        asyncio.create_task(run_cypher_query_async(dept_query, dept_params))
                    
                    logger.info("Mapped %d department referral contacts in Neo4j.", len(dept_contacts))
                except Exception as e:
                    logger.error("Failed to query and map department reference contacts: %s", e)


async def sync_entire_database_to_neo4j():
    """Syncs all Campaigns and Recipients from PostgreSQL into Neo4j to seed schema and data."""
    from app.models import Campaign, Recipient
    
    driver = get_neo4j_driver()
    if not driver:
        logger.warning("Neo4j database connection not active. Skipping initial sync.")
        return
        
    try:
        campaigns = await Campaign.find().to_list()
        recipients = await Recipient.find().to_list()
        
        logger.info("Initializing Neo4j DB: Syncing %d campaigns and %d recipients.", len(campaigns), len(recipients))
        
        for campaign in campaigns:
            params = {
                "campaign_id": str(campaign.id),
                "campaign_name": campaign.name
            }
            query = """
            MERGE (c:Campaign {pg_id: $campaign_id})
            SET c.name = $campaign_name
            """
            await run_cypher_query_async(query, params)
            
        for recipient in recipients:
            campaign = next((c for c in campaigns if c.id == recipient.campaign_id), None)
            campaign_name = campaign.name if campaign else "Unknown Campaign"
            
            params = {
                "campaign_id": str(recipient.campaign_id),
                "campaign_name": campaign_name,
                "lead_id": str(recipient.id),
                "lead_email": recipient.email,
                "lead_name": f"{recipient.first_name or ''} {recipient.last_name or ''}".strip() or "Prospect",
                "lead_status": recipient.status,
                "response_category": recipient.response_category,
                "reply_text": recipient.response_category or "",
                "company_name": recipient.company_name or "",
                "department": recipient.department or "",
                "title": recipient.title or ""
            }
            
            query = """
            MERGE (c:Campaign {pg_id: $campaign_id})
            ON CREATE SET c.name = $campaign_name
            
            MERGE (l:Lead {pg_id: $lead_id})
            SET l.email = $lead_email,
                l.name = $lead_name,
                l.status = $lead_status,
                l.responseCategory = $response_category,
                l.companyName = $company_name,
                l.department = $department,
                l.title = $title
                
            MERGE (c)-[:TARGETED]->(l)
            
            FOREACH (ignoreMe IN CASE WHEN $response_category IS NOT NULL THEN [1] ELSE [] END |
                MERGE (l)-[resp:RESPONDED]->(c)
                SET resp.category = $response_category,
                    resp.text = $reply_text,
                    resp.at = datetime()
            )
            
            FOREACH (ignoreMe IN CASE WHEN $company_name IS NOT NULL AND $company_name <> "" THEN [1] ELSE [] END |
                MERGE (co:Company {name: $company_name})
                MERGE (l)-[:BELONGS_TO]->(co)
            )
            """
            await run_cypher_query_async(query, params)
            
        logger.info("✅ Neo4j database initialization and sync completed.")
    except Exception as e:
        logger.error("Failed to sync entire database to Neo4j: %s", e)
