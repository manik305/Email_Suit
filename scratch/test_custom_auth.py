import sys
import os
import asyncio
from unittest import IsolatedAsyncioTestCase
from dotenv import load_dotenv

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", ".env")))

from app import database, models

class TestAuthAndResendOTP(IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await database.init_db()

    async def asyncTearDown(self):
        await database.close_db()

    async def test_resend_otp_flow(self):
        # Clean up any existing test user first
        email = "test-resend-otp-user@example.com"
        user = await models.User.find_one(email=email)
        if user:
            await user.delete()

        # Create dummy user profile
        new_user = models.User(
            email=email,
            hashed_password="somehashpassword",
            role="agent",
            is_verified=False,
            otp="111111"
        )
        await new_user.insert()
        self.assertIsNotNone(new_user.id)

        # Retrieve user to check fields
        fetched_user = await models.User.find_one(email=email)
        self.assertEqual(fetched_user.otp, "111111")

        # Now simulate resend flow logic manually
        import random
        from datetime import datetime, timezone, timedelta
        otp = f"{random.randint(100000, 999999)}"
        fetched_user.otp = otp
        fetched_user.otp_expires_at = datetime.now(timezone.utc) + timedelta(seconds=60)
        await fetched_user.save()

        # Fetch and verify again
        updated_user = await models.User.find_one(email=email)
        self.assertEqual(updated_user.otp, otp)
        self.assertIsNotNone(updated_user.otp_expires_at)
        
        # Verify 60s window
        time_diff = (updated_user.otp_expires_at - datetime.now(timezone.utc)).total_seconds()
        self.assertTrue(50 < time_diff <= 60)

        # Cleanup
        await updated_user.delete()
        print("[OK] TestAuthAndResendOTP verification complete!")

if __name__ == "__main__":
    import unittest
    unittest.main()
