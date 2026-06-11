from fastapi import APIRouter, HTTPException
from app.schema import UserCreate, UserPublic, UserUpdate
from database import SupabaseDep
from app.crud import hash_password, verify_password
import uuid

router = APIRouter()


@router.get("/")
def read_root():
    return {"Hello": "World"}


@router.get("/user/id/{user_id}", response_model=UserPublic)
def get_user_by_id(user_id: uuid.UUID, supabase: SupabaseDep):
    res = supabase.table("users").select("*").eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found")
    return res.data[0]


@router.get("/user/{username}", response_model=UserPublic)
def get_user_by_username(username: str, supabase: SupabaseDep):
    res = supabase.table("users").select("*").eq("username", username).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found")
    return res.data[0]


@router.put("/user/id/{user_id}", response_model=UserPublic)
def create_user(user_in: UserCreate, supabase: SupabaseDep):
    res = supabase.table("users").select("*").eq("username", user_in.username).execute()
    print(res)
    if res.data:
        raise HTTPException(status_code=400, detail="Username is taken")
    user_data = user_in.model_dump(exclude={"password"})
    hashed_pass = hash_password(user_in.password)
    user_data["hashed_password"] = hashed_pass
    result = supabase.table("users").insert(user_data).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create user")
    return result.data[0]
