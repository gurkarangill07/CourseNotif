# Roadmap (Planning Version)

## Phase 0: Scope and policy

- Confirm exact use case and supported terms/sections
- Confirm York policy and acceptable usage boundaries
- Define reliability and alert-latency targets

## Phase 1: Product requirements

- Finalize user input model (course, section, lab key, email)
- Define session-expiry and re-login workflow
- Define alert behavior and dedupe rules

## Phase 2: System design

- Choose architecture path (centralized MVP vs client extension)
- Define storage model and event model
- Define operational and security requirements

## Phase 3: Pilot plan

- Define pilot user cohort and success metrics
- Define support process for session expiry issues
- Define feedback loop and prioritization method

## Decision guidance

- Short-term easiest path: centralized MVP
- Long-term scalable path: client-side extension/agent
- Immediate next action: finalize non-functional requirements before coding
