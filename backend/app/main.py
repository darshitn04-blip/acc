from __future__ import annotations

import json
import math
import os
import secrets
import uuid
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Float, Integer, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


class Category(str, Enum):
    pothole = "Pothole"
    waste = "Waste & sanitation"
    streetlight = "Streetlight"
    water = "Water leak"
    drainage = "Drainage & flooding"
    sidewalk = "Sidewalk & accessibility"
    other = "Other"


class Status(str, Enum):
    reported = "Reported"
    acknowledged = "Acknowledged"
    in_progress = "In progress"
    resolved = "Resolved"


DEPARTMENTS = {
    "Pothole": "Roads & transport", "Waste & sanitation": "Sanitation",
    "Streetlight": "Public works", "Water leak": "Water services",
    "Drainage & flooding": "Stormwater & drainage",
    "Sidewalk & accessibility": "Roads & accessibility", "Other": "Civic services",
}


class Base(DeclarativeBase):
    pass


class Complaint(Base):
    __tablename__ = "complaints"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reference: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(40), index=True)
    department: Mapped[str] = mapped_column(String(80))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    address: Mapped[str] = mapped_column(String(200), default="")
    photo_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default=Status.reported.value, index=True)
    duplicate_of: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./civicfix.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
Base.metadata.create_all(engine)

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="CivicFix API", version="1.0.0", description="Community-powered civic issue reporting")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "*").split(","), allow_methods=["*"], allow_headers=["*"])
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def categorize(title: str, description: str) -> str:
    """Use OpenAI when configured; otherwise provide a useful keyword-based fallback."""
    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:
        try:
            client = OpenAI(api_key=api_key)
            response = client.responses.create(
                model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
                instructions="Classify the civic issue into exactly one category and return only the category string. Allowed categories: " + ", ".join(c.value for c in Category) + ".",
                input=f"Title: {title}\nDescription: {description}",
            )
            choice = response.output_text.strip()
            return next((c.value for c in Category if c.value.lower() == choice.lower()), "Other")
        except Exception:
            pass
    text = f"{title} {description}".lower()
    keywords = {
        "Pothole": ("pothole", "road", "asphalt", "crater"), "Waste & sanitation": ("garbage", "trash", "waste", "bin", "dump"),
        "Streetlight": ("streetlight", "street light", "lamp", "dark", "lighting"), "Water leak": ("water leak", "pipe", "burst", "water main"),
        "Drainage & flooding": ("drain", "flood", "sewer", "standing water"), "Sidewalk & accessibility": ("sidewalk", "pavement", "curb", "wheelchair", "crosswalk"),
    }
    return next((category for category, words in keywords.items() if any(word in text for word in words)), "Other")


def distance_m(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    radius = 6_371_000
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = math.radians(b_lat - a_lat), math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(h))


def serialize(row: Complaint, base_url: str):
    return {
        "id": row.id, "reference": row.reference, "title": row.title, "description": row.description,
        "category": row.category, "department": row.department, "latitude": row.latitude, "longitude": row.longitude,
        "address": row.address, "photo_url": f"{base_url}/uploads/{row.photo_path}" if row.photo_path else None,
        "status": row.status, "duplicate_of": row.duplicate_of,
        "created_at": row.created_at.isoformat(), "updated_at": row.updated_at.isoformat(),
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/stats")
def stats(db: Session = Depends(get_db)):
    rows = db.scalars(select(Complaint)).all()
    return {"total": len(rows), "resolved": sum(r.status == Status.resolved.value for r in rows),
            "in_progress": sum(r.status in (Status.acknowledged.value, Status.in_progress.value) for r in rows),
            "open": sum(r.status == Status.reported.value for r in rows)}


@app.get("/api/complaints")
def list_complaints(category: Optional[str] = None, status: Optional[str] = None, db: Session = Depends(get_db)):
    query = select(Complaint).order_by(Complaint.created_at.desc())
    if category:
        query = query.where(Complaint.category == category)
    if status:
        query = query.where(Complaint.status == status)
    return [serialize(row, "") for row in db.scalars(query).all()]


@app.post("/api/complaints", status_code=201)
async def create_complaint(
    title: str = Form(..., min_length=5, max_length=100), description: str = Form(..., min_length=10, max_length=2000),
    latitude: float = Form(..., ge=-90, le=90), longitude: float = Form(..., ge=-180, le=180),
    address: str = Form("", max_length=200), photo: Optional[UploadFile] = File(None), db: Session = Depends(get_db),
):
    category = categorize(title, description)
    duplicate = None
    for existing in db.scalars(select(Complaint).where(Complaint.category == category, Complaint.status != Status.resolved.value)).all():
        if distance_m(latitude, longitude, existing.latitude, existing.longitude) <= 100:
            duplicate = existing
            break
    photo_name = None
    if photo and photo.filename:
        if not photo.content_type or not photo.content_type.startswith("image/"):
            raise HTTPException(400, "Photo must be an image.")
        content = await photo.read(5_000_001)
        if len(content) > 5_000_000:
            raise HTTPException(413, "Photo must be smaller than 5 MB.")
        suffix = Path(photo.filename).suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
            raise HTTPException(400, "Use a JPG, PNG or WebP photo.")
        photo_name = f"{uuid.uuid4().hex}{suffix}"
        (UPLOAD_DIR / photo_name).write_bytes(content)
    row = Complaint(reference=f"CF-{secrets.token_hex(3).upper()}", title=title.strip(), description=description.strip(),
                    category=category, department=DEPARTMENTS[category], latitude=latitude, longitude=longitude,
                    address=address.strip(), photo_path=photo_name, duplicate_of=duplicate.id if duplicate else None)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {**serialize(row, ""), "possible_duplicate": serialize(duplicate, "") if duplicate else None}


class StatusUpdate(BaseModel):
    status: Status
    note: str = Field(default="", max_length=500)


@app.patch("/api/complaints/{complaint_id}/status")
def update_status(complaint_id: int, payload: StatusUpdate, x_admin_key: str = Header(default=""), db: Session = Depends(get_db)):
    admin_key = os.getenv("ADMIN_API_KEY", "")
    if not admin_key or not secrets.compare_digest(x_admin_key, admin_key):
        raise HTTPException(401, "A valid staff key is required to update status.")
    row = db.get(Complaint, complaint_id)
    if not row:
        raise HTTPException(404, "Complaint not found.")
    row.status = payload.status.value
    row.updated_at = datetime.now(timezone.utc)
    if payload.note.strip():
        row.description = f"{row.description}\n\nStaff update: {payload.note.strip()}"
    db.commit()
    db.refresh(row)
    return serialize(row, "")


# In the hosted single-container deployment, serve the built React app from the
# API origin so the UI and API share a URL. Local Vite development stays separate.
FRONTEND_DIR = Path(os.getenv("FRONTEND_DIR", "/app/frontend-dist"))
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True, check_dir=False), name="frontend")
