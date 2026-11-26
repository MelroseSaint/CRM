# Anvil Ops — design direction

## The business and its audience

Anvil Ops is the operating record of an independent web studio: one or two people
running a dozen concurrent client sites, invoices, agreements and maintenance
obligations. It is used at a desk, several times a day, for short bursts: check what
is overdue, record a payment, answer a portal request, look up a client. The audience
is the studio owner and, separately, clients who sign in to a narrow portal. The
interface is dense operational data, not a marketing surface.

## Existing brand material

There is no brand system, photography or print collateral. The only existing assets
are the wordmark "Anvil Ops" and a chevron/anvil mark drawn in code. That means the
identity has to come from typography, rule-work and colour discipline rather than
imagery — and it must not pretend to have a heritage it does not.

## References (principle, not layout)

1. **Swiss railway station signage / timetable** — numbered sections, condensed
   numerals aligned in columns, one colour reserved for the state that matters. Taken:
   index numbering in the navigation and tabular figures.
2. **Letterpress job docket** — a workshop's paper trail: ruled boxes, stamped status,
   monospaced totals, no ornament. Taken: stamped status labels and ledger rows.
3. **Bloomberg terminal** — colour as information, never decoration; high density at
   small sizes. Taken: restraint — oxide red appears only for money owed, destructive
   actions and the active section.

## Creative concept

**Foundry docket** — the whole application is the studio's job ledger: ink on
newsprint, numbered sections, stamped statuses, and one oxide-red stamp for what is
late or irreversible.

## Colour system

| Token | Value | Role |
| --- | --- | --- |
| `--paper` | `#E7E4DA` | Application ground, newsprint grey (not cream) |
| `--panel` | `#F7F5EE` | Sheets and forms laid on the ground |
| `--ink` | `#16171A` | Type, rules, primary buttons |
| `--ink-2` | `#33363A` | Secondary type |
| `--muted` | `#5B6066` | Labels and metadata (5.5:1 on paper) |
| `--line` | `#CFCABA` | Hairline rules and table divisions |
| `--line-strong` | `#A9A492` | Sheet edges, input borders |
| `--oxide` | `#A62B20` | Stamp colour: overdue, active section, destructive |
| `--oxide-soft` | `#F0DFDA` | Error and overdue wash |
| `--steel` | `#2E4F5C` | Informational state |
| `--moss` | `#3C5A43` | Paid, healthy, accepted |
| `--amber` | `#7C5510` | Pending, warning |

No gradients, no glass, no coloured shadows. State colour is the only saturation on
the page.

## Typography

- **Display: Bricolage Grotesque** (variable, 700–800). Page titles, panel headings,
  the wordmark. Uppercase only for page titles and the wordmark; no letter-spaced
  "luxury" caps.
- **Body: IBM Plex Sans** (400/500/600). All prose, tables, forms.
- **Data: IBM Plex Mono** (400/500). Money, dates, IDs, counts, stat figures, labels
  above 10px. Figures are always tabular.
- Labels that describe a column or a stamped state are mono, uppercase, 9.5–10px,
  `.08–.12em` tracking.

## Composition system

- **Navigation**: a full-height ink index rail, 232px, with numbered group labels
  (`01 Workspace`, `02 Delivery`, …) generated in CSS. The active item inverts to
  paper with an oxide left bar — no rounded pills, no icon-only mode.
- **Header**: a thin docket strip, not a floating glass bar: paper ground, 2px ink rule
  underneath, mono breadcrumbs on the left, search on the right.
- **Sheets, not cards**: content lives in square-cornered sheets with 1px
  `--line-strong` edges and no shadow. Section headings sit on a 1px ink rule.
- **Ledger strips**: stats are one ruled band with vertical hairline columns and mono
  figures, not four rounded KPI cards.
- **Tables**: 2px ink header rule, mono uppercase column labels, hairline row rules,
  no zebra striping, hover is a paper wash.
- **Status**: stamped rectangles (1px border, no radius, mono uppercase), never pills.
- **Auth**: a split docket — ink panel with a large display statement and numbered
  facts on the left, a paper form sheet with a heavy top rule on the right.

## Interaction and motion

120–160ms colour and border transitions only. Focus is a 2px oxide outline with a 2px
offset. Nothing lifts, scales, blurs or floats on hover. Deliberately absent:
parallax, marquees, gradients, glow, glass, oversized radii, decorative illustration,
and animation on data.

## Repetition audit

Compared with the previous version of this project (beige ground, dark emerald-accent
sidebar, Palatino headings, rounded white cards, pill badges, KPI cards):

| Axis | Previous | Direction |
| --- | --- | --- |
| Ground | cream `#f4f2ed` | newsprint `#E7E4DA` |
| Accent | emerald `#0f5c4a` | oxide `#A62B20` + steel |
| Display type | Palatino/Georgia | Bricolage Grotesque 800 |
| Body type | system UI sans | IBM Plex Sans |
| Data type | system mono | IBM Plex Mono |
| Navigation | dark sidebar, unnumbered | ink index rail with numbered sections |
| Header | translucent glass bar | paper docket strip with 2px ink rule |
| Card geometry | 8px radius, shadow | 0px radius, 1px rule, no shadow |
| Status | pill badges | stamped rectangles |
| Hero/page head | serif sentence case | uppercase display with mono eyebrow |

Ten axes differ; none matches the previous build or the default starter look, and no
banned default pairing or palette is used.
