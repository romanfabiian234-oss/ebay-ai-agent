#!/usr/bin/env python3
"""Chrome Native Messaging bridge for eBay AI Agent.

The extension never receives the localhost pairing secret. Chrome authorizes this
host by exact extension origin, then this process retrieves the internal pairing
secret from macOS Keychain and relays only allow-listed local Backend routes.
All stdout bytes belong to the Native Messaging protocol; diagnostics use stderr.
"""
from __future__ import annotations

import json
import os
import struct
import sys
import urllib.error
import urllib.request
from pathlib import Path

EXPECTED_EXTENSION_ORIGIN = "chrome-extension://jemamkjcijdmmmgknhejdmceachdildh/"
HOST = "127.0.0.1"
PORT = 8790
BASE_URL = f"http://{HOST}:{PORT}"
PROTOCOL = "6.9.0"
LEGACY_PROTOCOL = "6.8.0"
MAX_INBOUND_BYTES = 64 * 1024 * 1024
# Chrome limits a message from native host to 1 MiB. Leave headroom for JSON framing.
MAX_NATIVE_RESPONSE_BYTES = 900_000

GET_PATHS = frozenset({
    "/v1/ebay/status",
    "/v1/ebay/profile",
    "/v1/ebay/account",
    "/v1/ai/status",
    "/v1/setup/status",
    "/v1/setup/profile",
    "/v1/claude/status",
    "/v1/ocr/status",
    "/v1/review/status",
})
POST_PATHS = frozenset({
    "/v1/ebay/profile",
    "/v1/ebay/credentials",
    "/v1/ebay/oauth/start",
    "/v1/ebay/oauth/complete",
    "/v1/ebay/disconnect",
    "/v1/ebay/remove-credentials",
    "/v1/ai/key",
    "/v1/ai/remove-key",
    "/v1/ai/proxy",
    "/v1/setup/profile",
    "/v1/claude/key",
    "/v1/claude/remove-key",
    "/v1/claude/proxy",
    "/v1/ocr/analyze",
    "/v1/review/folder/select",
    "/v1/review/database/select",
    "/v1/review/item/save",
    "/v1/review/item/get",
    "/v1/review/item/list",
    "/v1/review/item/update-field",
})


def _stderr(message: str) -> None:
    try:
        print(f"[eBay AI Agent native host] {message}", file=sys.stderr, flush=True)
    except Exception:
        pass


def _read_message() -> dict | None:
    header = sys.stdin.buffer.read(4)
    if not header:
        return None
    if len(header) != 4:
        raise RuntimeError("Native message header is incomplete.")
    length = struct.unpack("=I", header)[0]
    if length <= 0 or length > MAX_INBOUND_BYTES:
        raise RuntimeError("Native message size is invalid.")
    raw = sys.stdin.buffer.read(length)
    if len(raw) != length:
        raise RuntimeError("Native message body is incomplete.")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("Native message is not valid JSON.") from error
    if not isinstance(payload, dict):
        raise RuntimeError("Native message must be a JSON object.")
    return payload


def _write_message(payload: dict) -> None:
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(raw) > MAX_NATIVE_RESPONSE_BYTES:
        raw = json.dumps(
            {"ok": False, "message": "Local Backend response exceeded the Native Messaging safety limit."},
            separators=(",", ":"),
        ).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(raw)))
    sys.stdout.buffer.write(raw)
    sys.stdout.buffer.flush()


def _load_internal_pairing() -> str:
    # Import the installed Backend module from this same directory. Importing it
    # does not start the HTTP server because server.py is guarded by __main__.
    backend_dir = Path(__file__).resolve().parent
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))
    import server  # pylint: disable=import-outside-toplevel

    persistence = server.PersistentEbayProfile()
    value, _created = persistence.local_pairing_secret()
    pairing = str(value or "").strip()
    if not pairing:
        raise RuntimeError("Internal Backend credential is unavailable in macOS Keychain.")
    return pairing


def _validate_request(message: dict) -> tuple[str, str, dict, float, int]:
    if message.get("type") != "backend_request":
        raise RuntimeError("Unsupported Native Messaging request type.")
    method = str(message.get("method") or "GET").upper()
    path = str(message.get("path") or "").strip()
    allowed = GET_PATHS if method == "GET" else POST_PATHS if method == "POST" else frozenset()
    if path not in allowed:
        raise RuntimeError("Native Backend route is not allowed.")
    payload = message.get("payload") if isinstance(message.get("payload"), dict) else {}
    try:
        timeout_ms = int(message.get("timeoutMs") or 30_000)
    except (TypeError, ValueError):
        timeout_ms = 30_000
    timeout_seconds = max(1.0, min(timeout_ms / 1000.0, 180.0))
    try:
        requested_max = int(message.get("maximumChars") or 262_144)
    except (TypeError, ValueError):
        requested_max = 262_144
    maximum_bytes = max(4_096, min(requested_max, MAX_NATIVE_RESPONSE_BYTES - 16_384))
    return method, path, payload, timeout_seconds, maximum_bytes


def _backend_request(message: dict) -> dict:
    method, path, payload, timeout_seconds, maximum_bytes = _validate_request(message)
    pairing = _load_internal_pairing()
    headers = {
        "Accept": "application/json",
        "X-Listing-Filler-Protocol": PROTOCOL,
        "X-Listing-Filler-Pairing": pairing,
        "X-Ebay-Filler-Protocol": LEGACY_PROTOCOL,
        "X-Ebay-Filler-Pairing": pairing,
    }
    body = None
    if method == "POST":
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(f"{BASE_URL}{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            raw = response.read(maximum_bytes + 1)
            status = int(getattr(response, "status", 200) or 200)
    except urllib.error.HTTPError as error:
        raw = error.read(maximum_bytes + 1)
        status = int(error.code or 500)
    except urllib.error.URLError as error:
        raise RuntimeError("Local Backend is not running or could not be reached.") from error
    if len(raw) > maximum_bytes:
        raise RuntimeError("Local Backend response is too large for this operation.")
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("Local Backend returned invalid JSON.") from error
    if not isinstance(data, dict):
        raise RuntimeError("Local Backend returned an invalid response.")
    if status < 200 or status >= 300 or data.get("ok") is False:
        return {"ok": False, "message": str(data.get("message") or f"HTTP {status}")[:500]}
    return {"ok": True, "data": data}


def main() -> int:
    origin = str(sys.argv[1] if len(sys.argv) > 1 else "")
    if origin != EXPECTED_EXTENSION_ORIGIN:
        _stderr("Rejected caller origin.")
        return 2
    while True:
        try:
            message = _read_message()
            if message is None:
                return 0
            response = _backend_request(message)
        except Exception as error:  # Never expose tracebacks or secret material to Chrome.
            response = {"ok": False, "message": str(error)[:500] or "Native host request failed."}
        _write_message(response)


if __name__ == "__main__":
    raise SystemExit(main())
