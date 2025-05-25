# XatBrowserAi
Browser Extension which can control your browser.

## Browser tools

The extension exposes helper functions in `browserTools.js` that can be used by
other scripts or agents. These tools communicate with the background script to
perform common operations:

* `getActiveTabInfo()` – returns the id, URL and title of the active tab.
* `getActiveTabHtml()` – retrieves the full HTML of the active tab.
* `openNewTab(url)` – opens a new tab with the provided URL.

These functions rely on message types `GET_TAB_INFO`, `GET_PAGE_HTML` and
`OPEN_TAB` handled in `background.js`.

## Using tools

The AI model is instructed to request browser actions by returning a JSON object
with a `tool` field. When the extension detects such a response, it calls the
corresponding function from `browserTools.js` and feeds the result back to the
model.

Example workflow:

1. **User:** "Show me today's top tax news."
2. **Assistant:** `{"tool": "openNewTab", "args": {"url": "https://news.google.com/search?q=tax"}}`
3. The extension opens the tab, obtains the page HTML and provides it to the
   model for follow‑up.
4. **Assistant:** Summarizes the relevant headlines.
