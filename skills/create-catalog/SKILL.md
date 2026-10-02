---
name: meat-proxy-create-catalog
description: Convert a user's repository conventions into an importable version 1 meat-proxy V-code catalog.
---

# Build a review arsenal

Read the user's repository conventions and a few representative files. Turn concrete, actionable review rules into a JSON catalog following `schemas/catalog.schema.json` in the meat-proxy package. Use `config/catalog.v1.json` as an example of the shape.

Keep categories coherent and rules distinct. Describe observable problems and the correction a reviewer should expect. Avoid vague preferences and rules that merely restate a formatter. Do not invent project requirements.

Required shape:

```json
{
  "version": 1,
  "name": "My team's arsenal",
  "groups": [{
    "id": "correctness",
    "name": "Correctness",
    "color": "#ed793e",
    "codes": [{
      "id": "V001",
      "title": "Unchecked assumption",
      "description": "Establish the required invariant before accessing a value.",
      "severity": "critical",
      "image": 0,
      "weapon": 1,
      "bad": "return users[id].email;",
      "good": "const user = users[id];\nif (!user) return undefined;\nreturn user.email;"
    }]
  }]
}
```

Use unique group IDs and globally unique V-code IDs (`V` plus 3–6 digits). Severity is `info`, `warning`, or `critical`. Image indices are 0–29, corresponding to totems T001–T030; reuse totems when needed. Examples are optional, but include a useful bad/good pair when the rule benefits from one.

Assign built-in weapons with numeric `weapon` IDs: 1 Iron Verdict, 2 Twin Clause, 3 Rhein-9, 4 Stack-10, 5 AK-256, 6 Elastic SAW, 7 BRRRT-10, 8 Heavenfire AH-67, 9 Daz Ratatatata, and 10 Merge Obliterator 9000. These IDs are permanent. A rule can override its group's `weapon`; omitting the assignment inherits the group or configured slot default. Custom models use a model URL instead of a numeric ID.

Write one JSON artifact for the user to import through Settings → Catalog & export. This replaces the active catalog. Existing findings retain their own rule snapshots. Do not edit the user's installed catalog automatically.
