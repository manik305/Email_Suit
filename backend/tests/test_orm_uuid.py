import pytest
from app.database import is_uuid_key, _coerce_db_value, NON_UUID_ID_FIELDS
import uuid

def test_is_uuid_key():
    assert is_uuid_key("campaign_id") is True
    assert is_uuid_key("project_id") is True
    assert is_uuid_key("id") is True
    
    # Non-UUID string fields
    assert is_uuid_key("last_message_id") is False
    assert is_uuid_key("agent_id") is False
    assert is_uuid_key("page_id") is False

def test_coerce_db_value():
    msg_id = "<178481003164.1.3641202890113360854@3e26b77f3d53>"
    # Non-UUID field should remain string and not raise exception or convert to UUID
    coerced_msg_id = _coerce_db_value("last_message_id", msg_id)
    assert coerced_msg_id == msg_id
    assert isinstance(coerced_msg_id, str)

    # Valid UUID field
    valid_uuid_str = "550e8400-e29b-41d4-a716-446655440000"
    coerced_uuid = _coerce_db_value("campaign_id", valid_uuid_str)
    assert isinstance(coerced_uuid, uuid.UUID)

if __name__ == "__main__":
    test_is_uuid_key()
    test_coerce_db_value()
    print("All ORM UUID tests passed successfully!")
