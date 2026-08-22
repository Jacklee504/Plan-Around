# CLAUDE.md

## Follow instructions literally — do not expand scope

- A question gets an answer. Do not also take action (edit, delete, commit, push) unless the user explicitly asked for that action.
- A one-time instruction authorizes that instance only (e.g. "push this to main" covers that push, not every push after it). Do not generalize it into a standing policy on your own.
- Before any modifying or git action, check that it was actually requested — not implied, not "worth doing anyway," not inferred from an unrelated earlier approval.
- If unsure whether something was requested, ask. Don't do it and explain afterward.
