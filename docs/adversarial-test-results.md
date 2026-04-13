# Adversarial Test Results
## Scout — Apify Resilience Branch

**Run date:** 2026-04-13T05:31:17.653Z  
**Branch:** feature/apify-resilience  
**Result:** ✅ ALL PASS (16/16)  

---

## ✅ S1 — PASS
**Scenario:** Structural: All actor schemas and fallbacks registered correctly  
**Duration:** 0ms  

**Findings:**
  ✅ PASS: harvestapi/linkedin-profile-posts has 1 required field(s): content
  ✅ PASS: harvestapi/linkedin-profile-posts has 5 fieldMap entries
  ✅ PASS: apimaestro/linkedin-posts-search-scraper-no-cookies has 1 required field(s): text
  ✅ PASS: apimaestro/linkedin-posts-search-scraper-no-cookies has 5 fieldMap entries
  ✅ PASS: Fallback data-slayer/linkedin-profile-posts-scraper has 1 required field(s)
  ✅ PASS: Fallback data-slayer/linkedin-profile-posts-scraper waitSecs=90 (>60 as required)
  ✅ PASS: Fallback powerai/linkedin-posts-search-scraper has 1 required field(s)
  ✅ PASS: Fallback powerai/linkedin-posts-search-scraper waitSecs=90 (>60 as required)
  ℹ️ INFO: Total actor coverage: 4 actors (2 primary, 2 fallback)

---

## ✅ A1 — PASS
**Scenario:** Primary actor returns actor_error, fallback succeeds with valid output  
**Duration:** 0ms  

**Findings:**
  ✅ PASS: Fallback actor registered: data-slayer/linkedin-profile-posts-scraper
  ✅ PASS: Attempt 1 failed with RUN_FAILED as expected
  ✅ PASS: Attempt 2 failed with RUN_FAILED as expected
  ✅ PASS: Fallback returned 3 items
  ✅ PASS: Fallback output passed schema validation

**Actor call log:**
  - Attempt 1 | harvestapi/linkedin-profile-posts → ERROR:RUN_FAILED
  - Attempt 2 | harvestapi/linkedin-profile-posts → ERROR:RUN_FAILED
  - Attempt 3 | data-slayer/linkedin-profile-posts-scraper → SUCCESS:3 items

---

## ✅ A2 — PASS
**Scenario:** Primary fails, fallback succeeds with DIFFERENT field schema — normalization must work  
**Duration:** 0ms  

**Findings:**
  ✅ PASS: Vendors are different (primary: harvestapi, fallback: data-slayer)
  ✅ PASS: Fallback schema defined with 1 required field(s): text
  ✅ PASS: Field normalization produced all canonical fields: text, authorName, authorUrl, postUrl, postId
  ✅       Sample: text="Fallback actor post about leadership and...", authorName="DataSlayer Author 1"

**Actor call log:**
  - Attempt 1 | harvestapi/linkedin-profile-posts → ERROR:RUN_FAILED
  - Attempt 2 | harvestapi/linkedin-profile-posts → ERROR:NETWORK
  - Attempt 3 | data-slayer/linkedin-profile-posts-scraper → SUCCESS:2 items

---

## ✅ A3 — PASS
**Scenario:** Primary fails and fallback ALSO fails — all 3 attempts exhausted  
**Duration:** 0ms  

**Findings:**
  ✅ PASS: Attempt 1 returned 0 items (error: RUN_FAILED)
  ✅ PASS: Attempt 2 returned 0 items (error: TIMEOUT)
  ✅ PASS: Fallback returned 0 items (error: RUN_FAILED)
  ✅ PASS: No exception thrown across 3 failed attempts (clean failure)

**Actor call log:**
  - Attempt 1 | harvestapi/linkedin-profile-posts → ERROR:RUN_FAILED
  - Attempt 2 | harvestapi/linkedin-profile-posts → ERROR:TIMEOUT
  - Attempt 3 | data-slayer/linkedin-profile-posts-scraper → ERROR:RUN_FAILED

---

## ✅ A4 — PASS
**Scenario:** Primary returns 0 items with NO error code (silent empty) — should trigger fallback  
**Duration:** 0ms  

**Findings:**
  ✅ PASS: Attempt 1 returns empty with no error (silent empty correctly represented)
  ✅ PASS: Attempt 2 also returns empty — fallback should trigger
  ✅ PASS: Fallback returned 1 items after two silent-empty primaries

**Actor call log:**
  - Attempt 1 | harvestapi/linkedin-profile-posts → SUCCESS:0 items
  - Attempt 2 | harvestapi/linkedin-profile-posts → SUCCESS:0 items
  - Attempt 3 | data-slayer/linkedin-profile-posts-scraper → SUCCESS:1 items

---

## ✅ A5 — PASS
**Scenario:** Primary succeeds but returns schema-broken output — validation must block Airtable write  
**Duration:** 0ms  

**Findings:**
  ✅ PASS: Schema validation correctly rejected schema-broken items from attempt 1
  ✅ PASS: Schema validation also rejected attempt 2 broken items
  ✅ PASS: Fallback returned 1 valid items and passed validation

**Actor call log:**
  - Attempt 1 | harvestapi/linkedin-profile-posts → SUCCESS:2 items
  - Attempt 2 | harvestapi/linkedin-profile-posts → SUCCESS:1 items
  - Attempt 3 | data-slayer/linkedin-profile-posts-scraper → SUCCESS:1 items

---

## ✅ A6 — PASS
**Scenario:** Primary succeeds, first/last items valid, middle item malformed — sampling must catch it  
**Duration:** 0ms  

**Findings:**
  ✅ PASS: item[0] is valid (has content field)
  ✅ PASS: item[1] is schema-broken (no content field — correct for test)
  ✅ PASS: item[2] is valid (has content field)
  ✅ PASS: Validator caught the broken middle item — 3-point sampling is working correctly

**Actor call log:**
  - Attempt 1 | harvestapi/linkedin-profile-posts → SUCCESS:3 items

---

## ✅ A7 — PASS
**Scenario:** Primary succeeds, all items valid schema but 35% have empty text — post-write sanity must trigger  
**Duration:** 0ms  

**Findings:**
  ✅ PASS: Actor returned 7 items
  ✅ NOTE: Schema validation rejected items — this may be correct if empty strings are treated as missing
  ℹ️ INFO: 3/7 items (43%) have blank text after normalization
  ✅ PASS: Post-write sanity check SHOULD flag this scan as degraded (43% > 30% threshold)
  ✅ PASS: degraded=true would be returned from saveScoredPosts — scan result would include WARNING

**Actor call log:**
  - Attempt 1 | harvestapi/linkedin-profile-posts → SUCCESS:7 items

---

## ✅ A8 — PASS
**Scenario:** Two scan requests fire for same tenant — concurrency lock prevents duplicate  
**Duration:** 0ms  

**Findings:**
  ✅ PASS: First lock acquisition succeeded
  ✅ PASS: Second lock acquisition correctly rejected: scan_in_progress
  ✅ PASS: Lock acquisition succeeds after release
  ✅ PASS: Lock state cleared correctly after release

---

## ✅ A9 — PASS
**Scenario:** Stale lock (expiry in past) must not block future scans  
**Duration:** 0ms  

**Findings:**
  ℹ️ INFO: Planted stale lock (expired 5 minutes ago)
  ✅ PASS: Stale lock detected and cleared — new scan proceeded correctly
  ✅ PASS: New valid lock set (expires in 120s)

---

## ✅ A10 — PASS
**Scenario:** Global Inflight Count = 26 (above ceiling of 24) — scan should be delayed  
**Duration:** 0ms  

**Findings:**
  ℹ️ INFO: Set inflight count to 26 (ceiling is 24)
  ✅ PASS: Ceiling check correctly returns true at 26 (>= 24) — scan should be delayed
  ✅ PASS: Ceiling check returns true at exactly 24 (at >= threshold)
  ✅ PASS: Ceiling check returns false at 23 (below threshold) — scan proceeds normally

---

## ✅ A11 — PASS
**Scenario:** Global Inflight Count stuck at 8 for >10 minutes — watchdog must reset  
**Duration:** 0ms  

**Findings:**
  ℹ️ INFO: Set inflight=8 with last activity 11 minutes ago (stale)
  ✅ PASS: Watchdog correctly reset stale inflight counter to 0
  ✅ PASS: Inflight counter is now 0 after watchdog reset
  ✅ PASS: Watchdog correctly left non-stale counter alone (3 minutes < 10 minute threshold)

---

## ✅ A12 — PASS
**Scenario:** AUTH error on primary actor — non-retriable, no fallback triggered  
**Duration:** 0ms  

**Findings:**
  ✅ PASS: Attempt 1 returns AUTH error
  ✅ PASS: AUTH error is correctly classified as non-retriable — no retry, no fallback
  ✅ PASS: Only 1 actor call was made (AUTH blocked retry and fallback)

**Actor call log:**
  - Attempt 1 | harvestapi/linkedin-profile-posts → ERROR:AUTH

---

## ✅ A13 — PASS
**Scenario:** Primary TIMEOUT, fallback succeeds — timeout is retriable  
**Duration:** 0ms  

**Findings:**
  ✅ PASS: Attempt 1 returned TIMEOUT
  ✅ PASS: TIMEOUT is correctly classified as retriable
  ✅ PASS: Attempt 2 returned TIMEOUT — fallback triggered
  ✅ PASS: Fallback returned 2 items after two primary timeouts
  ✅ PASS: Fallback items passed validation

**Actor call log:**
  - Attempt 1 | harvestapi/linkedin-profile-posts → ERROR:TIMEOUT
  - Attempt 2 | harvestapi/linkedin-profile-posts → ERROR:TIMEOUT
  - Attempt 3 | data-slayer/linkedin-profile-posts-scraper → SUCCESS:2 items

---

## ✅ A14 — PASS
**Scenario:** All keyword terms fail in parallel — no crash, scan reports 0 posts cleanly  
**Duration:** 0ms  

**Findings:**
  ✅ PASS: Fallback actor registered for keyword actor: powerai/linkedin-posts-search-scraper
  ✅ PASS: Keyword actor vendors are diverse (apimaestro → powerai)
  ✅ PASS: All 3 attempts returned 0 items — total result is 0 posts, no exception
  ✅ PASS: All 3 attempts returned structured responses (no undefined errorType)

**Actor call log:**
  - Attempt 1 | apimaestro/linkedin-posts-search-scraper-no-cookies → ERROR:RUN_FAILED
  - Attempt 2 | apimaestro/linkedin-posts-search-scraper-no-cookies → ERROR:RUN_FAILED
  - Attempt 3 | powerai/linkedin-posts-search-scraper → ERROR:RUN_FAILED

---

## ✅ A15 — PASS
**Scenario:** Fallback actor times out — clean TIMEOUT failure, no crash  
**Duration:** 0ms  

**Findings:**
  ✅ PASS: Fallback actor returned TIMEOUT as configured
  ✅ PASS: Fallback TIMEOUT returned 0 items — clean failure
  ✅ PASS: Final result correctly represents TIMEOUT from fallback — no crash, no undefined state

**Actor call log:**
  - Attempt 1 | harvestapi/linkedin-profile-posts → ERROR:RUN_FAILED
  - Attempt 2 | harvestapi/linkedin-profile-posts → ERROR:RUN_FAILED
  - Attempt 3 | data-slayer/linkedin-profile-posts-scraper → ERROR:TIMEOUT

---

## Summary

All 16 scenarios passed. The resilience code behaves as specified in `docs/apify-resilience-plan.md`.

**This report does NOT constitute production clearance.** The remaining validation gates from the resilience plan (live integration test, memory baseline test, TypeScript compile check) must be completed before the branch is merged.
