"""
Creates the 'Facebook Keywords' table in Airtable and pre-populates it
with the default keyword set used for Facebook post filtering.

Run once: python setup_facebook_keywords_table.py
"""
import os
import json
import urllib.request
import urllib.error

AIRTABLE_TOKEN = os.environ.get('AIRTABLE_API_TOKEN', '')
BASE_ID = os.environ.get('AIRTABLE_BASE_ID', '')

if not AIRTABLE_TOKEN or not BASE_ID:
    raise SystemExit("Set AIRTABLE_API_TOKEN and AIRTABLE_BASE_ID env vars first.")

META_URL = f"https://api.airtable.com/v0/meta/bases/{BASE_ID}/tables"
RECORDS_URL_TPL = "https://api.airtable.com/v0/{base_id}/Facebook%20Keywords"

HEADERS = {
    "Authorization": f"Bearer {AIRTABLE_TOKEN}",
    "Content-Type": "application/json",
}

# ---- Default keyword set ----
DEFAULT_KEYWORDS = [
    # Retention & Churn
    ("client retention",        "Retention & Churn"),
    ("client churn",            "Retention & Churn"),
    ("retain clients",          "Retention & Churn"),
    ("losing clients",          "Retention & Churn"),
    ("lost a client",           "Retention & Churn"),
    ("clients leaving",         "Retention & Churn"),
    ("client turnover",         "Retention & Churn"),
    ("customer churn",          "Retention & Churn"),
    ("customer retention",      "Retention & Churn"),
    ("agency retention",        "Retention & Churn"),
    ("client cancelled",        "Retention & Churn"),
    ("clients keep leaving",    "Retention & Churn"),
    ("high churn",              "Retention & Churn"),
    ("reduce churn",            "Retention & Churn"),
    ("churn rate",              "Retention & Churn"),
    # Emotional / Friction
    ("frustrated with clients", "Emotional / Friction"),
    ("client complaints",       "Emotional / Friction"),
    ("difficult clients",       "Emotional / Friction"),
    ("unhappy clients",         "Emotional / Friction"),
    ("client ghosted",          "Emotional / Friction"),
    ("fire a client",           "Emotional / Friction"),
    ("client is leaving",       "Emotional / Friction"),
    ("client at risk",          "Emotional / Friction"),
    ("client escalation",       "Emotional / Friction"),
    ("client lifetime value",   "Emotional / Friction"),
    ("lost the account",        "Emotional / Friction"),
    # Process / Systems
    ("client health score",     "Process / Systems"),
    ("client health",           "Process / Systems"),
    ("customer health score",   "Process / Systems"),
    ("client onboarding",       "Process / Systems"),
    ("client success",          "Process / Systems"),
    ("customer success manager","Process / Systems"),
    ("CSM",                     "Process / Systems"),
    ("client dashboard",        "Process / Systems"),
    ("client portal",           "Process / Systems"),
    ("client reporting",        "Process / Systems"),
    ("book of business",        "Process / Systems"),
    ("account management systems","Process / Systems"),
]


def api_request(url, method="GET", payload=None):
    data = json.dumps(payload).encode() if payload else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


# Step 1: Create the table
print("Creating 'Facebook Keywords' table...")
table_payload = {
    "name": "Facebook Keywords",
    "description": "Keywords used to pre-filter Facebook group posts before AI scoring.",
    "fields": [
        {"name": "Keyword",  "type": "singleLineText"},
        {"name": "Category", "type": "singleLineText"},
        {"name": "Active",   "type": "checkbox", "options": {"icon": "check", "color": "greenBright"}},
    ],
}

try:
    result = api_request(META_URL, "POST", table_payload)
    print(f"✅  Table created: {result.get('name')} (id: {result.get('id')})")
except urllib.error.HTTPError as e:
    body = e.read().decode()
    if "DUPLICATE_TABLE_NAME" in body or "already exists" in body.lower():
        print("ℹ️   'Facebook Keywords' table already exists — skipping creation, will still populate.")
    else:
        print(f"❌  HTTP {e.code}: {body}")
        raise

# Step 2: Check if already populated
records_url = RECORDS_URL_TPL.format(base_id=BASE_ID)
existing = api_request(records_url + "?maxRecords=1")
if existing.get("records"):
    print("ℹ️   Table already has records — skipping seed population.")
    raise SystemExit(0)

# Step 3: Batch-insert default keywords (Airtable max 10 per request)
print(f"Seeding {len(DEFAULT_KEYWORDS)} default keywords...")
batch_size = 10
for i in range(0, len(DEFAULT_KEYWORDS), batch_size):
    batch = DEFAULT_KEYWORDS[i:i + batch_size]
    payload = {
        "records": [
            {"fields": {"Keyword": kw, "Category": cat, "Active": True}}
            for kw, cat in batch
        ]
    }
    api_request(records_url, "POST", payload)
    print(f"  Inserted {i + len(batch)}/{len(DEFAULT_KEYWORDS)}...")

print(f"✅  Done — {len(DEFAULT_KEYWORDS)} keywords seeded.")
