from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr
from app.models.user import UserRole


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.technician
    is_active: bool = True
    customer_id: Optional[int] = None
    is_contact_person: bool = False
    job_title: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None
    customer_id: Optional[int] = None
    is_contact_person: Optional[bool] = None
    job_title: Optional[str] = None
    signature_b64: Optional[str] = None


class UserOut(UserBase):
    id: int
    job_title: Optional[str] = None
    signature_b64: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut


class TokenData(BaseModel):
    user_id: Optional[int] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
