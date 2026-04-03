"""
Creates the 'Business Profile' table in Airtable with all required fields.
Run once: python setup_business_profile_table.py
"""
import os
import json
import urllib.request
import urllib.error

AIRTABLE_TOKEN = os.environ.get('AIRTABLE_API_TOKEN', '')
BASE_ID = os.environ.get('AIRTABLE_BASE_ID', '')

if not AIRTABLE_TOKEN or not BASE_ID:
    raise SystemExit("Set AIRTABLE_API_TOKEN and AIRTABLE_BASE_ID env vars first.")

url = f"https://api.airtable.com/v0/meta/bases/{BASE_ID}/tables"
headers = {
    "Authorization": f"Bearer {AIRTABLE_TOKEN}",
    "Content-Type": "application/json",
}

payload = {
    "name": "Business Profile",
    "description": "Single-record tenant configuration used to personalise AI scoring.",
    "fields": [
        {"name": "Business Name", "type": "singleLineText"},
        {"name": "Industry",      "type": "singleLineText"},
        {"name": "Ideal Client",  "type": "multilineText"},
        {"name": "Problem Solved","type": "multilineText"},
        {"name": "Signal Types",  "type": "multilineText"},
        {"name": "Updated At",    "type": "singleLineText"},
    ],
}

req = urllib.request.Request(
    url,
    data=json.dumps(payload).encode(),
    headers=headers,
    method="POST",
)

try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
        print(f"✅  Table created: {data.get('name')} (id: {data.get('id')})")
except urllib.error.HTTPError as e:
    body = e.read().decode()
    # Table already exists → not a blocking error
    if "DUPLICATE_TABLE_NAME" in body or "already exists" in body.lower():
        print("ℹ️   'Business Profile' table already exists — nothing to do.")
    else:
        print(f"❌  HTTP {e.code}: {body}")
        raise
