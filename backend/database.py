import os
from pathlib import Path
from typing import Annotated
from supabase import create_client, Client
from dotenv import load_dotenv
from fastapi import Depends

load_dotenv(Path(__file__).resolve().parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL") or "localhost"
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or "error"


def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


SupabaseDep = Annotated[Client, Depends(get_supabase)]
