# Editing local text with ReactRewrite

Keep the Vite dev server running (`npm run dev`). In a second terminal, run:

```powershell
npm run dev:rewrite
```

Open the proxy URL printed in that terminal. Double-click text, edit it, and click **Confirm** to save it to the source file. After updating the compatibility scripts, stop ReactRewrite with **Ctrl+C**, start it again, and refresh the proxy page.

Use this launcher each time. `npx react-rewrite` does not install the project's compatibility fixes after a dependency reinstall.

The launcher fixes React 19 source attribution that can point at a layout wrapper instead of the element being edited. It supports static JSX text (including multiline text and inline markup), local string constants and object values, text props, and template literals without interpolation. It keeps source line endings and provides undo snapshots to ReactRewrite.

For example, a heading rendered as `<h2>{method.title}</h2>` can update the local `title: "Test other founders"` string. It does not replace the expression with hardcoded JSX.

Text must match a unique static location, or a verified exact source position. Repeated text that cannot be distinguished is rejected with an explanation. Text available only at runtime, such as database records, and unsupported computed expressions cannot be edited this way. No database connection is used by these compatibility scripts.

The compatibility patch targets the installed `react-rewrite-cli` 0.1.1 build. It is reapplied by the launcher after `npm install`; an incompatible build fails with an explicit message instead of silently patching unknown code.

Run its regression checks with:

```powershell
npm run test:react-rewrite
```
