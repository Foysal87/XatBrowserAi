export function getActiveTabInfo() {
    return sendMessage({ type: 'GET_TAB_INFO' });
}

export function getActiveTabHtml() {
    return sendMessage({ type: 'GET_PAGE_HTML' }).then(r => r.html);
}

export function openNewTab(url) {
    return sendMessage({ type: 'OPEN_TAB', url });
}

function sendMessage(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(response);
            }
        });
    });
}
