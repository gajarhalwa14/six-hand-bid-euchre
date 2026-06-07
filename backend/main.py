from fastapi import FastAPI
from app.routes import router

apps = FastAPI()

apps.include_router(router)
