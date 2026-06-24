from argon2 import PasswordHasher
import jwt
from pydantic import BaseModel
from fastapi import HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
import os
from typing import Annotated
from database import SupabaseDep

load_dotenv(dotenv_path="../")

SECRET_KEY = os.getenv("SECRET_KEY") or ""
ALGORITHM = os.getenv("ALGORITHM") or ""


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: str | None = None


ph = PasswordHasher()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


def hash_password(plain_password: str) -> str:
    return ph.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return ph.verify(hash=hashed_password, password=plain_password)
    except Exception:
        return False


DUMMY_HASH = hash_password("dummypassword")


def get_user(username: str, supabase):
    res = supabase.table("users").select("*").eq("username", username).execute()
    return res.data[0] if res.data else None


def authenticate_user(username: str, plain_password: str, supabase):
    user = get_user(username=username, supabase=supabase)
    if user is None:
        verify_password(plain_password, DUMMY_HASH)
        return False
    if not verify_password(plain_password=plain_password, hashed_password=user["hashed_password"]):
        return False
    return user


# Make sure user_data DOES NOT include password (hashed or plain), make sure it is UserBase schema
def create_access_token(user_data: dict, expires_delta: timedelta | None = None):
    if not SECRET_KEY or not ALGORITHM:
        raise RuntimeError("JWT SECRET_KEY or ALGORITHM is not configured")
    to_encode = user_data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    supabase: SupabaseDep,
):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        if not SECRET_KEY or not ALGORITHM:
            raise RuntimeError("JWT SECRET_KEY or ALGORITHM is not configured")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except jwt.InvalidTokenError:
        raise credentials_exception
    user = get_user(username=token_data.username or "", supabase=supabase)
    if user is None:
        raise credentials_exception
    return user


async def login_for_access_token(
    user_login: Annotated[OAuth2PasswordRequestForm, Depends()],
    supabase: SupabaseDep,
) -> Token:
    user = authenticate_user(user_login.username, user_login.password, supabase)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Abritrarily chosen, change time later as needed
    access_token_expires = timedelta(minutes=30)
    access_token = create_access_token(
        user_data={"sub": user["username"]}, expires_delta=access_token_expires
    )
    return Token(access_token=access_token, token_type="bearer")
