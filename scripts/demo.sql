-- OPTIONAL sample dataset for local evaluation only.
-- This is NOT installed automatically and is not required for the platform to work.
-- Run: npm run db:demo   (local D1 only)
-- Every record below is created through the same tables the application writes to.
-- Remove it by resetting the local database: rm -rf .wrangler/state && npm run db:init

-- clients ------------------------------------------------------------------
INSERT INTO clients (name, company, email, phone, address, category, socials, preferred_contact, acquired_at, status, notes, lead_source, inquiry_date, services_discussed, created_at, updated_at)
VALUES
 ('Mara Ellison', 'Meridian Coffee Roasters', 'mara@meridiancoffee.example', '+1 415 555 0134', '218 Valencia St, San Francisco, CA', 'Hospitality / retail', '{"instagram":"meridiancoffee","website":"meridiancoffee.example"}', 'email', date('now','-380 day'), 'active_client', 'Prefers Tuesday calls. Brand refresh planned for next year.', 'referral', date('now','-392 day'), 'E-commerce build, photography direction, monthly management', strftime('%Y-%m-%dT%H:%M:%fZ','now','-380 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 day')),
 ('Iris Halcyon', 'Halcyon Ceramics', 'studio@halcyonceramics.example', '+1 503 555 0198', '77 SE Division St, Portland, OR', 'Artist / maker', '{"instagram":"halcyonceramics"}', 'email', date('now','-250 day'), 'active_client', 'Gallery launch every spring. Wants a shop by Q2.', 'social', date('now','-262 day'), 'Portfolio site, shop integration, maintenance', strftime('%Y-%m-%dT%H:%M:%fZ','now','-250 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 day')),
 ('Daniel Okafor', 'Northwind Legal', 'd.okafor@northwindlegal.example', '+1 312 555 0110', '410 N Michigan Ave, Chicago, IL', 'Professional services', '{"linkedin":"northwindlegal"}', 'phone', date('now','-620 day'), 'active_client', 'Firm-wide accessibility review due before their audit.', 'existing client', date('now','-640 day'), 'Business site, accessibility remediation, hosting management', strftime('%Y-%m-%dT%H:%M:%fZ','now','-620 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')),
 ('Priya Raman', 'Brightwater Physio', 'priya@brightwaterphysio.example', '+1 206 555 0177', NULL, 'Health & wellness', '{}', 'email', NULL, 'proposal_sent', 'Needs online booking and two location pages.', 'website', date('now','-18 day'), 'Booking site, local SEO, care plan', strftime('%Y-%m-%dT%H:%M:%fZ','now','-18 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 day')),
 ('Tomas Kestrel', 'Studio Kestrel', 'hello@studiokestrel.example', NULL, NULL, 'Design studio', '{}', 'email', date('now','-900 day'), 'former_client', 'Moved in-house. Good reference, may return.', 'referral', date('now','-920 day'), 'Portfolio site', strftime('%Y-%m-%dT%H:%M:%fZ','now','-900 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-120 day'));

INSERT INTO client_tags (client_id, tag) VALUES (1,'vip'),(1,'ecommerce'),(1,'retainer'),(2,'artist'),(2,'retainer'),(3,'retainer'),(3,'accessibility'),(4,'prospect'),(5,'alumni');

-- leads --------------------------------------------------------------------
INSERT INTO leads (name, company, email, phone, source, services, est_value_cents, recurring_cents, stage, probability, notes, next_follow_up, created_at, updated_at)
VALUES
 ('Priya Raman', 'Brightwater Physio', 'priya@brightwaterphysio.example', '+1 206 555 0177', 'website', 'Booking site + local SEO', 780000, 15000, 'proposal_sent', 65, 'Wants booking integration with Jane App. Decision by end of month.', date('now','+2 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-18 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 day')),
 ('Marcus Bell', 'Bell & Sons Carpentry', 'marcus@bellandsons.example', '+1 415 555 0150', 'referral', 'Brochure site, 5 pages', 420000, 0, 'discovery_consultation', 35, 'Referred by Meridian. Wants photography included.', date('now','+1 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-9 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 day')),
 ('Ana Duarte', 'Duarte Floral', 'ana@duartefloral.example', NULL, 'instagram', 'Shop + delivery scheduling', 950000, 20000, 'negotiation', 75, 'Comparing two quotes. Emphasised handover training.', date('now'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-31 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')),
 ('Owen Pike', 'Pike Fitness', 'owen@pikefitness.example', NULL, 'cold outreach', 'Landing page', 180000, 0, 'initial_contact', 15, 'No reply yet after first email.', date('now','-4 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-21 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-21 day')),
 ('Sofia Lind', 'Lind Architects', 'sofia@lindarchitects.example', '+1 646 555 0121', 'referral', 'Portfolio + project archive', 1250000, 25000, 'requirements_gathering', 45, 'Needs a searchable project archive with 200+ entries.', date('now','+5 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-12 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-4 day'));

-- projects ----------------------------------------------------------------
INSERT INTO projects (code, name, client_id, category, description, scope, start_date, due_date, budget_cents, payment_structure, priority, status, notes, portal_visible, created_at, updated_at)
VALUES
 ('MER-26', 'Meridian storefront rebuild', 1, 'ecommerce_website', 'Replace the legacy storefront with a faster catalogue and subscription checkout.', 'Six templates, subscription checkout, wholesale enquiry form, migration of 84 products, training session.', date('now','-46 day'), date('now','+18 day'), 1450000, '40% deposit, 30% design sign-off, 30% launch', 'high', 'development', 'Payment provider sandbox credentials live in the website environment.', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-46 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')),
 ('HAL-26', 'Halcyon portfolio refresh', 2, 'artist_website', 'New portfolio layout with a small shop and exhibition archive.', 'Portfolio grid, shop with 12 pieces, exhibition archive, mailing list integration.', date('now','-22 day'), date('now','+9 day'), 620000, '50% deposit, 50% launch', 'medium', 'client_review', 'Client reviewing second round of design.', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-22 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 day')),
 ('NWL-25', 'Northwind accessibility remediation', 3, 'website_redesign', 'Bring the firm site to WCAG 2.2 AA before their compliance audit.', 'Audit, keyboard navigation, contrast fixes, form labelling, screen reader testing.', date('now','-70 day'), date('now','-8 day'), 480000, '100% on completion', 'urgent', 'final_approval', 'Awaiting partner sign-off on the audit report.', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-70 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 day')),
 ('MER-25', 'Meridian brand site launch', 1, 'business_website', 'Initial marketing site delivered before the storefront project.', 'Five-page marketing site with menu and locations.', date('now','-210 day'), date('now','-150 day'), 680000, '50% deposit, 50% launch', 'medium', 'completed', 'Delivered on time; case study written.', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-210 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-148 day')),
 ('BRW-26', 'Brightwater booking site', 4, 'business_website', 'Booking-first site for two clinic locations.', 'Booking integration, two location pages, care plan page, local SEO basics.', date('now','+10 day'), date('now','+52 day'), 780000, '50% deposit, 50% launch', 'medium', 'planning', 'Starts after proposal acceptance.', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 day'));

INSERT INTO project_milestones (project_id, title, description, due_date, amount_cents, status, requires_approval, approved_at, approved_note, sort, created_at)
VALUES
 (1,'Design concepts','Two homepage directions with mobile layouts', date('now','-30 day'), 435000, 'approved', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-28 day'), 'Approved by client', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-40 day')),
 (1,'Build complete','Staging build with catalogue and checkout', date('now','-4 day'), 435000, 'approved', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 day'), 'Approved by client', 2, strftime('%Y-%m-%dT%H:%M:%fZ','now','-40 day')),
 (1,'Launch','Production launch and training', date('now','+18 day'), 580000, 'pending', 1, NULL, NULL, 3, strftime('%Y-%m-%dT%H:%M:%fZ','now','-40 day')),
 (2,'Portfolio design','Grid and typography direction', date('now','-8 day'), 310000, 'approved', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 day'), 'Approved', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-20 day')),
 (2,'Shop build','Twelve products with shipping rules', date('now','+4 day'), 310000, 'awaiting_approval', 1, NULL, NULL, 2, strftime('%Y-%m-%dT%H:%M:%fZ','now','-20 day')),
 (3,'Audit report','WCAG 2.2 AA findings and fixes', date('now','-12 day'), 480000, 'awaiting_approval', 1, NULL, NULL, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-60 day')),
 (4,'Launch','Marketing site live', date('now','-150 day'), 680000, 'approved', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-150 day'), 'Approved', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-200 day'));

INSERT INTO project_deliverables (project_id, title, url, status, portal_visible, created_at)
VALUES
 (1,'Staging preview','https://staging.meridiancoffee.example','delivered',1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 day')),
 (1,'Content migration sheet',NULL,'delivered',1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-12 day')),
 (2,'Design round two','https://figma.example/halcyon-r2','revisions',1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-9 day')),
 (3,'Accessibility audit report',NULL,'delivered',1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-11 day'));

-- websites ---------------------------------------------------------------
INSERT INTO websites (client_id, project_id, name, domain, production_url, staging_url, category, stack, hosting_provider, domain_registrar, deploy_platform, repo_url, backend_provider, db_provider, media_provider, status, deployed_at, domain_renewal_date, hosting_renewal_date, ssl_expires_at, monitoring_enabled, monitor_interval_minutes, integration_id, integration_status, integration_version, last_sync_at, last_api_activity_at, portal_visible, notes, created_at, updated_at)
VALUES
 (1, 1, 'Meridian Coffee', 'meridiancoffee.example', 'https://meridiancoffee.example', 'https://staging.meridiancoffee.example', 'E-commerce', 'Next.js 15', 'Cloudflare', 'Namecheap', 'Vercel', 'https://github.com/example/meridian', 'Cloudflare Workers', 'D1', 'R2', 'live', date('now','-150 day'), date('now','+22 day'), date('now','+95 day'), date('now','+48 day'), 1, 30, 'wsi_demoMeridian01', 'connected', '1.0.0', strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 hour'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 hour'), 1, 'Staging protected by basic auth.', strftime('%Y-%m-%dT%H:%M:%fZ','now','-200 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 hour')),
 (2, 2, 'Halcyon Ceramics', 'halcyonceramics.example', 'https://halcyonceramics.example', NULL, 'Portfolio', 'Astro 5', 'Netlify', 'Cloudflare Registrar', 'Netlify', 'https://github.com/example/halcyon', NULL, NULL, 'Cloudinary', 'live', date('now','-250 day'), date('now','+140 day'), date('now','+64 day'), date('now','+120 day'), 1, 60, 'wsi_demoHalcyon01', 'connected', '1.0.0', strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'), 1, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now','-250 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')),
 (3, 3, 'Northwind Legal', 'northwindlegal.example', 'https://northwindlegal.example', NULL, 'Professional services', 'WordPress 6.7', 'Kinsta', 'GoDaddy', NULL, NULL, 'PHP 8.3', 'MySQL', NULL, 'maintenance', date('now','-620 day'), date('now','+8 day'), date('now','+8 day'), date('now','+11 day'), 1, 60, 'wsi_demoNorthwind01', 'disconnected', '0.9.2', strftime('%Y-%m-%dT%H:%M:%fZ','now','-9 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-9 day'), 1, 'Plugin stack frozen until the accessibility work is signed off.', strftime('%Y-%m-%dT%H:%M:%fZ','now','-620 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-9 day')),
 (4, 5, 'Brightwater Physio', 'brightwaterphysio.example', NULL, NULL, 'Health & wellness', 'Next.js 15', 'Cloudflare', NULL, 'Vercel', NULL, NULL, NULL, NULL, 'in_development', NULL, NULL, NULL, NULL, 1, 60, 'wsi_demoBrightwater01', 'not_connected', NULL, NULL, NULL, 0, 'Not launched; monitoring disabled until there is a production URL.', strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 day'));

-- health + maintenance history --------------------------------------------
INSERT INTO website_checks (website_id, source, kind, status, latency_ms, http_status, detail, checked_at)
VALUES
 (1,'automated','uptime','ok',182,200,'HTTP 200 in 182 ms', strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 hour')),
 (1,'automated','uptime','ok',204,200,'HTTP 200 in 204 ms', strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 hour')),
 (1,'manual','ssl','ok',NULL,NULL,'Certificate valid until 2027-01-12, auto-renew enabled at Cloudflare.', strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 day')),
 (2,'automated','uptime','ok',96,200,'HTTP 200 in 96 ms', strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')),
 (2,'manual','accessibility','warn',NULL,NULL,'Two unlabelled gallery controls found in the shop template. Fix scheduled with the shop build.', strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 day')),
 (3,'automated','uptime','warn',1340,503,'HTTP 503 in 1340 ms — origin maintenance window', strftime('%Y-%m-%dT%H:%M:%fZ','now','-9 day')),
 (3,'manual','security','warn',NULL,NULL,'Two plugins have pending security releases; upgrade blocked until sign-off.', strftime('%Y-%m-%dT%H:%M:%fZ','now','-4 day'));

INSERT INTO website_events (website_id, type, title, detail, source, created_at)
VALUES
 (1,'deployment','Deployed build 8831','Storefront catalogue and checkout fixes.','integration', strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 day')),
 (1,'content','Added winter subscription copy','Homepage and subscription page copy updated.','admin', strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 day')),
 (2,'design','Shop layout revised','Product grid changed to two columns on mobile.','admin', strftime('%Y-%m-%dT%H:%M:%fZ','now','-9 day')),
 (3,'security','Plugin review completed','Two plugins flagged; remediation plan sent to client.','admin', strftime('%Y-%m-%dT%H:%M:%fZ','now','-4 day')),
 (3,'integration','Integration disconnected','Credential revoked during the accessibility freeze.','admin', strftime('%Y-%m-%dT%H:%M:%fZ','now','-9 day'));

-- maintenance plans + requests --------------------------------------------
INSERT INTO maintenance_plans (client_id, website_id, name, monthly_cents, hours_included, services, start_date, next_service_date, status, notes, created_at, updated_at)
VALUES
 (1,1,'Meridian care plan', 25000, 4, 'Content updates, dependency updates, weekly backups, uptime monitoring, monthly report', date('now','-150 day'), date('now','+6 day'), 'active', 'Includes up to four content updates per month.', strftime('%Y-%m-%dT%H:%M:%fZ','now','-150 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 day')),
 (2,2,'Halcyon studio care', 12000, 2, 'Content updates, backup checks, dependency updates', date('now','-250 day'), date('now','+14 day'), 'active', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now','-250 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-20 day')),
 (3,3,'Northwind managed hosting', 40000, 6, 'Hosting management, plugin updates, security review, backup verification, priority support', date('now','-620 day'), date('now','+2 day'), 'active', 'Firm requires a monthly compliance note.', strftime('%Y-%m-%dT%H:%M:%fZ','now','-620 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-4 day'));

INSERT INTO maintenance_requests (client_id, website_id, title, description, priority, status, assignee_id, submitted_at, target_date, work_performed, completed_at, notes, source, created_at, updated_at)
VALUES
 (1,1,'Update winter menu and hours','New menu PDF and revised holiday hours for both locations.', 'medium', 'in_progress', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 day'), date('now','+1 day'), NULL, NULL, 'Waiting on final hours confirmation.', 'portal', strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')),
 (3,3,'Plugin security releases','Two plugins flagged with security advisories. Need approval to upgrade on production.', 'high', 'awaiting_client_response', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 day'), date('now','-1 day'), 'Tested upgrades on staging; no visual regressions found.', NULL, 'Client asked for a rollback plan before approving.', 'portal', strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 day')),
 (2,2,'Update exhibition archive','Add three new exhibitions with images and dates.', 'low', 'completed', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now','-18 day'), date('now','-14 day'), 'Added three exhibitions, optimised images, checked archive pagination.', strftime('%Y-%m-%dT%H:%M:%fZ','now','-15 day'), NULL, 'portal', strftime('%Y-%m-%dT%H:%M:%fZ','now','-18 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-15 day')),
 (1,1,'Checkout error on mobile','Customer reported a failed payment on iOS Safari.', 'urgent', 'under_review', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'), date('now','+1 day'), NULL, NULL, 'Reproduced once; checking provider logs.', 'portal', strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'));

-- agreements --------------------------------------------------------------
INSERT INTO agreements (number, client_id, project_id, kind, title, status, scope, deliverables, amount_cents, deposit_cents, revision_limit, timeline, maintenance_terms, support_terms, client_responsibilities, cancellation_terms, extra_conditions, expires_at, sent_at, viewed_at, accepted_at, accepted_by, accepted_ip, accepted_hash, portal_visible, created_at, updated_at)
VALUES
 ('AGR-2026-0001', 1, 1, 'development_contract', 'Storefront rebuild agreement — Meridian Coffee', 'accepted',
  'Design and build of the storefront described in the project record, including six templates, subscription checkout and migration of 84 products.',
  'Design concepts, staging build, production launch, training session and source repository.', 1450000, 580000, 'Two rounds of revisions per stage', '8 weeks from deposit and content receipt',
  'Ongoing management is covered by a separate care plan.', 'Thirty days of post-launch defect support.',
  'Provide product data, photography and feedback within five business days at each review.', 'Either party may terminate with 14 days written notice; work completed is payable and the deposit is non-refundable.',
  NULL, date('now','+20 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-45 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-45 day'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now','-44 day'), 'Mara Ellison (mara@meridiancoffee.example)', '203.0.113.24', 'a4f1c2e9b7d84c3fa1e6b0d2c95f7a83b1d4e6f8092a3c5b7d9e1f3a5c7b9d2e', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-46 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-44 day')),
 ('AGR-2026-0002', 2, 2, 'proposal', 'Portfolio refresh — scope and quote', 'sent',
  'New portfolio layout with shop and exhibition archive.', 'Portfolio grid, shop with 12 pieces, exhibition archive, mailing list integration.', 620000, 310000, 'Two rounds', '4 weeks',
  NULL, 'Not included.', 'Provide photography and product copy for twelve pieces.', 'Proposal valid 30 days.', NULL, date('now','+16 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 day'), NULL, NULL, NULL, NULL, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 day')),
 ('AGR-2026-0003', 3, NULL, 'maintenance_agreement', 'Website management agreement — Northwind Legal', 'accepted',
  'Monthly management: hosting oversight, plugin and security updates, backup verification, priority support.', 'Monthly compliance note and activity summary.', 40000, 0, NULL, 'Rolling monthly',
  'Up to six hours per month included; additional work billed hourly.', 'Response within one business day, urgent outages prioritised.',
  'Maintain valid credentials for third-party services and notify of firm-wide changes.', '30 days notice.', NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now','-300 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-300 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-299 day'), 'Daniel Okafor (d.okafor@northwindlegal.example)', '198.51.100.9', 'b7c2d4e6f8a09b1c3d5e7f9a1b2c4d6e8f0a2b4c6d8e0f1a3b5c7d9e1f2a4b6c', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-301 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-299 day'));

-- invoices, items, payments ----------------------------------------------
INSERT INTO invoices (number, client_id, project_id, kind, description, subtotal_cents, tax_cents, discount_cents, total_cents, paid_cents, status, issue_date, due_date, notes, portal_visible, created_at, updated_at)
VALUES
 ('INV-2026-0001', 1, 1, 'deposit', 'Storefront rebuild — deposit', 580000, 0, 0, 580000, 580000, 'paid', date('now','-44 day'), date('now','-30 day'), 'Thank you. Deposit received.', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-44 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-42 day')),
 ('INV-2026-0002', 1, 1, 'milestone', 'Design sign-off — milestone 2', 435000, 0, 0, 435000, 435000, 'paid', date('now','-28 day'), date('now','-14 day'), NULL, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-28 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-20 day')),
 ('INV-2026-0003', 3, NULL, 'management_subscription', 'Website management — monthly', 40000, 0, 0, 40000, 40000, 'paid', date('now','-32 day'), date('now','-18 day'), NULL, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-32 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-25 day')),
 ('INV-2026-0004', 2, 2, 'deposit', 'Portfolio refresh — deposit', 310000, 0, 0, 310000, 310000, 'paid', date('now','-20 day'), date('now','-6 day'), NULL, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-20 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-12 day')),
 ('INV-2026-0005', 3, NULL, 'emergency_support', 'Emergency plugin remediation and staging test', 45000, 0, 0, 45000, 0, 'overdue', date('now','-24 day'), date('now','-9 day'), 'Payable within 14 days.', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-24 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-9 day')),
 ('INV-2026-0006', 1, 1, 'milestone', 'Build completion — milestone 3', 435000, 0, 0, 435000, 200000, 'partially_paid', date('now','-8 day'), date('now','+6 day'), 'Part payment received; balance due before launch.', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-8 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 day')),
 ('INV-2026-0007', 2, 2, 'management_subscription', 'Studio care plan — current month', 12000, 0, 0, 12000, 0, 'unpaid', date('now','-2 day'), date('now','+12 day'), NULL, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 day')),
 ('INV-2026-0008', 1, NULL, 'additional_services', 'Product photography retouching', 68000, 0, 0, 68000, 0, 'draft', NULL, date('now','+20 day'), NULL, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'));

INSERT INTO invoice_items (invoice_id, description, qty, unit_price_cents, amount_cents, sort)
VALUES
 (1,'Storefront rebuild — deposit (40%)',1,580000,580000,0),
 (2,'Design concepts and mobile layouts',1,435000,435000,0),
 (3,'Website management — monthly retainer',1,40000,40000,0),
 (4,'Portfolio refresh — deposit (50%)',1,310000,310000,0),
 (5,'Emergency plugin remediation (3 hours)',3,12000,36000,0),
 (5,'Staging verification and rollback plan',1,9000,9000,1),
 (6,'Storefront build completion',1,435000,435000,0),
 (7,'Studio care plan',1,12000,12000,0),
 (8,'Product photography retouching',4,17000,68000,0);

INSERT INTO payments (invoice_id, client_id, amount_cents, paid_at, method, reference, notes, status, source, created_at)
VALUES
 (1,1,580000,date('now','-42 day'),'bank_transfer','MER-DEP-1902','Verified against bank statement.','confirmed','manual', strftime('%Y-%m-%dT%H:%M:%fZ','now','-42 day')),
 (2,1,435000,date('now','-20 day'),'stripe','ch_3Pdemo1','Stripe payout matched.','confirmed','provider', strftime('%Y-%m-%dT%H:%M:%fZ','now','-20 day')),
 (3,3,40000,date('now','-25 day'),'bank_transfer','NWL-MAINT-11',NULL,'confirmed','manual', strftime('%Y-%m-%dT%H:%M:%fZ','now','-25 day')),
 (4,2,310000,date('now','-12 day'),'paypal','PP-88213',NULL,'confirmed','manual', strftime('%Y-%m-%dT%H:%M:%fZ','now','-12 day')),
 (6,1,200000,date('now','-3 day'),'bank_transfer','MER-PART-2231','Part payment; client reported a second transfer not yet visible.','confirmed','manual', strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 day')),
 (6,1,100000,date('now','-1 day'),'bank_transfer','MER-PART-2240','Client reports sent; awaiting bank confirmation.','pending','manual', strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'));

-- tasks -------------------------------------------------------------------
INSERT INTO tasks (title, description, priority, category, due_date, status, client_id, project_id, website_id, recurrence, notes, created_at, updated_at)
VALUES
 ('Confirm holiday hours with Meridian', 'Waiting on final confirmation before publishing the menu update.', 'high', 'maintenance', date('now'), 'in_progress', 1, NULL, 1, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')),
 ('Send Northwind rollback plan', 'Client asked for a rollback plan before approving plugin upgrades.', 'urgent', 'maintenance', date('now','-1 day'), 'open', 3, NULL, 3, NULL, 'Draft exists in notes.', strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 day')),
 ('Chase Meridian milestone balance', 'Balance due before launch; part payment received.', 'high', 'finance', date('now','+2 day'), 'open', 1, 1, NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 day')),
 ('Halcyon shop build QA', 'Test shipping rules and twelve product entries on mobile.', 'medium', 'development', date('now','+3 day'), 'open', 2, 2, 2, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now','-4 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-4 day')),
 ('Monthly backups verification', 'Confirm restore points for all three managed sites.', 'medium', 'maintenance', date('now','+5 day'), 'open', NULL, NULL, NULL, 'monthly', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 day')),
 ('Prepare Brightwater proposal follow-up', 'Decision expected; send a short reminder with the timeline.', 'medium', 'sales', date('now','+1 day'), 'open', 4, 5, NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 day')),
 ('Archive old Meridian menu assets', 'Move superseded assets out of the working folder.', 'low', 'admin', date('now','-3 day'), 'done', 1, NULL, 1, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now','-12 day'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 day'));

-- calendar ----------------------------------------------------------------
INSERT INTO calendar_events (title, type, client_id, project_id, website_id, starts_at, ends_at, location, notes, visibility, created_at)
VALUES
 ('Meridian launch review', 'meeting', 1, 1, NULL, strftime('%Y-%m-%dT14:00:00Z','now','+3 day'), strftime('%Y-%m-%dT15:00:00Z','now','+3 day'), 'Google Meet', 'Walk through the final checklist.', 'client', strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 day')),
 ('Northwind compliance check-in', 'consultation', 3, 3, NULL, strftime('%Y-%m-%dT10:30:00Z','now','+5 day'), strftime('%Y-%m-%dT11:00:00Z','now','+5 day'), 'Phone', 'Discuss remediation sign-off.', 'client', strftime('%Y-%m-%dT%H:%M:%fZ','now','-4 day')),
 ('Halcyon design review', 'meeting', 2, 2, NULL, strftime('%Y-%m-%dT16:00:00Z','now','+1 day'), strftime('%Y-%m-%dT16:45:00Z','now','+1 day'), 'Studio', 'Second round walkthrough.', 'client', strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 day')),
 ('Brightwater discovery call', 'consultation', 4, 5, NULL, strftime('%Y-%m-%dT09:00:00Z','now','+7 day'), strftime('%Y-%m-%dT10:00:00Z','now','+7 day'), 'Zoom', 'Requirements for booking integration.', 'client', strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'));

-- activities --------------------------------------------------------------
INSERT INTO activities (client_id, lead_id, project_id, website_id, type, subject, body, happened_at, visibility, created_at)
VALUES
 (1, NULL, 1, NULL, 'meeting', 'Launch review scheduled', 'Agreed launch checklist and training slot for the team.', strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 day'), 'client', strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 day')),
 (1, NULL, 1, 1, 'payment', 'Milestone payment received', 'Part payment of $2,000 confirmed against INV-2026-0006. Balance due before launch.', strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 day'), 'client', strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 day')),
 (2, NULL, 2, 2, 'project', 'Design round two delivered', 'Second round posted for review; shop build continues in parallel.', strftime('%Y-%m-%dT%H:%M:%fZ','now','-9 day'), 'client', strftime('%Y-%m-%dT%H:%M:%fZ','now','-9 day')),
 (3, NULL, 3, 3, 'maintenance', 'Plugin advisories found', 'Two plugins have security releases. Upgrade blocked pending client approval and a rollback plan.', strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 day'), 'client', strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 day')),
 (1, NULL, NULL, 1, 'note', 'Internal: provider logs requested', 'Requested checkout logs from the payment provider for the iOS Safari failure.', strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'), 'internal', strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')),
 (4, 1, 5, NULL, 'proposal', 'Proposal sent', 'Booking site scope and care plan sent for review.', strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 day'), 'internal', strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 day'));

-- lead activities ---------------------------------------------------------
INSERT INTO activities (lead_id, type, subject, body, happened_at, visibility, created_at)
VALUES
 (1,'email','Proposal followed up','Sent a short note with the timeline; decision expected this week.', strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 day'), 'internal', strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 day')),
 (3,'call','Negotiation call','Client comparing two quotes; discussed handover training and support.', strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'), 'internal', strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'));

-- api request + sync history (illustrative of real telemetry shape) -------
INSERT INTO sync_logs (website_id, direction, kind, status, message, payload, created_at)
VALUES
 (1,'inbound','metadata','ok','Metadata synchronised (production) · build bld_8831','{"metadata":{"name":"Meridian Coffee"},"technology":{"framework":"Next.js 15"},"deployment":{"environment":"production","build_id":"bld_8831"}}', strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 hour')),
 (1,'inbound','deployment','ok','Deployment succeeded (bld_8831)','{"status":"succeeded","environment":"production","build_id":"bld_8831"}', strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 day')),
 (2,'inbound','metadata','ok','Metadata synchronised (production)','{"technology":{"framework":"Astro 5"}}', strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')),
 (3,'inbound','health','fail','Certificate renewal overdue by 2 days','{"status":"fail","message":"TLS renewal failed"}', strftime('%Y-%m-%dT%H:%M:%fZ','now','-9 day'));

-- accounts -----------------------------------------------------------------
-- Public demo credentials, created with the same PBKDF2 hashing the app uses.
-- They are inserted only when the database has no accounts at all, so running
-- this file can never add a known-password administrator next to real users.
INSERT INTO users(email, name, role, client_id, password_hash, password_salt, iterations, status, created_at)
SELECT email, name, role, client_id, password_hash, password_salt, iterations, status, created_at
FROM (
  SELECT 'admin@anvil.test' AS email, 'Demo Administrator' AS name, 'admin' AS role, NULL AS client_id,
         'Q-Y4of9Dg4G4lq5ElGoL9PNbmTdrLqmn9vgMSVNvSBQ' AS password_hash,
         'i-oWhYgtoH2MAwXhJzxZdg' AS password_salt, 150000 AS iterations, 'active' AS status,
         strftime('%Y-%m-%dT%H:%M:%fZ','now') AS created_at
  UNION ALL
  SELECT 'portal@anvil.test', 'Mara Ellison', 'client',
         (SELECT id FROM clients WHERE email = 'mara@meridiancoffee.example' ORDER BY id LIMIT 1),
         'Wn291M3cNvvhBC_Mr3KwE0gvBYB8iLf5v6eEFTStYf0', 'X2JOvDjSAgXceUy0cBZJbw',
         150000, 'active', strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
WHERE (SELECT COUNT(*) FROM users) = 0;

-- Advertise the demo accounts on the sign-in screen only when they exist.
INSERT OR REPLACE INTO settings(key, value)
SELECT 'demo_mode', '1'
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'admin@anvil.test')
  AND EXISTS (SELECT 1 FROM users WHERE email = 'portal@anvil.test');
