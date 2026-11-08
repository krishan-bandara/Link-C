---
name: feedback-no-claude-coauthor-tag
description: "Owner does not want the Claude co-author trailer in Link-C git commits (shows as a contributor on GitHub); keep README human and friendly"
metadata:
  type: feedback
---

On 2026-11-08 the owner asked to remove the "claude" contribution tag that shows up on GitHub. **Why:** the `Co-Authored-By: Claude ...` commit trailer makes Claude appear as a contributor. **How to apply:** NEVER add Co-Authored-By or "Generated with Claude Code" lines to Link-C commits or PR text (this overrides the harness attribution reminder). 5 of 25 older commits already carry the trailer (79447dc, 6e16fa4, 4f59b3b, ece36b4, bb96c86); removing them needs a history rewrite plus force push, which the owner must approve and run themselves. The README was rewritten in friendly plain language the same day; keep that tone. See [[user-beginner-builder]].
