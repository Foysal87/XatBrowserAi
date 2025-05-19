document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    const errorMessage = document.getElementById('errorMessage');
    const infoMessage = document.getElementById('infoMessage');
    const openOptionsButton = document.getElementById('openOptions');
    const goBackButton = document.getElementById('goBack');

    // Handle different error types
    if (error === 'restricted') {
        errorMessage.textContent = 'The sidebar cannot be opened on this page. Please try a different webpage.';
        errorMessage.style.display = 'block';
    } else if (error === 'injection') {
        errorMessage.textContent = 'Error opening sidebar. Please try refreshing the page.';
        errorMessage.style.display = 'block';
    } else {
        infoMessage.textContent = 'This page is meant to be opened as a sidebar. Please use the extension icon to open it.';
        infoMessage.style.display = 'block';
    }

    // Handle button clicks
    openOptionsButton.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
    });

    goBackButton.addEventListener('click', (e) => {
        e.preventDefault();
        window.history.back();
    });
}); 