# End-to-End Software Application Planning Guide

> Copy the prompts into Claude. Fill every `[ ]` placeholder with your app's details before sending.

---

## ✏️ YOUR APP — FILL THIS IN FIRST

> **Edit this section before anything else. Every prompt below pulls from it.**

```
App name        : [ TBD - working name "VaultChat" ]
One-line idea   : Invite-only, WhatsApp-style secure web chat with one-time and timed (snap) photos/videos, voice/video calls, responsive on PC, Android and iPhone
Primary users   : Private circle invited by the owner (under 50 users)
Core problem    : A private, secure messenger the owner fully controls, with self-destructing media
Key outcomes    : 
  1. Secure 1:1 messaging with photo/video sharing, read receipts, typing indicators
  2. One-time view and snap media (1-10 s timer or no limit) deleted server-side after viewing
  3. One responsive web app (PWA) that adapts to PC, Samsung and iPhone screens
Team size       : 1 (beginner, building with Claude)
Existing skills : Beginner; relies on Claude for design and code
Expected users  : Under 50 (invite-only)
Budget/infra    : Recommend best fit; managed services, low cost (Next.js + Supabase + Vercel)
Timeline        : ASAP; realistic MVP 6-8 weeks
Data sensitivity: PII + private messages + media + location
Compliance      : Sri Lanka PDPA / Computer Crimes Act, GDPR-aligned practices; location only with user consent
```

---

## Phase 1 — Plan

### Step 1 · Problem definition & PRD

**When to use:** Before touching any tech or code.

**Prompt:**
```
I want to build [APP NAME]. Users are [PRIMARY USERS]. 
The core problem is [CORE PROBLEM]. 
Key outcomes:
1. [OUTCOME 1]
2. [OUTCOME 2]
3. [OUTCOME 3]

Help me write a one-page PRD covering:
- Goals and non-goals
- Success metrics (quantified)
- Assumptions and constraints
- Risks and open questions
```

**What to expect:** A structured PRD draft. Ask Claude to challenge any assumption that seems weak.

---

### Step 2 · User stories & flows

**When to use:** Once the PRD is agreed.

**Prompt:**
```
Given this PRD: [PASTE PRD]

1. List all user roles in this system.
2. For each role write 5–8 user stories: "As a … I want … so that …"
3. For the most critical story, draw the happy-path flow as a numbered 
   sequence of steps (including error paths and edge cases).
```

---

### Step 3 · Data model

**When to use:** After user stories are stable.

**Prompt:**
```
Based on these user stories: [PASTE STORIES]

Propose an entity-relationship model:
- List each entity with key attributes and data types
- Show relationships (one-to-many, many-to-many)
- Flag any normalisation trade-offs or design choices I should reconsider
- Suggest indexes for the most query-heavy paths
```

---

## Phase 2 — Tech Stack

### Step 4 · Stack selection

**Prompt:**
```
I need a tech stack for [APP TYPE].

Constraints:
- Team size: [TEAM SIZE]
- Existing skills: [SKILLS]
- Expected users: [SCALE]
- Budget/infra: [BUDGET]
- Timeline: [TIMELINE]

Recommend: frontend, backend, database, auth provider, file storage, 
infra/hosting, CI/CD tooling.

For each choice: justify it AND list one alternative with trade-offs.
```

---

### Step 5 · Architecture diagram

**Prompt:**
```
Using the stack above, describe a C4 context + container diagram.

Show:
- How users reach the system (browser, mobile, API)
- Frontend ↔ Backend ↔ Database connections
- Any async queues or background workers
- Third-party integrations (auth, email, payments, etc.)
- Which calls are sync vs async
- Where data at rest lives

Output as a Mermaid diagram or clear text description.
```

---

### Step 6 · API contract

**Prompt:**
```
Draft an OpenAPI 3.1 spec stub for the [FEATURE NAME] endpoints.

Include:
- All paths and HTTP methods
- Request/response JSON schemas
- Status codes (success + error)
- Auth requirements per endpoint
- Flag any endpoint needing pagination or rate limiting
```

---

## Phase 3 — Security

> Run these steps **before writing any code**, not after.

### Step 7 · Threat modelling (STRIDE)

**Prompt:**
```
Apply STRIDE threat modelling to this architecture:
[PASTE ARCHITECTURE DESCRIPTION]

For each component/boundary identify threats across:
Spoofing, Tampering, Repudiation, Information Disclosure, DoS, 
Elevation of Privilege.

Rate each threat High / Medium / Low.
Suggest one mitigation control per threat.
Present as a table.
```

---

### Step 8 · Auth & authorisation design

**Prompt:**
```
Design an auth system for [APP NAME].

User roles: [LIST ROLES]
Sensitivity: [DATA SENSITIVITY]

Recommend:
- Auth protocol (OAuth2 / OIDC / SAML — justify)
- Token strategy (JWT vs session, expiry, storage)
- Refresh-token rotation policy
- MFA approach
- RBAC or ABAC permission model

Include a permission matrix table showing which roles can 
create / read / update / delete each key resource.
```

---

### Step 9 · OWASP & compliance checklist

**Prompt:**
```
Given stack [LIST STACK] and data classification [DATA SENSITIVITY]:

Create a security checklist covering:
- OWASP Top 10 controls mapped to each layer of my stack
- Secrets management (env vars, vault, rotation)
- Dependency scanning (which tool, how often)
- HTTP security headers (CSP, HSTS, X-Frame, etc.)
- Encryption at rest and in transit (algorithms, key management)
- Audit logging (what to log, retention, tamper-proofing)
- Compliance requirements: [COMPLIANCE]

Mark each item: Mandatory / Recommended / Nice-to-have
```

---

## Phase 4 — Build

### Step 10 · Scaffold the project

**Prompt:**
```
Create a production-ready project scaffold for [STACK].

Include:
- Folder/module structure
- GitHub Actions CI config (lint → test → build → security scan)
- Linting and formatting setup
- .env.example with all required variables (no real values)
- Dockerfile and docker-compose for local dev
- README with: prerequisites, setup steps, run commands, env-var table

Apply the security controls defined in our checklist.
Do not add comments beyond non-obvious WHY explanations.
```

---

### Step 11 · Feature implementation (repeat per story)

**Prompt:**
```
Implement user story: "[PASTE STORY]"

Stack: [STACK]
Auth model: [AUTH MODEL]
Coding conventions: [ANY CONVENTIONS — or attach CLAUDE.md]

Order:
1. Data layer (migration / schema change)
2. Service / business logic
3. API handler
4. Unit + integration tests

Flag any edge cases or security considerations inline as you go.
Do not add features beyond the story scope.
```

---

### Step 12 · Code review per PR

**Prompt:**
```
Review this diff:
[PASTE DIFF]

Check for:
- Correctness bugs and logic errors
- OWASP Top 10 issues (injection, broken auth, XSS, IDOR, etc.)
- Hardcoded secrets or sensitive data
- Missing input validation at boundaries
- Inadequate error handling (silent failures)
- Test coverage gaps

Rate each finding: High / Medium / Low
Only report issues you can tie to a specific line.
```

> **Claude Code shortcut:** run `/code-review` or  
> `/softlogic-secure-coding:security-check` instead of the manual prompt.

---

## Useful Claude Code skills

| Skill / command | When to use |
|---|---|
| `/feature-dev` | Structured feature planning and implementation |
| `/code-review` | Diff review for bugs and security |
| `/softlogic-secure-coding:security-check` | Security scan against Softlogic standards |
| `/engineering:architecture` | Architecture design and review |
| `/engineering:testing-strategy` | Test plan generation |
| `/commit-commands:commit-push-pr` | Commit, push, and open PR in one step |
| `/engineering:tech-debt` | Track and prioritise tech debt |

---

## Tips

- **Put your stack and conventions in `CLAUDE.md`** at the repo root. Claude reads it automatically in every session — you won't need to repeat constraints in every prompt.
- **One user story per session.** Keep context tight. Split large features into sub-tasks.
- **Paste, don't describe.** Always paste the actual PRD / schema / diff. Claude performs far better with real artefacts.
- **Security before code.** Running threat modelling and the OWASP checklist before the first commit saves significantly more time than fixing issues later.
- **Iterate the PRD.** Ask Claude to play devil's advocate on your assumptions before moving to step 2.

---

*Guide version: 2026-10-18*
