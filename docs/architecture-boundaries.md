# Incremental module decoupling

## Completed boundary: mutation-driven UI refresh

Feature mutations call `refreshDerivedUiProfile` or `refreshDerivedUiAfterMutation`
from `src/services/derivedDataRefresh.ts`. That service does not discover callbacks
through `window`, import UI modules, or depend on their registration order.

`createDerivedUiRefresher` accepts six required typed callbacks. The application
composition layer (`src/app/derivedRefreshBindings.ts`) connects those callbacks
to their concrete implementations. `main.ts` initializes the connections before
auth bindings and protected boot. Configuration itself performs no data requests.
Calling the shared coordinator before configuration rejects explicitly.

The refresh profiles and forced reload arguments are unchanged. Inbox refreshes
continue to own their attention-summary update; an attention-only request invokes
the attention-summary port directly. Each requested callback is scheduled before
awaiting the group, so a synchronous exception cannot prevent other callbacks from
starting. Failures propagate to the caller.

## Compatibility and limits

Existing window exports remain for inline page controls and unmigrated callers.
They are compatibility adapters, not the dependency mechanism for the new
coordinator. The handlers themselves still contain legacy dependencies; this
change isolates the coordination boundary, not the entire application.

Do not introduce new cross-feature window callbacks. Put orchestration in the app
layer, use typed imports for stable services, and inject implementations when a
service would otherwise depend on UI code. Keep optional feature implementations
behind their existing lazy entry points. Do not replace window with an untyped,
application-wide event bus or service registry.

## Next boundaries

The employee drawer coordinator now has a required typed loader map for all 15
tabs. The app layer supplies selection and access checks, and registers legacy
adapters before initializing tab controls. Drawer navigation, reset, and review
invalidation use imports rather than window callbacks. The internal job board
still uses its lazy entry point.

Pending requests are tracked by identity and an AbortController. Employee
changes, resets, and tab invalidation abort the previous signal and pass a typed
EmployeeDrawerLoadContext into each loader. Feature loaders share
createEmployeeDrawerRenderer and do not write loading, empty, error, or success
HTML unless the request still belongs to the selected employee and tab. Select
queries attach the abort signal when the Supabase builder supports it; otherwise
stale completions are ignored. Legacy one-argument window callers still render.
The employee-admin loader awaits all three flag/payroll loads.

1. Dashboard boot and refresh calls inside the six concrete handlers.
2. Shared employee/session state, with clearly owned state and explicit updates.
3. Remaining drawer side effects that are not tab-panel HTML (toasts, form
   autofill, signature pads) still read selected-employee globals.
4. Consolidate window exports into compatibility adapters, then remove them only
   after migrating their HTML and programmatic callers.

For each boundary, preserve access checks, verify authenticated workflows with
isolated fixtures, and run type checks, unit tests, the production build budget,
and browser tests. Do not test mutations against production employee data.
