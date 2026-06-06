from datetime import datetime, timedelta, timezone
from hashlib import sha256

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import Usuario

bearer = HTTPBearer()


def hash_password(password: str) -> str:
    return sha256(password.encode("utf-8")).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
    return hash_password(password) == password_hash


def create_token(user: Usuario) -> str:
    payload = {
        "sub": str(user.id),
        "tenant_id": user.tenant_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=8),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer), db: Session = Depends(get_db)) -> Usuario:
    try:
      payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
      user_id = int(payload["sub"])
    except Exception as exc:
      raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    user = db.get(Usuario, user_id)
    if not user:
      raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
