# Optional Elsa workflow module

`WebApi.Modules.Elsa.Infrastructure` is a custom runtime package. It is not referenced by the WebApi host and can be omitted from deployments that do not use newsroom automation.

## Deployment modes

- **Single process/pool:** activate `elsa`, `content`, and `shifts` in the same API pool. The Elsa hosted coordinator calls the Content and Shifts APIs through the gateway.
- **Separated workflow pool:** run dedicated WebApi processes with `Modules:Pool=workflow`, `Modules:Role=Api`, and `Modules:Enabled=elsa`. Route `/api/elsa/**` and the Content/Shifts APIs to their owning pools. `HotUnload=false`; upgrade by rolling restart.
- **ERP configuration:** omit Content, Shifts, and Elsa. Identity, tenancy, and unrelated modules have no project dependency on them.

The modules communicate through HTTP and the host's tenant context, not project references. Content owns creative works and validates state changes; Shifts owns rota and shift timing; Elsa coordinates delayed assignment, scheduled publishing, and shift handover. Persisted timestamps and state in Content/Shifts are authoritative, so a restarted coordinator can reconcile overdue actions. Domain endpoints recheck permissions and current state on every command.

## Setup

1. Build this project and package the **contents** of `bin/Debug/net10.0` as a zip for the runtime module installer.
2. Install `elsa` in the shared module catalog and activate it only in the workflow pool. Install Content and Shifts the same way, activating them in the pools that own their APIs.
3. Configure the `ConnectionStrings:elsa` secret for the workflow host. The host passes it only to the Elsa module; it is not stored in `modules.json`.
4. Configure the same confidential OAuth client secret for Identity and the workflow pool. In the Aspire Hybird AppHost, supply the `elsa-client-secret` parameter from Aspire user-secrets or the deployment secret provider.
5. Grant service subject `elsa-workflows` tenant-wide `content.assign`, `content.transfer`, `content.publish`, and `shifts.manage`. These grants are tenant-scoped and must be provisioned for each tenant; do not add them to the client token as global permissions.
6. Ensure replicas share the module catalog/package storage and configure the Elsa database with durable storage/backups. PostgreSQL is the provider wired by this initial module.

Section settings control the assignment delay (default five minutes) and checkout grace (default fifteen minutes). Assignment delay begins when the manager accepts the submission. The handover first returns unfinished review work to the queue, then checks out the shift. Editing a live creative work retains its published snapshot and cancels a pending schedule pending Desk reapproval.

The current coordinator reconciles persisted business deadlines on a configurable polling interval. The Elsa engine, persistence, tenant resolver, and secured Elsa API are hosted by this module. Authorable Elsa workflow definitions for these operations are a follow-up; keep business state transitions in Content/Shifts if that is added.
