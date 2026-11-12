"""
============================================================
BOLLYWOOD PARTY ARCADE - MSG91 & WHATSAPP OTP INTEGRATION
Integrates with MSG91 Login with OTP Widget (SendOTP v5 API)
Supports:
- WhatsApp-first delivery with SMS fallback
- Widget headless API: sendOtp, retryOtp, verifyOtp
- Client-side token verification: verifyAccessToken
- Dynamic configuration via msg91_config.json or environment variables
============================================================
"""

import os
import json
import urllib.request
import urllib.error

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "msg91_config.json")
MSG91_BASE_URL = "https://api.msg91.com/api/v5/widget"


def load_raw_config():
    """Reads configuration from msg91_config.json."""
    default_config = {
        "enabled": False,
        "authkey": "",
        "widgetId": "",
        "tokenAuth": "",
        "primaryChannel": "whatsapp",
        "msg": "Your Bollywood Party Arcade OTP is: ##OTP##"
    }
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                default_config.update(data)
        except Exception as e:
            print(f"⚠️ Error reading {CONFIG_FILE}: {e}")
    return default_config


def get_active_config():
    """
    Merges JSON file config with environment variable overrides.
    Environment variables take precedence:
    - MSG91_AUTHKEY
    - MSG91_WIDGET_ID
    - MSG91_TOKEN_AUTH
    - MSG91_ENABLED
    """
    cfg = load_raw_config()

    env_authkey = os.environ.get("MSG91_AUTHKEY")
    if env_authkey:
        cfg["authkey"] = env_authkey.strip()

    env_widget = os.environ.get("MSG91_WIDGET_ID")
    if env_widget:
        cfg["widgetId"] = env_widget.strip()

    env_token = os.environ.get("MSG91_TOKEN_AUTH")
    if env_token:
        cfg["tokenAuth"] = env_token.strip()

    env_enabled = os.environ.get("MSG91_ENABLED")
    if env_enabled is not None:
        cfg["enabled"] = env_enabled.lower() in ("true", "1", "yes")

    return cfg


def save_config(new_settings):
    """Saves updated settings to msg91_config.json."""
    cfg = load_raw_config()
    for k in ("enabled", "widgetId", "tokenAuth", "primaryChannel"):
        if k in new_settings:
            cfg[k] = new_settings[k]

    # Protect authkey: ONLY overwrite if non-empty, length >= 8, and contains NO asterisks or bullets
    new_authkey = new_settings.get("authkey")
    if new_authkey:
        new_authkey_str = str(new_authkey).strip()
        if new_authkey_str and "*" not in new_authkey_str and "•" not in new_authkey_str and len(new_authkey_str) >= 8:
            cfg["authkey"] = new_authkey_str
            print("🔑 Saved new MSG91 Authkey successfully.")
        elif "*" in new_authkey_str or "•" in new_authkey_str:
            print("🛡️ Ignored masked authkey in save payload to prevent overwriting stored key.")

    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
        print("✅ Saved updated MSG91 configuration to msg91_config.json")
        return True, "MSG91 configuration saved successfully!"
    except Exception as e:
        print(f"❌ Failed to save {CONFIG_FILE}: {e}")
        return False, str(e)


def is_msg91_configured():
    """Returns True if MSG91 is marked enabled AND both authkey and widgetId are provided."""
    cfg = get_active_config()
    return bool(cfg.get("enabled") and cfg.get("authkey") and cfg.get("widgetId"))


def get_public_client_config():
    """
    Returns safe public parameters for frontend client SDK.
    Never exposes authkey to the client browser!
    """
    cfg = get_active_config()
    is_active = is_msg91_configured()
    return {
        "enabled": is_active,
        "widgetId": cfg.get("widgetId", "") if is_active else "",
        "tokenAuth": cfg.get("tokenAuth", "") if is_active else "",
        "primaryChannel": cfg.get("primaryChannel", "whatsapp")
    }


def get_admin_masked_config():
    """Returns config for Admin UI with sensitive authkey masked."""
    cfg = get_active_config()
    raw_key = cfg.get("authkey", "")
    masked_key = ""
    if raw_key:
        if len(raw_key) > 8:
            masked_key = raw_key[:4] + ("*" * (len(raw_key) - 8)) + raw_key[-4:]
        else:
            masked_key = "****"

    return {
        "enabled": bool(cfg.get("enabled")),
        "is_configured": is_msg91_configured(),
        "has_authkey": bool(raw_key),
        "masked_authkey": masked_key,
        "authkey_masked": masked_key,
        "widgetId": cfg.get("widgetId", ""),
        "tokenAuth": cfg.get("tokenAuth", ""),
        "primaryChannel": cfg.get("primaryChannel", "whatsapp")
    }


# ============================================================
# MSG91 WIDGET API INTEGRATION HELPERS
# ============================================================

def _call_msg91_api(endpoint, payload):
    """Internal helper to make HTTP POST requests to MSG91 with authkey header."""
    cfg = get_active_config()
    authkey = cfg.get("authkey", "").strip()
    if not authkey:
        return False, {"type": "error", "message": "MSG91 authkey is not configured."}

    url = f"{MSG91_BASE_URL}/{endpoint}"
    data_bytes = json.dumps(payload).encode("utf-8")
    headers = {
        "authkey": authkey,
        "content-type": "application/json",
        "accept": "application/json"
    }

    req = urllib.request.Request(url, data=data_bytes, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8")
            data = json.loads(body)
            return True, data
    except urllib.error.HTTPError as e:
        try:
            err_body = e.read().decode("utf-8")
            data = json.loads(err_body)
            return False, data
        except Exception:
            return False, {"type": "error", "message": f"HTTP {e.code}: {e.reason}"}
    except Exception as e:
        return False, {"type": "error", "message": str(e)}


def send_otp_via_msg91(mobile):
    """
    Calls https://api.msg91.com/api/v5/widget/sendOtp
    Sends OTP via configured Widget channels (WhatsApp / SMS).
    Returns (success, message, req_id)
    """
    cfg = get_active_config()
    widget_id = cfg.get("widgetId", "")
    if not widget_id:
        return False, "MSG91 Widget ID is missing", None

    clean_mobile = mobile.strip().replace(" ", "").replace("-", "")
    if clean_mobile.startswith("+"):
        clean_mobile = clean_mobile[1:]
    if not clean_mobile.startswith("91") and len(clean_mobile) == 10:
        clean_mobile = "91" + clean_mobile

    payload = {
        "widgetId": widget_id,
        "identifier": clean_mobile
    }

    ok, resp = _call_msg91_api("sendOtp", payload)
    print(f"📡 [MSG91 sendOtp] Mobile: {clean_mobile} -> Resp: {resp}", flush=True)

    if ok and resp.get("type") == "success":
        # In MSG91, resp['message'] contains the reqId needed for verify
        req_id = resp.get("message", "")
        return True, "OTP sent successfully to your WhatsApp / Mobile number via MSG91!", req_id
    else:
        err_msg = resp.get("message", "Failed to send OTP via MSG91")
        if "Invalid Captcha Token" in str(err_msg):
            err_msg = "Google reCAPTCHA is enabled on your MSG91 Widget. To allow direct OTPs without a popup, open MSG91 Panel -> OTP -> Widgets -> Edit Widget -> turn OFF 'Google reCAPTCHA validation'. Or click 'Verify with MSG91 OTP Widget' below."
        elif "AuthenticationFailure" in str(err_msg):
            err_msg = "MSG91 Authentication Failed (Invalid Authkey). Please re-enter your unmasked MSG91 Authkey (API Key) in Admin Settings."
        return False, f"{err_msg}", None


def retry_otp_via_msg91(req_id, retry_channel=None):
    """
    Calls https://api.msg91.com/api/v5/widget/retryOtp
    Returns (success, message)
    """
    cfg = get_active_config()
    widget_id = cfg.get("widgetId", "")
    if not widget_id:
        return False, "MSG91 Widget ID missing"

    payload = {
        "widgetId": widget_id,
        "reqId": req_id
    }
    if retry_channel:
        payload["retryType"] = retry_channel

    ok, resp = _call_msg91_api("retryOtp", payload)
    if ok and resp.get("type") == "success":
        return True, "OTP resent successfully via MSG91!"
    else:
        err_msg = resp.get("message", "Failed to resend OTP via MSG91")
        return False, f"MSG91: {err_msg}"


def verify_otp_via_msg91(mobile, req_id, otp):
    """
    Calls https://api.msg91.com/api/v5/widget/verifyOtp
    Verifies the user's OTP code against the MSG91 request.
    Returns (success, message, access_token)
    """
    cfg = get_active_config()
    widget_id = cfg.get("widgetId", "")
    if not widget_id:
        return False, "MSG91 Widget ID missing", None

    clean_mobile = mobile.strip().replace(" ", "").replace("-", "")
    if clean_mobile.startswith("+"):
        clean_mobile = clean_mobile[1:]
    if not clean_mobile.startswith("91") and len(clean_mobile) == 10:
        clean_mobile = "91" + clean_mobile

    payload = {
        "widgetId": widget_id,
        "reqId": req_id,
        "otp": otp.strip(),
        "identifier": clean_mobile
    }

    ok, resp = _call_msg91_api("verifyOtp", payload)
    print(f"📡 [MSG91 verifyOtp] ReqId: {req_id} -> Resp: {resp}", flush=True)

    if ok and resp.get("type") == "success":
        access_token = resp.get("message", "")
        return True, "OTP verified successfully via MSG91!", access_token
    else:
        err_msg = resp.get("message", "Invalid or expired OTP code")
        return False, f"MSG91: {err_msg}", None


def verify_access_token_via_msg91(access_token):
    """
    Calls https://api.msg91.com/api/v5/widget/verifyAccessToken
    Validates the client-side widget token and returns the verified phone number.
    Returns (success, verified_mobile_or_error)
    """
    if not access_token:
        return False, "Missing MSG91 access token"

    payload = {
        "access-token": access_token.strip()
    }

    ok, resp = _call_msg91_api("verifyAccessToken", payload)
    print(f"📡 [MSG91 verifyAccessToken] Resp: {resp}", flush=True)

    if ok and resp.get("type") == "success":
        # resp['message'] is the verified identifier e.g. "919899259836"
        verified_ident = str(resp.get("message", "")).strip()
        # Clean down to 10-digit Indian number if it has country code
        if verified_ident.startswith("91") and len(verified_ident) == 12:
            verified_ident = verified_ident[2:]
        elif verified_ident.startswith("+91") and len(verified_ident) == 13:
            verified_ident = verified_ident[3:]

        return True, verified_ident
    else:
        err_msg = resp.get("message", "Failed to verify MSG91 access token")
        return False, f"MSG91: {err_msg}"
