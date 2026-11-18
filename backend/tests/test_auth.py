"""Tests for passwords, tokens, the login limiter and the local account/garage storage."""
import json

from app import auth
from app.repository import LocalRepository


def test_password_hash_and_verify():
    h = auth.hash_password("correct horse")
    assert h.startswith("pbkdf2_sha256$310000$") and "correct horse" not in h
    assert auth.verify_password("correct horse", h)
    assert not auth.verify_password("wrong horse", h)
    assert not auth.verify_password("x", "garbage")


def test_same_password_gets_different_salt():
    assert auth.hash_password("samepassword") != auth.hash_password("samepassword")


def test_token_round_trip_and_tampering():
    t = auth.create_token("user-123")
    assert auth.read_token(t) == "user-123"
    body, sig = t.split(".")
    forged_body = auth._b64(json.dumps({"sub": "admin", "exp": 9_999_999_999}).encode())
    assert auth.read_token(f"{forged_body}.{sig}") is None        # changed payload, old signature
    assert auth.read_token(t[:-2] + "xx") is None
    assert auth.read_token("not-a-token") is None


def test_token_expires():
    t = auth.create_token("u", now=1_000_000)
    assert auth.read_token(t, now=1_000_000 + 60) == "u"
    assert auth.read_token(t, now=1_000_000 + auth.TOKEN_TTL + 1) is None


def test_token_signed_with_other_secret_is_rejected(monkeypatch):
    t = auth.create_token("u")
    monkeypatch.setenv("AUTH_SECRET", "a-different-secret")
    assert auth.read_token(t) is None


def test_validation():
    assert auth.validate_new_account("a@b.co", "longenough") is None
    assert auth.validate_new_account("not-an-email", "longenough")
    assert auth.validate_new_account("a@b.co", "short")


def test_login_limiter():
    lim = auth.LoginLimiter(max_failures=3, window=60)
    for _ in range(3):
        assert not lim.blocked("x@y.z", now=100)
        lim.failed("x@y.z", now=100)
    assert lim.blocked("x@y.z", now=110)
    assert not lim.blocked("x@y.z", now=200)        # window passed
    lim.failed("x@y.z", now=200)
    lim.succeeded("x@y.z")
    assert not lim.blocked("x@y.z", now=201)


def test_local_accounts_and_garage_persist(tmp_path):
    db = tmp_path / "db.json"
    repo = LocalRepository(db_file=db)
    user = repo.create_user("me@test.com", auth.hash_password("password1"))
    try:
        repo.create_user("me@test.com", "x")
        assert False, "duplicate email should fail"
    except ValueError:
        pass
    item = repo.add_garage(user["id"], {"vehicle_id": 1, "city": "Pune", "nickname": "Daily", "target_stage": 2, "notes": None})
    other = repo.create_user("other@test.com", "x")
    assert repo.delete_garage(other["id"], item["id"]) is False     # can't delete someone else's car

    again = LocalRepository(db_file=db)                              # survives a restart
    assert again.get_user_by_email("me@test.com")["id"] == user["id"]
    assert [g["nickname"] for g in again.list_garage(user["id"])] == ["Daily"]
    assert again.delete_garage(user["id"], item["id"]) is True
    assert again.list_garage(user["id"]) == []
