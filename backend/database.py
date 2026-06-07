import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL") or "localhost"
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or "error"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
