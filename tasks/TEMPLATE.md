# NNN — <imperative title>

## Goal
One or two sentences: what is different for the player or the codebase when this is done.

## Context
Only what the implementer cannot find by reading the listed files: why this is needed,
a decision already made, a trap to avoid.

## Files
- Edit: <paths, ideally three or fewer>
- Create: <paths>
- Read only: <paths needed for understanding>

## Requirements
1. Concrete behaviour with numbers and units. Name the config constants to add.
2. ...

## Out of scope
- Things that look related and must not be touched.

## Acceptance (all must hold)
- [ ] `npm run build` exits 0
- [ ] `npm test` exits 0
- [ ] <a named new test that fails before the change and passes after>
- [ ] <a grep or command with its expected output>

## Human check (not for the agent)
- What to look or listen for in the browser, in one or two lines.
