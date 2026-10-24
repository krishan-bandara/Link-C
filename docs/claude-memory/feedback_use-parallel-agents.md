---
name: feedback-use-parallel-agents
description: "Owner wants big builds split across parallel sub-agents, and fast-track delivery; keep Link-C separate from Softlogic accounts"
metadata:
  node_type: memory
  type: feedback
  originSessionId: ebd8444a-83d8-42b2-afd3-afe7c770d1e1
  modified: 2026-10-24T19:30:55.505Z
---

When the owner asked for a fast-track build they said "use concurrent features like multi agent and do the task" (after my first parallel spawn was declined, they repeated the request).

**Why:** They want the whole app built quickly, today, not step by step week by week.

**How to apply:** For large builds, define shared contracts first (schema, auth helper, API shapes), then spawn disjoint-file agents in one batch; afterwards run tsc, tests, build, and parallel reviewer agents. Agents sometimes stop early without a report, so check the files they own and resume them. Also: Link-C is personal, so never use Softlogic work accounts, emails or Supabase projects for it (the owner corrected this explicitly). The owner repeats this on every big task ("use multiple agents", "use 10 agents and fast track it"): split by file ownership, use read-only reviewer agents in parallel for checks, and apply fixes myself or with a fix agent. They also want me to grill them with questions before building and to explain each step simply. They push git themselves (my shell has no GitHub key) and want database migrations applied by me through the Supabase MCP. Confirmed again 2026-10-25 ("use 10 agents", then "like 20 agents"): about 17 agents ran fine when each owned separate files (shared look.css locked to one agent) and used a static screenshot harness (built .next CSS plus live look*.css, headless Edge at "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"; headless Edge cannot go narrower than about 500px, so use a 420px iframe or force the body width, and disable CSS animations or shots look faded). Never run two `next build` at once. The owner also wants plain-words explanations ("I did not understand") and short options to pick from, and answers design questions with the AskUserQuestion chips. They wanted a "how long will it take" status answer in plain terms. See [[project-link-c]].
