# Asynchronous states

Use skeletons only when the loaded geometry is stable. Prefer determinate progress when completion can be measured. Empty, partial, error, permission, offline, and destructive states must be represented explicitly and must not shift the surrounding layout unexpectedly.

- Loading: use `Skeleton` with an adjacent screen-reader label or `Progress` when a value exists.
- Empty: use `EmptyState` with an outcome-oriented next action.
- Partial: preserve available data and identify what has not loaded.
- Error: use `Alert` or inline validation with a recovery action and retained user input.
- Permission: name the missing browser capability and the exact action required to retry.
- Offline/retry: keep safe local state, describe retry progress, and avoid false completion.
- Destructive: require a named confirmation dialog, trap focus, support Escape, and restore focus.

Toasts supplement visible state but never carry the only copy of an error or required action.
