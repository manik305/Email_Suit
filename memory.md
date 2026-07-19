# Project Memory: Email Suit Campaign & Scheduler Engine

This memory file captures the context, custom constraints, architectural guidelines, database states, and implemented modules across all iterations.

---

## 1. Core Constraints & Business Rules

### Resumption Wave & Batch Consistency Rule
* **Rule**: When follow-ups are triggered, only the recipients belonging to the specific batch sent on a given day should be followed up. We do not trigger follow-ups for all recipients at once.
* **Implementation**: We preserve the actual dispatch timestamp in `send_at` for fresh outreach. When processing follow-ups, the scheduler groups recipients by their original `send_at` date, only dispatching follow-ups for the oldest eligible batch.

### Bounce Prevention Rule
* **Rule**: Maintain a separate bounce list and actively check if a recipient's address is listed on it or blacklisted before sending follow-ups or new outreaches.
* **Implementation**: Bounced emails parsed from IMAP folders are marked as `'bounced'` in PostgreSQL and suppressed.

---

## 2. Active Campaigns & IMAP Connectivity

All 6 active campaigns use working IMAP connections that auto-detect and sync bounces:

1. **US-Campaign-1**: `jeff.garnai@digioclick.com` — Active & Connected
2. **US_Campaign_2**: `luna.davidson@digioclick.com` — Active & Connected
3. **UK_Campaign_1**: `sophie.wilson@digioclick.tech` — Active & Connected
4. **Digio_Sales_US_1_Tech**: `britney.smith@digioclick.tech` — Active & Connected
5. **Digio_Sales_US_Tech**: `luna.davidson@digioclick.tech` — Active & Connected
6. **UK_Campaign_2**: `clara.merck@digioclick.tech` — Active & Connected

---

## 3. Work Accomplished

### A. Scheduler Batch Alignment (Enforced)
* Follow-up send times are grouped by their initial outreach date. Only one batch is released at a time, preventing follow-up spikes.

### B. IMAP-Based Bounce Auto-Detection (Enforced)
* Scheduler triggers background IMAP scans to fetch bounces, updates DB statuses to `'bounced'`, and adds them to suppression/DNC lists.

### C. Dashboard Simulation & Metrics Showcase
* Populated dashboard columns: Companies, Contacts, Leads, Hot, Meetings, Cold, Negative, Bounced.
* Campaign metrics gauges dynamically display prioritized counts, scheduled follow-ups, and meeting slots.

### D. Duplicate Data Ingestion Prevention
* **Endpoint**: `/api/v1/data/upload` in `data.py`
* **Behavior**: Skips rows containing emails already registered for the selected campaign, returning a count of `duplicates_skipped` to the frontend toast: `✅ Ingestion complete: Added X leads. Skipped Y duplicates.`

### E. Scheduler Follow-up Trigger Bug Fix
* **The Bug**: Campaigns with `send_at` (fresh sends) scheduled in the future were completely skipping queue processing, causing due follow-ups to stall.
* **The Fix**: The scheduler (`_run_scheduled_campaigns` in `scheduler.py`) now runs if **either** fresh sending is due **or** if there are any follow-ups due (`status = 'sent'` and `next_follow_up_at <= now`).

### F. Multi-Day Send Time Projection
* Estimated send times (`send_at` in the recipients table) are distributed across future business days by division of `daily_fresh_limit` and skipping weekends, preventing the UI from showing all leads scheduled for tomorrow.

### G. Campaign Pause & Resume Behavior
* **Pause**: When a campaign is paused:
  1. Campaign `send_at` is set to `NULL`.
  2. Estimated send times for pending recipients are set to `NULL`.
  3. Throttled/Deferred recipients are reset back to `pending`.
* **Resume**: When a campaign status changes from `paused` to `active`, the backend defaults `send_at` to the current time (`now`) if it is null, so that the campaign begins processing immediately, and reconsidering all leads fresh.
