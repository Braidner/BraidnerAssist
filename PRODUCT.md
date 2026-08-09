# Product

## Register

product

## Platform

web

## Users

A single operator — the owner — running the dashboard at home on the LAN, plus **Hermes**, a Claude-based AI agent that reads the same data and drives the same tasks through MCP and REST. The two are co-equal operators, not a user and a bot: anything the owner can do in the UI, Hermes can do through tools, and both see one shared source of truth. The owner's context is personal and ambient — opening the board to check what's happening across tasks, homelab services, media, and system health, often at a glance, on desktop or phone. The job to be done is staying oriented and in control of a personal life-and-homelab from one place, and handing work to Hermes when it's easier to delegate than to click.

## Product Purpose

Pultra is a self-hosted personal command center that unifies tasks, homelab services, home automation, media, and system status into one local surface. It exists so the owner doesn't have to juggle a dozen separate tools and dashboards, and so an AI agent can operate that same surface autonomously. Success is a board that is trusted and pleasant to open: state is legible at a glance, nothing feels stale or broken, and both human and agent can act without friction.

## Positioning

One local, private screen that unifies the owner's whole life-and-homelab — tasks, services, media, system — with nothing in the cloud. The value is the union under one roof, on hardware the owner controls.

## Brand Personality

Rich, characterful, and personal. This is a space the owner *chooses* to open, not a utility endured — the cinematic media experience (full-bleed hero backdrops, large titles, auto-hiding chrome) sets a tone of polish that carries into the denser control panels. Utility and delight both count: the interface should feel expressive and considered, a dark cockpit with personality, while never letting the flourish get in the way of reading status fast. Confident and quietly indulgent, not corporate and not utilitarian.

## Anti-references

- **The generic SaaS admin template.** No stock dashboard look — no endless identical white-on-gray cards, no default blue primary, no icon-heading-text grids repeated without a point of view. If it could be any admin panel, it's wrong.
- **The enterprise monitoring wall.** No Grafana/Kibana density-without-soul — no cramped edge-to-edge gauge walls that are purely functional and visually unconsidered. Density here should stay legible and intentional, never oppressive.

## Design Principles

- **Local-first and private.** Everything runs on the owner's hardware, LAN-only, nothing in the cloud. Privacy and ownership are the point, not a feature bullet — design choices should never assume an external service or leak data off the box.
- **Human and agent are co-equal operators.** Every meaningful capability is reachable both through the UI and through Hermes via MCP/REST. Neither path is a second-class citizen; the shared data model is the contract between them.
- **Glanceable trust.** The operator should understand system state at a glance and never wonder whether a reading is stale or a service is quietly down. Legibility of status beats decoration everywhere on the control side.
- **Resilient by module.** Every integration is optional and isolated. A missing config shows "not configured" rather than an error, and one failing widget never breaks the board. The dashboard degrades gracefully, always.
- **Utility and delight together.** Polish is part of the job, not a coat of paint — the cinematic media experience earns its richness — but flourish never costs clarity or speed on the surfaces where the owner is reading state.

## Accessibility & Inclusion

Personal-use baseline. It's primarily a single operator on their own devices, so there's no formal WCAG conformance target. Maintain readable contrast, keyboard operability, and the `prefers-reduced-motion` support already in place; treat these as sensible defaults to preserve rather than a standard to certify against.
