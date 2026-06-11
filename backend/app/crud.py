from argon2 import PasswordHasher

ph = PasswordHasher()


def hash_password(plain_password: str) -> str:
    return ph.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return ph.verify(hash=hashed_password, password=plain_password)
    except Exception:
        return False
