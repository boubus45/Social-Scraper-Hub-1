---
name: Workflow bootstrap limits
description: Environment-specific failures that prevent managed workflows from starting before application code runs.
---

Managed workflows can fail before the app command starts when the pnpm bootstrap tries to install its pinned pnpm version and Node cannot create worker threads. The visible symptoms are `pthread_create: Resource temporarily unavailable`, `uv_thread_create` assertions, or repeated pnpm bootstrap failures; Metro never opens its configured port.

**Why:** The failure is in workflow provisioning rather than the application, so changing app code or the workflow command does not address it.

**How to apply:** Verify the app independently with direct local checks such as the package's TypeScript compiler when available. Do not modify the APK workflow to work around this environment limitation.