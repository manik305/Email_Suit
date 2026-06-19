import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv

load_dotenv(override=True)

router = APIRouter()

EURI_API_KEY = os.getenv("EURI_API_KEY", "")
DEFAULT_DRAFT_MODEL = "gpt-4o-mini"

def _is_key_configured() -> bool:
    """Check if a real API key is set (not a placeholder)."""
    if not EURI_API_KEY:
        return False
    placeholders = ["your_", "placeholder", "dummy", "xxx", "change_me"]
    return not any(p in EURI_API_KEY.lower() for p in placeholders) and len(EURI_API_KEY) > 10

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    max_tokens: int = 500
    temperature: float = 0.7

def _mock_response(request: ChatRequest) -> dict:
    """Return a simulated response for testing without a real API key."""
    return {
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": (
                        f"[Simulated {request.model} Response] "
                        f"You asked: \"{request.messages[-1].content}\". "
                        f"To get real AI responses, set your EURI_API_KEY in backend/.env "
                        f"with a valid key from api.euron.one."
                    )
                },
                "finish_reason": "stop"
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    }

@router.post("/completions")
async def chat_completion(request: ChatRequest):
    if not _is_key_configured():
        return _mock_response(request)
    
    try:
        from openai import OpenAI
        client = OpenAI(
            api_key=EURI_API_KEY,
            base_url="https://api.euron.one/api/v1/euri"
        )
        response = client.chat.completions.create(
            model=request.model,
            messages=[{"role": m.role, "content": m.content} for m in request.messages],
            max_tokens=request.max_tokens,
            temperature=request.temperature
        )
        return response
    except Exception as e:
        # If the API call itself fails (bad key, network, etc.), fall back to mock
        error_str = str(e)
        if "401" in error_str or "403" in error_str or "auth" in error_str.lower():
            return _mock_response(request)
        raise HTTPException(status_code=400, detail=error_str)

@router.get("/models")
async def list_available_models():
    """Return the list of models available through the Euron API."""
    return {
        "models": [
            {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "provider": "OpenAI"},
            {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "provider": "Google"},
            {"id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6", "provider": "Anthropic"},
            {"id": "llama-4-scout-17b-16e-instruct", "name": "Llama 4 Scout", "provider": "Meta"},
        ]
    }


# ─── AI Email Draft Generation ────────────────────────────────────────────────

class EmailDraftRequest(BaseModel):
    campaign_name: str
    target_segment: Optional[str] = "professionals"
    product_or_service: Optional[str] = None
    tone: Optional[str] = "professional"          # professional | casual | urgent | friendly
    sender_name: Optional[str] = None
    company_name: Optional[str] = None
    model: Optional[str] = DEFAULT_DRAFT_MODEL
    include_subject: bool = True


class EmailDraftResponse(BaseModel):
    subject: Optional[str] = None
    body: str
    model_used: str


@router.post("/draft", response_model=EmailDraftResponse)
async def generate_email_draft(req: EmailDraftRequest):
    """
    Generate a cold / warm outreach email draft using AI.
    Powered by Euron API (OpenAI-compatible).  Falls back to a structured
    template if the API key is not configured or the call fails.
    """
    system_prompt = (
        "You are an expert B2B email copywriter. "
        "Write concise, high-converting outreach emails. "
        "Always personalise with {name} and {company} tokens so they can be substituted later. "
        "Keep the body under 150 words. No emojis unless tone is casual."
    )

    product_hint = f" promoting '{req.product_or_service}'" if req.product_or_service else ""
    sender_hint = f" from {req.sender_name} at {req.company_name}" if req.sender_name else ""
    subject_hint = "Start with SUBJECT: on the first line, then the email body." if req.include_subject else ""

    user_prompt = (
        f"Write a {req.tone} cold email for campaign '{req.campaign_name}'{product_hint}{sender_hint}. "
        f"The target audience is: {req.target_segment}. "
        f"{subject_hint}"
    )

    if not _is_key_configured():
        # Structured template fallback
        subject = f"Quick question about your {req.target_segment} strategy"
        body = (
            f"Hi {{name}},\n\n"
            f"I came across your profile and wanted to reach out regarding "
            f"{req.product_or_service or 'our solution'}.\n\n"
            f"Many {req.target_segment} teams are facing challenges with growth — "
            f"we help solve that.\n\n"
            f"Would you be open to a quick 15-minute chat this week?\n\n"
            f"Best,\n{req.sender_name or 'The Team'}"
        )
        return EmailDraftResponse(subject=subject, body=body, model_used="template-fallback")

    try:
        from openai import OpenAI
        client = OpenAI(
            api_key=EURI_API_KEY,
            base_url="https://api.euron.one/api/v1/euri"
        )
        response = client.chat.completions.create(
            model=req.model or DEFAULT_DRAFT_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=400,
            temperature=0.75,
        )

        raw = response.choices[0].message.content.strip()
        subject = None
        body = raw

        if req.include_subject and raw.lower().startswith("subject:"):
            lines = raw.split("\n", 1)
            subject = lines[0].replace("SUBJECT:", "").replace("Subject:", "").strip()
            body = lines[1].strip() if len(lines) > 1 else raw

        return EmailDraftResponse(
            subject=subject,
            body=body,
            model_used=req.model or DEFAULT_DRAFT_MODEL,
        )

    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI draft generation failed: {exc}")
