"""
setup_sources_table.py — One-time script to create the Airtable "Sources" table
and seed it with Facebook groups and LinkedIn terms from config.yaml.

Run once: python setup_sources_table.py
"""

import os
import sys
import json
import yaml
import requests
from dotenv import dotenv_values

# Load credentials
env = dotenv_values(".env")
AIRTABLE_TOKEN = env.get("AIRTABLE_API_TOKEN")
BASE_ID = env.get("AIRTABLE_BASE_ID")

if not AIRTABLE_TOKEN or not BASE_ID:
    print("ERROR: Missing AIRTABLE_API_TOKEN or AIRTABLE_BASE_ID in .env")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {AIRTABLE_TOKEN}",
    "Content-Type": "application/json",
}

# Load config
with open("config.yaml") as f:
    config = yaml.safe_load(f)


def create_sources_table():
    """Create the Sources table with the required fields via Airtable Metadata API."""
    print("Creating Sources table...")

    url = f"https://api.airtable.com/v0/meta/bases/{BASE_ID}/tables"
    payload = {
        "name": "Sources",
        "description": "Facebook groups and LinkedIn search terms monitored by the scraper",
        "fields": [
            {
                "name": "Name",
                "type": "singleLineText",
                "description": "Display name for this source"
            },
            {
                "name": "Type",
                "type": "singleSelect",
                "description": "facebook_group or linkedin_term",
                "options": {
                    "choices": [
                        {"name": "facebook_group", "color": "blueLight2"},
                        {"name": "linkedin_term", "color": "cyanLight2"},
                    ]
                }
            },
            {
                "name": "Value",
                "type": "singleLineText",
                "description": "URL (for Facebook groups) or search term (for LinkedIn)"
            },
            {
                "name": "Active",
                "type": "checkbox",
                "description": "Whether this source is currently being scraped",
                "options": {
                    "icon": "check",
                    "color": "greenBright"
                }
            },
            {
                "name": "Priority",
                "type": "singleSelect",
                "description": "Scraping priority level",
                "options": {
                    "choices": [
                        {"name": "high", "color": "blueLight2"},
                        {"name": "medium", "color": "yellowLight2"},
                        {"name": "low", "color": "grayLight2"},
                    ]
                }
            },
        ]
    }

    resp = requests.post(url, headers=HEADERS, json=payload)

    if resp.status_code == 200:
        data = resp.json()
        print(f"  Created table with ID: {data['id']}")
        return data["id"]
    elif resp.status_code == 422 and "already exists" in resp.text.lower():
        print("  Table already exists — fetching existing table ID...")
        tables_resp = requests.get(url, headers=HEADERS)
        tables = tables_resp.json().get("tables", [])
        for t in tables:
            if t["name"] == "Sources":
                print(f"  Found existing table ID: {t['id']}")
                return t["id"]
    else:
        print(f"  ERROR creating table: {resp.status_code} {resp.text}")
        sys.exit(1)


def seed_sources():
    """Seed the Sources table with data from config.yaml."""
    print("\nSeeding Sources table...")

    records_url = f"https://api.airtable.com/v0/{BASE_ID}/Sources"

    # Check if already seeded
    check = requests.get(records_url, headers=HEADERS, params={"maxRecords": 1})
    if check.status_code == 200 and len(check.json().get("records", [])) > 0:
        print("  Sources table already has records — skipping seed.")
        print("  (Delete existing records manually if you want to re-seed.)")
        return

    # Build records for Facebook groups
    facebook_records = []
    for group in config.get("facebook_groups", []):
        facebook_records.append({
            "fields": {
                "Name": group["name"],
                "Type": "facebook_group",
                "Value": group["url"],
                "Active": True,
                "Priority": group.get("priority", "medium").lower(),
            }
        })

    # Build records for LinkedIn terms
    linkedin_records = []
    for term in config.get("linkedin_search_terms", []):
        linkedin_records.append({
            "fields": {
                "Name": term,
                "Type": "linkedin_term",
                "Value": term,
                "Active": True,
                "Priority": "high",
            }
        })

    all_records = facebook_records + linkedin_records

    # Airtable batch limit is 10 records per request
    created = 0
    for i in range(0, len(all_records), 10):
        batch = all_records[i:i+10]
        resp = requests.post(records_url, headers=HEADERS, json={"records": batch})
        if resp.status_code == 200:
            created += len(resp.json().get("records", []))
            print(f"  Batch {i//10 + 1}: created {len(batch)} records")
        else:
            print(f"  ERROR on batch {i//10 + 1}: {resp.status_code} {resp.text}")

    print(f"\nDone. Created {created} source records total.")
    print(f"  - {len(facebook_records)} Facebook groups")
    print(f"  - {len(linkedin_records)} LinkedIn terms")


if __name__ == "__main__":
    table_id = create_sources_table()
    seed_sources()
    print("\nSources table is ready.")
    print("The dashboard and agent will now read from Airtable instead of config.yaml.")
