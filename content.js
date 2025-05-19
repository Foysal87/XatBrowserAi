// Content script that runs in the context of web pages

// Track mouse movements for visualization
let mouseMovements = [];
let isTracking = false;

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'START_MOUSE_TRACKING':
            isTracking = true;
            mouseMovements = [];
            sendResponse({ success: true });
            break;

        case 'STOP_MOUSE_TRACKING':
            isTracking = false;
            sendResponse({ movements: mouseMovements });
            break;

        case 'GET_PAGE_ELEMENTS':
            sendResponse({
                title: document.title,
                url: window.location.href,
                elements: getVisibleElements()
            });
            break;

        case 'HIGHLIGHT_ELEMENT':
            highlightElement(message.selector);
            sendResponse({ success: true });
            break;
    }
    return true; // Required for async sendResponse
});

// Track mouse movements
document.addEventListener('mousemove', (event) => {
    if (!isTracking) return;

    // Only record significant movements (more than 5 pixels)
    const lastMovement = mouseMovements[mouseMovements.length - 1];
    if (!lastMovement || 
        Math.abs(lastMovement.x - event.clientX) > 5 || 
        Math.abs(lastMovement.y - event.clientY) > 5) {
        mouseMovements.push({
            x: event.clientX,
            y: event.clientY,
            timestamp: Date.now()
        });
    }
});

// Get visible and interactive elements on the page
function getVisibleElements() {
    const elements = [];
    const selectors = [
        'a', 'button', 'input', 'select', 'textarea',
        '[role="button"]', '[role="link"]', '[role="menuitem"]',
        '[contenteditable="true"]'
    ];

    selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(element => {
            if (isElementVisible(element)) {
                elements.push({
                    tag: element.tagName.toLowerCase(),
                    type: element.type || '',
                    id: element.id || '',
                    class: element.className || '',
                    text: element.textContent?.trim() || '',
                    value: element.value || '',
                    href: element.href || '',
                    role: element.getAttribute('role') || '',
                    selector: generateSelector(element)
                });
            }
        });
    });

    return elements;
}

// Check if an element is visible
function isElementVisible(element) {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           element.offsetWidth > 0 &&
           element.offsetHeight > 0;
}

// Generate a unique selector for an element
function generateSelector(element) {
    if (element.id) {
        return `#${element.id}`;
    }

    if (element.className) {
        const classes = Array.from(element.classList).join('.');
        const elements = document.querySelectorAll(`.${classes}`);
        if (elements.length === 1) {
            return `.${classes}`;
        }
    }

    // Generate a path using tag names and indices
    const path = [];
    let current = element;
    while (current && current !== document.body) {
        let selector = current.tagName.toLowerCase();
        const siblings = Array.from(current.parentNode.children);
        if (siblings.length > 1) {
            const index = siblings.indexOf(current) + 1;
            selector += `:nth-child(${index})`;
        }
        path.unshift(selector);
        current = current.parentNode;
    }

    return path.join(' > ');
}

// Highlight an element temporarily
function highlightElement(selector) {
    const element = document.querySelector(selector);
    if (!element) return;

    const originalOutline = element.style.outline;
    const originalTransition = element.style.transition;

    element.style.outline = '2px solid #007AFF';
    element.style.transition = 'outline 0.2s ease-in-out';

    setTimeout(() => {
        element.style.outline = originalOutline;
        element.style.transition = originalTransition;
    }, 2000);
}

// Add a visual indicator for the current mouse position
const mouseIndicator = document.createElement('div');
mouseIndicator.style.cssText = `
    position: fixed;
    pointer-events: none;
    width: 20px;
    height: 20px;
    border: 2px solid #007AFF;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    transition: transform 0.1s ease-out;
    z-index: 9999;
    display: none;
`;
document.body.appendChild(mouseIndicator);

// Update mouse indicator position
document.addEventListener('mousemove', (event) => {
    if (isTracking) {
        mouseIndicator.style.display = 'block';
        mouseIndicator.style.left = `${event.clientX}px`;
        mouseIndicator.style.top = `${event.clientY}px`;
    } else {
        mouseIndicator.style.display = 'none';
    }
});

// Create and inject the toggle button
function createToggleButton() {
    const button = document.createElement('button');
    button.id = 'xatbrowser-toggle';
    button.innerHTML = `
        <svg viewBox="0 0 24 24" width="24" height="24">
            <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" fill="currentColor"/>
        </svg>
    `;
    button.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #007AFF;
        border: none;
        color: white;
        cursor: pointer;
        z-index: 10000;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.3s ease, background-color 0.3s ease;
    `;
    document.body.appendChild(button);
    return button;
}

// Create and inject the mouse movement overlay
function createMouseOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'xatbrowser-mouse-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 9999;
    `;
    document.body.appendChild(overlay);
    return overlay;
}

// Create the mouse cursor element
function createMouseCursor() {
    const cursor = document.createElement('div');
    cursor.id = 'xatbrowser-mouse-cursor';
    cursor.style.cssText = `
        position: absolute;
        width: 20px;
        height: 20px;
        background: rgba(0, 122, 255, 0.5);
        border: 2px solid #007AFF;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
        transition: transform 0.1s ease;
        display: none;
    `;
    return cursor;
}

// Initialize the UI elements
const toggleButton = createToggleButton();
const mouseOverlay = createMouseOverlay();
const mouseCursor = createMouseCursor();
mouseOverlay.appendChild(mouseCursor);

// Handle toggle button click
toggleButton.addEventListener('click', () => {
    // Send message to the sidebar to toggle
    window.postMessage({ type: 'TOGGLE_SIDEBAR' }, '*');
});

// Handle mouse movement animations
function animateMouseMovements(movements) {
    if (!movements || !movements.length) return;

    mouseCursor.style.display = 'block';
    let currentIndex = 0;

    function animateNextMovement() {
        if (currentIndex >= movements.length) {
            mouseCursor.style.display = 'none';
            return;
        }

        const movement = movements[currentIndex];
        const { x, y, type } = movement;

        // Update cursor position
        mouseCursor.style.left = `${x}px`;
        mouseCursor.style.top = `${y}px`;

        // Add click animation if needed
        if (type === 'click') {
            mouseCursor.style.transform = 'translate(-50%, -50%) scale(0.8)';
            setTimeout(() => {
                mouseCursor.style.transform = 'translate(-50%, -50%) scale(1)';
            }, 100);
        }

        // Move to next movement after delay
        currentIndex++;
        setTimeout(animateNextMovement, 100);
    }

    animateNextMovement();
}

// Listen for messages from the sidebar
window.addEventListener('message', (event) => {
    if (event.data.type === 'ANIMATE_MOUSE') {
        animateMouseMovements(event.data.movements);
    }
});

// Clean up when the page is unloaded
window.addEventListener('unload', () => {
    toggleButton.remove();
    mouseOverlay.remove();
}); 