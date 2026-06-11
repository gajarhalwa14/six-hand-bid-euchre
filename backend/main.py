from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import router

apps = FastAPI()

origins = [
    "http://localhost:8080",
    "http://localhost",
]

apps.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

apps.include_router(router)
