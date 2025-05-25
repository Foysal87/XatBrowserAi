# XatBrowserAi
Browser Extension which can control your browser.

## Browser tools

The extension exposes helper functions in `browserTools.js` that can be used by
other scripts or agents. These tools communicate with the background script to
perform common operations:

* `getActiveTabInfo()` – returns the id, URL and title of the active tab.
* `getActiveTabHtml()` – retrieves the full HTML of the active tab.
* `openNewTab(url)` – opens a new tab with the provided URL.
* `searchWeb(query)` – opens a new tab with search results for the query.

These functions rely on message types `GET_TAB_INFO`, `GET_PAGE_HTML`, `OPEN_TAB`
and `SEARCH_WEB` handled in `background.js`.

When interacting with an AI agent, it can request these tools by responding with
a JSON object in the following form:

```json
{"tool": "openTab", "input": "https://example.com"}
```

The extension will execute the tool and return the result before the assistant
continues its conversation.

Example workflow:

1. User asks for football news.
2. Assistant replies with:

   ```json
   {"tool": "searchWeb", "input": "latest football news"}
   ```

3. After the search results page is loaded, the assistant can call
   `getActiveTabHtml()` to read the page content and provide a summary.
