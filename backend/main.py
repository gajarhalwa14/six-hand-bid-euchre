from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import router

apps = FastAPI()

origins = [
    "http://localhost:8080",
    "http://localhost",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8080",
    "http://127.0.0.1",
    "https://six-hand-bid-euchre.onrender.com",
]

apps.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

apps.include_router(router)
