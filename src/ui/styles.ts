// Design system stylesheet. Served from /assets/app.css.

export const CSS = String.raw`
:root {
  --paper: #f4f2ed;
  --panel: #ffffff;
  --ink: #16181b;
  --ink-2: #2c3036;
  --muted: #6d7278;
  --faint: #8f959c;
  --line: #e3e0d8;
  --line-strong: #d3cfc4;
  --accent: #0f5c4a;
  --accent-ink: #0a4a3b;
  --accent-soft: #e7f0ec;
  --gold: #a87c2a;
  --gold-soft: #f6efdf;
  --danger: #a3252c;
  --danger-soft: #fbeaea;
  --warn: #966414;
  --warn-soft: #f8f0dd;
  --info: #2c5a7d;
  --info-soft: #e8f0f6;
  --sidebar: #14161a;
  --sidebar-2: #1c1f24;
  --sidebar-ink: #e9e7e1;
  --sidebar-muted: #8d9299;
  --radius: 8px;
  --shadow: 0 1px 2px rgba(20, 22, 26, .04), 0 8px 24px -16px rgba(20, 22, 26, .22);
  --sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
}

*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--paper); color: var(--ink);
  font-family: var(--sans); font-size: 14px; line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--accent-ink); text-decoration: none; }
a:hover { text-decoration: underline; }
h1, h2, h3, h4 { margin: 0; font-weight: 600; letter-spacing: -.01em; }
p { margin: 0 0 .75em; }
hr { border: 0; border-top: 1px solid var(--line); margin: 20px 0; }
code, .mono { font-family: var(--mono); font-size: .86em; }
::selection { background: #d8e7e0; }

/* ---------------------------------------------------------------- shell */
.app { display: grid; grid-template-columns: 238px minmax(0, 1fr); min-height: 100vh; }
.sidebar {
  background: var(--sidebar); color: var(--sidebar-ink); padding: 0 0 24px;
  display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh;
  overflow-y: auto; z-index: 30;
}
.brand { display: flex; align-items: center; gap: 11px; padding: 20px 18px 18px; min-width: 0; }
.brand > span:last-child { min-width: 0; }
.brand-mark {
  width: 30px; height: 30px; border-radius: 6px; background: var(--accent);
  display: grid; place-items: center; color: #fff; flex: none;
}
.brand-name { display: block; font-family: var(--serif); font-size: 19px; letter-spacing: .01em; line-height: 1.1; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.brand-sub { display: block; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--sidebar-muted); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nav { flex: 1; }
.nav-group { padding: 14px 12px 4px; }
.nav-label {
  font-size: 9.5px; letter-spacing: .16em; text-transform: uppercase; color: #6f757d;
  padding: 0 8px 7px; font-weight: 600;
}
.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 7px 9px; border-radius: 6px;
  color: #c9ccd1; font-size: 13px; margin-bottom: 1px; position: relative;
}
.nav-item:hover { background: var(--sidebar-2); color: #fff; text-decoration: none; }
.nav-item.active { background: #23272d; color: #fff; }
.nav-item.active::before {
  content: ''; position: absolute; left: -12px; top: 6px; bottom: 6px; width: 2px;
  background: #3fae8a; border-radius: 2px;
}
.nav-item svg { flex: none; opacity: .78; }
.nav-item.active svg { opacity: 1; color: #6fcfae; }
.nav-count {
  margin-left: auto; font-family: var(--mono); font-size: 10.5px; color: #b9bec5;
  background: #2b3037; border-radius: 20px; padding: 1px 6px; min-width: 19px; text-align: center;
}
.sidebar-foot { padding: 14px 16px 0; border-top: 1px solid #262a30; margin-top: 14px; }
.who { display: flex; gap: 9px; align-items: center; }
.avatar {
  width: 30px; height: 30px; border-radius: 50%; background: #2c3238; color: #dfe2e6;
  display: grid; place-items: center; font-size: 11.5px; font-weight: 600; flex: none;
  letter-spacing: .02em;
}
.who-name { font-size: 12.5px; color: #eceef0; line-height: 1.2; }
.who-role { font-size: 10.5px; color: var(--sidebar-muted); text-transform: uppercase; letter-spacing: .1em; }
.sidebar-foot a { color: var(--sidebar-muted); font-size: 11.5px; }
.sidebar-foot a:hover { color: #fff; }

.main { min-width: 0; display: flex; flex-direction: column; }
.topbar {
  height: 54px; background: rgba(255,255,255,.86); backdrop-filter: saturate(140%) blur(8px);
  border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 14px;
  padding: 0 26px; position: sticky; top: 0; z-index: 20;
}
.crumbs { display: flex; gap: 7px; align-items: center; font-size: 12.5px; color: var(--muted); min-width: 0; }
.crumbs a { color: var(--muted); }
.crumbs .sep { color: var(--line-strong); }
.crumbs strong { color: var(--ink); font-weight: 500; }
.topbar-search { margin-left: auto; display: flex; align-items: center; gap: 0; }
.topbar-search input {
  width: 250px; height: 32px; border: 1px solid var(--line); border-right: 0;
  border-radius: 6px 0 0 6px; padding: 0 10px; font-size: 12.5px; background: #fbfaf7; color: var(--ink);
}
.topbar-search input:focus { outline: none; border-color: var(--line-strong); background: #fff; }
.topbar-search button {
  height: 32px; border: 1px solid var(--line); background: #fff; border-radius: 0 6px 6px 0;
  padding: 0 9px; color: var(--muted); cursor: pointer; display: grid; place-items: center;
}
.content { padding: 26px 28px 56px; max-width: 1480px; width: 100%; }
.nav-toggle, .nav-toggle-label { display: none; }

/* ---------------------------------------------------------------- page header */
.page-head { display: flex; align-items: flex-end; gap: 18px; margin-bottom: 22px; flex-wrap: wrap; }
.page-head .eyebrow {
  font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: var(--accent);
  font-weight: 600; margin-bottom: 6px;
}
.page-head h1 { font-family: var(--serif); font-size: 27px; font-weight: 600; line-height: 1.15; letter-spacing: -.015em; }
.page-head .sub { color: var(--muted); font-size: 13px; margin-top: 5px; max-width: 76ch; }
.page-actions { margin-left: auto; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.section-head { display: flex; align-items: baseline; gap: 12px; margin: 26px 0 12px; }
.section-head h2 { font-size: 14px; font-weight: 600; letter-spacing: .01em; }
.section-head .hint { font-size: 12px; color: var(--muted); }
.section-head .right { margin-left: auto; font-size: 12px; }

/* ---------------------------------------------------------------- stat band */
.stat-band {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  margin-bottom: 18px; overflow: hidden;
}
.stat { padding: 15px 18px; border-right: 1px solid var(--line); min-width: 0; }
.stat:last-child { border-right: 0; }
.stat-label {
  font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted);
  font-weight: 600; display: flex; align-items: center; gap: 5px;
}
.stat-value {
  font-family: var(--mono); font-size: 23px; font-weight: 500; letter-spacing: -.03em;
  margin-top: 7px; font-variant-numeric: tabular-nums; line-height: 1.1;
}
.stat-sub { font-size: 11.5px; color: var(--muted); margin-top: 5px; }
.stat a:hover { text-decoration: none; }
.stat a.stat-value { display: inline-block; }
.stat-value.is-danger { color: var(--danger); }
.stat-value.is-warn { color: var(--warn); }
.stat-value.is-ok { color: var(--accent); }

/* ---------------------------------------------------------------- panels & grids */
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); min-width: 0; }
.panel-head {
  display: flex; align-items: center; gap: 12px; padding: 13px 16px; border-bottom: 1px solid var(--line);
}
.panel-head h2, .panel-head h3 { font-size: 13px; font-weight: 600; }
.panel-head .right { margin-left: auto; display: flex; gap: 8px; align-items: center; font-size: 12px; }
.panel-body { padding: 16px; }
.panel-foot { padding: 11px 16px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); }
.grid { display: grid; gap: 16px; }
.grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.grid-main { grid-template-columns: minmax(0, 1.65fr) minmax(300px, 1fr); align-items: start; }
.grid-detail { grid-template-columns: minmax(0, 1fr) 320px; align-items: start; }
.stack { display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr); }
.grid > * { min-width: 0; }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.row-tight { display: flex; gap: 6px; align-items: center; }
.spread { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.muted { color: var(--muted); }
.small { font-size: 12px; }
.tiny { font-size: 11px; }
.nowrap { white-space: nowrap; }
.right { text-align: right; }
.mt-0 { margin-top: 0; } .mt-1 { margin-top: 8px; } .mt-2 { margin-top: 16px; } .mt-3 { margin-top: 24px; }
.mb-0 { margin-bottom: 0; } .mb-1 { margin-bottom: 8px; } .mb-2 { margin-bottom: 16px; }

/* ---------------------------------------------------------------- tables */
.table-wrap { overflow-x: auto; }
table.data { width: 100%; border-collapse: collapse; font-size: 13px; }
table.data th {
  text-align: left; font-size: 10px; letter-spacing: .09em; text-transform: uppercase;
  color: var(--muted); font-weight: 600; padding: 9px 14px; border-bottom: 1px solid var(--line);
  background: #fbfaf7; white-space: nowrap; position: sticky; top: 0;
}
table.data th.num, table.data td.num { text-align: right; font-variant-numeric: tabular-nums; }
table.data td { padding: 10px 14px; border-bottom: 1px solid #efede7; vertical-align: top; }
table.data tbody tr:last-child td { border-bottom: 0; }
table.data tbody tr:hover { background: #faf9f5; }
table.data td.actions { text-align: right; white-space: nowrap; }
table.data .primary-cell { font-weight: 550; color: var(--ink); }
table.data .sub-cell { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.table-empty { padding: 34px 20px; text-align: center; color: var(--muted); font-size: 13px; }

/* ---------------------------------------------------------------- badges */
.badge {
  display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 600;
  letter-spacing: .05em; text-transform: uppercase; padding: 2.5px 8px; border-radius: 20px;
  border: 1px solid transparent; white-space: nowrap; line-height: 1.5;
}
.badge .dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.badge.ok { color: var(--accent-ink); background: var(--accent-soft); border-color: #cfe2d9; }
.badge.info { color: var(--info); background: var(--info-soft); border-color: #d3e2ee; }
.badge.warn { color: var(--warn); background: var(--warn-soft); border-color: #eddfc0; }
.badge.danger { color: var(--danger); background: var(--danger-soft); border-color: #f0d2d3; }
.badge.neutral { color: #575d64; background: #f0efeb; border-color: #e0ded6; }
.badge.gold { color: var(--gold); background: var(--gold-soft); border-color: #e9dcc0; }
.chip {
  display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--ink-2);
  background: #f2f1ec; border: 1px solid var(--line); border-radius: 4px; padding: 1px 6px;
}
.chip.mono { font-family: var(--mono); }
.tag { display: inline-block; font-size: 11px; color: var(--accent-ink); background: var(--accent-soft); border-radius: 3px; padding: 1px 6px; margin: 0 3px 3px 0; }

/* ---------------------------------------------------------------- buttons */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 32px; padding: 0 12px; border-radius: 6px; border: 1px solid var(--ink);
  background: var(--ink); color: #fff; font-size: 12.5px; font-weight: 500; font-family: inherit;
  cursor: pointer; white-space: nowrap; line-height: 1; transition: background .12s, border-color .12s;
}
.btn:hover { background: #000; text-decoration: none; color: #fff; }
.btn.accent { background: var(--accent); border-color: var(--accent); }
.btn.accent:hover { background: var(--accent-ink); }
.btn.ghost { background: #fff; border-color: var(--line-strong); color: var(--ink-2); }
.btn.ghost:hover { background: #fbfaf7; border-color: #bfb9ac; color: var(--ink); }
.btn.danger { background: #fff; border-color: #e3c8c9; color: var(--danger); }
.btn.danger:hover { background: var(--danger-soft); }
.btn.sm { height: 26px; padding: 0 9px; font-size: 11.5px; border-radius: 5px; }
.btn.xs { height: 22px; padding: 0 7px; font-size: 11px; border-radius: 4px; }
.btn.block { width: 100%; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.link-action { font-size: 12px; color: var(--accent-ink); font-weight: 500; background: none; border: 0; padding: 0; cursor: pointer; font-family: inherit; }
.link-action:hover { text-decoration: underline; }
.link-danger { color: var(--danger); }

/* ---------------------------------------------------------------- forms */
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 16px; }
.form-grid.one { grid-template-columns: minmax(0, 1fr); }
.form-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.field.span-2 { grid-column: span 2; }
.field.span-3 { grid-column: span 3; }
label.lbl { font-size: 11.5px; font-weight: 600; color: var(--ink-2); letter-spacing: .01em; }
label.lbl .req { color: var(--danger); }
.input, select.input, textarea.input {
  width: 100%; border: 1px solid var(--line-strong); border-radius: 6px; background: #fff;
  font-family: inherit; font-size: 13px; color: var(--ink); padding: 0 10px; height: 35px;
  transition: border-color .12s, box-shadow .12s;
}
textarea.input { height: auto; min-height: 78px; padding: 8px 10px; line-height: 1.5; resize: vertical; }
.input:focus, select.input:focus, textarea.input:focus {
  outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(15,92,74,.12);
}
.input::placeholder { color: #a9adb2; }
select.input {
  appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236d7278' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 10px center; padding-right: 28px;
}
.hint { font-size: 11px; color: var(--muted); }
.check { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--ink-2); }
.check input { width: 14px; height: 14px; accent-color: var(--accent); }
.form-actions { display: flex; gap: 8px; align-items: center; margin-top: 18px; padding-top: 15px; border-top: 1px solid var(--line); }
fieldset { border: 0; padding: 0; margin: 0; }
.fieldset-title { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); font-weight: 600; margin: 22px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
.fieldset-title:first-child { margin-top: 0; }

/* filter bar */
.filters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
.filters .input { height: 32px; font-size: 12.5px; width: auto; min-width: 0; }
.filters input[type=search] { width: 230px; }
.filters .spacer { margin-left: auto; }

/* ---------------------------------------------------------------- tabs */
.tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); margin-bottom: 20px; overflow-x: auto; }
.tab {
  padding: 8px 13px; font-size: 12.5px; color: var(--muted); border-bottom: 2px solid transparent;
  white-space: nowrap; margin-bottom: -1px;
}
.tab:hover { color: var(--ink); text-decoration: none; }
.tab.active { color: var(--ink); border-bottom-color: var(--accent); font-weight: 550; }
.tab .n { font-family: var(--mono); font-size: 10.5px; color: var(--faint); margin-left: 4px; }

/* ---------------------------------------------------------------- empty state */
.empty {
  border: 1px dashed var(--line-strong); border-radius: var(--radius); padding: 32px 24px;
  text-align: center; background: #fbfaf6;
}
.empty .icon-wrap { color: #b3b0a6; margin-bottom: 10px; }
.empty h3 { font-size: 14px; margin-bottom: 5px; }
.empty p { color: var(--muted); font-size: 12.5px; max-width: 46ch; margin: 0 auto 14px; }
.empty .btn { margin-top: 2px; }

/* ---------------------------------------------------------------- kanban */
.board { display: grid; grid-auto-flow: column; grid-auto-columns: 258px; gap: 12px; overflow-x: auto; padding-bottom: 12px; align-items: start; }
.col { background: #efece5; border-radius: var(--radius); border: 1px solid #e5e1d7; }
.col-head { display: flex; align-items: center; gap: 7px; padding: 10px 11px; border-bottom: 1px solid #e2ded4; }
.col-head .name { font-size: 10.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #4c5259; }
.col-head .n { font-family: var(--mono); font-size: 10px; color: var(--muted); background: #fff; border-radius: 12px; padding: 0 5px; }
.col-head .val { margin-left: auto; font-family: var(--mono); font-size: 10.5px; color: var(--muted); }
.col-body { padding: 8px; display: grid; gap: 7px; min-height: 46px; }
.col-body .none { font-size: 11.5px; color: var(--faint); text-align: center; padding: 10px 0; }
.kcard {
  background: #fff; border: 1px solid #e0dbd0; border-radius: 6px; padding: 10px 11px;
  display: block; color: var(--ink);
}
.kcard:hover { border-color: #c9c3b5; text-decoration: none; box-shadow: 0 2px 8px -4px rgba(20,22,26,.25); }
.kcard .t { font-size: 12.5px; font-weight: 550; line-height: 1.3; }
.kcard .m { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 7px; font-size: 11px; color: var(--muted); }
.kcard .money { font-family: var(--mono); font-size: 11.5px; }
.kcard .move { margin-top: 8px; border-top: 1px solid #f0ede6; padding-top: 6px; }
.kcard .move select { height: 24px; font-size: 11px; border-radius: 4px; padding: 0 22px 0 6px; }

/* ---------------------------------------------------------------- dashboard */
.metric-strip { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); overflow: hidden; }
.metric { padding: 14px 16px; border-right: 1px solid var(--line); }
.metric:last-child { border-right: 0; }
.metric .k { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.metric .v { font-family: var(--mono); font-size: 20px; margin-top: 6px; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.bar { height: 6px; border-radius: 3px; background: #eceae4; overflow: hidden; }
.bar > span { display: block; height: 100%; background: var(--accent); border-radius: 3px; }
.bar.thin { height: 4px; }
.dist-row { display: grid; grid-template-columns: 118px 1fr 34px; gap: 10px; align-items: center; padding: 6px 0; font-size: 12px; }
.dist-row .n { font-family: var(--mono); font-size: 11.5px; color: var(--muted); text-align: right; }
.rev-chart { display: flex; align-items: flex-end; gap: 6px; height: 132px; padding-top: 8px; }
.rev-col { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 5px; min-width: 0; }
.rev-bars { display: flex; gap: 2px; align-items: flex-end; width: 100%; justify-content: center; height: 100%; }
.rev-bars .b1 { width: 46%; background: #cddfd8; border-radius: 2px 2px 0 0; min-height: 2px; }
.rev-bars .b2 { width: 46%; background: var(--accent); border-radius: 2px 2px 0 0; min-height: 2px; }
.rev-x { font-size: 9.5px; color: var(--muted); font-family: var(--mono); white-space: nowrap; }
.legend { display: flex; gap: 12px; font-size: 11px; color: var(--muted); }
.legend i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 4px; }

/* ---------------------------------------------------------------- timeline */
.timeline { list-style: none; padding: 0; margin: 0; }
.timeline li { position: relative; padding: 0 0 18px 22px; border-left: 1px solid var(--line); margin-left: 5px; }
.timeline li:last-child { padding-bottom: 0; border-left-color: transparent; }
.timeline li::before {
  content: ''; position: absolute; left: -4.5px; top: 5px; width: 8px; height: 8px;
  border-radius: 50%; background: #fff; border: 1.5px solid var(--line-strong);
}
.timeline li.accent::before { border-color: var(--accent); background: var(--accent); }
.timeline li.warn::before { border-color: var(--warn); background: var(--warn); }
.timeline li.danger::before { border-color: var(--danger); background: var(--danger); }
.tl-head { display: flex; gap: 9px; align-items: baseline; flex-wrap: wrap; }
.tl-title { font-size: 12.5px; font-weight: 550; }
.tl-meta { font-size: 11px; color: var(--muted); margin-left: auto; font-family: var(--mono); }
.tl-body { font-size: 12.5px; color: var(--ink-2); margin-top: 3px; white-space: pre-wrap; }

/* ---------------------------------------------------------------- detail lists */
.kv { display: grid; grid-template-columns: 132px minmax(0,1fr); gap: 8px 12px; font-size: 12.5px; }
.kv dt { color: var(--muted); font-size: 11.5px; }
.kv dd { margin: 0; color: var(--ink); word-break: break-word; }
.divide > * + * { border-top: 1px solid var(--line); }
.list-row { display: flex; gap: 12px; align-items: center; padding: 11px 16px; font-size: 12.5px; }
.list-row:hover { background: #fbfaf6; }
.list-row .grow { min-width: 0; flex: 1; }
.list-row .t { font-weight: 550; color: var(--ink); }
.list-row .s { font-size: 11.5px; color: var(--muted); margin-top: 2px; }

/* ---------------------------------------------------------------- alerts / flash */
.flash {
  display: flex; gap: 9px; align-items: flex-start; padding: 10px 13px; border-radius: 6px;
  font-size: 12.5px; margin-bottom: 16px; border: 1px solid;
}
.flash.ok { background: var(--accent-soft); border-color: #cadfd5; color: var(--accent-ink); }
.flash.err { background: var(--danger-soft); border-color: #f0d0d2; color: var(--danger); }
.flash.info { background: var(--info-soft); border-color: #d3e2ee; color: var(--info); }
.flash.warn { background: var(--warn-soft); border-color: #eddfc0; color: var(--warn); }
.callout { border-left: 3px solid var(--line-strong); padding: 3px 0 3px 12px; font-size: 12.5px; color: var(--ink-2); }
.callout.warn { border-color: var(--gold); }
.callout.danger { border-color: var(--danger); }
.callout.info { border-color: var(--info); }

/* ---------------------------------------------------------------- misc */
.progress-row { display: flex; align-items: center; gap: 9px; }
.progress-row .bar { flex: 1; min-width: 60px; }
.progress-row .pct { font-family: var(--mono); font-size: 11px; color: var(--muted); width: 32px; text-align: right; }
.pill-group { display: inline-flex; border: 1px solid var(--line-strong); border-radius: 6px; overflow: hidden; background: #fff; }
.pill-group a { padding: 5px 11px; font-size: 11.5px; color: var(--muted); border-right: 1px solid var(--line); }
.pill-group a:last-child { border-right: 0; }
.pill-group a.active { background: var(--ink); color: #fff; }
.pill-group a:hover { text-decoration: none; background: #f6f4ef; }
.pill-group a.active:hover { background: var(--ink); }
.mono-block {
  background: #1a1d21; color: #dfe3e6; border-radius: 6px; padding: 14px 16px; overflow-x: auto;
  font-family: var(--mono); font-size: 11.5px; line-height: 1.65; white-space: pre;
}
.mono-block .c { color: #7d8b94; }
.code-inline { background: #f2f0ea; border: 1px solid var(--line); border-radius: 4px; padding: 1px 5px; font-family: var(--mono); font-size: 11.5px; }
.health-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.health-dot.ok { background: #2f9e7c; } .health-dot.warn { background: #d3a03a; }
.health-dot.fail { background: #c1444a; } .health-dot.unknown { background: #b8bcc0; }
.credential-box { background: #fbf6ea; border: 1px solid #e8dcbe; border-radius: 6px; padding: 14px; }
.credential-box .val { font-family: var(--mono); font-size: 12px; background: #fff; border: 1px solid #e5d9bb; border-radius: 4px; padding: 8px 10px; word-break: break-all; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.print-only { display: none; }

/* ---------------------------------------------------------------- auth page */
.auth-wrap { min-height: 100vh; display: grid; grid-template-columns: 1.05fr .95fr; }
.auth-side { background: var(--sidebar); color: #fff; padding: 56px 52px; display: flex; flex-direction: column; justify-content: space-between; }
.auth-side .brand-name { font-size: 26px; }
.auth-side h2 { font-family: var(--serif); font-size: 30px; line-height: 1.25; margin: 32px 0 12px; max-width: 22ch; }
.auth-side p { color: #a7adb4; font-size: 13px; max-width: 40ch; }
.auth-side ul { list-style: none; padding: 0; margin: 26px 0 0; display: grid; gap: 10px; }
.auth-side li { display: flex; gap: 9px; font-size: 12.5px; color: #c6cace; align-items: flex-start; }
.auth-side li svg { color: #5fc3a2; flex: none; margin-top: 2px; }
.auth-form-wrap { display: grid; place-items: center; padding: 40px 24px; background: var(--paper); }
.auth-form { width: 100%; max-width: 356px; }
.auth-form h1 { font-family: var(--serif); font-size: 24px; margin-bottom: 6px; }
.auth-form .auth-sub { color: var(--muted); font-size: 13px; margin-bottom: 22px; }
.auth-form .field { margin-bottom: 13px; }
.auth-form .btn { width: 100%; height: 38px; margin-top: 6px; }
.auth-foot { margin-top: 20px; font-size: 11.5px; color: var(--faint); text-align: center; }

/* ---------------------------------------------------------------- calendar */
.cal-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
.cal-toolbar .title { font-family: var(--serif); font-size: 19px; }
.cal-grid { display: grid; grid-template-columns: repeat(7, minmax(0,1fr)); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; background: var(--panel); }
.cal-dow { padding: 8px 10px; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); background: #fbfaf7; border-bottom: 1px solid var(--line); border-right: 1px solid var(--line); font-weight: 600; }
.cal-dow:nth-child(7) { border-right: 0; }
.cal-cell { min-height: 104px; padding: 6px 7px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 3px; }
.cal-cell:nth-child(7n) { border-right: 0; }
.cal-cell.out { background: #faf9f5; }
.cal-cell.out .cal-day { color: var(--faint); }
.cal-cell.today { background: #f1f6f3; box-shadow: inset 0 0 0 1px #cfe3d9; }
.cal-day { font-family: var(--mono); font-size: 11px; color: var(--muted); display: flex; justify-content: space-between; align-items: center; }
.cal-day .n { font-size: 9.5px; color: var(--faint); }
.cal-item { display: block; font-size: 11px; line-height: 1.35; padding: 2px 5px; border-radius: 4px; border-left: 2px solid var(--accent); background: #f2f5f3; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cal-item:hover { text-decoration: none; background: #e9efec; }
.cal-item.money { border-left-color: var(--warn); background: #fbf5e9; }
.cal-item.risk { border-left-color: var(--danger); background: #fbeeef; }
.cal-item.info { border-left-color: var(--info); background: #eef4f8; }
.cal-more { font-size: 10px; color: var(--muted); padding-left: 5px; }
.agenda { display: grid; gap: 18px; }
.agenda-day { display: grid; grid-template-columns: 96px minmax(0,1fr); gap: 14px; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
.agenda-day:last-child { border-bottom: 0; }
.agenda-date { font-family: var(--mono); font-size: 11.5px; color: var(--muted); }
.agenda-date strong { display: block; font-family: var(--serif); font-size: 15px; color: var(--ink); font-weight: 600; }
.agenda-items { display: grid; gap: 6px; }
.agenda-row { display: flex; gap: 9px; align-items: baseline; font-size: 12.5px; }
.agenda-row .time { font-family: var(--mono); font-size: 11px; color: var(--muted); width: 62px; flex: none; }

/* ---------------------------------------------------------------- print */
@media print {
  .sidebar, .topbar, .page-actions, .tabs, .filters, .no-print, .flash { display: none !important; }
  .app { display: block; }
  .content { padding: 0; max-width: none; }
  body { background: #fff; font-size: 11.5pt; }
  .panel { border: 0; box-shadow: none; }
  .print-only { display: block; }
  a { color: inherit; }
}

/* ---------------------------------------------------------------- responsive */
@media (max-width: 1180px) {
  .grid-main, .grid-detail { grid-template-columns: minmax(0, 1fr); }
  .grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 960px) {
  .app { grid-template-columns: minmax(0, 1fr); }
  .sidebar {
    position: fixed; left: 0; top: 0; bottom: 0; width: 248px; transform: translateX(-100%);
    transition: transform .18s ease;
  }
  .nav-toggle:checked ~ .sidebar { transform: translateX(0); box-shadow: 0 0 0 100vmax rgba(0,0,0,.35); }
  .nav-toggle-label {
    display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px;
    border: 1px solid var(--line); border-radius: 6px; background: #fff; cursor: pointer; color: var(--ink);
  }
  .topbar { padding: 0 16px; gap: 10px; }
  .content { padding: 20px 16px 44px; }
  .topbar-search input { width: 148px; }
  .grid-2, .grid-3, .grid-4 { grid-template-columns: minmax(0, 1fr); }
  .form-grid, .form-grid.three { grid-template-columns: minmax(0, 1fr); }
  .field.span-2, .field.span-3 { grid-column: auto; }
  .stat-band { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stat { border-bottom: 1px solid var(--line); }
  .stat:nth-child(2n) { border-right: 0; }
  .page-head h1 { font-size: 23px; }
  .auth-wrap { grid-template-columns: minmax(0,1fr); }
  .auth-side { display: none; }
  .kv { grid-template-columns: 110px minmax(0,1fr); }
  .cal-cell { min-height: 74px; }
  .cal-item { font-size: 10px; }
  .agenda-day { grid-template-columns: minmax(0,1fr); gap: 6px; }
}
@media (max-width: 560px) {
  .stat-band { grid-template-columns: minmax(0,1fr); }
  .stat { border-right: 0; }
  .metric-strip { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .metric:nth-child(2n) { border-right: 0; }
  .topbar-search { display: none; }
}
`;
