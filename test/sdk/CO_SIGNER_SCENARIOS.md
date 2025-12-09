# Co-Signer Behavior Scenarios

This document describes all the co-signer behavior scenarios used in SDK testing. Each scenario defines how signers at different levels will act (sign, deny, or abstain) and the expected outcome.

## Scenario Overview

| Scenario | Description | Expected Outcome | Levels |
|----------|-------------|------------------|--------|
| Happy Path | All signers approve at all levels | Approved | 3 |
| Early Denial | Level 1 denies immediately | Denied | 1 |
| Mid-Level Denial | Level 2 denies after Level 1 approves | Denied | 2 |
| Late Denial | Level 3 denies after Levels 1+2 approve | Denied | 3 |
| Partial Quorum | Not enough signers, quorum not reached | Pending (timeout) | 1 |
| Conditional Approval | Amount-based behavior | Approved (small) / Denied (large) | 1 |
| Slow Approval | All approve but with significant delays | Approved | 3 |
| Mixed Behavior | Some sign, some abstain, but quorum reached | Approved | 3 |
| Veto Power | Executive denies at final level | Denied | 3 |
| Rapid Approval | All sign immediately | Approved | 3 |

## Detailed Scenario Descriptions

### 1. Happy Path - All Approve

**Description:** All signers at all levels approve the transaction sequentially.

**Behavior:**
- **Level 1:** ops1 signs (0s), ops2 signs (5s), ops3 signs (10s)
- **Level 2:** comp1 signs (0s), comp2 signs (5s)
- **Level 3:** exec signs (0s)

**Expected Outcome:** Transaction fully approved and ready for execution

---

### 2. Early Denial - Level 1

**Description:** First signer at level 1 denies, transaction cancelled immediately.

**Behavior:**
- **Level 1:** ops1 denies (0s)
- Other signers never get a chance to act

**Expected Outcome:** Transaction denied at Level 1

---

### 3. Mid-Level Denial - Level 2

**Description:** Level 1 approves, but first signer at level 2 denies.

**Behavior:**
- **Level 1:** ops1 signs (0s), ops2 signs (5s), ops3 signs (10s)
- **Level 2:** comp1 denies (0s)
- comp2 never gets a chance

**Expected Outcome:** Transaction denied at Level 2

---

### 4. Late Denial - Level 3

**Description:** Levels 1 and 2 approve, but level 3 denies.

**Behavior:**
- **Level 1:** ops1 signs (0s), ops2 signs (5s), ops3 signs (10s)
- **Level 2:** comp1 signs (0s), comp2 signs (5s)
- **Level 3:** exec denies (0s)

**Expected Outcome:** Transaction denied at Level 3

---

### 5. Partial Quorum - Timeout

**Description:** Some signers sign but quorum not reached.

**Behavior:**
- **Level 1:** ops1 signs (0s), ops2 signs (5s)
- ops3 abstains (only 2/3 sign, but quorum is 3)

**Expected Outcome:** Transaction pending (will timeout)

---

### 6. Conditional Approval - Amount Based

**Description:** Signers approve small amounts but deny large amounts.

**Behavior:**
- **Level 1:** 
  - ops1 signs if amount < 10,000 ETH, denies if >= 10,000 ETH
  - ops2 signs (5s)
  - ops3 signs (10s)

**Expected Outcome:** Approved for small amounts, denied for large amounts

---

### 7. Sequential Slow Approval

**Description:** All signers approve but with significant delays between actions.

**Behavior:**
- **Level 1:** ops1 signs (0s), ops2 signs (60s), ops3 signs (120s)
- **Level 2:** comp1 signs (0s), comp2 signs (60s)
- **Level 3:** exec signs (0s)

**Expected Outcome:** Transaction approved after delays

---

### 8. Mixed Behavior - Partial Participation

**Description:** Some signers sign, some abstain, but quorum is still reached.

**Behavior:**
- **Level 1:** ops1 signs (0s), ops2 signs (5s), ops3 abstains (quorum 2/3 met)
- **Level 2:** comp1 signs (0s), comp2 abstains (quorum 1/2 met)
- **Level 3:** exec signs (0s)

**Expected Outcome:** Transaction approved with partial participation

---

### 9. Veto Power - Executive Denial

**Description:** All lower levels approve, but executive uses veto power at final level.

**Behavior:**
- **Level 1:** ops1 signs (0s), ops2 signs (5s), ops3 signs (10s)
- **Level 2:** comp1 signs (0s), comp2 signs (5s)
- **Level 3:** exec denies (0s) - Veto!

**Expected Outcome:** Transaction denied by executive veto

---

### 10. Rapid Approval - All Sign Immediately

**Description:** All signers approve immediately with no delays.

**Behavior:**
- **Level 1:** ops1 signs (0s), ops2 signs (0s), ops3 signs (0s)
- **Level 2:** comp1 signs (0s), comp2 signs (0s)
- **Level 3:** exec signs (0s)

**Expected Outcome:** Transaction approved rapidly

---

## Signer Roles

- **ops1, ops2, ops3:** Operational signers at Level 1
- **comp1, comp2:** Compliance signers at Level 2
- **exec:** Executive signer at Level 3

## Usage in Tests

These scenarios are used in SDK tests to verify:
1. Transaction proposal and tracking
2. Signer interface privacy
3. Event monitoring
4. Status updates
5. Denial handling
6. Quorum calculations
7. Timelock progression

Each scenario is executed programmatically in tests, with signers taking actions based on the defined behavior.


