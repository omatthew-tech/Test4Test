# Iconography

Lucide is the sole product icon family. Use its outlined style with the default 2 px stroke and one of the three semantic optical sizes:

| Role                                   | Token                       | Size  |
| -------------------------------------- | --------------------------- | ----- |
| Compact controls and inline metadata   | `semantic.size.icon.small`  | 16 px |
| Default controls and status details    | `semantic.size.icon.medium` | 20 px |
| High-emphasis status or feature detail | `semantic.size.icon.large`  | 24 px |

Numeric `size` props are permitted only because Lucide's public API serializes the corresponding semantic token values. `ds:validate` rejects every other numeric icon size and any custom numeric `strokeWidth`.

Decorative icons use `aria-hidden="true"`. Icon-only actions require the design-system `IconButton` and a specific `label`. Filled icons are reserved for selected states and essential status communication. Do not place every icon in a tinted rounded square, mix icon families, or use sparkle, wand, brain, bot, star, or orbit symbols as generic decoration.
