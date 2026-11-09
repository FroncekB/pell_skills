# Trial 1: the fictional SOW

`fictional-sow.md` is an invented client's Scope of Work in Pell's house format: Brightfold Linen Services, a commercial linen service. It is written to run the whole design-intake skill end to end. It names no real company, and its website is on the reserved `example.com` domain, so the run fetches no real site. It lives outside `plugins/`, so it does not ship with the plugin.

## What the SOW contains

- Ten numbered items, each with user stories, a "User Roles this applies to" list and, on some, "Technical Notes".
- Two portals: a Driver portal for field staff on phones (items 4 and 5) and a Customer portal for the client's customers (item 7).
- A delivery review workflow (item 6) with two review steps, Dispatcher and Billing, and a send-back at each.
- Assumptions, an estimate table listing every item by number, summaries of Phase 2 and Phase 3, and an out-of-scope list.
- Two deliberate conflicts with the framework, which intake must list on the intake sheet:
  - Item 10 asks for a third-party data grid (AG Grid). The framework has its own list pattern.
  - Item 2 scopes roles by depot and location. In the framework, roles are plain permission sets, and records are visible to everyone or to the assignee only.
- One requirement that sits in no numbered item: the seven-year retention of delivery records and photos, stated in the Project Overview. Intake must list it as a requirement beyond the SOW's items.

## How to run

1. Make a throwaway fork from the framework branch with the Phase 4 fork tool. Never push it.
2. Load the skill from the Pell_Skills branch (`design-intake`).
3. On the skill's first run, give it `fictional-sow.md` as the source document and `https://www.brightfold.example.com` as the client's website. Skip the optional brand guide and reference products, or answer them with invented values.
4. Run every stage. A person answers both checkpoints, including the intake sheet.

Trial 1 runs on the Markdown SOW and fetches nothing, because its `example.com` address doesn't resolve. The trial record says so. The `.docx` path and fetching are covered by the framework's converter tests and by trial 2.

## What passing means

The trial passes when:
- each stage's files match their formats,
- every citation points at a line that exists, and
- every check in the fork passes after stages 3, 6, 7 and 8.

Also confirm that the intake sheet's conflicts section lists both deliberate conflicts, and its beyond-the-SOW section lists the retention requirement.
