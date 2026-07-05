# Blueprint for Customized Campaign Scheduling & Timezone Queue System

This document outlines the architectural changes and step-by-step implementation plan for introducing a user-customizable campaign configuration flow, a timezone-prioritized queue processor, and a smart rate-throttling engine into the **Email Suit**.

---

## 1. Database Schema Updates (`public.campaigns`)

To support these campaign-specific configurations, the `public.campaigns` table in [schema.sql](file:///c:/Users/manik/Downloads/Email%20Suit/backend/schema.sql) needs to store these new settings:

```sql
ALTER TABLE public.campaigns 
  ADD COLUMN IF NOT EXISTS mails_per_minute INTEGER DEFAULT 2,     -- Range: 1 to 10
  ADD COLUMN IF NOT EXISTS daily_fresh_limit INTEGER DEFAULT 100,  -- Options: 50, 100, 200, 300, 400, 500
  ADD COLUMN IF NOT EXISTS max_contacts_per_company INTEGER DEFAULT 1; -- Range: 1 to 10
```

---

## 2. Frontend Campaign Wizard Restructuring

We will restructure the frontend Campaign Creation flow to enforce this step-by-step procedure:

```
Step 1: Campaign Rules Config (Scheduler Constraints)
      └── Mails per minute
      └── Daily fresh email limit
      └── Max contacts per company
      └── Target Region & Start Time
            │
            ▼
Step 2: Drafting Section (Templates)
      └── Outreach templates (Subject & body templates with variables)
      └── Multi-phase follow-up schedules
            │
            ▼
Step 3: Email Sender Configuration
      └── Link SMTP/IMAP Accounts (EmailConfig selection)
```

### Proposed UI Form Elements:
1.  **Sending Speed (Mails Per Minute)**:
    *   *UI element*: Slider or dropdown from `1` to `10`.
    *   *Default*: `2 mails / min`.
2.  **Daily Outreach Volume (Fresh Limit)**:
    *   *UI element*: Toggle buttons/dropdown (`50`, `100`, `200`, `300`, `400`, `500`).
    *   *Default*: `100`.
3.  **Company Concentration Filter**:
    *   *UI element*: Dropdown selection from `1` to `10` contacts per company.
    *   *Default*: `1`.

---

## 3. The "Queue Prioritizer" Backend Logic

The background scheduler needs to assemble a dynamic daily sending queue based on your specific requirements:

### Phase 1: Company Throttled Selection
When contacts are imported or a campaign transitions to `active`:
1.  Group all uploaded contacts for that campaign by `company_name`.
2.  For each group, randomly select `max_contacts_per_company` (e.g. 2).
3.  Mark those chosen contacts as `eligible_outreach`. All other contacts remain in a deferred state.

### Phase 2: Timezone Prioritization Map (US Audience)
When constructing the daily send list, map the recipient’s `state` to its respective US timezone:

*   **EST (Eastern Standard Time - P1)**: `NY`, `FL`, `GA`, `MA`, `PA`, `OH`, `MI`, `NC`, `SC`, `VA`, `NJ`
*   **CST (Central Standard Time - P2)**: `TX`, `IL`, `TN`, `MO`, `AL`, `LA`, `WI`, `MN`
*   **MST (Mountain Standard Time - P3)**: `CO`, `AZ`, `UT`, `NM`, `WY`, `MT`, `ID`
*   **PST (Pacific Standard Time - P4)**: `CA`, `WA`, `OR`, `NV`

**Sorting Algorithm**:
```python
def sort_queue_by_timezone(recipients):
    # Map of states to timezone priority
    priority_map = {
        'EST': 1, 'CST': 2, 'MST': 3, 'PST': 4
    }
    # Resolve state to timezone, sort queue by priority ascending
    return sorted(recipients, key=lambda r: priority_map.get(get_timezone_from_state(r.state), 5))
```

---

## 4. The Rate-Throttled Queue Processor

Instead of sending emails immediately inside a fast loop, the queue processor operates on a heartbeat matching the campaign's `mails_per_minute` configuration.

### Processing Algorithm:
1.  **Load Daily Workload**: Fetch up to `daily_fresh_limit` (e.g. 100) fresh contacts and combine them with any active follow-ups due for the day.
2.  **Order by Priority**: Sort this combined set by timezone priority (EST first).
3.  **Throttle Calculation**:
    *   Formula: `gap_seconds = 60 / mails_per_minute`.
    *   Example: If `mails_per_minute = 2`, `gap_seconds = 30`.
4.  **Send Engine Loop**:
    ```python
    import asyncio
    
    async def process_campaign_queue(campaign, recipients):
        gap_seconds = 60 / campaign.mails_per_minute
        for recipient in recipients:
            await send_email(..., recipient_id=recipient.id)
            # Apply customized sleep gap
            await asyncio.sleep(gap_seconds)
    ```

---

## 5. Automated Block Protection (Kill Switch)

To keep your SMTP sending credentials from getting permanently shut down:
*   **Listener**: The IMAP checking routine or bounce-webhook parsing listens for incoming bounce messages.
*   **Trigger**: If the error code returned is standard spam blocking (e.g., `554 5.7.1 Spam block`, `550 Blocked`, or account login failures), increment a failure counter.
*   **Action**: If **3 consecutive sends fail due to block/reputation errors**, update the campaign database:
    *   `campaign.status = "paused"`
    *   Log a critical diagnostic error visible in the dashboard workspace to notify the user.

---

## 6. Action Plan Summary

### Phase A: Database & Models (1-2 Hours)
*   Add campaign configuration columns to postgres schema.
*   Update `Campaign` and `CampaignCreate` schema models in `backend/app/models.py` and `schemas.py`.

### Phase B: Frontend Wizard Updates (3-4 Hours)
*   Reorder the Campaign setup wizard steps.
*   Implement the step-1 configuration screen with interactive sliders/dropdown controls.

### Phase C: Backend Queue Engine (4-6 Hours)
*   Update `backend/app/scheduler.py` to compile the queue using timezone sorting.
*   Incorporate `asyncio.sleep` calculated dynamically using the campaign's `mails_per_minute` value.
*   Integrate random selection logic for contacts matching the `max_contacts_per_company` limit.
