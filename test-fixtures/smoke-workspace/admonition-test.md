# MyST `:::` Directive Test File

> Copy this into a `.md` file opened with the myst-notebook extension and
> move focus off each cell to see rendered output. Source stays `:::` format.

---

## 1. Core Admonition Types (10 types, 4 color groups)

### Blue Group

:::{note}
This is a **note** — use for supplementary information the user should be aware of.
Contains inline math $E = mc^2$.
:::

:::{important}
This is an **important** callout — stronger than a note, for must-know information.
- bullet 1
- bullet 2
:::

### Green Group

:::{hint}
This is a **hint** — a gentle suggestion or shortcut.
:::

:::{seealso}
This is a **seealso** — cross-reference or further reading.
:::

:::{tip}
:::

### Orange Group

:::{attention}
This is an **attention** — something that requires the reader's attention.
:::

:::{caution}
This is a **caution** — potential pitfall or risk of error.
:::

:::{warning}
This is a **warning** — something that could cause problems if ignored.
:::

### Red Group

:::{danger}
This is a **danger** — serious risk of data loss or damage.
:::

:::{error}
This is an **error** — something that will not work or is incorrect.
:::

---

## 2. Generic `{admonition}` with Custom Title

:::{admonition} My Custom Title Here
This is a generic admonition with a **custom title**. Defaults to orange styling.

Use this when none of the 10 named types fit your purpose.
:::

---

## 3. Dropdown (Collapsible)

:::{note} :class: dropdown
Click the summary to expand this note. The dropdown uses native HTML `<details>` so it works
without JavaScript and is keyboard-accessible.
:::

:::{warning} :class: dropdown
**Warning inside a dropdown!** Expands on click. Good for hiding spoilers or optional detail.
:::

:::{admonition} Click to Reveal :class: dropdown
This is a custom-title admonition that is also collapsible. Combines generic `{admonition}` with `:class: dropdown`.
:::

---

## 4. Content Inside Admonitions

:::{tip}
### Headings work inside admonitions

So do **bold**, *italic*, `inline code`, and [links](https://example.com).

```python
# Code blocks work too
def hello():
    print("Hello from inside an admonition!")
```


| Table | Works |
|-------|-------|
| A     | B     |

$$ \int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2} $$
:::

---

## 5. Edge Cases

:::{note}
:::

*(Empty admonition — renders with title bar only)*

:::{warning}
Single line, no trailing newline.
:::

:::{tip} :class: dropdown
:::

*(Empty dropdown)*

---

## Notes

- **Source preservation**: all `:::` fences remain as-is in the file after save/reload.
- **Color mapping** follows MyST/Jupyter Book convention: blue (note/important), green (hint/seealso/tip), orange (attention/caution/warning), red (danger/error).
- **Not yet supported** (rendered as plain source text):
  - `:::{figure}` / `:::{image}` — figures and images
  - `:::{math}` — block math (use `$$...$$` instead)
  - `:::{grid}` / `:::{grid-item}` — grid layouts
  - `:::{card}` / `:::{cards}` — card components
  - `:::{tab-set}` / `:::{tab-item}` — tabbed content
  - `:::{code-cell}` (in `:::` form — backtick fence ` ```{code-cell}` already works)
  - `:::{list-table}` — list-table directive
  - `:::{glossary}` — glossary directive
