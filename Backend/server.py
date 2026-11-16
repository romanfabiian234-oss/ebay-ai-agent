#!/usr/bin/env python3
"""eBay Filler V8.23.21 secure localhost backend for eBay OAuth, OpenAI, Claude, and local OCR.

Security model:
- binds only to 127.0.0.1:8790;
- eBay Client Secret, OAuth tokens, and the AI API key stay in macOS Keychain or process memory;
- Chrome reaches the backend only through a fixed-ID Native Messaging host;
- an internal device-only Keychain credential protects native host -> loopback Backend;
- never exposes secrets to the Chrome extension;
- never creates, updates, deletes, or publishes eBay listings.
"""
from __future__ import annotations

import argparse
import base64
import binascii
import ctypes
import concurrent.futures
import getpass
import hashlib
import hmac
import html
import ipaddress
import json
import os
import re
import secrets
import socket
import ssl
import subprocess
import sys
import threading
import tempfile
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import unicodedata
from pathlib import Path
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    from keychain import DataProtectionKeychain, KeychainError as DataProtectionKeychainError
except Exception:  # Imported only on macOS runtime; syntax tests run cross-platform.
    DataProtectionKeychain = None
    DataProtectionKeychainError = RuntimeError



#region VERSION, NETWORK LIMITS, AND ROUTES
# These constants are the single source of truth for backend identity and paths.
def _load_app_version():
    manifest_path = Path(__file__).resolve().parent.parent / "Extension" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    version = manifest["version"]
    if not isinstance(version, str) or not re.fullmatch(r"[0-9]+(?:\.[0-9]+){0,3}", version):
        raise ValueError("Invalid extension version in manifest.json")
    if manifest.get("version_name", version) != version:
        raise ValueError("Extension version and version_name must match")
    return version


APP_VERSION = _load_app_version()
APP_DISPLAY_VERSION = f"V{APP_VERSION}"
APP_SERVER_VERSION = APP_VERSION

HOST = "127.0.0.1"
PORT = 8790
CALLBACK_PATH = "/ebay/oauth/callback"
CALLBACK_URL = f"http://{HOST}:{PORT}{CALLBACK_PATH}"
PROTOCOL_VERSION = "6.9.0"
SUPPORTED_PROTOCOL_VERSIONS = frozenset({"6.3.6", "6.3.7", "6.3.8", "6.3.9", "6.4.0", "6.4.2", "6.4.3", "6.4.4", "6.4.5", "6.4.6", "6.5.0", "6.6.0", "6.8.0", PROTOCOL_VERSION})
STATE_TTL_SECONDS = 10 * 60
UPSTREAM_TIMEOUT_SECONDS = 20
MAX_UPSTREAM_BYTES = 256 * 1024
MAX_LOCAL_BODY_BYTES = 8 * 1024
MAX_AI_LOCAL_BODY_BYTES = 64 * 1024 * 1024
MAX_REVIEW_LOCAL_BODY_BYTES = 1024 * 1024
MAX_AI_UPSTREAM_BYTES = 2 * 1024 * 1024
AI_UPSTREAM_TIMEOUT_SECONDS = 120
AI_UPSTREAM_MIN_TIMEOUT_SECONDS = 30
OCR_MAX_IMAGES = 12
OCR_MAX_IMAGE_BYTES = 12 * 1024 * 1024
OCR_PROCESS_TIMEOUT_SECONDS = 60
OCR_ALLOWED_MEDIA_TYPES = frozenset({"image/jpeg", "image/jpg", "image/png", "image/webp"})
OCR_HELPER_PATH = Path(__file__).with_name("ocr.js")
OCR_HELPER_VERSION = "8.23.21"
OCR_SIPS_PATH = Path("/usr/bin/sips")
OCR_PREPROCESS_HELPER_PATH = Path(__file__).with_name("image_preprocess.js")
OCR_PREPROCESS_MAX_SIDE = 2400
OCR_CACHE_TTL_SECONDS = 6 * 60 * 60
OCR_CACHE_MAX_ITEMS = 128
OCR_CACHE_LOCK = threading.Lock()
OCR_RESULT_CACHE: dict[str, dict] = {}

MISSING_VALUE = "<missing>"
NOT_RECEIVED_VALUE = "<not received>"
REDACTED_VALUE = "[REDACTED]"
HTTP_STATUS_LABEL = "HTTP status"
URLLIB_EXCEPTION_LABEL = "complete urllib exception"
JSON_MEDIA_TYPE = "application/json"
JSON_CONTENT_TYPE = f"{JSON_MEDIA_TYPE}; charset=utf-8"
AUTHORIZATION_FAILED_TITLE = "Authorization failed"

EBAY_RESULT_ROUTE = "/ebay/oauth/result"
EBAY_STATUS_ROUTE = "/v1/ebay/status"
EBAY_PROFILE_ROUTE = "/v1/ebay/profile"
EBAY_ACCOUNT_ROUTE = "/v1/ebay/account"
EBAY_OAUTH_START_ROUTE = "/v1/ebay/oauth/start"
EBAY_OAUTH_COMPLETE_ROUTE = "/v1/ebay/oauth/complete"
EBAY_CREDENTIALS_ROUTE = "/v1/ebay/credentials"
EBAY_DISCONNECT_ROUTE = "/v1/ebay/disconnect"
EBAY_REMOVE_CREDENTIALS_ROUTE = "/v1/ebay/remove-credentials"
AI_STATUS_ROUTE = "/v1/ai/status"
AI_KEY_ROUTE = "/v1/ai/key"
AI_REMOVE_KEY_ROUTE = "/v1/ai/remove-key"
AI_PROXY_ROUTE = "/v1/ai/proxy"
SETUP_STATUS_ROUTE = "/v1/setup/status"
SETUP_PROFILE_ROUTE = "/v1/setup/profile"
CLAUDE_STATUS_ROUTE = "/v1/claude/status"
CLAUDE_KEY_ROUTE = "/v1/claude/key"
CLAUDE_REMOVE_KEY_ROUTE = "/v1/claude/remove-key"
CLAUDE_PROXY_ROUTE = "/v1/claude/proxy"
OCR_STATUS_ROUTE = "/v1/ocr/status"
OCR_ANALYZE_ROUTE = "/v1/ocr/analyze"
REVIEW_STATUS_ROUTE = "/v1/review/status"
REVIEW_SELECT_FOLDER_ROUTE = "/v1/review/folder/select"
REVIEW_SELECT_DATABASE_ROUTE = "/v1/review/database/select"  # Beta 66 compatibility
REVIEW_SAVE_ITEM_ROUTE = "/v1/review/item/save"
REVIEW_GET_ITEM_ROUTE = "/v1/review/item/get"
REVIEW_LIST_ITEMS_ROUTE = "/v1/review/item/list"
REVIEW_UPDATE_FIELD_ROUTE = "/v1/review/item/update-field"

LOCAL_SETUP_ROUTES = frozenset({
    EBAY_PROFILE_ROUTE,
    EBAY_CREDENTIALS_ROUTE,
    EBAY_REMOVE_CREDENTIALS_ROUTE,
    EBAY_OAUTH_COMPLETE_ROUTE,
    AI_KEY_ROUTE,
    AI_REMOVE_KEY_ROUTE,
    SETUP_PROFILE_ROUTE,
    CLAUDE_KEY_ROUTE,
    CLAUDE_REMOVE_KEY_ROUTE,
    REVIEW_SELECT_FOLDER_ROUTE,
    REVIEW_SELECT_DATABASE_ROUTE,
})

READ_ONLY_SCOPES = (
    "https://api.ebay.com/oauth/api_scope",
    "https://api.ebay.com/oauth/api_scope/sell.account.readonly",
)
SELL_ACCOUNT_READONLY_SCOPE = "https://api.ebay.com/oauth/api_scope/sell.account.readonly"
READ_ONLY_SCOPE_ALLOWLIST = frozenset(READ_ONLY_SCOPES)

ENVIRONMENTS = {
    "sandbox": {
        "authorization_url": "https://auth.sandbox.ebay.com/oauth2/authorize",
        "token_url": "https://api.sandbox.ebay.com/identity/v1/oauth2/token",
        "privileges_url": "https://api.sandbox.ebay.com/sell/account/v1/privilege",
    },
    "production": {
        "authorization_url": "https://auth.ebay.com/oauth2/authorize",
        "token_url": "https://api.ebay.com/identity/v1/oauth2/token",
        "privileges_url": "https://api.ebay.com/sell/account/v1/privilege",
    },
}
#endregion


#region MACOS KEYCHAIN AND PERSISTENT PROFILE
# Secrets stay in Keychain. Only non-secret profile values are written to JSON.
APP_SUPPORT_DIR = Path.home() / "Library" / "Application Support" / "eBay AI Listing Filler"
PROFILE_PATH = APP_SUPPORT_DIR / "ebay-api-profile.json"
PAIRING_FALLBACK_PATH = APP_SUPPORT_DIR / ".local-pairing-secret"
KEYCHAIN_SERVICE = "com.fabiian.ebay-listing-filler.oauth"
KEYCHAIN_PAIRING_ACCOUNT = "native-backend-credential"
AI_KEYCHAIN_SERVICE = "com.fabiian.ebay-listing-filler.ai"
AI_KEYCHAIN_ACCOUNT = "universal-api-key"
CLAUDE_KEYCHAIN_SERVICE = "com.fabiian.ebay-listing-filler.claude"
CLAUDE_KEYCHAIN_ACCOUNT = "anthropic-api-key"
ANTHROPIC_MESSAGES_ENDPOINT = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
PROFILE_SCHEMA_VERSION = 1
SETUP_PROFILE_SCHEMA_VERSION = 1
SETUP_PROFILE_PATH = APP_SUPPORT_DIR / "agent-setup-profile.json"
SETUP_COMPLETE_PATH = APP_SUPPORT_DIR / ".setup-complete"
DEFAULT_AGENT_SETTINGS = {
    "workflowMode": "hybrid",
    "apiPreset": "openai-quality",
    "apiEnabled": True,
    "apiMode": "openai-compatible",
    "apiBaseUrl": "https://api.openai.com",
    "apiPath": "/v1/responses",
    "apiModel": "gpt-5.6",
    "authHeader": "Authorization",
    "authPrefix": "Bearer",
    "customHeaders": "",
    "saveApiKey": True,
    "claudeReviewEnabled": False,
    "claudeModel": "claude-sonnet-5",
    "claudeMaxFields": "6",
    "claudeMaxOutputTokens": "3000",
    "claudeTimeoutMs": "45000",
    "reviewFillMode": "safe",
    "themeMode": "light",
    "panelSizeMode": "auto",
    "panelCustomWidth": "460",
    "panelCustomHeight": "680",
    "imageMaxSide": "1280",
    "exactOnly": True,
    "autoReadEbayPhotos": False,
    "webResearchEnabled": False,
    "autoFillDescriptionCondition": False,
    "customAiInstruction": "",
    "tokenMode": "balanced",
    "maxPhotosPerRequest": "5",
    "maxOutputTokens": "8000",
    "imageQuality": "0.82",
    "cacheEnabled": True,
    "smartPhotoSelection": True,
    "warnItemCost": "0.10",
    "dailyBudget": "1.00",
    "monthlyBudget": "20.00",
    "inputCostPer1M": "5.00",
    "outputCostPer1M": "30.00",
}
SETUP_BOOLEAN_FIELDS = frozenset({
    "apiEnabled", "saveApiKey", "claudeReviewEnabled", "exactOnly",
    "autoReadEbayPhotos", "webResearchEnabled", "autoFillDescriptionCondition",
    "cacheEnabled", "smartPhotoSelection",
})
SETUP_ENUM_FIELDS = {
    "workflowMode": frozenset({"ai", "text", "hybrid"}),
    "apiPreset": frozenset({"custom", "openai-quality", "openai-cheap", "openrouter", "local-proxy"}),
    "apiMode": frozenset({"off", "openai-compatible", "local-proxy"}),
    "reviewFillMode": frozenset({"safe", "review_assisted", "confirmed_only", "complete_coverage"}),
    "themeMode": frozenset({"light", "dark", "auto"}),
    "panelSizeMode": frozenset({"auto", "compact", "medium", "large", "custom"}),
    "tokenMode": frozenset({"cheap", "balanced", "quality"}),
}
SETUP_TEXT_LIMITS = {
    "apiBaseUrl": 500, "apiPath": 500, "apiModel": 200,
    "authHeader": 128, "authPrefix": 128, "customHeaders": 4096,
    "claudeModel": 200, "claudeMaxFields": 20, "claudeMaxOutputTokens": 20,
    "claudeTimeoutMs": 20, "panelCustomWidth": 20, "panelCustomHeight": 20, "imageMaxSide": 20, "customAiInstruction": 4000,
    "maxPhotosPerRequest": 20, "maxOutputTokens": 20, "imageQuality": 20,
    "warnItemCost": 40, "dailyBudget": 40, "monthlyBudget": 40,
    "inputCostPer1M": 40, "outputCostPer1M": 40,
}
DEFAULT_PROFILE = {
    "schemaVersion": PROFILE_SCHEMA_VERSION,
    "environment": "production",
    "clientId": "",
    "runame": "",
    "scopes": list(READ_ONLY_SCOPES),
}

# Local Review Assistant stores only listing review metadata. The user selects a
# folder, and each listing is stored as one independent JSON file. Secrets and
# eBay credentials are never written to Review files.
REVIEW_PROFILE_PATH = APP_SUPPORT_DIR / "review-folder-profile.json"
LEGACY_REVIEW_PROFILE_PATH = APP_SUPPORT_DIR / "review-database-profile.json"
DEFAULT_REVIEW_STORAGE_FOLDER = APP_SUPPORT_DIR / "Review Listings"
REVIEW_STORAGE_SCHEMA_VERSION = 3
REVIEW_STATUS_VALUES = frozenset({
    "confirmed_by_tag", "confirmed_by_photo", "supported_by_two_models", "likely_correct", "suggested",
    "needs_review", "conflict", "user_confirmed", "user_corrected", "cleared_by_user", "not_filled"
})
REVIEW_HUMAN_STATUSES = frozenset({"user_confirmed", "user_corrected", "cleared_by_user"})
REVIEW_DB_LOCK = threading.RLock()


def review_clean(value, limit=1000):
    text = str(value or "").replace("\x00", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text[: max(0, int(limit))]


def review_int(value, default=0, minimum=None, maximum=None):
    """Parse untrusted Review JSON integers without letting malformed files crash the backend."""
    try:
        parsed = int(value)
    except (TypeError, ValueError, OverflowError):
        parsed = int(default)
    if minimum is not None:
        parsed = max(int(minimum), parsed)
    if maximum is not None:
        parsed = min(int(maximum), parsed)
    return parsed


def review_list(value, maximum=200):
    return value[:maximum] if isinstance(value, list) else []


def review_string_list(value, limit=100, item_limit=180):
    result = []
    for item in review_list(value, limit):
        cleaned = review_clean(item, item_limit)
        if cleaned and cleaned not in result:
            result.append(cleaned)
    return result


def review_normalized_key(value):
    return re.sub(r"[^a-z0-9]+", " ", review_clean(value, 300).lower()).strip()


def review_field_id(*, marketplace="EBAY_US", category_id="unknown", dom_key="", label=""):
    normalized_dom = review_clean(dom_key, 240).lower().replace(" ", "")
    if not normalized_dom:
        normalized_dom = "label:" + review_normalized_key(label).replace(" ", "_")
    basis = f"{review_clean(marketplace, 40).upper() or 'EBAY_US'}|{review_clean(category_id, 40) or 'unknown'}|{normalized_dom}"
    return "aspect:v3:" + hashlib.sha256(basis.encode("utf-8")).hexdigest()[:20]


def review_storage_folder() -> Path:
    """Return the selected Review folder, accepting the Beta 66 profile once."""
    for profile in (REVIEW_PROFILE_PATH, LEGACY_REVIEW_PROFILE_PATH):
        try:
            data = json.loads(profile.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                continue
            raw = review_clean(data.get("folder") or data.get("path"), 4096)
            if not raw:
                continue
            candidate = Path(raw).expanduser()
            if candidate.suffix.lower() in {".sqlite", ".sqlite3", ".db"}:
                return candidate.parent
            return candidate
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            continue
    return DEFAULT_REVIEW_STORAGE_FOLDER


def save_review_storage_folder(folder: Path) -> None:
    APP_SUPPORT_DIR.mkdir(parents=True, exist_ok=True)
    REVIEW_PROFILE_PATH.write_text(json.dumps({
        "schemaVersion": REVIEW_STORAGE_SCHEMA_VERSION,
        "folder": str(folder),
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }, indent=2), encoding="utf-8")
    try:
        os.chmod(REVIEW_PROFILE_PATH, 0o600)
    except OSError:
        pass


def initialize_review_storage(folder: Path | None = None) -> Path:
    selected = (folder or review_storage_folder()).expanduser()
    if selected.exists() and not selected.is_dir():
        raise RuntimeError("Review storage must be a folder, not a file.")
    selected.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(selected, 0o700)
    except OSError:
        pass
    return selected


def review_item_key(payload: dict) -> str:
    explicit = review_clean(payload.get("itemKey"), 300)
    if explicit:
        return explicit
    draft_id = review_clean(payload.get("draftId"), 180)
    if draft_id:
        return f"draft:{draft_id}"
    listing_id = review_clean(payload.get("listingId"), 180)
    if listing_id:
        return f"listing:{listing_id}"
    stable = "|".join([
        review_clean(payload.get("url"), 2000),
        review_clean(payload.get("title"), 500),
        review_clean(payload.get("category"), 500),
    ])
    return "item:" + hashlib.sha256(stable.encode("utf-8")).hexdigest()[:32]


def review_safe_identifier(value: str, fallback: str = "item") -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", review_clean(value, 220)).strip("-._")
    return (safe or fallback)[:180]


def review_item_filename(payload: dict) -> str:
    item_key = review_item_key(payload)
    kind, separator, raw = item_key.partition(":")
    if kind not in {"draft", "listing", "item"} or not separator:
        kind = "item"
        raw = hashlib.sha256(item_key.encode("utf-8")).hexdigest()[:32]
    fallback = hashlib.sha256(item_key.encode("utf-8")).hexdigest()[:32]
    return f"{kind}-{review_safe_identifier(raw, fallback)}.json"


def review_item_file_path(payload: dict, folder: Path | None = None) -> Path:
    return initialize_review_storage(folder) / review_item_filename(payload)


def review_read_raw_item_file(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Saved Review item is corrupted: {path.name}") from error
    if not isinstance(data, dict):
        raise RuntimeError(f"Saved Review item is corrupted: {path.name}")
    return data


def review_migrate_v2_to_v3(data: dict) -> dict:
    """Migrate in memory only. The original file is not touched until a later save."""
    if not isinstance(data, dict):
        return data
    version = review_int(data.get("schemaVersion") or data.get("reviewFileSchemaVersion"), 0, 0, 100)
    if version >= 3:
        return data
    category_id = review_clean(data.get("categoryId"), 40) or "unknown"
    marketplace = review_clean(data.get("marketplaceId"), 40) or "EBAY_US"
    migrated_answers = []
    for old in review_list(data.get("answers"), 200):
        if not isinstance(old, dict):
            continue
        label = review_clean(old.get("field") or old.get("label"), 120)
        field_key = review_clean(old.get("fieldKey"), 160) or review_normalized_key(label)
        sources = []
        for source in review_list(old.get("sources"), 8):
            if not isinstance(source, dict):
                continue
            try:
                display_number = review_int(source.get("photo"), 0, 0, 100)
            except (TypeError, ValueError):
                display_number = 0
            sources.append({
                "photoId": f"legacy-position:{display_number}" if display_number else "",
                "photo": display_number,
                "type": review_clean(source.get("type") or old.get("sourceType"), 60),
                "evidence": review_clean(source.get("evidence"), 800),
                "scope": "unknown",
                "provider": "openai",
            })
        migrated_answers.append({
            **old,
            "field": label,
            "fieldKey": field_key,
            "fieldId": review_field_id(marketplace=marketplace, category_id=category_id, label=field_key),
            "fieldKeySource": "migrated_label",
            "domKey": "",
            "previousFieldId": "",
            "orphaned": False,
            "modelStatus": "needs_review" if old.get("status") in {"needs_review", "conflict", "not_filled"} else "confirmed",
            "rawValue": review_clean(old.get("aiValue"), 500),
            "evidenceScope": "unknown",
            "reviewReason": "none" if old.get("status") not in {"needs_review", "conflict", "not_filled"} else "no_evidence",
            "missingPhotoRole": "none",
            "sources": sources,
            "validationIssues": [],
        })
    migrated = dict(data)
    migrated.update({
        "schemaVersion": 3,
        "reviewFileSchemaVersion": 3,
        "aiResponseSchemaVersion": review_int(data.get("aiResponseSchemaVersion"), 2, 2, 100),
        "fileRevision": review_int(data.get("fileRevision"), 1, 1),
        "analysisRunId": review_clean(data.get("analysisRunId"), 120),
        "marketplaceId": marketplace,
        "categoryId": category_id,
        "fieldCatalog": [],
        "photoCatalog": [],
        "validationIssues": review_string_list(data.get("validationIssues"), 100, 100),
        "answers": migrated_answers,
        "migratedFromSchemaVersion": max(version, 2),
    })
    return migrated


def review_read_item_file(path: Path) -> dict:
    return review_migrate_v2_to_v3(review_read_raw_item_file(path))


def review_write_item_file(path: Path, item: dict) -> None:
    """Atomic replacement prevents a partially written listing file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    encoded = json.dumps(item, ensure_ascii=False, indent=2) + "\n"
    try:
        with temporary.open("w", encoding="utf-8") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
    finally:
        try:
            if temporary.exists():
                temporary.unlink()
        except OSError:
            pass


def review_backup_v2_once(path: Path, raw_item: dict) -> Path | None:
    version = review_int(raw_item.get("schemaVersion") or raw_item.get("reviewFileSchemaVersion"), 0, 0, 100)
    if version >= 3:
        return None
    backup = path.with_name(path.stem + ".v2.backup.json")
    if backup.exists():
        return backup
    temporary = backup.with_name(f".{backup.name}.{os.getpid()}.tmp")
    encoded = json.dumps(raw_item, ensure_ascii=False, indent=2) + "\n"
    try:
        with temporary.open("w", encoding="utf-8") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, backup)
        try:
            os.chmod(backup, 0o600)
        except OSError:
            pass
    finally:
        try:
            if temporary.exists():
                temporary.unlink()
        except OSError:
            pass
    return backup


def review_iter_item_files(folder: Path | None = None):
    root = initialize_review_storage(folder)
    for path in root.glob("*.json"):
        if path.is_file() and not path.name.startswith(".") and ".backup." not in path.name:
            yield path


def sanitize_review_source(source: dict) -> dict:
    item = source if isinstance(source, dict) else {}
    try:
        photo = review_int(item.get("photo") or item.get("displayNumber"), 0, 0, 100)
    except (TypeError, ValueError):
        photo = 0
    return {
        "photoId": review_clean(item.get("photoId") or item.get("photo_id"), 180),
        "photo": photo,
        "type": review_clean(item.get("type") or item.get("sourceType"), 60),
        "scope": review_clean(item.get("scope") or item.get("evidenceScope"), 60),
        "provider": review_clean(item.get("provider"), 40),
        "evidence": review_clean(item.get("evidence"), 800),
    }


def sanitize_review_model_result(value: dict) -> dict:
    item = value if isinstance(value, dict) else {}
    try:
        confidence = max(0.0, min(float(item.get("confidence") or 0), 1.0))
    except (TypeError, ValueError):
        confidence = 0.0
    return {
        "provider": review_clean(item.get("provider"), 40),
        "modelStatus": review_clean(item.get("modelStatus") or item.get("model_status"), 40),
        "value": review_clean(item.get("value"), 500),
        "rawValue": review_clean(item.get("rawValue") or item.get("raw_value"), 500),
        "candidateValues": review_string_list(item.get("candidateValues") or item.get("candidate_values"), 30, 160),
        "confidence": confidence,
        "evidenceType": review_clean(item.get("evidenceType") or item.get("evidence_type"), 60),
        "evidenceScope": review_clean(item.get("evidenceScope") or item.get("evidence_scope"), 60),
        "evidence": review_clean(item.get("evidence"), 160),
        "reviewReason": review_clean(item.get("reviewReason") or item.get("review_reason"), 80),
        "missingPhotoRole": review_clean(item.get("missingPhotoRole") or item.get("missing_photo_role"), 80),
        "photoSources": review_string_list(item.get("photoSources") or item.get("photo_sources"), 8, 180),
        "status": review_clean(item.get("status"), 60),
    }


def sanitize_review_answer(value: dict, fallback_label="") -> dict:
    item = value if isinstance(value, dict) else {}
    label = review_clean(item.get("field") or item.get("label") or fallback_label, 120)
    status = review_clean(item.get("status") or ((item.get("final") or {}).get("status") if isinstance(item.get("final"), dict) else ""), 40)
    if status not in REVIEW_STATUS_VALUES:
        status = "needs_review" if review_clean(item.get("aiValue") or item.get("proposedValue"), 500) else "not_filled"
    sources = [sanitize_review_source(source) for source in review_list(item.get("sources"), 8) if isinstance(source, dict)]
    sources = [source for source in sources if source.get("photoId") or source.get("photo") or source.get("evidence")]
    history = []
    for event in review_list(item.get("history"), 50)[-50:]:
        if isinstance(event, dict):
            history.append({
                "at": review_clean(event.get("at"), 80),
                "type": review_clean(event.get("type"), 60),
                "from": review_clean(event.get("from"), 500),
                "to": review_clean(event.get("to"), 500),
            })
    try:
        confidence = max(0.0, min(float(item.get("confidence") or 0), 1.0))
    except (TypeError, ValueError):
        confidence = 0.0
    field_key = review_clean(item.get("fieldKey"), 160) or review_normalized_key(label)
    field_id = review_clean(item.get("fieldId") or item.get("field_id"), 180)
    return {
        "field": label,
        "fieldKey": field_key,
        "fieldId": field_id,
        "previousFieldId": review_clean(item.get("previousFieldId"), 180),
        "fieldKeySource": review_clean(item.get("fieldKeySource"), 60),
        "domKey": review_clean(item.get("domKey"), 240),
        "taxonomyName": review_clean(item.get("taxonomyName"), 160),
        "orphaned": bool(item.get("orphaned")),
        "aiValue": review_clean(item.get("aiValue") or item.get("proposedValue"), 500),
        "primaryValue": review_clean(item.get("primaryValue"), 500),
        "reviewerValue": review_clean(item.get("reviewerValue"), 500),
        "filledValue": review_clean(item.get("filledValue"), 500),
        "currentValue": review_clean(item.get("currentValue"), 500),
        "status": status,
        "modelStatus": review_clean(item.get("modelStatus") or item.get("model_status"), 40),
        "confidence": confidence,
        "sourceType": review_clean(item.get("sourceType") or item.get("evidenceType"), 60),
        "evidenceScope": review_clean(item.get("evidenceScope"), 60),
        "rawValue": review_clean(item.get("rawValue"), 500),
        "reason": review_clean(item.get("reason"), 800),
        "reviewReason": review_clean(item.get("reviewReason"), 80),
        "missingPhotoRole": review_clean(item.get("missingPhotoRole"), 80),
        "sources": sources,
        "validationIssues": review_string_list(item.get("validationIssues"), 50, 100),
        "primary": sanitize_review_model_result(item.get("primary")) if isinstance(item.get("primary"), dict) else {},
        "reviewer": sanitize_review_model_result(item.get("reviewer")) if isinstance(item.get("reviewer"), dict) else {},
        "changedFrom": review_clean(item.get("changedFrom"), 500),
        "changedTo": review_clean(item.get("changedTo"), 500),
        "history": history,
        "updatedAt": review_clean(item.get("updatedAt"), 80),
    }


def sanitize_field_catalog(value, *, marketplace="EBAY_US", category_id="unknown"):
    result = []
    for raw in review_list(value, 250):
        if not isinstance(raw, dict):
            continue
        label = review_clean(raw.get("field") or raw.get("name") or raw.get("label"), 120)
        dom_key = review_clean(raw.get("domKey") or raw.get("dom_key") or ((raw.get("locator") or {}).get("name") if isinstance(raw.get("locator"), dict) else ""), 240)
        field_id = review_clean(raw.get("fieldId") or raw.get("field_id"), 180) or review_field_id(marketplace=marketplace, category_id=category_id, dom_key=dom_key, label=label)
        result.append({
            "fieldId": field_id,
            "field": label,
            "domKey": dom_key,
            "fieldKeySource": review_clean(raw.get("fieldKeySource") or raw.get("field_key_source"), 60) or ("dom_control_name" if dom_key else "label_fallback"),
            "taxonomyName": review_clean(raw.get("taxonomyName") or raw.get("taxonomy_name"), 160) or label,
            "type": review_clean(raw.get("type") or raw.get("controlType"), 40),
            "selectionMode": review_clean(raw.get("selectionMode") or raw.get("selection_mode"), 40),
            "required": bool(raw.get("required")),
            "customValueAllowed": bool(raw.get("customValueAllowed") or raw.get("custom_value_allowed")),
            "allowedValues": review_string_list(raw.get("allowedValues") or raw.get("options"), 250, 160),
            "currentValues": review_string_list(raw.get("currentValues"), 50, 500),
            "order": int(raw.get("order") or 0) if str(raw.get("order") or "0").lstrip("-").isdigit() else 0,
        })
    return result


def sanitize_photo_catalog(value):
    result = []
    for raw in review_list(value, 30):
        if not isinstance(raw, dict):
            continue
        photo_id = review_clean(raw.get("photoId") or raw.get("photo_id"), 180)
        if not photo_id:
            continue
        try:
            number = review_int(raw.get("displayNumber") or raw.get("display_number") or raw.get("requestPhotoNumber"), 0, 0, 100)
        except (TypeError, ValueError):
            number = 0
        result.append({
            "photoId": photo_id,
            "displayNumber": number,
            "roleHint": review_clean(raw.get("roleHint") or raw.get("role_hint") or raw.get("photoCategory"), 80),
            "canonicalUrl": review_clean(raw.get("canonicalUrl"), 4000),
            "fingerprintSource": review_clean(raw.get("fingerprintSource"), 60) or "canonical_url",
        })
    return result


def sanitize_review_item(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise RuntimeError("Review item must be a JSON object.")
    marketplace = review_clean(payload.get("marketplaceId"), 40) or "EBAY_US"
    category_id = review_clean(payload.get("categoryId"), 40) or "unknown"
    answers_in = payload.get("answers")
    if isinstance(answers_in, list):
        answers = [sanitize_review_answer(item) for item in answers_in[:250] if isinstance(item, dict)]
    elif isinstance(answers_in, dict):
        answers = [sanitize_review_answer(value if isinstance(value, dict) else {"aiValue": value}, str(label)) for label, value in list(answers_in.items())[:250]]
    else:
        answers = []
    answers = [item for item in answers if item.get("field")]
    catalog = sanitize_field_catalog(payload.get("fieldCatalog"), marketplace=marketplace, category_id=category_id)
    catalog_by_key = {review_normalized_key(item.get("field")): item for item in catalog}
    for answer in answers:
        if not answer.get("fieldId"):
            catalog_item = catalog_by_key.get(review_normalized_key(answer.get("field"))) or {}
            answer["fieldId"] = review_clean(catalog_item.get("fieldId"), 180) or review_field_id(marketplace=marketplace, category_id=category_id, dom_key=answer.get("domKey"), label=answer.get("fieldKey") or answer.get("field"))
            answer["fieldKeySource"] = answer.get("fieldKeySource") or ("dom_control_name" if answer.get("domKey") else "label_fallback")
    statuses = [item["status"] for item in answers]
    if "conflict" in statuses:
        overall = "conflict"
    elif any(status in {"needs_review", "suggested", "likely_correct", "supported_by_two_models", "not_filled", "cleared_by_user"} for status in statuses):
        overall = "needs_review"
    else:
        overall = "review_complete"
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    revision = review_int(payload.get("fileRevision"), 1, 1)
    reviewer = payload.get("reviewer") if isinstance(payload.get("reviewer"), dict) else {}
    usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
    return {
        "schemaVersion": 3,
        "reviewFileSchemaVersion": 3,
        "aiResponseSchemaVersion": review_int(payload.get("aiResponseSchemaVersion") or payload.get("ai_response_schema_version"), 3, 2, 100),
        "fileRevision": revision,
        "analysisRunId": review_clean(payload.get("analysisRunId"), 120),
        "itemKey": review_item_key(payload),
        "draftId": review_clean(payload.get("draftId"), 180),
        "listingId": review_clean(payload.get("listingId"), 180),
        "title": review_clean(payload.get("title"), 500),
        "category": review_clean(payload.get("category"), 500),
        "categoryId": category_id,
        "marketplaceId": marketplace,
        "url": review_clean(payload.get("url"), 2000),
        "extensionVersion": review_clean(payload.get("extensionVersion"), 80) or APP_DISPLAY_VERSION,
        "reviewStatus": review_clean(payload.get("reviewStatus"), 60) or overall,
        "fillPolicy": review_clean(payload.get("fillPolicy"), 40) or "safe",
        "primaryProvider": review_clean(payload.get("primaryProvider"), 40) or "openai",
        "reviewer": {
            "provider": review_clean(reviewer.get("provider"), 40) or "anthropic",
            "model": review_clean(reviewer.get("model"), 120),
            "enabled": bool(reviewer.get("enabled")),
            "used": bool(reviewer.get("used")),
            "status": review_clean(reviewer.get("status"), 60),
            "error": review_clean(reviewer.get("error"), 500),
            "questions": review_string_list(reviewer.get("questions"), 12, 120),
        },
        "fieldCatalog": catalog,
        "photoCatalog": sanitize_photo_catalog(payload.get("photoCatalog")),
        "answers": answers,
        "validationIssues": review_string_list(payload.get("validationIssues"), 100, 100),
        "usage": {
            "inputTokens": max(0, int(usage.get("inputTokens") or 0)) if str(usage.get("inputTokens") or "0").isdigit() else 0,
            "outputTokens": max(0, int(usage.get("outputTokens") or 0)) if str(usage.get("outputTokens") or "0").isdigit() else 0,
            "totalTokens": max(0, int(usage.get("totalTokens") or 0)) if str(usage.get("totalTokens") or "0").isdigit() else 0,
            "cost": max(0.0, float(usage.get("cost") or 0)) if str(usage.get("cost") or "0").replace(".", "", 1).isdigit() else 0.0,
        },
        "createdAt": review_clean(payload.get("createdAt"), 80) or now,
        "updatedAt": now,
    }


def review_database_status() -> dict:
    folder = initialize_review_storage()
    item_count = needs_review = 0
    for path in review_iter_item_files(folder):
        try:
            item = review_read_item_file(path)
        except RuntimeError:
            continue
        item_count += 1
        if review_clean(item.get("reviewStatus"), 60) != "review_complete":
            needs_review += 1
    return {"ok": True, "path": str(folder), "folder": str(folder), "exists": folder.exists(), "itemCount": item_count, "needsReview": needs_review, "storageType": "one_json_file_per_listing", "schemaVersion": 3}


def choose_review_database(payload: dict) -> dict:
    if sys.platform != "darwin":
        raise RuntimeError("Native Review folder selection is available on macOS only.")
    script = 'POSIX path of (choose folder with prompt "Choose eBay Review Folder")'
    result = subprocess.run(["/usr/bin/osascript", "-e", script], capture_output=True, text=True, timeout=120, check=False)
    if result.returncode != 0:
        message = review_clean(result.stderr, 500)
        if "User canceled" in message or "-128" in message:
            return {"ok": False, "cancelled": True, "message": "Folder selection cancelled."}
        raise RuntimeError("Could not open the native Review folder picker.")
    folder = initialize_review_storage(Path(review_clean(result.stdout, 4096)).expanduser())
    save_review_storage_folder(folder)
    status = review_database_status()
    status["message"] = "Review folder selected. Each listing will use one JSON file."
    return status


def merge_review_user_decisions(existing_item: dict, incoming_item: dict) -> dict:
    """Preserve explicit human decisions, preferring fieldId and falling back to legacy fieldKey."""
    if not isinstance(existing_item, dict):
        return incoming_item
    old_answers = [a for a in existing_item.get("answers", []) if isinstance(a, dict)]
    old_by_id = {review_clean(a.get("fieldId"), 180): a for a in old_answers if review_clean(a.get("fieldId"), 180)}
    old_by_key = {review_clean(a.get("fieldKey"), 160): a for a in old_answers if review_clean(a.get("fieldKey"), 160)}
    incoming_ids = set()
    for answer in incoming_item.get("answers", []):
        field_id = review_clean(answer.get("fieldId"), 180)
        field_key = review_clean(answer.get("fieldKey"), 160)
        incoming_ids.add(field_id)
        old = old_by_id.get(field_id) or old_by_key.get(field_key)
        if not old or review_clean(old.get("status"), 40) not in REVIEW_HUMAN_STATUSES:
            continue
        for name in ("status", "currentValue", "changedFrom", "changedTo", "updatedAt"):
            answer[name] = old.get(name)
        answer["history"] = list(old.get("history") or [])[-50:]
    # Keep orphaned human decisions visible instead of silently losing them after a DOM redesign.
    for old in old_answers:
        old_id = review_clean(old.get("fieldId"), 180)
        if review_clean(old.get("status"), 40) in REVIEW_HUMAN_STATUSES and old_id and old_id not in incoming_ids:
            orphan = sanitize_review_answer({**old, "orphaned": True})
            incoming_item.setdefault("answers", []).append(orphan)
    incoming_item["createdAt"] = review_clean(existing_item.get("createdAt"), 80) or incoming_item.get("createdAt")
    statuses = [answer.get("status") for answer in incoming_item.get("answers", [])]
    incoming_item["reviewStatus"] = "review_complete" if statuses and all(status in {"confirmed_by_tag", "confirmed_by_photo", "user_confirmed", "user_corrected"} for status in statuses) else "needs_review"
    return incoming_item


def save_review_item(payload: dict) -> dict:
    item = sanitize_review_item(payload)
    folder = initialize_review_storage()
    path = review_item_file_path(item, folder)
    with REVIEW_DB_LOCK:
        existing_raw = None
        if path.exists():
            existing_raw = review_read_raw_item_file(path)
            expected = payload.get("expectedFileRevision")
            existing_revision = review_int(existing_raw.get("fileRevision"), 1, 1)
            if expected not in (None, "") and review_int(expected, -1) != existing_revision:
                raise RuntimeError("Review file changed after it was opened. Reload it before saving again.")
            review_backup_v2_once(path, existing_raw)
            existing = review_migrate_v2_to_v3(existing_raw)
            item = merge_review_user_decisions(existing, item)
            item["createdAt"] = review_clean(existing.get("createdAt"), 80) or item["createdAt"]
            item["fileRevision"] = existing_revision + 1
        else:
            item["fileRevision"] = 1
        review_write_item_file(path, item)
    return {"ok": True, "message": "Review listing file saved.", "item": item, "path": str(path), "folder": str(folder), "fileName": path.name, "fileRevision": item["fileRevision"]}


def get_review_item(payload: dict) -> dict:
    folder = initialize_review_storage()
    item_key = review_clean(payload.get("itemKey"), 300)
    draft_id = review_clean(payload.get("draftId"), 180)
    listing_id = review_clean(payload.get("listingId"), 180)
    url = review_clean(payload.get("url"), 2000)
    title = review_clean(payload.get("title"), 500)
    category = review_clean(payload.get("category"), 500)
    candidate_payload = {"itemKey": item_key, "draftId": draft_id, "listingId": listing_id, "url": url, "title": title, "category": category}
    if item_key or draft_id or listing_id:
        direct = review_item_file_path(candidate_payload, folder)
        if direct.exists():
            return {"ok": True, "found": True, "item": review_read_item_file(direct), "path": str(direct), "message": "Review item loaded."}
    for path in review_iter_item_files(folder):
        try:
            item = review_read_item_file(path)
        except RuntimeError:
            continue
        if (
            (item_key and review_clean(item.get("itemKey"), 300) == item_key)
            or (draft_id and review_clean(item.get("draftId"), 180) == draft_id)
            or (listing_id and review_clean(item.get("listingId"), 180) == listing_id)
            or (url and review_clean(item.get("url"), 2000) == url)
            or (title and category and review_clean(item.get("title"), 500) == title and review_clean(item.get("category"), 500) == category)
        ):
            return {"ok": True, "found": True, "item": item, "path": str(path), "message": "Review item loaded."}
    return {"ok": True, "found": False, "item": None, "message": "No saved review item matched the current draft."}


def list_review_items(payload: dict) -> dict:
    folder = initialize_review_storage()
    try:
        limit = max(1, min(int(payload.get("limit") or 50), 200))
    except (TypeError, ValueError):
        limit = 50
    records = []
    for path in review_iter_item_files(folder):
        try:
            data = review_read_item_file(path)
        except RuntimeError:
            continue
        answers = data.get("answers") if isinstance(data.get("answers"), list) else []
        records.append((review_clean(data.get("updatedAt"), 80), {
            "itemKey": review_clean(data.get("itemKey"), 300), "draftId": review_clean(data.get("draftId"), 180), "listingId": review_clean(data.get("listingId"), 180),
            "title": review_clean(data.get("title"), 500), "category": review_clean(data.get("category"), 500), "reviewStatus": review_clean(data.get("reviewStatus"), 60),
            "updatedAt": review_clean(data.get("updatedAt"), 80), "answerCount": len(answers),
            "attentionCount": sum(1 for answer in answers if answer.get("status") in {"needs_review", "conflict", "suggested", "likely_correct", "supported_by_two_models", "not_filled", "cleared_by_user"}),
            "fileRevision": review_int(data.get("fileRevision"), 1, 1), "fileName": path.name, "path": str(path),
        }))
    records.sort(key=lambda pair: pair[0], reverse=True)
    items = [item for _, item in records[:limit]]
    return {"ok": True, "items": items, "count": len(items), "path": str(folder), "folder": str(folder)}


def update_review_field(payload: dict) -> dict:
    loaded = get_review_item(payload)
    if not loaded.get("found"):
        raise RuntimeError("Review item was not found.")
    item = loaded["item"]
    field_id = review_clean(payload.get("fieldId"), 180)
    previous_field_id = review_clean(payload.get("previousFieldId"), 180)
    field_key = review_clean(payload.get("fieldKey"), 160)
    field_label = review_clean(payload.get("field"), 120)
    target = None
    for answer in item.get("answers", []):
        if (
            (field_id and answer.get("fieldId") == field_id)
            or (previous_field_id and answer.get("fieldId") == previous_field_id)
            or (field_id and answer.get("previousFieldId") == field_id)
            or (field_key and answer.get("fieldKey") == field_key)
            or (field_label and review_clean(answer.get("field"), 120).lower() == field_label.lower())
        ):
            target = answer
            break
    if target is None:
        target = sanitize_review_answer({"field": field_label, "fieldKey": field_key, "fieldId": field_id, "previousFieldId": previous_field_id, "status": "not_filled"})
        item.setdefault("answers", []).append(target)
    elif field_id and target.get("fieldId") != field_id:
        target["previousFieldId"] = review_clean(target.get("fieldId") or previous_field_id, 180)
        target["fieldId"] = field_id
        target["fieldKeySource"] = "rebound_by_name"
        target["orphaned"] = False
    before = review_clean(target.get("currentValue") or target.get("filledValue") or target.get("aiValue"), 500)
    new_value = review_clean(payload.get("currentValue"), 500)
    status = review_clean(payload.get("status"), 40)
    if status not in REVIEW_STATUS_VALUES:
        status = "user_corrected" if new_value and new_value != target.get("aiValue") else "user_confirmed"
    target.update({"currentValue": new_value, "status": status, "changedFrom": review_clean(payload.get("changedFrom"), 500) or before, "changedTo": review_clean(payload.get("changedTo"), 500) or new_value, "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
    target.setdefault("history", []).append({"at": target["updatedAt"], "type": status, "from": target["changedFrom"], "to": target["changedTo"]})
    target["history"] = target["history"][-50:]
    item["reviewStatus"] = "review_complete" if all(answer.get("status") in {"confirmed_by_tag", "confirmed_by_photo", "user_confirmed", "user_corrected"} for answer in item.get("answers", [])) else "needs_review"
    item["expectedFileRevision"] = review_int(item.get("fileRevision"), 1, 1)
    return save_review_item(item)

class KeychainError(RuntimeError):
    """macOS Keychain operation failed without exposing the stored value."""


class MacOSKeychain:
    """Small native Security.framework wrapper; no secret enters process arguments."""

    ERR_SEC_ITEM_NOT_FOUND = -25300

    def __init__(self) -> None:
        if sys.platform != "darwin":
            raise KeychainError("macOS Keychain is available only on macOS.")
        try:
            self.security = ctypes.cdll.LoadLibrary(
                "/System/Library/Frameworks/Security.framework/Security"
            )
            self.core_foundation = ctypes.cdll.LoadLibrary(
                "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation"
            )
        except OSError as error:
            raise KeychainError("macOS Security framework could not be loaded.") from error

        self.security.SecKeychainFindGenericPassword.argtypes = [
            ctypes.c_void_p, ctypes.c_uint32, ctypes.c_char_p,
            ctypes.c_uint32, ctypes.c_char_p,
            ctypes.POINTER(ctypes.c_uint32), ctypes.POINTER(ctypes.c_void_p),
            ctypes.POINTER(ctypes.c_void_p),
        ]
        self.security.SecKeychainFindGenericPassword.restype = ctypes.c_int32
        self.security.SecKeychainAddGenericPassword.argtypes = [
            ctypes.c_void_p, ctypes.c_uint32, ctypes.c_char_p,
            ctypes.c_uint32, ctypes.c_char_p,
            ctypes.c_uint32, ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p),
        ]
        self.security.SecKeychainAddGenericPassword.restype = ctypes.c_int32
        self.security.SecKeychainItemModifyAttributesAndData.argtypes = [
            ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint32, ctypes.c_void_p,
        ]
        self.security.SecKeychainItemModifyAttributesAndData.restype = ctypes.c_int32
        self.security.SecKeychainItemDelete.argtypes = [ctypes.c_void_p]
        self.security.SecKeychainItemDelete.restype = ctypes.c_int32
        self.security.SecKeychainItemFreeContent.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        self.security.SecKeychainItemFreeContent.restype = ctypes.c_int32
        self.core_foundation.CFRelease.argtypes = [ctypes.c_void_p]
        self.core_foundation.CFRelease.restype = None

    @staticmethod
    def _encoded(value: str) -> bytes:
        return str(value).encode("utf-8")

    def _find(self, service: str, account: str) -> tuple[int, str, ctypes.c_void_p]:
        service_bytes = self._encoded(service)
        account_bytes = self._encoded(account)
        length = ctypes.c_uint32(0)
        data = ctypes.c_void_p()
        item = ctypes.c_void_p()
        status = int(self.security.SecKeychainFindGenericPassword(
            None,
            len(service_bytes), service_bytes,
            len(account_bytes), account_bytes,
            ctypes.byref(length), ctypes.byref(data), ctypes.byref(item),
        ))
        value = ""
        try:
            if status == 0 and data.value:
                value = ctypes.string_at(data, length.value).decode("utf-8")
        finally:
            if data.value:
                self.security.SecKeychainItemFreeContent(None, data)
        return status, value, item

    def get(self, service: str, account: str) -> str:
        status, value, item = self._find(service, account)
        try:
            if status == self.ERR_SEC_ITEM_NOT_FOUND:
                return ""
            if status != 0:
                raise KeychainError(f"macOS Keychain read failed (status {status}).")
            return value
        finally:
            if item.value:
                self.core_foundation.CFRelease(item)

    def set(self, service: str, account: str, value: str) -> None:
        normalized = str(value)
        if not normalized:
            raise KeychainError("Refusing to store an empty Keychain value.")
        status, _, item = self._find(service, account)
        value_bytes = normalized.encode("utf-8")
        value_buffer = ctypes.create_string_buffer(value_bytes)
        try:
            if status == 0 and item.value:
                update_status = int(self.security.SecKeychainItemModifyAttributesAndData(
                    item, None, len(value_bytes), ctypes.cast(value_buffer, ctypes.c_void_p)
                ))
                if update_status != 0:
                    raise KeychainError(f"macOS Keychain update failed (status {update_status}).")
                return
            if status != self.ERR_SEC_ITEM_NOT_FOUND:
                raise KeychainError(f"macOS Keychain lookup failed (status {status}).")
            service_bytes = service.encode("utf-8")
            account_bytes = account.encode("utf-8")
            add_status = int(self.security.SecKeychainAddGenericPassword(
                None,
                len(service_bytes), service_bytes,
                len(account_bytes), account_bytes,
                len(value_bytes), ctypes.cast(value_buffer, ctypes.c_void_p),
                None,
            ))
            if add_status != 0:
                raise KeychainError(f"macOS Keychain save failed (status {add_status}).")
        finally:
            if item.value:
                self.core_foundation.CFRelease(item)

    def delete(self, service: str, account: str) -> None:
        status, _, item = self._find(service, account)
        try:
            if status == self.ERR_SEC_ITEM_NOT_FOUND:
                return
            if status != 0 or not item.value:
                raise KeychainError(f"macOS Keychain lookup failed (status {status}).")
            delete_status = int(self.security.SecKeychainItemDelete(item))
            if delete_status != 0:
                raise KeychainError(f"macOS Keychain delete failed (status {delete_status}).")
        finally:
            if item.value:
                self.core_foundation.CFRelease(item)


class PersistentEbayProfile:
    """Stores non-secret eBay settings in Application Support and secrets in Keychain."""

    def __init__(self, keychain=None, pairing_keychain=None) -> None:
        self.keychain = keychain if keychain is not None else MacOSKeychain()
        if pairing_keychain is not None:
            self.pairing_keychain = pairing_keychain
        elif sys.platform != "darwin" and keychain is not None:
            # Test-only fallback; production macOS always uses DataProtectionKeychain.
            self.pairing_keychain = keychain
        else:
            if DataProtectionKeychain is None:
                raise KeychainError("Modern macOS data-protection Keychain support is unavailable.")
            try:
                self.pairing_keychain = DataProtectionKeychain()
            except Exception as error:
                raise KeychainError("Modern macOS data-protection Keychain could not be opened.") from error
        APP_SUPPORT_DIR.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(APP_SUPPORT_DIR, 0o700)
        except OSError:
            pass

    @staticmethod
    def client_secret_account(environment: str) -> str:
        return f"{environment}-client-secret"

    @staticmethod
    def refresh_token_account(environment: str) -> str:
        return f"{environment}-refresh-token"

    def _validated_profile(self, payload) -> dict:
        if not isinstance(payload, dict):
            raise RuntimeError("eBay profile must be a JSON object.")
        schema = int(payload.get("schemaVersion") or PROFILE_SCHEMA_VERSION)
        if schema > PROFILE_SCHEMA_VERSION:
            raise RuntimeError("This eBay profile was created by a newer unsupported version.")
        environment = str(payload.get("environment") or "production").strip().lower()
        if environment not in ENVIRONMENTS:
            raise RuntimeError("eBay environment must be production or sandbox.")
        client_id = str(payload.get("clientId") or "").strip()
        runame = str(payload.get("runame") or "").strip()
        if client_id:
            client_id, _ = normalize_credential_input(client_id, "EBAY_CLIENT_ID")
        if runame:
            runame, _ = normalize_credential_input(runame, "EBAY_RUNAME")
            validate_runame(runame)
        return {
            "schemaVersion": PROFILE_SCHEMA_VERSION,
            "environment": environment,
            "clientId": client_id,
            "runame": runame,
            "scopes": list(READ_ONLY_SCOPES),
            "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

    def load(self) -> dict:
        if not PROFILE_PATH.exists():
            return dict(DEFAULT_PROFILE)
        try:
            raw = PROFILE_PATH.read_text(encoding="utf-8")
            payload = json.loads(raw)
            return self._validated_profile(payload)
        except Exception as error:
            raise RuntimeError("Saved eBay profile is invalid and was not overwritten.") from error

    def save(self, payload) -> dict:
        profile = self._validated_profile(payload)
        APP_SUPPORT_DIR.mkdir(parents=True, exist_ok=True)
        temp_path = PROFILE_PATH.with_suffix(".tmp")
        encoded = (json.dumps(profile, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
        with open(temp_path, "wb") as handle:
            os.chmod(temp_path, 0o600)
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, PROFILE_PATH)
        try:
            os.chmod(PROFILE_PATH, 0o600)
        except OSError:
            pass
        return profile

    def get_client_secret(self, environment: str) -> str:
        return self.keychain.get(KEYCHAIN_SERVICE, self.client_secret_account(environment))

    def set_client_secret(self, environment: str, value: str) -> None:
        normalized, _ = normalize_credential_input(value, "EBAY_CLIENT_SECRET")
        self.keychain.set(KEYCHAIN_SERVICE, self.client_secret_account(environment), normalized)

    def delete_client_secret(self, environment: str) -> None:
        self.keychain.delete(KEYCHAIN_SERVICE, self.client_secret_account(environment))

    def get_refresh_token(self, environment: str) -> str:
        return self.keychain.get(KEYCHAIN_SERVICE, self.refresh_token_account(environment))

    def set_refresh_token(self, environment: str, value: str) -> None:
        token = str(value or "")
        if not token or len(token) > 8192 or contains_control_characters(token):
            raise KeychainError("eBay refresh token was rejected before Keychain storage.")
        self.keychain.set(KEYCHAIN_SERVICE, self.refresh_token_account(environment), token)

    def delete_refresh_token(self, environment: str) -> None:
        self.keychain.delete(KEYCHAIN_SERVICE, self.refresh_token_account(environment))

    def local_pairing_secret(self) -> tuple[str, bool]:
        """Return the internal loopback credential from macOS Keychain.

        V8.23.21: Chrome never receives this value. Native Messaging authenticates
        the extension by exact extension origin, while this separate random
        credential authenticates only native_host.py -> localhost Backend.
        A legacy mode-0600 pairing file is migrated into Keychain once and then
        deleted; new installations never create a pairing file.
        """
        try:
            current = str(self.pairing_keychain.get(KEYCHAIN_SERVICE, KEYCHAIN_PAIRING_ACCOUNT) or "").strip()
        except Exception as error:
            raise KeychainError("Internal Backend credential could not be read from macOS Keychain.") from error
        if current:
            return current, False

        legacy = ""
        if PAIRING_FALLBACK_PATH.exists():
            try:
                legacy = PAIRING_FALLBACK_PATH.read_text(encoding="utf-8").strip()
            except OSError:
                legacy = ""
        value = legacy or secrets.token_urlsafe(32)
        try:
            self.pairing_keychain.set(KEYCHAIN_SERVICE, KEYCHAIN_PAIRING_ACCOUNT, value)
        except Exception as error:
            raise KeychainError("Internal Backend credential could not be saved to macOS Keychain.") from error
        if PAIRING_FALLBACK_PATH.exists():
            try:
                PAIRING_FALLBACK_PATH.unlink()
            except OSError:
                pass
        return value, not bool(legacy)

    def pairing_secret(self) -> tuple[str, bool]:
        return self.local_pairing_secret()

    def rotate_pairing_secret(self) -> str:
        value = secrets.token_urlsafe(32)
        self.pairing_keychain.set(KEYCHAIN_SERVICE, KEYCHAIN_PAIRING_ACCOUNT, value)
        if PAIRING_FALLBACK_PATH.exists():
            try:
                PAIRING_FALLBACK_PATH.unlink()
            except OSError:
                pass
        return value
#endregion


#region SAFE ERRORS, LOGGING, AND REDACTION
# Everything in this section may appear in local logs, so secrets are redacted.
class SafeUpstreamError(RuntimeError):
    """Upstream error safe to show without credentials or tokens."""


class EbayHttpError(SafeUpstreamError):
    """Sanitized eBay HTTP failure with structured OAuth/REST error details."""

    def __init__(
        self,
        status: int,
        error_code: str,
        error_description: str,
        *,
        error_domain: str = "",
        error_category: str = "",
        long_message: str = "",
    ):
        self.status = int(status)
        self.error_code = clean_public_text(error_code, 100) or "unknown_error"
        self.error_description = clean_public_text(error_description, 300) or "eBay rejected the request."
        self.error_domain = clean_public_text(error_domain, 100)
        self.error_category = clean_public_text(error_category, 100)
        self.long_message = clean_public_text(long_message, 500)
        super().__init__(
            f"eBay error {self.error_code}: {self.error_description} (HTTP {self.status})"
        )


def oauth_log(event: str, **safe_fields) -> None:
    """Log only fixed OAuth lifecycle metadata; never secrets, codes, or tokens."""
    details = " ".join(
        f"{key}={clean_public_text(value, 120)}"
        for key, value in safe_fields.items()
        if value not in (None, "")
    )
    suffix = f" | {details}" if details else ""
    print(f"[OAuth {APP_DISPLAY_VERSION}] {event}{suffix}", flush=True)


def clean_public_text(value, limit: int = 240) -> str:
    text = " ".join(str(value or "").split())
    return text[:limit]


def yes_no(value) -> str:
    return "yes" if bool(value) else "no"


def scope_diagnostic_log(label: str, value=None) -> None:
    if value is None:
        print(f"[OAuth Scope {APP_DISPLAY_VERSION}] {label}", flush=True)
    else:
        print(f"[OAuth Scope {APP_DISPLAY_VERSION}] {label}: {clean_public_text(value, 500)}", flush=True)


def account_diagnostic_log(label: str, value=None) -> None:
    if value is None:
        print(f"[Account API {APP_DISPLAY_VERSION}] {label}", flush=True)
        return
    rendered = str(value)
    separator = "\n" if "\n" in rendered else " "
    print(f"[Account API {APP_DISPLAY_VERSION}] {label}:{separator}{rendered}", flush=True)


def scope_may_write(scope: str) -> bool:
    """Conservative guard: only the audited read-only scope allowlist is accepted."""
    return scope not in READ_ONLY_SCOPE_ALLOWLIST


def inspect_authorization_scope_url(authorization_url: str, expected_scopes) -> dict:
    """Parse the final URL and prove the scope value was encoded exactly once."""
    expected = tuple(str(scope) for scope in expected_scopes)
    expected_text = " ".join(expected)
    split = urllib.parse.urlsplit(authorization_url)
    raw_scope_values = []
    for component in split.query.split("&") if split.query else ():
        raw_name, separator, raw_value = component.partition("=")
        if separator and urllib.parse.unquote_plus(raw_name) == "scope":
            raw_scope_values.append(raw_value)
    parsed_scope_values = [
        value
        for name, value in urllib.parse.parse_qsl(split.query, keep_blank_values=True)
        if name == "scope"
    ]
    decoded_text = parsed_scope_values[0] if len(parsed_scope_values) == 1 else ""
    parsed_scopes = tuple(decoded_text.split())
    expected_encoded = urllib.parse.quote_plus(expected_text, safe="")
    encoded_exactly_once = (
        len(raw_scope_values) == 1
        and raw_scope_values[0] == expected_encoded
        and decoded_text == expected_text
        and parsed_scopes == expected
    )
    return {
        "authorization_host": split.hostname or "",
        "requested_scopes": parsed_scopes,
        "scope_parameter_count": len(raw_scope_values),
        "encoded_exactly_once": encoded_exactly_once,
        "duplicates_present": len(parsed_scopes) != len(set(parsed_scopes)),
        "sell_account_readonly_present": SELL_ACCOUNT_READONLY_SCOPE in parsed_scopes,
        "write_capable_present": any(scope_may_write(scope) for scope in parsed_scopes),
    }


def log_authorization_scope_diagnostics(environment: str, runame: str, analysis: dict) -> None:
    scopes = tuple(analysis.get("requested_scopes") or ())
    scope_diagnostic_log("environment", environment)
    scope_diagnostic_log("exact requested scope count", len(scopes))
    for index, scope in enumerate(scopes, start=1):
        scope_diagnostic_log(f"requested scope {index}", scope)
    scope_diagnostic_log(
        "sell.account.readonly present",
        yes_no(analysis.get("sell_account_readonly_present")),
    )
    scope_diagnostic_log(
        "write-capable scope present",
        yes_no(analysis.get("write_capable_present")),
    )
    scope_diagnostic_log("duplicate scopes present", yes_no(analysis.get("duplicates_present")))
    scope_diagnostic_log("scope URL-encoded exactly once", yes_no(analysis.get("encoded_exactly_once")))
    scope_diagnostic_log("authorization endpoint host", analysis.get("authorization_host") or MISSING_VALUE)
    scope_diagnostic_log("redirect_uri RuName", runame)


def parse_token_response_scopes(value) -> tuple[str, ...]:
    if isinstance(value, str):
        return tuple(value.split())
    if isinstance(value, (list, tuple)):
        scopes = []
        for scope in value:
            text = str(scope or "").strip()
            if text:
                scopes.append(text)
        return tuple(scopes)
    return ()


def contains_control_characters(value: str) -> bool:
    """Detect C0/C1 and Unicode format/surrogate controls without changing input."""
    return any(
        ord(character) < 32
        or 0x7F <= ord(character) <= 0x9F
        or unicodedata.category(character) in {"Cf", "Cs"}
        for character in value
    )


def normalize_credential_input(value, label: str) -> tuple[str, dict]:
    """Trim edge whitespace only; reject controls that remain inside a credential."""
    supplied = str(value or "")
    normalized = supplied.strip()
    metadata = {
        "edge_whitespace_detected": supplied != normalized,
        "control_characters_detected": contains_control_characters(supplied),
    }
    if not normalized:
        raise RuntimeError(f"{label} cannot be empty.")
    if "\r" in normalized or "\n" in normalized:
        raise RuntimeError(f"{label} must be one line; an embedded line ending was rejected.")
    if contains_control_characters(normalized):
        raise RuntimeError(f"{label} contains a control character and was rejected.")
    return normalized, metadata


def masked_client_id(client_id: str) -> str:
    if not client_id:
        return "<empty>"
    if len(client_id) < 8:
        suffix = client_id[-1] if len(client_id) > 2 else "*"
        return f"{client_id[0]}...{suffix}"
    visible = min(4, max(1, len(client_id) // 6))
    return f"{client_id[:visible]}...{client_id[-visible:]}"


def credential_environment_hint(value: str) -> str:
    upper = value.upper()
    if re.search(r"(?:^|[-_])SBX(?:[-_]|$)", upper):
        return "sandbox"
    if re.search(r"(?:^|[-_])PRD(?:[-_]|$)", upper):
        return "production"
    return "unknown"


def credential_pattern_check(environment: str, client_id: str, client_secret: str) -> dict:
    """Advisory only: eBay's response remains authoritative."""
    client_id_hint = credential_environment_hint(client_id)
    client_secret_hint = credential_environment_hint(client_secret)
    mismatches = [
        role
        for role, hint in (("client_id", client_id_hint), ("client_secret", client_secret_hint))
        if hint != "unknown" and hint != environment
    ]
    marker = "PRD" if environment == "production" else "SBX"
    appears_reversed = (
        client_id.upper().startswith(f"{marker}-")
        and f"-{marker}-" in client_secret.upper()
    )
    secret_looks_like_dev_id = bool(
        re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", client_secret)
    )
    return {
        "client_id_environment_hint": client_id_hint,
        "client_secret_environment_hint": client_secret_hint,
        "obvious_environment_mismatch": bool(mismatches),
        "mismatched_roles": tuple(mismatches),
        "appears_reversed": appears_reversed,
        "client_secret_looks_like_dev_id": secret_looks_like_dev_id,
    }


def build_basic_authorization(client_id: str, client_secret: str) -> tuple[str, dict]:
    """Build client_secret_basic exactly once and verify its in-memory round trip."""
    raw_credentials = f"{client_id}:{client_secret}".encode("utf-8")
    encoded_credentials = base64.b64encode(raw_credentials).decode("ascii")
    authorization_header = f"Basic {encoded_credentials}"
    try:
        decoded_credentials = base64.b64decode(encoded_credentials.encode("ascii"), validate=True)
    except (ValueError, binascii.Error) as error:
        raise RuntimeError("Internal Basic Authorization Base64 validation failed.") from error
    if not hmac.compare_digest(decoded_credentials, raw_credentials):
        raise RuntimeError("Internal Basic Authorization round-trip validation failed.")
    return authorization_header, {
        "source_separator_count": raw_credentials.count(b":"),
        "encoded_length": len(encoded_credentials),
        "round_trip_verified": True,
    }


def positive_int(value, fallback: int = 0, maximum: int = 100_000_000) -> int:
    try:
        return min(max(0, int(value)), maximum)
    except (TypeError, ValueError):
        return fallback


def safe_error_from_json(data, fallback: str) -> str:
    if isinstance(data, dict):
        errors = data.get("errors")
        if isinstance(errors, list) and errors and isinstance(errors[0], dict):
            first = errors[0]
            return clean_public_text(first.get("message") or first.get("longMessage") or fallback)
        return clean_public_text(data.get("error_description") or data.get("message") or data.get("error") or fallback)
    return clean_public_text(fallback)


def first_ebay_error(data) -> dict:
    """Return eBay's first structured error, or an empty object."""
    if not isinstance(data, dict):
        return {}
    errors = data.get("errors")
    if not isinstance(errors, list) or not errors or not isinstance(errors[0], dict):
        return {}
    return errors[0]


def first_present(mapping: dict, names, fallback=""):
    """Pick the first non-empty value without repeating long ``or`` chains."""
    for name in names:
        value = mapping.get(name)
        if value not in (None, ""):
            return value
    return fallback


def safe_ebay_error_details(data, fallback: str, sensitive_values=()) -> tuple[str, str]:
    payload = data if isinstance(data, dict) else {}
    first_error = first_ebay_error(payload)
    source = first_error or payload
    code_names = ("errorId", "code") if first_error else ("error", "errorId", "code")
    message_names = ("message", "longMessage") if first_error else ("error_description", "message")
    error_code = first_present(source, code_names, "http_error")
    error_description = first_present(source, message_names, fallback)
    safe_code = redact_known_values(clean_public_text(error_code, 100), sensitive_values)
    safe_description = redact_known_values(clean_public_text(error_description, 300), sensitive_values)
    if looks_like_opaque_secret(safe_code):
        safe_code = "redacted_error"
    return safe_code or "http_error", safe_description or clean_public_text(fallback, 300)


def safe_ebay_rest_error_details(data, fallback: str, sensitive_values=()) -> dict:
    payload = data if isinstance(data, dict) else {}
    first_error = first_ebay_error(payload)
    source = first_error or payload
    details = {
        "error_id": first_present(source, ("errorId", "code", "error"), "http_error"),
        "domain": first_present(source, ("domain",)),
        "category": first_present(source, ("category",)),
        "message": first_present(source, ("message", "error_description"), fallback),
        "long_message": first_present(source, ("longMessage",)),
    }
    limits = {
        "error_id": 100,
        "domain": 100,
        "category": 100,
        "message": 300,
        "long_message": 500,
    }
    for key, limit in limits.items():
        value = redact_known_values(clean_public_text(details.get(key), limit), sensitive_values)
        details[key] = REDACTED_VALUE if looks_like_opaque_secret(value) else value
    details["error_id"] = details["error_id"] or "http_error"
    details["message"] = details["message"] or clean_public_text(fallback, 300)
    return details


def invalid_client_failure_reason(description: str, suffix: str) -> str:
    lowered = description.lower()
    malformed_terms = ("malformed", "invalid header", "basic")
    if "authorization" in lowered and any(term in lowered for term in malformed_terms):
        return f"malformed Basic Authorization header: {description}{suffix}"
    return f"invalid client authentication: {description}{suffix}"


def invalid_grant_failure_reason(description: str, suffix: str) -> str:
    lowered = description.lower()
    if any(term in lowered for term in ("expired", "already used", "reused")):
        return f"authorization code expired or was already used: {description}{suffix}"
    if "redirect" in lowered or "runame" in lowered:
        return f"redirect URI/RuName mismatch: {description}{suffix}"
    return f"invalid authorization code or redirect URI: {description}{suffix}"


def ebay_http_failure_reason(error: EbayHttpError) -> str:
    description = error.error_description
    suffix = f" (HTTP {error.status}; eBay error: {error.error_code})"
    code = error.error_code.lower()
    if code == "invalid_client":
        return invalid_client_failure_reason(description, suffix)
    if code == "invalid_grant":
        return invalid_grant_failure_reason(description, suffix)
    if code == "invalid_request":
        return f"malformed token request: {description}{suffix}"
    return f"{description}{suffix}"


def safe_upstream_failure_reason(message: str) -> str:
    lowered = message.lower()
    if "http 400" in lowered or "invalid_grant" in lowered:
        return "eBay rejected the authorization code or RuName"
    if any(term in lowered for term in ("could not reach", "connection", "timed out")):
        return "eBay token endpoint is unreachable"
    if any(term in lowered for term in ("invalid json", "unexpected response", "valid access token")):
        return "eBay token endpoint returned an invalid response"
    return "eBay rejected the token request"


def safe_token_exchange_failure_reason(error: Exception) -> str:
    """Return a useful sanitized OAuth failure without exposing credentials."""
    if isinstance(error, EbayHttpError):
        return ebay_http_failure_reason(error)
    if isinstance(error, SafeUpstreamError):
        return safe_upstream_failure_reason(str(error))
    return "unexpected local backend error"


def diagnostic_log(label: str, value=None) -> None:
    """Print token HTTP diagnostics without printing OAuth credentials."""
    if value is None:
        print(f"[OAuth HTTP {APP_DISPLAY_VERSION}] {label}", flush=True)
        return
    rendered = str(value)
    separator = "\n" if "\n" in rendered else " "
    print(f"[OAuth HTTP {APP_DISPLAY_VERSION}] {label}:{separator}{rendered}", flush=True)


def masked_header_value(name: str, value, *, authorization_prefix: bool = True) -> str:
    text = str(value or "")
    normalized = name.strip().lower()
    if normalized in {"authorization", "proxy-authorization"}:
        scheme, separator, credential = text.partition(" ")
        if not separator:
            return REDACTED_VALUE
        if not authorization_prefix:
            return f"{scheme} {REDACTED_VALUE}"
        visible = credential[:6]
        return f"{scheme} {visible}...{REDACTED_VALUE}"
    if normalized in {"cookie", "set-cookie"}:
        return REDACTED_VALUE
    return text


def diagnostic_headers(headers, sensitive_values=(), *, authorization_prefix: bool = True) -> str:
    if not headers:
        return "<none>"
    try:
        items = list(headers.items())
    except AttributeError:
        items = list(dict(headers).items())
    safe = {
        str(name): redact_known_values(
            masked_header_value(str(name), value, authorization_prefix=authorization_prefix),
            sensitive_values,
        )
        for name, value in items
    }
    return json.dumps(safe, ensure_ascii=False, indent=2, sort_keys=True)


def sensitive_body_key(key) -> bool:
    normalized = re.sub(r"[^a-z0-9]+", "_", str(key or "").lower()).strip("_")
    if normalized in {
        "access_token", "refresh_token", "id_token", "client_secret",
        "authorization_code", "auth_code", "credentials", "credential",
        "password", "secret", "token", "cookie", "set_cookie",
    }:
        return True
    return normalized.endswith("_token") and normalized != "token_type"


def looks_like_opaque_secret(value: str) -> bool:
    candidate = value.strip()
    if len(candidate) < 64 or any(character.isspace() for character in candidate):
        return False
    if candidate.startswith("v^1.1#"):
        return True
    if candidate.count(".") == 2 and all(candidate.split(".")):
        return True
    return bool(re.fullmatch(r"[A-Za-z0-9._~+/=^#-]{64,}", candidate))


def redact_diagnostic_value(value, key: str = ""):
    if sensitive_body_key(key):
        return REDACTED_VALUE
    if isinstance(value, dict):
        return {str(child_key): redact_diagnostic_value(child_value, str(child_key)) for child_key, child_value in value.items()}
    if isinstance(value, list):
        return [redact_diagnostic_value(item) for item in value]
    if isinstance(value, str) and looks_like_opaque_secret(value):
        return "[REDACTED OPAQUE VALUE]"
    return value


def redact_known_values(text: str, sensitive_values=()) -> str:
    for value in sensitive_values:
        secret = str(value or "")
        if not secret:
            continue
        variants = {secret, urllib.parse.quote(secret, safe=""), urllib.parse.quote_plus(secret)}
        for variant in sorted(variants, key=len, reverse=True):
            if variant:
                text = text.replace(variant, "[REDACTED REQUEST VALUE]")
    return text


def redacted_response_body(raw: bytes, sensitive_values=()) -> str:
    if not raw:
        return "<empty>"
    text = raw.decode("utf-8", errors="replace")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        sensitive_assignment = re.compile(
            r"(?i)\b(access_token|refresh_token|id_token|client_secret|authorization_code|auth_code)"
            r"(\s*[:=]\s*)(\"[^\"]*\"|'[^']*'|[^\s&,}]+)"
        )
        text = sensitive_assignment.sub(
            lambda match: f"{match.group(1)}{match.group(2)}{REDACTED_VALUE}",
            text,
        )
        # ``(?i)`` already makes a-z case-insensitive; repeating A-Z confused Sonar.
        text = re.sub(r"(?i)\b(Basic|Bearer)\s+[a-z0-9._~+/=^#-]+", rf"\1 {REDACTED_VALUE}", text)
        text = re.sub(r"v\^1\.1#[^\s<>\"']+", "[REDACTED OAUTH VALUE]", text)
        text = re.sub(r"\b[A-Za-z0-9._~+/=^#-]{64,}\b", "[REDACTED OPAQUE VALUE]", text)
        return redact_known_values(text, sensitive_values)
    rendered = json.dumps(redact_diagnostic_value(parsed), ensure_ascii=False, indent=2, sort_keys=True)
    return redact_known_values(rendered, sensitive_values)


def transport_error_category(error: Exception) -> tuple[str, Exception]:
    reason = getattr(error, "reason", None) or error
    lowered = str(reason).lower()
    if isinstance(reason, ssl.SSLError) or any(term in lowered for term in ("certificate", "ssl", "tls")):
        return "TLS error", reason
    if isinstance(reason, socket.gaierror) or any(term in lowered for term in ("name or service not known", "nodename nor servname", "temporary failure in name resolution", "dns")):
        return "DNS error", reason
    if isinstance(reason, TimeoutError):
        return "connect timeout", reason
    return "connect error", reason


def request_header(request: urllib.request.Request, name: str) -> str:
    wanted = name.lower()
    for header_name, value in request.header_items():
        if str(header_name).lower() == wanted:
            return str(value)
    return ""


def log_token_request_diagnostics(
    request: urllib.request.Request,
    form: dict,
    environment: str,
    body: bytes | None,
    context: dict,
) -> None:
    authorization = request_header(request, "Authorization")
    authorization_scheme = authorization.partition(" ")[0] or MISSING_VALUE
    diagnostic_log("exact token endpoint URL", request.full_url)
    diagnostic_log("environment selected", environment)
    diagnostic_log("HTTP method", request.get_method())
    diagnostic_log("client_id length", context.get("client_id_length", 0))
    diagnostic_log("masked client_id prefix and suffix", context.get("masked_client_id", MISSING_VALUE))
    diagnostic_log("client_secret length", context.get("client_secret_length", 0))
    diagnostic_log("client_id leading or trailing whitespace detected", yes_no(context.get("client_id_edge_whitespace")))
    diagnostic_log("client_secret leading or trailing whitespace detected", yes_no(context.get("client_secret_edge_whitespace")))
    diagnostic_log("client_id control characters detected", yes_no(context.get("client_id_control_characters")))
    diagnostic_log("client_secret control characters detected", yes_no(context.get("client_secret_control_characters")))
    diagnostic_log("Basic source contains exactly one separator colon", yes_no(context.get("basic_separator_count") == 1))
    diagnostic_log("Basic Base64 round-trip verified", yes_no(context.get("basic_round_trip_verified")))
    diagnostic_log("Authorization scheme", authorization_scheme)
    diagnostic_log("Authorization encoded length", context.get("basic_encoded_length", 0))
    diagnostic_log("Authorization header preserved by urllib.request.Request", yes_no(context.get("authorization_header_preserved")))
    diagnostic_log("request headers", diagnostic_headers(dict(request.header_items())))
    diagnostic_log("Content-Type", request_header(request, "Content-Type") or MISSING_VALUE)
    diagnostic_log("redirect_uri used", form.get("redirect_uri", MISSING_VALUE))
    diagnostic_log("grant_type", form.get("grant_type", MISSING_VALUE))
    diagnostic_log("authorization-code processing mode", context.get("authorization_code_processing_mode", "not applicable"))
    diagnostic_log("request body byte length", len(body or b""))
    diagnostic_log("timeout", f"{UPSTREAM_TIMEOUT_SECONDS} seconds")


def log_account_request_diagnostics(
    request: urllib.request.Request,
    environment: str,
    context: dict,
) -> None:
    authorization = request_header(request, "Authorization")
    scheme, separator, credential = authorization.partition(" ")
    scopes = tuple(context.get("requested_scopes") or ())
    account_diagnostic_log("environment", environment)
    account_diagnostic_log(
        "exact Account API endpoint",
        redact_known_values(request.full_url, (credential,)),
    )
    account_diagnostic_log("HTTP method", request.get_method())
    account_diagnostic_log("Authorization scheme", scheme or MISSING_VALUE)
    account_diagnostic_log("access token present", yes_no(bool(separator and credential)))
    account_diagnostic_log("access token length only", context.get("access_token_length", 0))
    account_diagnostic_log(
        "access token expiration time remaining",
        f"{positive_int(context.get('access_expires_in'))} seconds",
    )
    account_diagnostic_log("access token source", context.get("access_token_source") or "<unknown>")
    account_diagnostic_log("requested OAuth scope count stored for this token", len(scopes))
    for index, scope in enumerate(scopes, start=1):
        account_diagnostic_log(f"stored requested OAuth scope {index}", scope)
    account_diagnostic_log(
        "sell.account.readonly requested for this token",
        yes_no(SELL_ACCOUNT_READONLY_SCOPE in scopes),
    )
    account_diagnostic_log(
        "Bearer header preserved by urllib.request.Request",
        yes_no(context.get("authorization_header_preserved")),
    )
    account_diagnostic_log("Basic Authorization reused", yes_no(scheme.lower() == "basic"))
    account_diagnostic_log("access token present in URL", yes_no(context.get("token_in_url")))
    account_diagnostic_log("request body present", yes_no(context.get("request_body_present")))
    account_diagnostic_log(
        "request headers (token fully redacted)",
        diagnostic_headers(dict(request.header_items()), authorization_prefix=False),
    )
    account_diagnostic_log("timeout", f"{UPSTREAM_TIMEOUT_SECONDS} seconds")


def log_account_response_diagnostics(
    status,
    headers,
    raw: bytes,
    sensitive_values=(),
    error_details: dict | None = None,
) -> None:
    account_diagnostic_log(HTTP_STATUS_LABEL, status)
    account_diagnostic_log(
        "sanitized response headers",
        diagnostic_headers(headers, sensitive_values, authorization_prefix=False),
    )
    account_diagnostic_log("sanitized response body", redacted_response_body(raw, sensitive_values))
    if error_details is not None:
        account_diagnostic_log("eBay error ID", error_details.get("error_id") or MISSING_VALUE)
        account_diagnostic_log("eBay error domain", error_details.get("domain") or MISSING_VALUE)
        account_diagnostic_log("eBay error category", error_details.get("category") or MISSING_VALUE)
        account_diagnostic_log("eBay error message", error_details.get("message") or MISSING_VALUE)
        account_diagnostic_log("eBay longMessage", error_details.get("long_message") or MISSING_VALUE)


def log_account_transport_exception(error: Exception) -> None:
    category, reason = transport_error_category(error)
    account_diagnostic_log(category, repr(reason))
    account_diagnostic_log(HTTP_STATUS_LABEL, NOT_RECEIVED_VALUE)
    account_diagnostic_log("sanitized response headers", NOT_RECEIVED_VALUE)
    account_diagnostic_log("sanitized response body", NOT_RECEIVED_VALUE)
    account_diagnostic_log(URLLIB_EXCEPTION_LABEL, f"{type(error).__name__}: {error}")


def log_http_response_diagnostics(status, headers, raw: bytes, sensitive_values=()) -> None:
    diagnostic_log(HTTP_STATUS_LABEL, status)
    diagnostic_log("response headers", diagnostic_headers(headers, sensitive_values))
    diagnostic_log("response body (OAuth values redacted)", redacted_response_body(raw, sensitive_values))


def log_transport_exception(error: Exception) -> None:
    category, reason = transport_error_category(error)
    diagnostic_log(category, repr(reason))
    diagnostic_log(HTTP_STATUS_LABEL, NOT_RECEIVED_VALUE)
    diagnostic_log("response headers", NOT_RECEIVED_VALUE)
    diagnostic_log("response body", NOT_RECEIVED_VALUE)
    diagnostic_log(URLLIB_EXCEPTION_LABEL, f"{type(error).__name__}: {error}")
    diagnostic_log("complete traceback (Python tracebacks do not include local variable values)")
    traceback.print_exc(file=sys.stdout)


def build_ebay_request(url: str, method: str, headers: dict | None, form: dict | None):
    """Build one eBay request and return it with the exact transmitted body."""
    body = None
    request_headers = {"Accept": JSON_MEDIA_TYPE, **(headers or {})}
    if form is not None:
        body = urllib.parse.urlencode(form).encode("utf-8")
        request_headers["Content-Type"] = "application/x-www-form-urlencoded"
    request = urllib.request.Request(url, data=body, headers=request_headers, method=method)
    return request, body, request_headers


def authorization_header_was_preserved(
    request: urllib.request.Request,
    request_headers: dict,
) -> tuple[str, bool]:
    expected_authorization = request_headers.get("Authorization", "")
    actual_authorization = request_header(request, "Authorization")
    preserved = (
        not expected_authorization
        or hmac.compare_digest(actual_authorization, expected_authorization)
    )
    return expected_authorization, preserved


def validate_account_request_preflight(
    request: urllib.request.Request,
    expected_authorization: str,
    body: bytes | None,
    context: dict,
) -> None:
    """Prove the read-only Account API request cannot become a write request."""
    expected_endpoint = str(context.get("expected_endpoint") or "")
    endpoint_parts = urllib.parse.urlsplit(request.full_url)
    scheme, separator, credential = expected_authorization.partition(" ")
    checks = (
        (request.get_method() == "GET", "Account API preflight rejected a non-GET request."),
        (bool(expected_endpoint) and request.full_url == expected_endpoint, "Account API preflight rejected an unexpected endpoint."),
        (not endpoint_parts.query and not endpoint_parts.fragment, "Account API preflight rejected URL query or fragment data."),
        (scheme == "Bearer" and bool(separator and credential), "Account API preflight requires a Bearer user access token."),
        (body is None, "Account API preflight rejected an unexpected request body."),
        (not credential or credential not in request.full_url, "Account API preflight rejected a token in the URL."),
    )
    for valid, message in checks:
        if not valid:
            raise SafeUpstreamError(message)


def prepare_account_diagnostics(
    request: urllib.request.Request,
    body: bytes | None,
    expected_authorization: str,
    authorization_preserved: bool,
    environment: str | None,
    supplied_context: dict | None,
) -> dict:
    if environment is None:
        return {}
    _, _, credential = expected_authorization.partition(" ")
    context = {
        **(supplied_context or {}),
        "authorization_header_preserved": authorization_preserved,
        "token_in_url": bool(credential and credential in request.full_url),
        "request_body_present": body is not None,
    }
    log_account_request_diagnostics(request, environment, context)
    validate_account_request_preflight(request, expected_authorization, body, context)
    return context


def diagnostic_redaction_values(
    form: dict | None,
    expected_authorization: str,
    extra_values,
) -> tuple:
    candidates = (
        (form or {}).get("code", ""),
        expected_authorization,
        expected_authorization.partition(" ")[2],
        *tuple(extra_values or ()),
    )
    return tuple(value for value in candidates if value)


def response_status(response) -> int:
    status = getattr(response, "status", None)
    return response.getcode() if status is None else status


def log_successful_ebay_response(
    response,
    raw: bytes,
    sensitive_values,
    *,
    token_diagnostics: bool,
    account_diagnostics: bool,
) -> None:
    status = response_status(response)
    if token_diagnostics:
        log_http_response_diagnostics(status, response.headers, raw, sensitive_values)
    if account_diagnostics:
        log_account_response_diagnostics(status, response.headers, raw, sensitive_values)


def decode_error_json(raw: bytes):
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None


def raise_ebay_http_error(
    error: urllib.error.HTTPError,
    sensitive_values,
    *,
    token_diagnostics: bool,
    account_diagnostics: bool,
) -> None:
    raw = error.read(MAX_UPSTREAM_BYTES + 1)
    parsed = decode_error_json(raw)
    fallback = f"eBay returned HTTP {error.code}."
    error_code, error_description = safe_ebay_error_details(parsed, fallback, sensitive_values)
    rest_details = safe_ebay_rest_error_details(parsed, fallback, sensitive_values)
    if token_diagnostics:
        log_http_response_diagnostics(error.code, error.headers, raw, sensitive_values)
        diagnostic_log("eBay error code", error_code)
        diagnostic_log("eBay error description", error_description)
        diagnostic_log(URLLIB_EXCEPTION_LABEL, f"{type(error).__name__}: {error}")
        diagnostic_log("complete traceback (Python tracebacks do not include local variable values)")
        traceback.print_exc(file=sys.stdout)
    if account_diagnostics:
        log_account_response_diagnostics(error.code, error.headers, raw, sensitive_values, rest_details)
    if len(raw) > MAX_UPSTREAM_BYTES:
        raise SafeUpstreamError(f"eBay returned HTTP {error.code} with an oversized error response.") from None
    raise EbayHttpError(
        error.code,
        rest_details["error_id"] if account_diagnostics else error_code,
        rest_details["message"] if account_diagnostics else error_description,
        error_domain=rest_details["domain"],
        error_category=rest_details["category"],
        long_message=rest_details["long_message"],
    ) from None


def raise_ebay_transport_error(
    error: Exception,
    *,
    token_diagnostics: bool,
    account_diagnostics: bool,
) -> None:
    if token_diagnostics:
        log_transport_exception(error)
    if account_diagnostics:
        log_account_transport_exception(error)
    raise SafeUpstreamError(
        "Could not reach the eBay API. Check DNS, TLS, proxy settings, internet connection, and environment."
    ) from None


def read_ebay_response(
    request: urllib.request.Request,
    sensitive_values,
    *,
    token_diagnostics: bool,
    account_diagnostics: bool,
) -> bytes:
    try:
        with urllib.request.urlopen(request, timeout=UPSTREAM_TIMEOUT_SECONDS) as response:
            raw = response.read(MAX_UPSTREAM_BYTES + 1)
            log_successful_ebay_response(
                response,
                raw,
                sensitive_values,
                token_diagnostics=token_diagnostics,
                account_diagnostics=account_diagnostics,
            )
            return raw
    except urllib.error.HTTPError as error:
        raise_ebay_http_error(
            error,
            sensitive_values,
            token_diagnostics=token_diagnostics,
            account_diagnostics=account_diagnostics,
        )
    except urllib.error.URLError as error:
        raise_ebay_transport_error(
            error,
            token_diagnostics=token_diagnostics,
            account_diagnostics=account_diagnostics,
        )
    except OSError as error:
        # URLError is handled above. The remaining OSError family covers TLS,
        # DNS, socket timeout, and connection failures without redundant classes.
        raise_ebay_transport_error(
            error,
            token_diagnostics=token_diagnostics,
            account_diagnostics=account_diagnostics,
        )
    raise AssertionError("unreachable")


def decode_ebay_json_response(raw: bytes) -> dict:
    if len(raw) > MAX_UPSTREAM_BYTES:
        raise SafeUpstreamError("eBay response was too large and was rejected.")
    try:
        parsed = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise SafeUpstreamError("eBay returned invalid JSON.") from None
    if not isinstance(parsed, dict):
        raise SafeUpstreamError("eBay returned an unexpected response shape.")
    return parsed


def request_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict | None = None,
    form: dict | None = None,
    token_diagnostics_environment: str | None = None,
    token_diagnostics_context: dict | None = None,
    account_diagnostics_environment: str | None = None,
    account_diagnostics_context: dict | None = None,
    redaction_values=(),
) -> dict:
    """Run one validated eBay request and return a JSON object."""
    request, body, request_headers = build_ebay_request(url, method, headers, form)
    expected_authorization, authorization_preserved = authorization_header_was_preserved(
        request,
        request_headers,
    )
    diagnostic_context = dict(token_diagnostics_context or {})
    diagnostic_context["authorization_header_preserved"] = authorization_preserved
    if token_diagnostics_environment is not None:
        log_token_request_diagnostics(
            request,
            form or {},
            token_diagnostics_environment,
            body,
            diagnostic_context,
        )
    prepare_account_diagnostics(
        request,
        body,
        expected_authorization,
        authorization_preserved,
        account_diagnostics_environment,
        account_diagnostics_context,
    )
    if not authorization_preserved:
        raise SafeUpstreamError("Authorization header validation failed before the eBay request was sent.")
    sensitive_values = diagnostic_redaction_values(
        form,
        expected_authorization,
        redaction_values,
    )
    raw = read_ebay_response(
        request,
        sensitive_values,
        token_diagnostics=token_diagnostics_environment is not None,
        account_diagnostics=account_diagnostics_environment is not None,
    )
    return decode_ebay_json_response(raw)


def sanitize_selling_amount(amount) -> dict:
    if not isinstance(amount, dict):
        return {}
    value = clean_public_text(amount.get("value"), 40)
    currency = clean_public_text(amount.get("currency"), 12)
    return {
        key: item
        for key, item in (("value", value), ("currency", currency))
        if item
    }


def sanitize_selling_limit(limit) -> dict:
    if not isinstance(limit, dict):
        return {}
    result = {}
    quantity = limit.get("quantity")
    if isinstance(quantity, (int, float)) and not isinstance(quantity, bool):
        result["quantity"] = max(0, int(quantity))
    amount = sanitize_selling_amount(limit.get("amount"))
    if amount:
        result["amount"] = amount
    return result


def sanitize_privileges(data: dict) -> dict:
    """Keep only the audited read-only Account API fields."""
    result = {}
    registration = data.get("sellerRegistrationCompleted")
    if isinstance(registration, bool):
        result["sellerRegistrationCompleted"] = registration
    selling_limit = sanitize_selling_limit(data.get("sellingLimit"))
    if selling_limit:
        result["sellingLimit"] = selling_limit
    return result
#endregion


#region READ-ONLY EBAY OAUTH SERVICE
# This class owns OAuth state and tokens. It never writes listings.


def parse_and_log_token_scopes(response: dict, requested_scopes) -> tuple[str, ...]:
    """Read the optional response scope field and record safe diagnostics."""
    field_present = "scope" in response and response.get("scope") not in (None, "")
    reported = parse_token_response_scopes(response.get("scope")) if field_present else ()
    scope_diagnostic_log("token response scope field present", yes_no(field_present))
    if not field_present:
        scope_diagnostic_log("token response did not include a scope field")
        return reported
    scope_diagnostic_log("token response scope count", len(reported))
    for index, scope in enumerate(reported, start=1):
        scope_diagnostic_log(f"token response scope {index}", scope)
    scope_diagnostic_log(
        "token response scopes match requested scopes",
        yes_no(set(reported) == set(requested_scopes)),
    )
    return reported


def valid_refresh_token_from_response(response: dict) -> str:
    token = response.get("refresh_token")
    if not isinstance(token, str) or not token or token == "N/A" or len(token) > 8192:
        return ""
    return token


class EbayReadOnlyOAuthService:
    def __init__(
        self,
        environment: str,
        client_id: str,
        client_secret: str,
        runame: str,
        *,
        refresh_token_saver=None,
    ):
        self.environment = environment
        self.endpoints = ENVIRONMENTS[environment]
        self.client_id, client_id_metadata = normalize_credential_input(client_id, "EBAY_CLIENT_ID")
        self.client_secret, client_secret_metadata = normalize_credential_input(client_secret, "EBAY_CLIENT_SECRET")
        self.runame, _ = normalize_credential_input(runame, "EBAY_RUNAME")
        validate_runame(self.runame)
        client_id_bytes = self.client_id.encode("utf-8")
        client_secret_bytes = self.client_secret.encode("utf-8")
        runame_bytes = self.runame.encode("utf-8")
        if hmac.compare_digest(client_secret_bytes, runame_bytes):
            raise RuntimeError("EBAY_CLIENT_SECRET must be the Cert ID, not the RuName.")
        if hmac.compare_digest(client_id_bytes, runame_bytes):
            raise RuntimeError("EBAY_CLIENT_ID must be the App ID, not the RuName.")
        if hmac.compare_digest(client_id_bytes, client_secret_bytes):
            raise RuntimeError("EBAY_CLIENT_ID and EBAY_CLIENT_SECRET cannot be the same value.")
        self.credential_input_metadata = {
            "client_id_edge_whitespace": client_id_metadata["edge_whitespace_detected"],
            "client_secret_edge_whitespace": client_secret_metadata["edge_whitespace_detected"],
            "client_id_control_characters": client_id_metadata["control_characters_detected"],
            "client_secret_control_characters": client_secret_metadata["control_characters_detected"],
        }
        self.credential_pattern_status = credential_pattern_check(
            environment,
            self.client_id,
            self.client_secret,
        )
        self.lock = threading.RLock()
        self.pending_state = ""
        self.pending_state_expires_at = 0.0
        self.pending_requested_scopes = ()
        self.completed_state_digest = b""
        self.access_token = ""
        self.access_expires_at = 0.0
        self.access_token_requested_scopes = ()
        self.access_token_reported_scopes = ()
        self.access_token_source = ""
        self.refresh_token = ""
        self.refresh_expires_at = 0.0
        self.refresh_token_requested_scopes = ()
        self.refresh_token_saver = refresh_token_saver
        self.persistence_warning = ""

    def _basic_authorization(self) -> tuple[str, dict]:
        return build_basic_authorization(self.client_id, self.client_secret)

    def _token_diagnostic_context(self, basic_metadata: dict, *, authorization_code: bool) -> dict:
        return {
            "client_id_length": len(self.client_id),
            "masked_client_id": masked_client_id(self.client_id),
            "client_secret_length": len(self.client_secret),
            **self.credential_input_metadata,
            "basic_separator_count": basic_metadata["source_separator_count"],
            "basic_encoded_length": basic_metadata["encoded_length"],
            "basic_round_trip_verified": basic_metadata["round_trip_verified"],
            "authorization_code_processing_mode": (
                "OAuth callback query decoded once; form body encoded once with urllib.parse.urlencode"
                if authorization_code
                else "not applicable (refresh_token grant)"
            ),
        }

    def startup_credential_check_message(self) -> str:
        status = self.credential_pattern_status
        warnings = []
        if status["obvious_environment_mismatch"]:
            warnings.append("standard key naming suggests an environment mismatch")
        if status["appears_reversed"]:
            warnings.append("standard key naming suggests App ID and Cert ID may be reversed")
        if status["client_secret_looks_like_dev_id"]:
            warnings.append("the Client Secret resembles a Dev ID UUID")
        if warnings:
            return "WARNING (naming-pattern check only): " + "; ".join(warnings) + ". eBay's token response is authoritative."
        if "unknown" in {
            status["client_id_environment_hint"],
            status["client_secret_environment_hint"],
        }:
            return "No obvious environment mismatch detected; naming pattern is inconclusive. eBay's token response is authoritative."
        return "No obvious environment mismatch detected from standard eBay key naming patterns."

    def _apply_token_response(
        self,
        response: dict,
        *,
        preserve_refresh: bool,
        requested_scopes,
        source: str,
    ) -> None:
        access_token = response.get("access_token")
        if not isinstance(access_token, str) or not access_token or len(access_token) > 8192:
            raise SafeUpstreamError("eBay token response did not contain a valid access token.")
        requested_scope_list = tuple(str(scope) for scope in requested_scopes)
        reported_scopes = parse_and_log_token_scopes(response, requested_scope_list)
        now = time.time()
        expires_in = positive_int(response.get("expires_in"), 7200, 86_400)
        refresh_token = valid_refresh_token_from_response(response)
        refresh_expires_in = positive_int(response.get("refresh_token_expires_in"), 0, 63_072_000)
        self.access_token = access_token
        self.access_expires_at = now + max(60, expires_in)
        self.access_token_requested_scopes = requested_scope_list
        self.access_token_reported_scopes = reported_scopes
        self.access_token_source = source
        if refresh_token:
            self._store_refresh_token(refresh_token, now, refresh_expires_in, requested_scope_list)
        elif not preserve_refresh:
            self._clear_refresh_token_state()

    def _store_refresh_token(
        self,
        token: str,
        now: float,
        expires_in: int,
        requested_scopes,
    ) -> None:
        self.refresh_token = token
        self.refresh_expires_at = now + expires_in if expires_in else 0.0
        self.refresh_token_requested_scopes = tuple(requested_scopes)
        if not self.refresh_token_saver:
            return
        try:
            self.refresh_token_saver(token)
            self.persistence_warning = ""
        except Exception:
            self.persistence_warning = (
                "Refresh token is active in memory but could not be saved to macOS Keychain."
            )

    def _clear_refresh_token_state(self) -> None:
        self.refresh_token = ""
        self.refresh_expires_at = 0.0
        self.refresh_token_requested_scopes = ()

    def restore_refresh_token(self, refresh_token: str) -> None:
        token = str(refresh_token or "")
        if not token:
            return
        if len(token) > 8192 or contains_control_characters(token):
            raise RuntimeError("Saved eBay refresh token is invalid.")
        with self.lock:
            self.refresh_token = token
            self.refresh_expires_at = 0.0
            self.refresh_token_requested_scopes = tuple(READ_ONLY_SCOPES)
            self.access_token_source = "persistent refresh token from macOS Keychain"

    def start_authorization(self) -> dict:
        with self.lock:
            state = secrets.token_urlsafe(32)
            self.pending_state = state
            self.pending_state_expires_at = time.time() + STATE_TTL_SECONDS
            query = urllib.parse.urlencode({
                "client_id": self.client_id,
                "redirect_uri": self.runame,
                "response_type": "code",
                "scope": " ".join(READ_ONLY_SCOPES),
                "state": state,
            })
            authorization_url = f"{self.endpoints['authorization_url']}?{query}"
            scope_analysis = inspect_authorization_scope_url(authorization_url, READ_ONLY_SCOPES)
            if (
                scope_analysis["requested_scopes"] != READ_ONLY_SCOPES
                or scope_analysis["scope_parameter_count"] != 1
                or not scope_analysis["encoded_exactly_once"]
                or scope_analysis["duplicates_present"]
                or not scope_analysis["sell_account_readonly_present"]
                or scope_analysis["write_capable_present"]
            ):
                self.pending_state = ""
                self.pending_state_expires_at = 0.0
                self.pending_requested_scopes = ()
                raise SafeUpstreamError("OAuth scope validation failed before opening eBay authorization.")
            self.pending_requested_scopes = tuple(scope_analysis["requested_scopes"])
            log_authorization_scope_diagnostics(self.environment, self.runame, scope_analysis)
            oauth_log(
                "authorization URL created",
                environment=self.environment,
                authorization_host=scope_analysis["authorization_host"],
                redirect_uri=self.runame,
                expected_direct_callback=CALLBACK_URL,
            )
            return {
                "ok": True,
                "authorizationUrl": authorization_url,
                "environment": self.environment,
                "stateExpiresIn": STATE_TTL_SECONDS,
            }

    def _consume_pending_state(self, state: str, *, allow_completed: bool = False) -> bytes | None:
        state_digest = hashlib.sha256(state.encode("utf-8")).digest() if state else b""
        expected = self.pending_state
        expires_at = self.pending_state_expires_at
        now = time.time()
        if (
            allow_completed
            and not expected
            and state_digest
            and self.completed_state_digest
            and hmac.compare_digest(self.completed_state_digest, state_digest)
        ):
            oauth_log("state verified", environment=self.environment)
            oauth_log("duplicate callback ignored", environment=self.environment)
            return None
        if not expected or now > expires_at or not hmac.compare_digest(expected, state):
            # A state failure invalidates the whole unfinished flow. This prevents
            # retrying the same pending authorization after a mismatch attempt.
            self.pending_state = ""
            self.pending_state_expires_at = 0.0
            self.pending_requested_scopes = ()
            oauth_log("state verification failed", environment=self.environment)
            raise SafeUpstreamError("OAuth state is missing, expired, or does not match. Start authorization again.")
        self.pending_state = ""
        self.pending_state_expires_at = 0.0
        self.pending_requested_scopes = ()
        oauth_log("state verified", environment=self.environment)
        return state_digest

    def reject_authorization(self, state: str) -> None:
        with self.lock:
            self._consume_pending_state(state)

    def exchange_authorization_code(self, code: str, state: str) -> None:
        with self.lock:
            requested_scopes = tuple(self.pending_requested_scopes)
            state_digest = self._consume_pending_state(state, allow_completed=True)
            if state_digest is None:
                return
            if requested_scopes != READ_ONLY_SCOPES:
                oauth_log("token exchange failed: requested scope session is invalid", environment=self.environment)
                raise SafeUpstreamError("OAuth requested-scope session is missing or invalid. Start authorization again.")
            if not code or len(code) > 2048:
                oauth_log("token exchange failed: missing or invalid authorization code", environment=self.environment)
                raise SafeUpstreamError("eBay returned an invalid authorization code.")
            oauth_log("token exchange started", environment=self.environment)
            try:
                authorization_header, basic_metadata = self._basic_authorization()
                response = request_json(
                    self.endpoints["token_url"],
                    method="POST",
                    headers={"Authorization": authorization_header},
                    form={
                        "grant_type": "authorization_code",
                        "code": code,
                        "redirect_uri": self.runame,
                    },
                    token_diagnostics_environment=self.environment,
                    token_diagnostics_context=self._token_diagnostic_context(
                        basic_metadata,
                        authorization_code=True,
                    ),
                    redaction_values=(self.client_id, self.client_secret, code),
                )
                self._apply_token_response(
                    response,
                    preserve_refresh=False,
                    requested_scopes=requested_scopes,
                    source="authorization_code user access token",
                )
                self.completed_state_digest = state_digest
            except Exception as error:
                reason = safe_token_exchange_failure_reason(error)
                oauth_log(f"token exchange failed: {reason}", environment=self.environment)
                raise SafeUpstreamError(f"Token exchange failed: {reason}.") from None
            oauth_log("token exchange succeeded", environment=self.environment)

    def _valid_access_token(self) -> str:
        with self.lock:
            now = time.time()
            if self.access_token and self.access_expires_at > now + 60:
                return self.access_token
            if not self.refresh_token:
                raise SafeUpstreamError("eBay authorization is not complete or has expired.")
            if self.refresh_expires_at and self.refresh_expires_at <= now:
                self.clear_tokens()
                raise SafeUpstreamError("eBay refresh authorization expired. Authorize again.")
            requested_scopes = tuple(self.refresh_token_requested_scopes or READ_ONLY_SCOPES)
            authorization_header, _ = self._basic_authorization()
            response = request_json(
                self.endpoints["token_url"],
                method="POST",
                headers={"Authorization": authorization_header},
                form={
                    "grant_type": "refresh_token",
                    "refresh_token": self.refresh_token,
                    "scope": " ".join(requested_scopes),
                },
            )
            self._apply_token_response(
                response,
                preserve_refresh=True,
                requested_scopes=requested_scopes,
                source="refresh_token derived from authorization_code user token",
            )
            return self.access_token

    def status(self) -> dict:
        with self.lock:
            now = time.time()
            access_remaining = max(0, int(self.access_expires_at - now)) if self.access_token else 0
            refresh_available = bool(self.refresh_token and (not self.refresh_expires_at or self.refresh_expires_at > now))
            return {
                "ok": True,
                "configured": True,
                "authenticated": bool(access_remaining or refresh_available),
                "environment": self.environment,
                "accessExpiresIn": access_remaining,
                "refreshAvailable": refresh_available,
                "scopes": list(self.access_token_requested_scopes or READ_ONLY_SCOPES),
                "mode": "read-only",
                "persistenceWarning": self.persistence_warning,
            }

    def read_account(self) -> dict:
        token = self._valid_access_token()
        with self.lock:
            now = time.time()
            account_context = {
                "expected_endpoint": self.endpoints["privileges_url"],
                "access_token_length": len(token),
                "access_expires_in": max(0, int(self.access_expires_at - now)),
                "access_token_source": self.access_token_source or "authorization_code user access token",
                "requested_scopes": tuple(self.access_token_requested_scopes),
            }
        headers = {"Authorization": f"Bearer {token}"}
        privileges = request_json(
            self.endpoints["privileges_url"],
            method="GET",
            headers=headers,
            account_diagnostics_environment=self.environment,
            account_diagnostics_context=account_context,
            redaction_values=(token, self.client_secret),
        )
        account = {"sellerPrivileges": sanitize_privileges(privileges)}
        return {
            "ok": True,
            "environment": self.environment,
            "readOnly": True,
            "checkedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "account": account,
        }

    def clear_tokens(self) -> None:
        with self.lock:
            self.pending_state = ""
            self.pending_state_expires_at = 0.0
            self.pending_requested_scopes = ()
            self.completed_state_digest = b""
            self.access_token = ""
            self.access_expires_at = 0.0
            self.access_token_requested_scopes = ()
            self.access_token_reported_scopes = ()
            self.access_token_source = ""
            self.refresh_token = ""
            self.refresh_expires_at = 0.0
            self.refresh_token_requested_scopes = ()

    def clear_pending_authorization(self) -> None:
        with self.lock:
            self.pending_state = ""
            self.pending_state_expires_at = 0.0
            self.pending_requested_scopes = ()
#endregion


#region ACTIVE SERVICE AND SAVED EBAY SETTINGS
# These functions connect the saved non-secret profile to the OAuth service.
SERVICE: EbayReadOnlyOAuthService | None = None
PERSISTENCE: PersistentEbayProfile | None = None
PAIRING_CODE = ""
PAIRING_CREATED = False
SERVICE_LOCK = threading.RLock()
CALLBACK_RESULT_LOCK = threading.RLock()
LAST_CALLBACK_RESULT = {
    "ok": False,
    "title": "eBay authorization not completed",
    "message": "No OAuth callback has been received by the local backend yet.",
}


def public_profile_status(*, check_keychain: bool = True) -> dict:
    assert PERSISTENCE is not None
    profile = PERSISTENCE.load()
    environment = profile["environment"]
    secret_stored = False
    refresh_stored = False
    keychain_error = ""
    if check_keychain:
        try:
            secret_stored = bool(PERSISTENCE.get_client_secret(environment))
            refresh_stored = bool(PERSISTENCE.get_refresh_token(environment))
        except Exception:
            keychain_error = "macOS Keychain access is required."
    else:
        with SERVICE_LOCK:
            service = SERVICE
        secret_stored = service is not None
        refresh_stored = bool(service and getattr(service, "refresh_token", ""))
    return {
        "schemaVersion": PROFILE_SCHEMA_VERSION,
        "environment": environment,
        "clientId": profile.get("clientId", ""),
        "runame": profile.get("runame", ""),
        "scopes": list(READ_ONLY_SCOPES),
        "clientSecretStored": secret_stored,
        "refreshTokenStored": refresh_stored,
        "keychainError": keychain_error,
        "profilePath": str(PROFILE_PATH),
    }


def read_keychain_or_empty(reader) -> str:
    try:
        return reader()
    except Exception:
        return ""


def discard_saved_refresh_token(environment: str) -> None:
    assert PERSISTENCE is not None
    try:
        PERSISTENCE.delete_refresh_token(environment)
    except Exception:
        pass


def service_from_profile(profile: dict) -> EbayReadOnlyOAuthService | None:
    assert PERSISTENCE is not None
    environment = profile["environment"]
    client_id = profile.get("clientId", "")
    runame = profile.get("runame", "")
    client_secret = read_keychain_or_empty(
        lambda: PERSISTENCE.get_client_secret(environment)
    )
    if not client_id or not runame or not client_secret:
        return None
    return EbayReadOnlyOAuthService(
        environment,
        client_id,
        client_secret,
        runame,
        refresh_token_saver=lambda token: PERSISTENCE.set_refresh_token(environment, token),
    )


def restore_saved_refresh_token(service: EbayReadOnlyOAuthService) -> None:
    assert PERSISTENCE is not None
    token = read_keychain_or_empty(
        lambda: PERSISTENCE.get_refresh_token(service.environment)
    )
    if token:
        service.restore_refresh_token(token)


def configure_service_from_persistent(*, discard_refresh_if_changed: bool = False) -> None:
    global SERVICE
    assert PERSISTENCE is not None
    with SERVICE_LOCK:
        profile = PERSISTENCE.load()
        environment = profile["environment"]
        if discard_refresh_if_changed:
            discard_saved_refresh_token(environment)
        service = service_from_profile(profile)
        if service is not None:
            restore_saved_refresh_token(service)
        SERVICE = service


def ensure_service_loaded() -> None:
    """Load saved eBay secrets only when an eBay route actually needs them."""
    with SERVICE_LOCK:
        already_loaded = SERVICE is not None
    if not already_loaded:
        configure_service_from_persistent()


def backend_status() -> dict:
    # Status is an explicit user action, so it is safe to perform the first
    # serialized Keychain read here instead of during automatic launchd start.
    ensure_service_loaded()
    profile_status = public_profile_status(check_keychain=False)
    with SERVICE_LOCK:
        service = SERVICE
    if service is None:
        return {
            "ok": True,
            "configured": False,
            "authenticated": False,
            "environment": profile_status["environment"],
            "mode": "read-only",
            "message": "Save the eBay profile and Production Client Secret, then authorize eBay.",
            "profile": profile_status,
        }
    result = service.status()
    result["profile"] = profile_status
    result["configured"] = True
    return result


def require_service() -> EbayReadOnlyOAuthService:
    ensure_service_loaded()
    with SERVICE_LOCK:
        service = SERVICE
    if service is None:
        raise SafeUpstreamError("eBay profile or Client Secret is not configured.")
    return service


def save_profile_payload(payload: dict) -> dict:
    assert PERSISTENCE is not None
    previous = PERSISTENCE.load()
    profile = PERSISTENCE.save({
        "schemaVersion": PROFILE_SCHEMA_VERSION,
        "environment": payload.get("environment"),
        "clientId": payload.get("clientId"),
        "runame": payload.get("runame"),
    })
    changed = any(previous.get(key) != profile.get(key) for key in ("environment", "clientId", "runame"))
    if changed:
        for environment in ENVIRONMENTS:
            try:
                PERSISTENCE.delete_refresh_token(environment)
            except Exception:
                pass
    configure_service_from_persistent()
    return {"ok": True, "message": "eBay API profile saved.", "profile": public_profile_status()}


def save_client_secret_payload(payload: dict) -> dict:
    assert PERSISTENCE is not None
    profile = PERSISTENCE.load()
    environment = profile["environment"]
    secret_value = str(payload.get("clientSecret") or "")
    PERSISTENCE.set_client_secret(environment, secret_value)
    try:
        PERSISTENCE.delete_refresh_token(environment)
    except Exception:
        pass
    configure_service_from_persistent()
    return {"ok": True, "message": "Client Secret saved securely in macOS Keychain.", "profile": public_profile_status()}


def disconnect_persistent_ebay() -> dict:
    assert PERSISTENCE is not None
    profile = PERSISTENCE.load()
    try:
        PERSISTENCE.delete_refresh_token(profile["environment"])
    except Exception as error:
        raise SafeUpstreamError("The saved refresh token could not be removed from macOS Keychain.") from error
    with SERVICE_LOCK:
        if SERVICE is not None:
            SERVICE.clear_tokens()
    return {"ok": True, "message": "eBay disconnected. Saved Client Secret and profile were preserved."}


def remove_saved_credentials() -> dict:
    assert PERSISTENCE is not None
    profile = PERSISTENCE.load()
    environment = profile["environment"]
    PERSISTENCE.delete_refresh_token(environment)
    PERSISTENCE.delete_client_secret(environment)
    configure_service_from_persistent()
    return {"ok": True, "message": "Saved eBay Client Secret and refresh token were removed from macOS Keychain."}
#endregion


#region AI KEYCHAIN AND SECURE UPSTREAM PROXY


def _safe_setup_text(value, limit: int) -> str:
    text = str(value or "").strip()
    if len(text) > limit or contains_control_characters(text):
        raise SafeUpstreamError("A saved Agent setting is invalid.")
    return text


def sanitize_agent_settings(payload) -> dict:
    source = payload if isinstance(payload, dict) else {}
    settings = dict(DEFAULT_AGENT_SETTINGS)
    for key in SETUP_BOOLEAN_FIELDS:
        if key in source:
            settings[key] = bool(source.get(key))
    for key, allowed in SETUP_ENUM_FIELDS.items():
        if key in source:
            value = _safe_setup_text(source.get(key), 80)
            if value not in allowed:
                raise SafeUpstreamError("A saved Agent setting is not supported.")
            settings[key] = value
    for key, limit in SETUP_TEXT_LIMITS.items():
        if key in source:
            settings[key] = _safe_setup_text(source.get(key), limit)
    # Protected capabilities stay disabled regardless of imported settings.
    settings["webResearchEnabled"] = False
    settings["autoFillDescriptionCondition"] = False
    return settings


def load_agent_setup_profile() -> dict:
    if not SETUP_PROFILE_PATH.exists():
        return {
            "schemaVersion": SETUP_PROFILE_SCHEMA_VERSION,
            "configured": False,
            "settings": dict(DEFAULT_AGENT_SETTINGS),
            "updatedAt": "",
        }
    try:
        payload = json.loads(SETUP_PROFILE_PATH.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("not an object")
        schema = int(payload.get("schemaVersion") or SETUP_PROFILE_SCHEMA_VERSION)
        if schema > SETUP_PROFILE_SCHEMA_VERSION:
            raise ValueError("newer schema")
        return {
            "schemaVersion": SETUP_PROFILE_SCHEMA_VERSION,
            "configured": bool(payload.get("configured")),
            "settings": sanitize_agent_settings(payload.get("settings")),
            "updatedAt": _safe_setup_text(payload.get("updatedAt"), 80),
        }
    except Exception as error:
        raise RuntimeError("Saved Agent setup profile is invalid and was not overwritten.") from error


def save_agent_setup_profile(payload: dict) -> dict:
    source = payload.get("settings") if isinstance(payload, dict) and isinstance(payload.get("settings"), dict) else payload
    profile = {
        "schemaVersion": SETUP_PROFILE_SCHEMA_VERSION,
        "configured": True,
        "settings": sanitize_agent_settings(source),
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    APP_SUPPORT_DIR.mkdir(parents=True, exist_ok=True)
    temporary = SETUP_PROFILE_PATH.with_suffix(".tmp")
    encoded = (json.dumps(profile, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    with open(temporary, "wb") as handle:
        os.chmod(temporary, 0o600)
        handle.write(encoded)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, SETUP_PROFILE_PATH)
    try:
        os.chmod(SETUP_PROFILE_PATH, 0o600)
    except OSError:
        pass
    return {"ok": True, "profile": profile, "message": "Agent settings saved for future updates."}


def agent_setup_status() -> dict:
    ai = ai_key_status()
    claude = claude_key_status()
    profile = load_agent_setup_profile()
    ebay_profile = PERSISTENCE.load() if PERSISTENCE is not None else dict(DEFAULT_PROFILE)
    ai_stored = bool(ai.get("keyStored"))
    return {
        "ok": True,
        "backendReady": True,
        "backendVersion": APP_DISPLAY_VERSION,
        "pythonVersion": sys.version.split()[0],
        "profile": profile,
        "profileConfigured": bool(profile.get("configured")) if isinstance(profile, dict) else False,
        "aiKeyStored": ai_stored,
        "claudeKeyStored": bool(claude.get("keyStored")),
        "ebayProfile": {
            "environment": str(ebay_profile.get("environment") or "production"),
            "clientId": str(ebay_profile.get("clientId") or ""),
            "runame": str(ebay_profile.get("runame") or ""),
        },
        "storage": "Application Support + macOS Keychain",
        "message": (
            "Backend is ready and the GPT API key is available in this Mac's Keychain."
            if ai_stored
            else "Backend is ready. No GPT API key is stored on this Mac yet."
        ),
    }


# Chrome sends settings and a JSON body; the API key is added only here.
AI_FORBIDDEN_HEADER_NAMES = frozenset({
    "host", "content-length", "connection", "transfer-encoding", "upgrade",
    "proxy-authorization", "proxy-authenticate", "cookie", "set-cookie",
    "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "sec-fetch-user",
})
AI_SECRET_HEADER_NAMES = frozenset({
    "authorization", "x-api-key", "api-key", "x-goog-api-key", "anthropic-api-key",
})
AI_HEADER_NAME_RE = re.compile(r"^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$")


def normalize_ai_api_key(value: str) -> str:
    key = str(value or "").strip()
    if len(key) < 8 or len(key) > 8192 or contains_control_characters(key):
        raise SafeUpstreamError("API key was rejected before macOS Keychain storage.")
    return key


def get_ai_api_key() -> str:
    assert PERSISTENCE is not None
    try:
        return PERSISTENCE.keychain.get(AI_KEYCHAIN_SERVICE, AI_KEYCHAIN_ACCOUNT)
    except Exception as error:
        raise SafeUpstreamError("The API key could not be read from macOS Keychain.") from error


def save_ai_api_key_payload(payload: dict) -> dict:
    assert PERSISTENCE is not None
    key = normalize_ai_api_key(payload.get("apiKey"))
    try:
        PERSISTENCE.keychain.set(AI_KEYCHAIN_SERVICE, AI_KEYCHAIN_ACCOUNT, key)
    except Exception as error:
        raise SafeUpstreamError("The API key could not be saved to macOS Keychain.") from error
    return {"ok": True, "message": "API key saved securely in macOS Keychain.", "keyStored": True}


def remove_ai_api_key() -> dict:
    assert PERSISTENCE is not None
    try:
        PERSISTENCE.keychain.delete(AI_KEYCHAIN_SERVICE, AI_KEYCHAIN_ACCOUNT)
    except Exception as error:
        raise SafeUpstreamError("The API key could not be removed from macOS Keychain.") from error
    return {"ok": True, "message": "API key removed from macOS Keychain.", "keyStored": False}


def ai_key_status() -> dict:
    try:
        stored = bool(get_ai_api_key())
        return {
            "ok": True,
            "keyStored": stored,
            "storage": "macOS Keychain",
            "message": "API key is stored in macOS Keychain." if stored else "No API key is saved in macOS Keychain.",
        }
    except SafeUpstreamError as error:
        return {"ok": False, "keyStored": False, "storage": "macOS Keychain", "message": clean_public_text(error)}



def get_claude_api_key() -> str:
    assert PERSISTENCE is not None
    try:
        return PERSISTENCE.keychain.get(CLAUDE_KEYCHAIN_SERVICE, CLAUDE_KEYCHAIN_ACCOUNT)
    except Exception as error:
        raise SafeUpstreamError("The Claude API key could not be read from macOS Keychain.") from error


def save_claude_api_key_payload(payload: dict) -> dict:
    assert PERSISTENCE is not None
    key = normalize_ai_api_key(payload.get("apiKey") or payload.get("claudeApiKey"))
    try:
        PERSISTENCE.keychain.set(CLAUDE_KEYCHAIN_SERVICE, CLAUDE_KEYCHAIN_ACCOUNT, key)
    except Exception as error:
        raise SafeUpstreamError("The Claude API key could not be saved to macOS Keychain.") from error
    return {"ok": True, "message": "Claude API key saved securely in macOS Keychain.", "keyStored": True}


def remove_claude_api_key() -> dict:
    assert PERSISTENCE is not None
    try:
        PERSISTENCE.keychain.delete(CLAUDE_KEYCHAIN_SERVICE, CLAUDE_KEYCHAIN_ACCOUNT)
    except Exception as error:
        raise SafeUpstreamError("The Claude API key could not be removed from macOS Keychain.") from error
    return {"ok": True, "message": "Claude API key removed from macOS Keychain.", "keyStored": False}


def claude_key_status() -> dict:
    try:
        stored = bool(get_claude_api_key())
        return {
            "ok": True,
            "keyStored": stored,
            "storage": "macOS Keychain",
            "provider": "anthropic",
            "message": "Claude API key is stored in macOS Keychain." if stored else "No Claude API key is saved in macOS Keychain.",
        }
    except SafeUpstreamError as error:
        return {"ok": False, "keyStored": False, "storage": "macOS Keychain", "provider": "anthropic", "message": clean_public_text(error)}

def _validate_ai_header_name(value: str, *, allow_empty: bool = False) -> str:
    name = str(value or "").strip()
    if not name and allow_empty:
        return ""
    if not AI_HEADER_NAME_RE.fullmatch(name):
        raise SafeUpstreamError("An API header name is invalid.")
    if name.lower() in AI_FORBIDDEN_HEADER_NAMES:
        raise SafeUpstreamError("A restricted API header was rejected.")
    return name


def _validate_ai_header_value(value) -> str:
    text = str(value)
    if len(text) > 4096 or contains_control_characters(text):
        raise SafeUpstreamError("An API header value is invalid.")
    return text


def parse_ai_custom_headers(value) -> dict:
    if value is None or value == "":
        return {}
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as error:
            raise SafeUpstreamError("Custom Headers JSON is invalid.") from error
    else:
        parsed = value
    if not isinstance(parsed, dict) or len(parsed) > 40:
        raise SafeUpstreamError("Custom Headers JSON must be a small JSON object.")
    headers = {}
    for raw_name, raw_value in parsed.items():
        name = _validate_ai_header_name(raw_name)
        if name.lower() in AI_SECRET_HEADER_NAMES:
            raise SafeUpstreamError("Authentication secrets must use the API Key and Auth Header fields, not Custom Headers JSON.")
        headers[name] = _validate_ai_header_value(raw_value)
    return headers


def _host_is_local(hostname: str) -> bool:
    lowered = str(hostname or "").strip().lower().rstrip(".")
    if lowered == "localhost":
        return True
    try:
        return ipaddress.ip_address(lowered).is_loopback
    except ValueError:
        return False


def _reject_private_remote_destination(hostname: str) -> None:
    try:
        addresses = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except socket.gaierror as error:
        raise SafeUpstreamError("The API host could not be resolved.") from error
    if not addresses:
        raise SafeUpstreamError("The API host could not be resolved.")
    for entry in addresses:
        address = entry[4][0]
        try:
            ip = ipaddress.ip_address(address)
        except ValueError:
            continue
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            raise SafeUpstreamError("Private or local API destinations require Local proxy mode.")


def normalized_ai_endpoint_parts(settings: dict):
    if not isinstance(settings, dict):
        raise SafeUpstreamError("AI settings are invalid.")
    base = str(settings.get("apiBaseUrl") or "").strip().rstrip("/")
    path = str(settings.get("apiPath") or "/v1/chat/completions").strip()
    if not base:
        raise SafeUpstreamError("API Base URL is empty.")
    if not path.startswith("/"):
        path = "/" + path
    parts = urllib.parse.urlsplit(base + path)
    mode = str(settings.get("apiMode") or "openai-compatible")
    return parts, mode


def validate_ai_endpoint_identity(parts) -> None:
    if not parts.hostname or parts.username or parts.password or parts.fragment:
        raise SafeUpstreamError("The API endpoint URL is invalid.")


def validate_ai_endpoint_transport(parts, mode: str) -> None:
    if parts.scheme not in {"http", "https"}:
        raise SafeUpstreamError("The API endpoint must use HTTPS, or loopback HTTP in Local proxy mode.")
    if parts.scheme == "http" and (mode != "local-proxy" or not _host_is_local(parts.hostname)):
        raise SafeUpstreamError("Plain HTTP is allowed only for a loopback Local proxy endpoint.")
    if parts.scheme == "https" and not _host_is_local(parts.hostname):
        _reject_private_remote_destination(parts.hostname)


def build_ai_endpoint(settings: dict) -> str:
    parts, mode = normalized_ai_endpoint_parts(settings)
    validate_ai_endpoint_identity(parts)
    validate_ai_endpoint_transport(parts, mode)
    return urllib.parse.urlunsplit(parts)


def build_ai_upstream_headers(settings: dict) -> dict:
    headers = {
        "Content-Type": JSON_MEDIA_TYPE,
        "Accept": JSON_MEDIA_TYPE,
        "User-Agent": f"eBay-AI-Listing-Filler/{APP_SERVER_VERSION}",
    }
    auth_header = _validate_ai_header_name(settings.get("authHeader") or "", allow_empty=True)
    custom_headers = parse_ai_custom_headers(settings.get("customHeaders"))
    if auth_header and any(name.lower() == auth_header.lower() for name in custom_headers):
        raise SafeUpstreamError("The authentication header must use the Auth Header field, not Custom Headers JSON.")
    headers.update(custom_headers)
    if auth_header:
        key = get_ai_api_key()
        if not key:
            raise SafeUpstreamError("No API key is saved in macOS Keychain. Paste the key and press Save Settings.")
        prefix = _validate_ai_header_value(settings.get("authPrefix") or "").strip()
        headers[auth_header] = f"{prefix} {key}".strip()
    return headers


def _safe_http_status_text(status: int, reason="") -> str:
    clean_reason = clean_public_text(reason, 120)
    if clean_reason:
        return clean_reason
    try:
        return HTTPStatus(int(status)).phrase
    except (ValueError, TypeError):
        return "HTTP response"


def encode_ai_request_body(body: dict) -> bytes:
    try:
        encoded = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise SafeUpstreamError("AI request body is not valid JSON data.") from error
    if len(encoded) > MAX_AI_LOCAL_BODY_BYTES:
        raise SafeUpstreamError("AI request body is too large.")
    return encoded


def ai_timeout_seconds(payload: dict, default_seconds: int = 75) -> int:
    raw_ms = payload.get("upstreamTimeoutMs") if isinstance(payload, dict) else None
    try:
        requested = int(round(float(raw_ms) / 1000.0)) if raw_ms is not None else int(default_seconds)
    except (TypeError, ValueError, OverflowError):
        requested = int(default_seconds)
    return max(AI_UPSTREAM_MIN_TIMEOUT_SECONDS, min(requested, AI_UPSTREAM_TIMEOUT_SECONDS))


def ai_timeout_error(timeout_seconds: int) -> SafeUpstreamError:
    return SafeUpstreamError(
        f"Analysis timed out after {int(timeout_seconds)} seconds. "
        "The upstream AI request was stopped by the local backend."
    )


def ai_connection_error() -> SafeUpstreamError:
    return SafeUpstreamError(
        "Could not reach the configured AI API. "
        "Check the URL, internet connection, TLS, and provider status."
    )


def read_ai_upstream(request: urllib.request.Request, timeout_seconds: int = AI_UPSTREAM_TIMEOUT_SECONDS):
    timeout_seconds = max(AI_UPSTREAM_MIN_TIMEOUT_SECONDS, min(int(timeout_seconds), AI_UPSTREAM_TIMEOUT_SECONDS))
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            status = int(getattr(response, "status", response.getcode()))
            reason = getattr(response, "reason", "")
            response_headers = response.headers
            raw = response.read(MAX_AI_UPSTREAM_BYTES + 1)
            return status, reason, response_headers, raw
    except urllib.error.HTTPError as error:
        status = int(error.code)
        reason = getattr(error, "reason", "")
        response_headers = error.headers
        raw = error.read(MAX_AI_UPSTREAM_BYTES + 1)
        return status, reason, response_headers, raw
    except urllib.error.URLError as error:
        reason = getattr(error, "reason", None)
        if isinstance(reason, TimeoutError) or "timed out" in str(reason).lower():
            raise ai_timeout_error(timeout_seconds) from error
        raise ai_connection_error() from error
    except TimeoutError as error:
        raise ai_timeout_error(timeout_seconds) from error
    except OSError as error:
        raise ai_connection_error() from error


def decode_ai_upstream_response(raw: bytes, response_headers) -> str:
    if len(raw) > MAX_AI_UPSTREAM_BYTES:
        raise SafeUpstreamError("AI API response was too large and was rejected.")
    content_encoding = str(response_headers.get("Content-Encoding") or "").lower() if response_headers else ""
    if content_encoding and content_encoding not in {"identity"}:
        raise SafeUpstreamError("Compressed AI API responses are not supported by this secure proxy.")
    try:
        response_text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise SafeUpstreamError("AI API returned a non-UTF-8 response.") from error
    return response_text


def proxy_ai_request(payload: dict) -> dict:
    settings = payload.get("settings")
    body = payload.get("body")
    if not isinstance(settings, dict) or not isinstance(body, dict):
        raise SafeUpstreamError("AI proxy request must contain settings and a JSON request body.")
    endpoint = build_ai_endpoint(settings)
    headers = build_ai_upstream_headers(settings)
    client_request_id = clean_public_text(payload.get("clientRequestId") or "", 160)
    # OpenAI recommends X-Client-Request-Id for tracing requests even when a
    # timeout prevents receipt of the provider x-request-id. Never send this
    # extra header to arbitrary custom providers.
    try:
        endpoint_host = (urllib.parse.urlsplit(endpoint).hostname or "").lower()
    except ValueError:
        endpoint_host = ""
    if endpoint_host == "api.openai.com" and client_request_id:
        headers["X-Client-Request-Id"] = client_request_id
    encoded = encode_ai_request_body(body)
    proxy_request_id = secrets.token_urlsafe(12)
    request = urllib.request.Request(endpoint, data=encoded, headers=headers, method="POST")
    timeout_seconds = ai_timeout_seconds(payload)
    status, reason, response_headers, raw = read_ai_upstream(request, timeout_seconds)
    response_text = decode_ai_upstream_response(raw, response_headers)
    provider_request_id = ""
    if response_headers:
        for header_name in ("x-request-id", "request-id", "openai-request-id"):
            candidate = clean_public_text(response_headers.get(header_name) or "", 160)
            if candidate:
                provider_request_id = candidate
                break
    request_confirmed = 200 <= status < 300 and bool(response_text.strip())
    return {
        "ok": True,
        "upstreamStatus": status,
        "upstreamStatusText": _safe_http_status_text(status, reason),
        "responseText": response_text,
        "requestConfirmed": request_confirmed,
        "proxyRequestId": proxy_request_id,
        "providerRequestId": provider_request_id,
        "clientRequestId": client_request_id,
        "confirmedAt": int(time.time()),
    }


def proxy_claude_request(payload: dict) -> dict:
    """Fixed Anthropic Messages proxy. Endpoint and authentication cannot be supplied by Chrome."""
    body = payload.get("body")
    if not isinstance(body, dict):
        raise SafeUpstreamError("Claude proxy request must contain a JSON request body.")
    key = get_claude_api_key()
    if not key:
        raise SafeUpstreamError("No Claude API key is saved in macOS Keychain.")
    model = review_clean(body.get("model"), 120)
    if not model or not model.startswith("claude-"):
        raise SafeUpstreamError("Claude request model is invalid.")
    encoded = encode_ai_request_body(body)
    headers = {
        "Content-Type": JSON_MEDIA_TYPE,
        "Accept": JSON_MEDIA_TYPE,
        "User-Agent": f"eBay-AI-Listing-Filler/{APP_SERVER_VERSION}",
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
    }
    proxy_request_id = secrets.token_urlsafe(12)
    request = urllib.request.Request(ANTHROPIC_MESSAGES_ENDPOINT, data=encoded, headers=headers, method="POST")
    timeout_seconds = ai_timeout_seconds(payload, default_seconds=45)
    status, reason, response_headers, raw = read_ai_upstream(request, timeout_seconds)
    response_text = decode_ai_upstream_response(raw, response_headers)
    provider_request_id = ""
    if response_headers:
        for header_name in ("request-id", "x-request-id"):
            candidate = clean_public_text(response_headers.get(header_name) or "", 160)
            if candidate:
                provider_request_id = candidate
                break
    return {
        "ok": True,
        "upstreamStatus": status,
        "upstreamStatusText": _safe_http_status_text(status, reason),
        "responseText": response_text,
        "requestConfirmed": 200 <= status < 300 and bool(response_text.strip()),
        "proxyRequestId": proxy_request_id,
        "providerRequestId": provider_request_id,
        "provider": "anthropic",
        "confirmedAt": int(time.time()),
    }

#endregion


#region LOCAL MACOS VISION OCR
# OCR only extracts visible text. It never invents product facts and never writes to eBay.
def _ocr_available() -> bool:
    return sys.platform == "darwin" and Path("/usr/bin/osascript").is_file() and OCR_HELPER_PATH.is_file()


def ocr_status() -> dict:
    available = _ocr_available()
    return {
        "ok": True,
        "available": available,
        "engine": "macos_vision" if available else "unavailable",
        "helperVersion": OCR_HELPER_VERSION if available else "",
        "maxImages": OCR_MAX_IMAGES,
        "message": "Local on-device OCR is ready." if available else "Local OCR requires macOS Vision and the installed OCR helper.",
    }


def _safe_ebay_image_url(value: str) -> str:
    raw = str(value or "").strip()
    try:
        parsed = urllib.parse.urlsplit(raw)
    except ValueError as error:
        raise RuntimeError("OCR image URL is invalid.") from error
    host = str(parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme.lower() != "https" or not (host == "i.ebayimg.com" or host.endswith(".ebayimg.com")):
        raise RuntimeError("OCR accepts only HTTPS eBay image URLs or supported image data URLs.")
    if parsed.username or parsed.password or parsed.fragment:
        raise RuntimeError("OCR image URL contains unsupported credentials or fragments.")
    return urllib.parse.urlunsplit(("https", parsed.netloc, parsed.path, parsed.query, ""))


def _image_extension(media_type: str, raw: bytes) -> str:
    media = str(media_type or "").split(";", 1)[0].strip().lower()
    if media in {"image/jpeg", "image/jpg"} or raw.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if media == "image/png" or raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if media == "image/webp" or (len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP"):
        return ".webp"
    raise RuntimeError("OCR received an unsupported or invalid image format.")


def _decode_ocr_data_url(source: str) -> tuple[bytes, str]:
    match = re.fullmatch(r"data:(image/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)", source, flags=re.IGNORECASE)
    if not match:
        raise RuntimeError("OCR image data URL is invalid or unsupported.")
    media_type = match.group(1).lower()
    try:
        raw = base64.b64decode(re.sub(r"\s+", "", match.group(2)), validate=True)
    except (binascii.Error, ValueError) as error:
        raise RuntimeError("OCR image data is not valid base64.") from error
    if not raw or len(raw) > OCR_MAX_IMAGE_BYTES:
        raise RuntimeError("OCR image is empty or too large.")
    return raw, _image_extension(media_type, raw)


class _OcrSafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        safe_url = _safe_ebay_image_url(urllib.parse.urljoin(request.full_url, new_url))
        return super().redirect_request(request, fp, code, message, headers, safe_url)


def _download_ocr_image(source: str) -> tuple[bytes, str]:
    url = _safe_ebay_image_url(source)
    request = urllib.request.Request(url, headers={
        "Accept": "image/jpeg,image/png,image/webp",
        "User-Agent": f"eBay-AI-Listing-Filler/{APP_SERVER_VERSION}",
    })
    try:
        opener = urllib.request.build_opener(_OcrSafeRedirectHandler())
        with opener.open(request, timeout=UPSTREAM_TIMEOUT_SECONDS) as response:
            _safe_ebay_image_url(response.geturl())
            media_type = str(response.headers.get_content_type() or "").lower()
            if media_type not in OCR_ALLOWED_MEDIA_TYPES:
                raise RuntimeError("OCR image server returned a non-image response.")
            raw = response.read(OCR_MAX_IMAGE_BYTES + 1)
    except RuntimeError:
        raise
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise RuntimeError("OCR could not download an eBay image.") from error
    if not raw or len(raw) > OCR_MAX_IMAGE_BYTES:
        raise RuntimeError("OCR image is empty or too large.")
    return raw, _image_extension(media_type, raw)


def _load_ocr_source(source: str) -> tuple[bytes, str]:
    raw_source = str(source or "").strip()
    if raw_source.lower().startswith("data:"):
        return _decode_ocr_data_url(raw_source)
    return _download_ocr_image(raw_source)


def _normalize_focus_box(value) -> dict | None:
    if not isinstance(value, dict):
        return None
    try:
        x = max(0.0, min(1.0, float(value.get("x") or 0)))
        y = max(0.0, min(1.0, float(value.get("y") or 0)))
        width = max(0.0, min(1.0 - x, float(value.get("width") or 0)))
        height = max(0.0, min(1.0 - y, float(value.get("height") or 0)))
    except (TypeError, ValueError, OverflowError):
        return None
    if width <= 0 or height <= 0:
        return None
    return {"x": x, "y": y, "width": width, "height": height}


def _ocr_cache_key(source: str, accurate: bool, focus_box=None, smart_preprocess: bool = False) -> str:
    focus = _normalize_focus_box(focus_box)
    signature = json.dumps({"source": str(source or ""), "accurate": bool(accurate), "focus": focus, "smart": bool(smart_preprocess)}, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(signature.encode("utf-8", errors="ignore")).hexdigest()
    return f"{OCR_HELPER_VERSION}:{digest}"


def _ocr_cache_get(key: str) -> dict | None:
    now = time.monotonic()
    with OCR_CACHE_LOCK:
        entry = OCR_RESULT_CACHE.get(key)
        if not isinstance(entry, dict) or now - float(entry.get("at") or 0) > OCR_CACHE_TTL_SECONDS:
            OCR_RESULT_CACHE.pop(key, None)
            return None
        return dict(entry.get("result") or {})


def _ocr_cache_put(key: str, result: dict) -> None:
    if result.get("ok") is not True or not isinstance(result.get("blocks"), list) or not result.get("blocks"):
        return
    with OCR_CACHE_LOCK:
        OCR_RESULT_CACHE[key] = {"at": time.monotonic(), "result": dict(result)}
        if len(OCR_RESULT_CACHE) > OCR_CACHE_MAX_ITEMS:
            oldest = sorted(OCR_RESULT_CACHE.items(), key=lambda item: float(item[1].get("at") or 0))[:len(OCR_RESULT_CACHE) - OCR_CACHE_MAX_ITEMS]
            for cache_key, _ in oldest:
                OCR_RESULT_CACHE.pop(cache_key, None)




def _sips_dimensions(path: str) -> tuple[int, int] | None:
    if not OCR_SIPS_PATH.is_file():
        return None
    try:
        completed = subprocess.run(
            [str(OCR_SIPS_PATH), "-g", "pixelWidth", "-g", "pixelHeight", path],
            check=False,
            capture_output=True,
            text=True,
            timeout=15,
            env={"PATH": "/usr/bin:/bin:/usr/sbin:/sbin"},
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if completed.returncode != 0:
        return None
    width_match = re.search(r"pixelWidth:\s*(\d+)", completed.stdout or "")
    height_match = re.search(r"pixelHeight:\s*(\d+)", completed.stdout or "")
    if not width_match or not height_match:
        return None
    width, height = int(width_match.group(1)), int(height_match.group(1))
    return (width, height) if width > 0 and height > 0 else None


def _focus_crop_geometry(width: int, height: int, focus_box, margin_ratio: float = 0.16) -> dict | None:
    box = _normalize_focus_box(focus_box)
    if not box or width <= 0 or height <= 0:
        return None
    margin_x = max(0.04, box["width"] * margin_ratio)
    margin_y = max(0.05, box["height"] * margin_ratio)
    x = max(0.0, box["x"] - margin_x)
    y = max(0.0, box["y"] - margin_y)
    right = min(1.0, box["x"] + box["width"] + margin_x)
    top = min(1.0, box["y"] + box["height"] + margin_y)
    crop_width = max(1, round((right - x) * width))
    crop_height = max(1, round((top - y) * height))
    left = max(0, min(width - crop_width, round(x * width)))
    # Vision uses a bottom-left origin. sips cropOffset uses top-left coordinates.
    top_offset = max(0, min(height - crop_height, round((1.0 - top) * height)))
    return {
        "left": left,
        "top": top_offset,
        "width": crop_width,
        "height": crop_height,
        "normalized": {"x": x, "y": max(0.0, 1.0 - ((top_offset + crop_height) / height)), "width": crop_width / width, "height": crop_height / height},
    }


def _run_sips(arguments: list[str]) -> bool:
    if not OCR_SIPS_PATH.is_file():
        return False
    try:
        completed = subprocess.run(
            [str(OCR_SIPS_PATH), *arguments],
            check=False,
            capture_output=True,
            text=True,
            timeout=25,
            env={"PATH": "/usr/bin:/bin:/usr/sbin:/sbin"},
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return completed.returncode == 0


def _coreimage_preprocess_variants(source_path: str, temp_dir: str, stem: str, map_box=None) -> list[dict]:
    """Create a bounded pair of local contrast/sharpen renditions for accurate OCR.

    The helper is best-effort. A Core Image failure must never make OCR unavailable;
    the original/crop path remains the fallback.
    """
    if sys.platform != "darwin" or not OCR_PREPROCESS_HELPER_PATH.is_file() or not Path("/usr/bin/osascript").is_file():
        return []
    command = [
        "/usr/bin/osascript", "-l", "JavaScript", str(OCR_PREPROCESS_HELPER_PATH),
        source_path, temp_dir, stem,
    ]
    try:
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=25,
            env={"PATH": "/usr/bin:/bin:/usr/sbin:/sbin"},
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    if completed.returncode != 0:
        return []
    lines = [line.strip() for line in str(completed.stdout or "").splitlines() if line.strip()]
    try:
        payload = json.loads(lines[-1] if lines else "{}")
    except json.JSONDecodeError:
        return []
    if payload.get("ok") is not True or not isinstance(payload.get("variants"), list):
        return []
    variants: list[dict] = []
    for item in payload["variants"][:2]:
        if not isinstance(item, dict):
            continue
        candidate = Path(str(item.get("path") or ""))
        kind = review_clean(item.get("kind"), 30)
        if kind not in {"contrast", "sharpen"} or not candidate.is_file():
            continue
        variants.append({"path": str(candidate), "kind": kind, "mapBox": map_box})
    return variants


def _prepare_ocr_variants(path: str, temp_dir: str, record: dict, accurate: bool, smart_preprocess: bool) -> list[dict]:
    variants = [{"path": path, "kind": "original", "mapBox": None}]
    if not accurate or not smart_preprocess or not OCR_SIPS_PATH.is_file():
        return variants
    dimensions = _sips_dimensions(path)
    if not dimensions:
        return variants
    width, height = dimensions
    stem = f"photo-{record['index'] + 1}"
    focus = _focus_crop_geometry(width, height, record.get("focusBox"))
    enhancement_source: dict | None = None

    if focus and focus["width"] >= 80 and focus["height"] >= 80:
        crop_path = str(Path(temp_dir) / f"{stem}-tag-crop.png")
        cropped = _run_sips([
            "-c", str(focus["height"]), str(focus["width"]),
            "--cropOffset", str(focus["top"]), str(focus["left"]),
            path, "--out", crop_path,
        ])
        if cropped and Path(crop_path).is_file():
            enlarged_path = str(Path(temp_dir) / f"{stem}-tag-crop-large.png")
            if _run_sips(["-Z", str(OCR_PREPROCESS_MAX_SIDE), crop_path, "--out", enlarged_path]) and Path(enlarged_path).is_file():
                crop_path = enlarged_path
            enhancement_source = {"path": crop_path, "kind": "focused_crop", "mapBox": focus["normalized"]}
            variants.append(enhancement_source)
    elif max(width, height) < OCR_PREPROCESS_MAX_SIDE:
        enlarged_path = str(Path(temp_dir) / f"{stem}-full-large.png")
        if _run_sips(["-Z", str(OCR_PREPROCESS_MAX_SIDE), path, "--out", enlarged_path]) and Path(enlarged_path).is_file():
            enhancement_source = {"path": enlarged_path, "kind": "full_upscale", "mapBox": None}
            variants.append(enhancement_source)

    # V8.23.21: only the strongest crop/upscale receives extra renditions. This
    # keeps accurate OCR bounded while testing difficult text at different local
    # contrast and sharpness without any paid AI call.
    if enhancement_source:
        variants.extend(_coreimage_preprocess_variants(
            enhancement_source["path"], temp_dir, f"{stem}-ocr", enhancement_source.get("mapBox")
        ))
    return variants[:4]


def _map_variant_box(box, map_box) -> dict | None:
    normalized = _normalize_focus_box(box)
    if not normalized:
        return None
    mapped = _normalize_focus_box(map_box)
    if not mapped:
        return normalized
    return {
        "x": mapped["x"] + normalized["x"] * mapped["width"],
        "y": mapped["y"] + normalized["y"] * mapped["height"],
        "width": normalized["width"] * mapped["width"],
        "height": normalized["height"] * mapped["height"],
    }


def _merge_variant_results(results: list[tuple[dict, dict]]) -> dict:
    best: dict[str, dict] = {}
    ok = False
    messages: list[str] = []
    variants: list[str] = []
    handler_sources: list[str] = []
    observation_count = 0
    best_label_box = None
    best_rectangle_confidence = 0.0

    for variant, raw_result in results:
        if not isinstance(raw_result, dict):
            continue
        ok = ok or raw_result.get("ok") is True
        message = review_clean(raw_result.get("message"), 300)
        if message:
            messages.append(message)
        variant_kind = str(variant.get("kind") or "original")
        variants.append(variant_kind)
        handler_source = review_clean(raw_result.get("handlerSource"), 40)
        if handler_source:
            handler_sources.append(handler_source)
        observation_count += review_int(raw_result.get("observationCount"), 0, 0, 10000)

        try:
            rectangle_confidence = max(0.0, min(1.0, float(raw_result.get("rectangleConfidence") or 0)))
        except (TypeError, ValueError, OverflowError):
            rectangle_confidence = 0.0
        mapped_label_box = _map_variant_box(raw_result.get("labelBox"), variant.get("mapBox"))
        if mapped_label_box and rectangle_confidence >= best_rectangle_confidence:
            best_label_box = mapped_label_box
            best_rectangle_confidence = rectangle_confidence

        for block in raw_result.get("blocks") if isinstance(raw_result.get("blocks"), list) else []:
            if not isinstance(block, dict):
                continue
            text = review_clean(block.get("text"), 1000)
            if not text:
                continue
            try:
                confidence = max(0.0, min(1.0, float(block.get("confidence") or 0)))
            except (TypeError, ValueError, OverflowError):
                confidence = 0.0
            pass_votes = review_int(block.get("votes"), 1, 1, 8)
            mapped_box = _map_variant_box(block.get("box"), variant.get("mapBox"))
            identity_text = re.sub(r"[^a-z0-9%]+", "", unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii").lower())
            if not identity_text:
                continue
            position_key = ""
            if mapped_box:
                position_key = f":{round(mapped_box['x'], 2)}:{round(mapped_box['y'], 2)}"
            identity = identity_text + position_key
            current = best.get(identity)
            candidate = {
                "text": text,
                "confidence": confidence,
                "variant": variant_kind,
                "passVotes": pass_votes,
                "variantVotes": 1,
                "votes": pass_votes,
            }
            if mapped_box:
                candidate["box"] = mapped_box
            if current is None:
                best[identity] = candidate
                continue
            current["variantVotes"] = min(8, review_int(current.get("variantVotes"), 1, 1, 8) + 1)
            current["passVotes"] = max(review_int(current.get("passVotes"), 1, 1, 8), pass_votes)
            current["votes"] = max(current["passVotes"], current["variantVotes"])
            if confidence > float(current.get("confidence") or 0):
                current["text"] = text
                current["confidence"] = confidence
                current["variant"] = variant_kind
                if mapped_box:
                    current["box"] = mapped_box

    blocks = sorted(
        best.values(),
        key=lambda block: (
            -review_int(block.get("votes"), 1, 1, 8),
            -float(block.get("confidence") or 0),
            -float(block.get("box", {}).get("y") or 0),
            float(block.get("box", {}).get("x") or 0),
        ),
    )
    return {
        "ok": ok,
        "blocks": blocks,
        "fullText": "\n".join(block["text"] for block in blocks),
        "message": "; ".join(dict.fromkeys(messages))[:300],
        "observationCount": observation_count,
        "handlerSource": ",".join(dict.fromkeys(handler_sources))[:80],
        "preprocessVariants": list(dict.fromkeys(variants)),
        "preprocessUsed": any(kind != "original" for kind in variants),
        "labelBox": best_label_box,
        "rectangleConfidence": best_rectangle_confidence,
        "rectangleDetected": bool(best_label_box),
        "consensusBlockCount": sum(1 for block in blocks if review_int(block.get("votes"), 1, 1, 8) >= 2),
    }


def analyze_ocr_payload(payload: dict) -> dict:
    if not _ocr_available():
        return {
            "ok": False,
            "available": False,
            "engine": "unavailable",
            "photos": [],
            "warnings": ["Local OCR is unavailable. Re-run START.command on macOS."],
        }
    images = payload.get("images")
    if not isinstance(images, list) or not images:
        return {"ok": True, "available": True, "engine": "macos_vision", "photos": [], "warnings": ["No photos were supplied to OCR."], "durationMs": 0}
    if len(images) > OCR_MAX_IMAGES:
        raise RuntimeError(f"OCR accepts at most {OCR_MAX_IMAGES} photos per request.")

    started = time.monotonic()
    accurate = payload.get("accurate") is not False
    smart_preprocess = payload.get("smartPreprocess") is True
    metadata: list[dict] = []
    warnings: list[str] = []
    records: list[dict] = []
    for index, item in enumerate(images):
        if not isinstance(item, dict):
            raise RuntimeError("Each OCR image must be an object.")
        source = str(item.get("source") or "").strip()
        meta = {
            "photoId": review_clean(item.get("photoId") or f"photo-{index + 1}", 240),
            "displayNumber": review_int(item.get("displayNumber"), index + 1, 1, 999),
            "role": review_clean(item.get("role"), 120),
        }
        focus_box = _normalize_focus_box(item.get("focusBox"))
        metadata.append(meta)
        cache_key = _ocr_cache_key(source, accurate, focus_box, smart_preprocess)
        cached = _ocr_cache_get(cache_key)
        records.append({"index": index, "source": source, "meta": meta, "focusBox": focus_box, "cacheKey": cache_key, "rawResult": cached, "cacheHit": cached is not None})

    preprocess_variant_count = 0
    with tempfile.TemporaryDirectory(prefix="ebay-filler-ocr-") as temp_dir:
        misses = [record for record in records if record["rawResult"] is None]

        def load_record(record: dict) -> tuple[int, str | None, str | None]:
            try:
                raw, extension = _load_ocr_source(record["source"])
                path = Path(temp_dir) / f"photo-{record['index'] + 1}{extension}"
                path.write_bytes(raw)
                return record["index"], str(path), None
            except Exception as error:
                return record["index"], None, review_clean(str(error), 300)

        loaded_paths: dict[int, str] = {}
        if misses:
            with concurrent.futures.ThreadPoolExecutor(max_workers=min(4, len(misses))) as executor:
                futures = [executor.submit(load_record, record) for record in misses]
                for future in concurrent.futures.as_completed(futures):
                    index, path, error_text = future.result()
                    if path:
                        loaded_paths[index] = path
                    else:
                        records[index]["rawResult"] = {"ok": False, "blocks": [], "message": error_text or "OCR image could not be loaded."}

        runnable = [record for record in misses if record["index"] in loaded_paths]
        helper_version = OCR_HELPER_VERSION
        preprocess_variant_count = 0
        if runnable:
            variant_records: list[tuple[dict, dict]] = []
            for record in runnable:
                variants = _prepare_ocr_variants(loaded_paths[record["index"]], temp_dir, record, accurate, smart_preprocess)
                preprocess_variant_count += max(0, len(variants) - 1)
                for variant in variants:
                    variant_records.append((record, variant))
            paths = [variant["path"] for _, variant in variant_records]
            command = ["/usr/bin/osascript", "-l", "JavaScript", str(OCR_HELPER_PATH), "--accurate" if accurate else "--fast"]
            if not accurate:
                command.append("--detect-geometry")
            command.extend(paths)
            try:
                completed = subprocess.run(
                    command,
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=OCR_PROCESS_TIMEOUT_SECONDS,
                    env={"PATH": "/usr/bin:/bin:/usr/sbin:/sbin"},
                )
            except subprocess.TimeoutExpired as error:
                raise RuntimeError("Local OCR timed out.") from error
            if completed.returncode != 0:
                raise RuntimeError("Local OCR could not process the selected photos.")
            output_lines = [line.strip() for line in str(completed.stdout or "").splitlines() if line.strip()]
            try:
                result = json.loads(output_lines[-1] if output_lines else "{}")
            except json.JSONDecodeError as error:
                raise RuntimeError("Local OCR returned invalid data.") from error
            raw_results = result.get("results") if isinstance(result, dict) else None
            if not isinstance(raw_results, list):
                raise RuntimeError("Local OCR returned an invalid result list.")
            helper_version = review_clean(result.get("helperVersion"), 80) if isinstance(result, dict) else OCR_HELPER_VERSION
            grouped_results: dict[int, list[tuple[dict, dict]]] = {record["index"]: [] for record in runnable}
            for position, (record, variant) in enumerate(variant_records):
                raw_result = raw_results[position] if position < len(raw_results) and isinstance(raw_results[position], dict) else {}
                grouped_results[record["index"]].append((variant, raw_result))
            for record in runnable:
                raw_result = _merge_variant_results(grouped_results.get(record["index"], []))
                record["rawResult"] = raw_result
                _ocr_cache_put(record["cacheKey"], raw_result)
        else:
            preprocess_variant_count = 0

        photos = []
        for index, meta in enumerate(metadata):
            record = records[index]
            raw_result = record.get("rawResult") if isinstance(record.get("rawResult"), dict) else {}
            blocks = []
            raw_blocks = raw_result.get("blocks") if isinstance(raw_result.get("blocks"), list) else []
            for block in raw_blocks:
                if not isinstance(block, dict):
                    continue
                text = review_clean(block.get("text"), 1000)
                if not text:
                    continue
                try:
                    confidence = max(0.0, min(1.0, float(block.get("confidence") or 0)))
                except (TypeError, ValueError, OverflowError):
                    confidence = 0.0
                normalized_block = {
                    "text": text,
                    "confidence": confidence,
                    "votes": review_int(block.get("votes"), 1, 1, 8),
                    "passVotes": review_int(block.get("passVotes"), review_int(block.get("votes"), 1, 1, 8), 1, 8),
                    "variantVotes": review_int(block.get("variantVotes"), 1, 1, 8),
                    "variant": review_clean(block.get("variant"), 40),
                }
                box = block.get("box")
                if isinstance(box, dict):
                    try:
                        normalized_block["box"] = {
                            "x": max(0.0, min(1.0, float(box.get("x") or 0))),
                            "y": max(0.0, min(1.0, float(box.get("y") or 0))),
                            "width": max(0.0, min(1.0, float(box.get("width") or 0))),
                            "height": max(0.0, min(1.0, float(box.get("height") or 0))),
                        }
                    except (TypeError, ValueError, OverflowError):
                        pass
                blocks.append(normalized_block)
            photo_ok = raw_result.get("ok") is True
            message = review_clean(raw_result.get("message"), 300)
            if not photo_ok:
                warnings.append(f"OCR could not process photo {meta['displayNumber']}: {message or 'Vision request failed.'}")
            elif not blocks:
                warnings.append(f"OCR processed photo {meta['displayNumber']} but found no readable text.")
            photos.append({
                **meta,
                "ok": photo_ok,
                "textDetected": bool(blocks),
                "blocks": blocks,
                "fullText": "\n".join(block["text"] for block in blocks),
                "message": message,
                "pass": review_int(raw_result.get("pass"), 0, 0, 9),
                "observationCount": review_int(raw_result.get("observationCount"), len(blocks), 0, 10000),
                "handlerSource": review_clean(raw_result.get("handlerSource"), 80),
                "cacheHit": record.get("cacheHit") is True,
                "preprocessUsed": raw_result.get("preprocessUsed") is True,
                "preprocessVariants": [review_clean(value, 40) for value in raw_result.get("preprocessVariants", []) if review_clean(value, 40)][:6],
                "labelBox": _normalize_focus_box(raw_result.get("labelBox")),
                "rectangleConfidence": max(0.0, min(1.0, float(raw_result.get("rectangleConfidence") or 0))),
                "rectangleDetected": raw_result.get("rectangleDetected") is True,
                "consensusBlockCount": review_int(raw_result.get("consensusBlockCount"), sum(1 for block in blocks if review_int(block.get("votes"), 1, 1, 8) >= 2), 0, 10000),
            })

    block_count = sum(len(photo.get("blocks") or []) for photo in photos)
    successful_photo_count = sum(1 for photo in photos if photo.get("ok") is True)
    text_photo_count = sum(1 for photo in photos if photo.get("textDetected") is True)
    if photos and block_count == 0:
        warnings.insert(0, "Local Vision OCR completed but returned zero text blocks. Re-run START.command and inspect backend logs if label text is clearly visible.")
    return {
        "ok": True,
        "available": True,
        "engine": "macos_vision",
        "helperVersion": helper_version,
        "photos": photos,
        "photoCount": len(photos),
        "successfulPhotoCount": successful_photo_count,
        "textPhotoCount": text_photo_count,
        "emptyPhotoCount": max(0, len(photos) - text_photo_count),
        "blockCount": block_count,
        "cacheHitCount": sum(1 for record in records if record.get("cacheHit") is True),
        "preprocessVariantCount": preprocess_variant_count + sum(max(0, len(photo.get("preprocessVariants") or []) - 1) for photo in photos if photo.get("cacheHit")),
        "preprocessedPhotoCount": sum(1 for photo in photos if photo.get("preprocessUsed") is True),
        "smartPreprocess": smart_preprocess,
        "mode": "accurate" if accurate else "fast",
        "warnings": list(dict.fromkeys(warnings))[:20],
        "durationMs": int((time.monotonic() - started) * 1000),
    }
#endregion


#region OAUTH CALLBACK AND LOCAL HTTP ROUTES
# Only paired Chrome-extension requests can reach the /v1 routes below.
def set_callback_result(ok: bool, title: str, message: str) -> None:
    global LAST_CALLBACK_RESULT
    with CALLBACK_RESULT_LOCK:
        LAST_CALLBACK_RESULT = {
            "ok": bool(ok),
            "title": clean_public_text(title, 100),
            "message": clean_public_text(message, 300),
        }


def get_callback_result() -> dict:
    with CALLBACK_RESULT_LOCK:
        return dict(LAST_CALLBACK_RESULT)


def complete_oauth_callback(*, code: str, state: str, denied: str, source: str) -> None:
    service = require_service()
    oauth_log("callback received", environment=service.environment, source=source)
    if denied:
        try:
            service.reject_authorization(state)
        except Exception as error:
            set_callback_result(False, AUTHORIZATION_FAILED_TITLE, clean_public_text(error))
            raise
        set_callback_result(False, "Authorization not completed", denied)
        oauth_log("authorization declined", environment=service.environment, source=source)
        raise SafeUpstreamError(denied)
    try:
        service.exchange_authorization_code(code, state)
    except Exception as error:
        set_callback_result(False, AUTHORIZATION_FAILED_TITLE, clean_public_text(error))
        raise
    set_callback_result(True, "eBay connected", "Read-only authorization completed successfully.")


class LocalOAuthServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


class Handler(BaseHTTPRequestHandler):
    server_version = f"EbayFillerOAuth/{APP_SERVER_VERSION}"
    sys_version = ""

    def _origin(self) -> str:
        return str(self.headers.get("Origin") or "").strip()

    def _trusted_extension_origin(self) -> bool:
        origin = self._origin()
        return not origin or origin.startswith("chrome-extension://")

    def _local_host_header(self) -> bool:
        host = str(self.headers.get("Host") or "").strip().lower()
        return host in {f"{HOST}:{PORT}", f"localhost:{PORT}"}

    def _common_headers(self, content_type: str) -> None:
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        origin = self._origin()
        if origin.startswith("chrome-extension://"):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def _json(self, code: int, payload: dict) -> None:
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(code)
        self._common_headers(JSON_CONTENT_TYPE)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _html(self, code: int, title: str, message: str) -> None:
        page = (
            "<!doctype html><html><head><meta charset='utf-8'><title>"
            + html.escape(title)
            + "</title></head><body style='font-family:system-ui;padding:32px;max-width:680px'>"
            + "<h1>" + html.escape(title) + "</h1><p>" + html.escape(message) + "</p>"
            + f"<p>You can close this tab and return to eBay Filler {APP_DISPLAY_VERSION}.</p></body></html>"
        ).encode("utf-8")
        self.send_response(code)
        self._common_headers("text/html; charset=utf-8")
        self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")
        self.send_header("Content-Length", str(len(page)))
        self.end_headers()
        self.wfile.write(page)

    def _api_client_allowed(self) -> bool:
        if not self._local_host_header():
            self._json(421, {"ok": False, "message": "Invalid local Host header."})
            return False
        if not self._trusted_extension_origin():
            self._json(403, {"ok": False, "message": "Browser web pages cannot access this local API."})
            return False
        protocol = str(self.headers.get("X-Listing-Filler-Protocol") or self.headers.get("X-Ebay-Filler-Protocol") or "")
        pairing = str(self.headers.get("X-Listing-Filler-Pairing") or self.headers.get("X-Ebay-Filler-Pairing") or "")
        if protocol not in SUPPORTED_PROTOCOL_VERSIONS or not PAIRING_CODE or not hmac.compare_digest(pairing, PAIRING_CODE):
            self._json(403, {"ok": False, "message": "Local secure backend pairing code is missing or incorrect."})
            return False
        return True

    def _read_json_body(self, maximum: int = MAX_LOCAL_BODY_BYTES) -> dict | None:
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except (TypeError, ValueError):
            length = -1
        if length < 0 or length > maximum:
            self._json(413, {"ok": False, "message": "Local request body is too large."})
            return None
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json(400, {"ok": False, "message": "Local request body must be valid JSON."})
            return None
        if not isinstance(payload, dict):
            self._json(400, {"ok": False, "message": "Local request body must be a JSON object."})
            return None
        return payload

    def do_OPTIONS(self) -> None:
        if not self._local_host_header() or not self._trusted_extension_origin():
            self._json(403, {"ok": False, "message": "CORS request rejected."})
            return
        self.send_response(204)
        self._common_headers(JSON_CONTENT_TYPE)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Accept, Content-Type, X-Listing-Filler-Protocol, X-Listing-Filler-Pairing, X-Ebay-Filler-Protocol, X-Ebay-Filler-Pairing")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self) -> None:
        path = urllib.parse.urlsplit(self.path).path
        if path == CALLBACK_PATH:
            self._handle_callback()
            return
        if path == EBAY_RESULT_ROUTE:
            if not self._local_host_header():
                self._html(421, "Authorization rejected", "Invalid local result host.")
                return
            result = get_callback_result()
            self._html(200, result["title"], result["message"])
            return
        if not self._api_client_allowed():
            return
        try:
            result = self._get_api_result(path)
            if result is None:
                self._json(404, {"ok": False, "message": "Read-only endpoint not found."})
            else:
                self._json(200, result)
        except RuntimeError as error:
            self._json(502, {"ok": False, "message": clean_public_text(error)})
        except Exception:
            self._json(500, {"ok": False, "message": "Local secure backend encountered an unexpected error."})

    @staticmethod
    def _get_api_result(path: str) -> dict | None:
        routes = {
            EBAY_STATUS_ROUTE: backend_status,
            EBAY_PROFILE_ROUTE: lambda: {"ok": True, "profile": public_profile_status()},
            EBAY_ACCOUNT_ROUTE: lambda: require_service().read_account(),
            AI_STATUS_ROUTE: ai_key_status,
            SETUP_STATUS_ROUTE: agent_setup_status,
            SETUP_PROFILE_ROUTE: agent_setup_status,
            CLAUDE_STATUS_ROUTE: claude_key_status,
            OCR_STATUS_ROUTE: ocr_status,
            REVIEW_STATUS_ROUTE: review_database_status,
        }
        handler = routes.get(path)
        return handler() if handler else None

    def do_POST(self) -> None:
        if not self._api_client_allowed():
            return
        path = urllib.parse.urlsplit(self.path).path
        maximum = MAX_AI_LOCAL_BODY_BYTES if path in {AI_PROXY_ROUTE, CLAUDE_PROXY_ROUTE, OCR_ANALYZE_ROUTE} else (MAX_REVIEW_LOCAL_BODY_BYTES if path in {REVIEW_SAVE_ITEM_ROUTE, REVIEW_UPDATE_FIELD_ROUTE} else MAX_LOCAL_BODY_BYTES)
        payload = self._read_json_body(maximum)
        if payload is None:
            return
        try:
            result = self._post_api_result(path, payload)
            if result is None:
                self._json(404, {"ok": False, "message": "Read-only endpoint not found."})
            else:
                self._json(200, result)
        except RuntimeError as error:
            status_code = 400 if path in LOCAL_SETUP_ROUTES or path == OCR_ANALYZE_ROUTE else 502
            self._json(status_code, {"ok": False, "message": clean_public_text(error)})
        except Exception:
            self._json(500, {"ok": False, "message": "Local secure backend encountered an unexpected error."})

    @staticmethod
    def _post_api_result(path: str, payload: dict) -> dict | None:
        routes = {
            EBAY_OAUTH_START_ROUTE: lambda: require_service().start_authorization(),
            EBAY_OAUTH_COMPLETE_ROUTE: lambda: Handler._complete_hosted_oauth(payload),
            EBAY_PROFILE_ROUTE: lambda: save_profile_payload(payload),
            EBAY_CREDENTIALS_ROUTE: lambda: save_client_secret_payload(payload),
            EBAY_DISCONNECT_ROUTE: disconnect_persistent_ebay,
            EBAY_REMOVE_CREDENTIALS_ROUTE: remove_saved_credentials,
            AI_KEY_ROUTE: lambda: save_ai_api_key_payload(payload),
            AI_REMOVE_KEY_ROUTE: remove_ai_api_key,
            AI_PROXY_ROUTE: lambda: proxy_ai_request(payload),
            SETUP_PROFILE_ROUTE: lambda: save_agent_setup_profile(payload),
            CLAUDE_KEY_ROUTE: lambda: save_claude_api_key_payload(payload),
            CLAUDE_REMOVE_KEY_ROUTE: remove_claude_api_key,
            CLAUDE_PROXY_ROUTE: lambda: proxy_claude_request(payload),
            OCR_ANALYZE_ROUTE: lambda: analyze_ocr_payload(payload),
            REVIEW_SELECT_FOLDER_ROUTE: lambda: choose_review_database(payload),
            REVIEW_SELECT_DATABASE_ROUTE: lambda: choose_review_database(payload),
            REVIEW_SAVE_ITEM_ROUTE: lambda: save_review_item(payload),
            REVIEW_GET_ITEM_ROUTE: lambda: get_review_item(payload),
            REVIEW_LIST_ITEMS_ROUTE: lambda: list_review_items(payload),
            REVIEW_UPDATE_FIELD_ROUTE: lambda: update_review_field(payload),
        }
        handler = routes.get(path)
        return handler() if handler else None

    @staticmethod
    def _complete_hosted_oauth(payload: dict) -> dict:
        code = str(payload.get("code") or "")
        state = str(payload.get("state") or "")
        denied = clean_public_text(payload.get("error") or payload.get("errorDescription") or "")
        if len(code) > 2048 or len(state) > 512:
            message = "Hosted OAuth callback values are unexpectedly long."
            set_callback_result(False, AUTHORIZATION_FAILED_TITLE, message)
            raise SafeUpstreamError(message)
        complete_oauth_callback(
            code=code,
            state=state,
            denied=denied,
            source="hosted eBay success-page relay",
        )
        return {"ok": True, "message": "Read-only eBay authorization completed."}

    def _handle_callback(self) -> None:
        if not self._local_host_header():
            self._html(421, "Authorization rejected", "Invalid local callback host.")
            return
        require_service()
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query, keep_blank_values=True)
        state = str((query.get("state") or [""])[0])
        code = str((query.get("code") or [""])[0])
        denied = clean_public_text((query.get("error_description") or query.get("error") or [""])[0])
        if len(code) > 2048 or len(state) > 512:
            set_callback_result(False, AUTHORIZATION_FAILED_TITLE, "Direct OAuth callback values are unexpectedly long.")
            self._html(400, AUTHORIZATION_FAILED_TITLE, "Direct OAuth callback values are unexpectedly long.")
            return
        try:
            complete_oauth_callback(code=code, state=state, denied=denied, source="direct loopback callback")
            result = get_callback_result()
            self._html(200, result["title"], result["message"])
        except SafeUpstreamError:
            result = get_callback_result()
            self._html(400, result["title"], result["message"])
        except Exception:
            self._html(500, AUTHORIZATION_FAILED_TITLE, "The local OAuth backend encountered an unexpected error.")

    def do_PUT(self) -> None:
        self._json(405, {"ok": False, "message": f"Write methods are disabled in {APP_DISPLAY_VERSION}."})

    do_PATCH = do_PUT
    do_DELETE = do_PUT

    def log_message(self, format_string: str, *args) -> None:
        path = urllib.parse.urlsplit(self.path).path
        print(f"[{self.log_date_time_string()}] {self.command} {path}")
#endregion


#region COMMAND-LINE STARTUP
# START.command launches this section. It also supports safe maintenance flags.
def required_value(env_name: str, prompt: str, *, secret: bool = False) -> str:
    environment_value = os.environ.get(env_name)
    if environment_value is not None and str(environment_value).strip():
        return str(environment_value)
    if not sys.stdin.isatty():
        raise RuntimeError(f"Missing {env_name}. Start the backend in an interactive Terminal or set the environment variable.")
    value = getpass.getpass(prompt) if secret else input(prompt)
    if not str(value).strip():
        raise RuntimeError(f"{env_name} cannot be empty.")
    return str(value)


def validate_runame(runame: str) -> None:
    if "://" in runame or any(character.isspace() for character in runame):
        raise RuntimeError("EBAY_RUNAME must be the eBay RuName value, not the Auth Accepted URL.")
    if any(character in runame for character in ("?", "#", "&")):
        raise RuntimeError("EBAY_RUNAME contains URL characters. Copy only the RuName value from eBay Developers.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=f"eBay Filler {APP_DISPLAY_VERSION} unified secure localhost backend"
    )
    parser.add_argument(
        "--environment",
        choices=sorted(ENVIRONMENTS),
        default="",
        help="Optional first-run environment override. Saved profile wins after setup.",
    )
    parser.add_argument("--service", action="store_true", help="Start non-interactively for macOS launchd.")
    parser.add_argument("--ensure-native-credential", action="store_true", help="Ensure the internal Native Messaging -> Backend credential exists in macOS Keychain without printing it.")
    parser.add_argument("--authorize-keychain-access", action="store_true", help="Serially verify access to saved API secrets without printing them.")
    parser.add_argument("--configure-agent-stdin", action="store_true", help="Read one local setup JSON object from stdin, save non-secret settings, and store supplied secrets in macOS Keychain without printing them.")
    parser.add_argument("--setup-terminal", action="store_true", help="Run the one-time interactive Terminal setup. Secrets are entered with hidden input and saved only to macOS Keychain.")
    parser.add_argument("--setup-status-json", action="store_true", help="Print non-secret Agent setup/status JSON and exit. Secret values are never printed.")
    parser.add_argument("--clear-refresh-token", action="store_true", help="Remove saved eBay refresh authorization and exit.")
    return parser.parse_args()


def apply_first_run_environment(args: argparse.Namespace) -> None:
    assert PERSISTENCE is not None
    if args.environment:
        profile = PERSISTENCE.load()
        if not profile.get("clientId") and not profile.get("runame"):
            profile["environment"] = args.environment
            PERSISTENCE.save(profile)


def authorize_saved_keychain_access() -> int:
    """Touch saved credentials one at a time in a foreground process.

    No value is printed. This is used by Agent Hub recovery so macOS never
    receives simultaneous Keychain requests from launchd and another Python
    process.
    """
    assert PERSISTENCE is not None
    profile = PERSISTENCE.load()
    environment = profile.get("environment") or "production"
    checks = (
        ("eBay Client Secret", lambda: PERSISTENCE.get_client_secret(environment)),
        ("eBay refresh token", lambda: PERSISTENCE.get_refresh_token(environment)),
        ("OpenAI API key", lambda: PERSISTENCE.keychain.get(AI_KEYCHAIN_SERVICE, AI_KEYCHAIN_ACCOUNT)),
        ("Claude API key", lambda: PERSISTENCE.keychain.get(CLAUDE_KEYCHAIN_SERVICE, CLAUDE_KEYCHAIN_ACCOUNT)),
    )
    denied = 0
    for label, reader in checks:
        try:
            value = reader()
            print(f"{label}: {'saved and accessible' if value else 'not saved'}")
        except Exception:
            denied += 1
            print(f"{label}: access was not granted")
    return denied





def _write_setup_complete_marker() -> bool:
    """Create the local first-run marker only after profile + GPT Keychain are ready."""
    profile = load_agent_setup_profile()
    ai_stored = bool(ai_key_status().get("keyStored"))
    if not bool(profile.get("configured")) or not ai_stored:
        return False
    APP_SUPPORT_DIR.mkdir(parents=True, exist_ok=True)
    temporary = SETUP_COMPLETE_PATH.with_suffix(".tmp")
    with open(temporary, "w", encoding="utf-8") as handle:
        os.chmod(temporary, 0o600)
        json.dump(
            {"schemaVersion": 1, "configuredAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
            handle,
            separators=(",", ":"),
        )
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, SETUP_COMPLETE_PATH)
    try:
        os.chmod(SETUP_COMPLETE_PATH, 0o600)
    except OSError:
        pass
    return True


def _terminal_value(label: str, current: str) -> str:
    current_text = str(current or "").strip()
    suffix = f" [{current_text}]" if current_text else ""
    value = input(f"{label}{suffix}: ").strip()
    return value or current_text


def _terminal_yes_no(label: str, default: bool = False) -> bool:
    suffix = "Y/n" if default else "y/N"
    while True:
        value = input(f"{label} [{suffix}]: ").strip().lower()
        if not value:
            return default
        if value in {"y", "yes"}:
            return True
        if value in {"n", "no"}:
            return False
        print("Enter y or n.")


def _terminal_secret(label: str, *, already_saved: bool, required: bool = False) -> str:
    if already_saved:
        prompt = f"{label} [saved — press Enter to keep]: "
    elif required:
        prompt = f"{label} [required, hidden input]: "
    else:
        prompt = f"{label} [optional, hidden input]: "
    value = getpass.getpass(prompt).strip()
    if required and not already_saved and not value:
        raise SafeUpstreamError(f"{label} is required for AI mode.")
    return value


def configure_agent_terminal() -> int:
    """Foreground first-run setup used by START.command.

    The Terminal process collects secrets with getpass (no echo). Non-secret
    settings are saved to Application Support, while GPT/Claude/eBay secrets are
    sent only to macOS Keychain. Nothing secret is written to START.command,
    config JSON, release files, or command-line arguments.
    """
    assert PERSISTENCE is not None
    if not sys.stdin.isatty():
        raise SafeUpstreamError("Terminal setup requires an interactive Terminal window.")

    profile = load_agent_setup_profile()
    settings = dict(profile.get("settings") or DEFAULT_AGENT_SETTINGS)
    ebay_profile = PERSISTENCE.load()

    print(f"\n{APP_DISPLAY_VERSION} — First Setup")
    print("Press Enter to keep the value shown in [brackets].")
    print("Secret input is hidden and is stored only in macOS Keychain.\n")

    settings["apiBaseUrl"] = _terminal_value("GPT Base URL", settings.get("apiBaseUrl") or DEFAULT_AGENT_SETTINGS["apiBaseUrl"])
    settings["apiPath"] = _terminal_value("GPT Path", settings.get("apiPath") or DEFAULT_AGENT_SETTINGS["apiPath"])
    settings["apiModel"] = _terminal_value("GPT Model", settings.get("apiModel") or DEFAULT_AGENT_SETTINGS["apiModel"])
    settings["workflowMode"] = _terminal_value("Workflow mode (ai/text/hybrid)", settings.get("workflowMode") or "hybrid").lower()
    settings["tokenMode"] = _terminal_value("Token mode (cheap/balanced/quality)", settings.get("tokenMode") or "balanced").lower()
    settings["maxPhotosPerRequest"] = _terminal_value("Max photos per AI request", settings.get("maxPhotosPerRequest") or "5")
    settings["apiEnabled"] = True
    settings["saveApiKey"] = True

    try:
        gpt_saved = bool(get_ai_api_key())
    except Exception as error:
        raise SafeUpstreamError("macOS Keychain could not be opened for the GPT API key.") from error
    gpt_key = _terminal_secret("GPT API Key", already_saved=gpt_saved, required=True)

    claude_enabled = _terminal_yes_no("Enable Claude targeted Review", bool(settings.get("claudeReviewEnabled")))
    settings["claudeReviewEnabled"] = claude_enabled
    claude_key = ""
    if claude_enabled:
        settings["claudeModel"] = _terminal_value("Claude Model", settings.get("claudeModel") or DEFAULT_AGENT_SETTINGS["claudeModel"])
        try:
            claude_saved = bool(get_claude_api_key())
        except Exception as error:
            raise SafeUpstreamError("macOS Keychain could not be opened for the Claude API key.") from error
        claude_key = _terminal_secret("Claude API Key", already_saved=claude_saved, required=not claude_saved)

    configure_ebay_default = bool(ebay_profile.get("clientId") and ebay_profile.get("runame"))
    configure_ebay = _terminal_yes_no("Configure eBay Developer credentials now", configure_ebay_default)
    ebay_secret = ""
    environment = str(ebay_profile.get("environment") or "production")
    client_id = str(ebay_profile.get("clientId") or "")
    runame = str(ebay_profile.get("runame") or "")
    if configure_ebay:
        environment = _terminal_value("eBay environment (production/sandbox)", environment).lower()
        if environment not in ENVIRONMENTS:
            raise SafeUpstreamError("eBay environment must be production or sandbox.")
        client_id = _terminal_value("eBay Client ID (App ID)", client_id)
        runame = _terminal_value("eBay OAuth RuName", runame)
        if not client_id or not runame:
            raise SafeUpstreamError("eBay Client ID and RuName must be provided together.")
        validate_runame(runame)
        try:
            ebay_secret_saved = bool(PERSISTENCE.get_client_secret(environment))
        except Exception as error:
            raise SafeUpstreamError("macOS Keychain could not be opened for the eBay Client Secret.") from error
        ebay_secret = _terminal_secret("eBay Client Secret", already_saved=ebay_secret_saved, required=not ebay_secret_saved)

    # Validate all non-secret fields as one configuration before writing anything.
    sanitized = sanitize_agent_settings(settings)
    save_agent_setup_profile({"settings": sanitized})
    if gpt_key:
        save_ai_api_key_payload({"apiKey": gpt_key})
    if claude_key:
        save_claude_api_key_payload({"apiKey": claude_key})
    if configure_ebay:
        save_profile_payload({"environment": environment, "clientId": client_id, "runame": runame})
        if ebay_secret:
            save_client_secret_payload({"clientSecret": ebay_secret})

    if not _write_setup_complete_marker():
        raise SafeUpstreamError("Setup was not marked complete because the GPT API key is not available in macOS Keychain.")

    print("\nSaved successfully:")
    print("  Agent settings  ✓ Application Support")
    print("  GPT API Key     ✓ macOS Keychain")
    print(f"  Claude Review   {'✓ configured' if claude_enabled else 'off'}")
    print(f"  eBay Developer  {'✓ configured' if configure_ebay else 'skipped'}")
    print("\nSetup complete. Future START.command runs will reuse these saved values.")
    return 0


def configure_agent_from_stdin() -> int:
    """Apply one foreground Mac setup payload without exposing secret values.

    A trusted local setup client may pipe one JSON object to stdin. Non-secret
    Agent settings are persisted in Application Support. GPT/Claude/eBay secrets are written only
    to macOS Keychain. Secret values are never printed or written to release
    files/logs. Blank secret fields preserve any existing Keychain item.
    """
    assert PERSISTENCE is not None
    try:
        payload = json.load(sys.stdin)
    except Exception as error:
        raise SafeUpstreamError("Setup input must be one valid JSON object.") from error
    if not isinstance(payload, dict):
        raise SafeUpstreamError("Setup input must be one valid JSON object.")

    settings = payload.get("settings") if isinstance(payload.get("settings"), dict) else {}
    setup_result = save_agent_setup_profile({"settings": settings})

    api_key = str(payload.get("apiKey") or "").strip()
    claude_key = str(payload.get("claudeApiKey") or "").strip()
    ebay_secret = str(payload.get("ebayClientSecret") or "").strip()
    ebay = payload.get("ebay") if isinstance(payload.get("ebay"), dict) else {}

    if api_key:
        save_ai_api_key_payload({"apiKey": api_key})
    if claude_key:
        save_claude_api_key_payload({"apiKey": claude_key})

    current_ebay = PERSISTENCE.load()
    environment = str(ebay.get("environment") or current_ebay.get("environment") or "production").strip().lower()
    if environment not in ENVIRONMENTS:
        raise SafeUpstreamError("eBay environment must be production or sandbox.")
    client_id = str(ebay.get("clientId") or current_ebay.get("clientId") or "").strip()
    runame = str(ebay.get("runame") or current_ebay.get("runame") or "").strip()
    if client_id or runame:
        if not client_id or not runame:
            raise SafeUpstreamError("eBay Client ID and RuName must be provided together.")
        save_profile_payload({"environment": environment, "clientId": client_id, "runame": runame})
    if ebay_secret:
        if not client_id or not runame:
            raise SafeUpstreamError("Save eBay Client ID and RuName before Client Secret.")
        save_client_secret_payload({"clientSecret": ebay_secret})

    result = {
        "ok": True,
        "message": "Local Agent setup saved.",
        "profileConfigured": bool(setup_result.get("profile", {}).get("configured")),
        "aiKeyStored": bool(ai_key_status().get("keyStored")),
        "claudeKeyStored": bool(claude_key_status().get("keyStored")),
        "ebayProfileConfigured": bool(PERSISTENCE.load().get("clientId") and PERSISTENCE.load().get("runame")),
        "ebaySecretStored": bool(PERSISTENCE.get_client_secret(environment)) if (client_id and runame) else False,
    }
    if result["profileConfigured"] and result["aiKeyStored"]:
        _write_setup_complete_marker()
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0


def handle_maintenance_action(args: argparse.Namespace) -> bool:
    """Run one requested maintenance action; return True when startup should stop."""
    global PAIRING_CODE, PAIRING_CREATED
    assert PERSISTENCE is not None
    if args.ensure_native_credential:
        PAIRING_CODE, PAIRING_CREATED = PERSISTENCE.local_pairing_secret()
        print("Native Backend credential ready in macOS Keychain.")
        return True
    if args.authorize_keychain_access:
        raise SystemExit(1 if authorize_saved_keychain_access() else 0)
    if args.setup_status_json:
        print(json.dumps(agent_setup_status(), ensure_ascii=False, separators=(",", ":")))
        return True
    if args.configure_agent_stdin:
        raise SystemExit(configure_agent_from_stdin())
    if args.setup_terminal:
        raise SystemExit(configure_agent_terminal())
    if args.clear_refresh_token:
        profile = PERSISTENCE.load()
        PERSISTENCE.delete_refresh_token(profile["environment"])
        print("Saved eBay refresh token removed.")
        return True
    PAIRING_CODE, PAIRING_CREATED = PERSISTENCE.local_pairing_secret()
    return False


def configure_interactive_first_run(args: argparse.Namespace) -> None:
    """Keep the old Terminal setup path without mixing it into server startup."""
    if SERVICE is not None or args.service or not sys.stdin.isatty():
        return
    assert PERSISTENCE is not None
    profile = PERSISTENCE.load()
    environment = args.environment or profile.get("environment") or "production"
    client_id = profile.get("clientId") or input(
        "eBay Client ID (App ID, leave blank to configure in extension): "
    ).strip()
    runame = profile.get("runame") or input(
        "eBay OAuth RuName (leave blank to configure in extension): "
    ).strip()
    if not client_id or not runame:
        return
    PERSISTENCE.save({"environment": environment, "clientId": client_id, "runame": runame})
    save_interactive_client_secret(environment)
    configure_service_from_persistent()


def save_interactive_client_secret(environment: str) -> None:
    assert PERSISTENCE is not None
    if PERSISTENCE.get_client_secret(environment):
        return
    secret_value = getpass.getpass(
        "eBay Client Secret (leave blank to configure in extension): "
    ).strip()
    if secret_value:
        PERSISTENCE.set_client_secret(environment, secret_value)


def refresh_saved_access_token() -> None:
    if SERVICE is None:
        return
    try:
        refresh_available = bool(SERVICE.status().get("refreshAvailable"))
    except Exception:
        return
    if not refresh_available:
        return
    try:
        SERVICE._valid_access_token()
        print("Saved refresh token loaded; access token refreshed in memory.")
    except Exception:
        print("Saved eBay authorization requires renewal. Use Authorize eBay in the extension.")


def print_backend_status(args: argparse.Namespace, profile: dict) -> None:
    print(f"\n{APP_DISPLAY_VERSION} unified eBay + OpenAI + Claude backend is ready.")
    print(f"Environment: {profile['environment']}")
    print(f"Profile: {PROFILE_PATH}")
    print(f"Preferred Auth Accepted URL for the RuName: {CALLBACK_URL}")
    if SERVICE is None:
        if args.service:
            print("Saved eBay credentials will be loaded lazily after an explicit eBay action; automatic startup did not open Keychain.")
        else:
            print("Setup required: save Client ID, RuName and Client Secret from the extension Settings tab.")
    else:
        print(f"Credential environment check: {SERVICE.startup_credential_check_message()}")
        refresh_saved_access_token()
    if PAIRING_CREATED and not args.service:
        print(f"Pairing code for the extension: {PAIRING_CODE}")
    else:
        print("Shared local pairing is ready. Run START.command only if pairing must be restored.")
    print("eBay Client Secret, eBay refresh token, OpenAI API key, and Claude API key are stored separately in macOS Keychain.")
    print("eBay access token stays in memory only. The eBay API module remains strictly read-only.")
    print("AI requests use the paired localhost proxy; the OpenAI and Claude keys never enter Chrome storage.\n")


def run_local_server(args: argparse.Namespace) -> None:
    assert PERSISTENCE is not None
    with LocalOAuthServer((HOST, PORT), Handler) as server:
        profile = PERSISTENCE.load()
        print_backend_status(args, profile)
        server.serve_forever()


def main() -> None:
    global PERSISTENCE
    args = parse_args()
    PERSISTENCE = PersistentEbayProfile()
    apply_first_run_environment(args)
    if handle_maintenance_action(args):
        return
    # Beta 84: launchd startup must never open a Keychain authorization dialog.
    # Saved eBay credentials are loaded lazily by the first explicit eBay action.
    if not args.service:
        configure_service_from_persistent()
    configure_interactive_first_run(args)
    run_local_server(args)
#endregion


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped. In-memory eBay tokens were cleared.")
    except Exception as error:
        print(f"Startup error: {clean_public_text(error, 500)}", file=sys.stderr)
        sys.exit(1)
