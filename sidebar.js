// Utility function to check if extension context is valid
function isExtensionContextValid() {
    try {
        return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (error) {
        return false;
    }
}

// Utility function to safely call chrome APIs
function safeChromeCaller(apiCall, fallback = null) {
    try {
        if (!isExtensionContextValid()) {
            console.warn('Extension context invalid, skipping chrome API call');
            return fallback;
        }
        return apiCall();
    } catch (error) {
        console.error('Chrome API call failed:', error);
        if (error.message && error.message.includes('Extension context invalidated')) {
            // Trigger context invalidation handler if available
            if (window.xatBrowserSidebar && typeof window.xatBrowserSidebar.handleContextInvalidation === 'function') {
                window.xatBrowserSidebar.handleContextInvalidation();
            }
        }
        return fallback;
    }
}

// Prevent multiple instances of the sidebar
if (window.xatBrowserSidebarLoaded) {
    console.log('XatBrowser sidebar already loaded, skipping...');
    // If sidebar exists but is hidden, show it
    if (window.xatBrowserSidebar && !window.xatBrowserSidebar.isOpen) {
        window.xatBrowserSidebar.showSidebarOnce();
    }
} else {
    window.xatBrowserSidebarLoaded = true;

    class SidebarUI {
        constructor() {
            this.isOpen = true;
            this.isProcessing = false;
            this.currentStreamingMessage = null;
            this.toolExecutionStatus = null;
            // Create a container and attach shadow root
            this.container = document.createElement('div');
            this.container.id = 'xatbrowser-sidebar-container';
            this.shadow = this.container.attachShadow({ mode: 'open' });
            // Add to document body if not already added
            if (!document.body.contains(this.container)) {
                document.body.appendChild(this.container);
            }
            this.initializeElements();
            this.attachEventListeners();
            this.loadConfig();
            this.loadPosition();
            this.loadSidebarState();
            
            // Ensure UI is properly initialized
            setTimeout(() => {
                this.initializeUIState();
            }, 100);
        }

        initializeElements() {
            // Create sidebar container with enhanced glassmorphism
            this.sidebar = document.createElement('div');
            this.sidebar.className = 'xatbrowser-sidebar';
            this.sidebar.style.cssText = `
                position: fixed; 
                left: 50px; 
                top: 50px; 
                width: 420px; 
                height: 650px; 
                background: rgba(15, 15, 15, 0.85); 
                backdrop-filter: blur(20px) saturate(180%); 
                border-radius: 24px; 
                box-shadow: 0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1); 
                z-index: 10000; 
                display: flex; 
                flex-direction: column; 
                font-family: "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
                color: #fff; 
                overflow: hidden; 
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            `;

            // Create enhanced drag handle
            this.dragHandle = document.createElement('div');
            this.dragHandle.className = 'sidebar-drag-handle';
            this.dragHandle.style.cssText = `
                position: absolute; 
                top: 0; 
                left: 0; 
                right: 0; 
                height: 60px; 
                background: linear-gradient(135deg, rgba(30, 30, 30, 0.95), rgba(20, 20, 20, 0.95)); 
                border-radius: 24px 24px 0 0; 
                cursor: move; 
                display: flex; 
                align-items: center; 
                justify-content: space-between; 
                padding: 0 24px; 
                border-bottom: 1px solid rgba(255, 255, 255, 0.08); 
                z-index: 2; 
                user-select: none; 
                transition: background 0.3s ease;
            `;

            // Create enhanced title
            this.title = document.createElement('h2');
            this.title.innerHTML = `
                <span style="font-size: 1.3em; margin-right: 8px;">🧠</span>
                <span style="background: linear-gradient(135deg, #007AFF, #5856D6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 700;">XatBrowser AI</span>
            `;
            this.title.style.cssText = `
                margin: 0; 
                font-size: 1.1em; 
                font-weight: 700; 
                display: flex; 
                align-items: center; 
                letter-spacing: -0.02em;
            `;

            // Create enhanced close button
            this.closeButton = document.createElement('button');
            this.closeButton.className = 'sidebar-close-button';
            this.closeButton.innerHTML = '×';
            this.closeButton.style.cssText = `
                background: rgba(255, 255, 255, 0.08); 
                border: none; 
                color: #fff; 
                font-size: 22px; 
                cursor: pointer; 
                padding: 0; 
                border-radius: 12px; 
                width: 36px; 
                height: 36px; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); 
                font-weight: 300;
            `;

            // Create enhanced model selector
            this.modelSelector = document.createElement('select');
            this.modelSelector.className = 'model-selector';
            this.modelSelector.style.cssText = `
                padding: 12px 16px; 
                border-radius: 12px; 
                border: 1px solid rgba(255, 255, 255, 0.08); 
                background: rgba(255, 255, 255, 0.05); 
                color: #fff; 
                cursor: pointer; 
                min-width: 200px; 
                height: 44px; 
                margin: 16px 24px 0 24px; 
                font-size: 0.9em; 
                transition: all 0.2s ease; 
                appearance: none; 
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E"); 
                background-repeat: no-repeat; 
                background-position: right 12px center; 
                background-size: 16px; 
                padding-right: 40px; 
                font-family: inherit;
            `;

            // Create enhanced status indicator with tool execution status
            this.statusIndicator = document.createElement('div');
            this.statusIndicator.className = 'status-indicator';
            this.statusIndicator.style.cssText = `
                display: flex; 
                align-items: center; 
                gap: 12px; 
                padding: 16px 24px 12px 24px; 
                background: transparent; 
                margin-top: 60px;
            `;

            // Create animated status dot
            this.statusDot = document.createElement('div');
            this.statusDot.className = 'status-dot';
            this.statusDot.style.cssText = `
                width: 8px; 
                height: 8px; 
                border-radius: 50%; 
                background-color: #666; 
                position: relative; 
                transition: all 0.3s ease;
            `;

            // Create status text
            this.statusText = document.createElement('span');
            this.statusText.className = 'status-text';
            this.statusText.textContent = 'Select a model to begin';
            this.statusText.style.cssText = `
                font-size: 0.85em; 
                color: rgba(255, 255, 255, 0.6); 
                font-weight: 500;
            `;

            // Remove the tool panel - we don't want to show tools to users
            // Tools will execute automatically in the background

            // Create enhanced messages container
            this.messages = document.createElement('div');
            this.messages.className = 'messages';
            this.messages.style.cssText = `
                flex: 1; 
                overflow-y: auto; 
                padding: 20px 24px; 
                display: flex; 
                flex-direction: column; 
                gap: 20px; 
                background: transparent; 
                scrollbar-width: thin; 
                scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
            `;

            // Create enhanced input container
            this.inputContainer = document.createElement('div');
            this.inputContainer.className = 'input-container';
            this.inputContainer.style.cssText = `
                padding: 20px 24px 24px 24px; 
                background: rgba(30, 30, 30, 0.3); 
                border-top: 1px solid rgba(255, 255, 255, 0.08); 
                display: flex; 
                gap: 12px; 
                backdrop-filter: blur(10px);
            `;

            // Create enhanced message input
            this.messageInput = document.createElement('textarea');
            this.messageInput.className = 'message-input';
            this.messageInput.placeholder = 'Ask me anything...';
            this.messageInput.style.cssText = `
                flex: 1; 
                padding: 16px 20px; 
                border: 1px solid rgba(255, 255, 255, 0.08); 
                border-radius: 16px; 
                outline: none; 
                font-size: 0.95em; 
                resize: none; 
                min-height: 24px; 
                max-height: 120px; 
                background: rgba(255, 255, 255, 0.03); 
                color: #fff; 
                transition: all 0.2s ease; 
                scrollbar-width: thin; 
                scrollbar-color: rgba(255, 255, 255, 0.2) transparent; 
                font-family: inherit; 
                line-height: 1.5;
            `;

            // Create enhanced send button
            this.sendButton = document.createElement('button');
            this.sendButton.className = 'send-button';
            this.sendButton.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;
            this.sendButton.style.cssText = `
                padding: 16px; 
                background: linear-gradient(135deg, #007AFF, #5856D6); 
                color: white; 
                border: none; 
                border-radius: 16px; 
                cursor: pointer; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); 
                min-width: 52px; 
                height: 52px;
            `;

            // Create resize handles
            this.resizeHandles = {
                se: this.createResizeHandle('se'),
                sw: this.createResizeHandle('sw'),
                ne: this.createResizeHandle('ne'),
                nw: this.createResizeHandle('nw')
            };

            // Add enhanced global styles
            const style = document.createElement('style');
            style.textContent = `
                @import url('https://fonts.googleapis.com/css2?family=SF+Pro+Display:wght@400;500;600;700&display=swap');
                
                .xatbrowser-sidebar {
                    --primary-gradient: linear-gradient(135deg, #007AFF, #5856D6);
                    --glass-bg: rgba(15, 15, 15, 0.85);
                    --glass-border: rgba(255, 255, 255, 0.1);
                    --hover-bg: rgba(255, 255, 255, 0.08);
                    font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                
                .xatbrowser-sidebar * { 
                    box-sizing: border-box; 
                }
                
                .sidebar-drag-handle:hover {
                    background: linear-gradient(135deg, rgba(40, 40, 40, 0.95), rgba(30, 30, 30, 0.95));
                }
                
                .sidebar-close-button:hover {
                    background: rgba(255, 255, 255, 0.15);
                    transform: scale(1.05);
                }
                
                .model-selector:hover {
                    border-color: rgba(255, 255, 255, 0.15);
                    background: rgba(255, 255, 255, 0.08);
                }
                
                .model-selector:focus {
                    border-color: #007AFF;
                    outline: none;
                    box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.2);
                }
                
                .message-input:hover {
                    border-color: rgba(255, 255, 255, 0.15);
                    background: rgba(255, 255, 255, 0.05);
                }
                
                .message-input:focus {
                    border-color: #007AFF;
                    box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.2);
                    background: rgba(255, 255, 255, 0.08);
                }
                
                .send-button:hover {
                    transform: scale(1.05);
                    box-shadow: 0 8px 25px rgba(0, 122, 255, 0.3);
                }
                
                .send-button:active {
                    transform: scale(0.98);
                }
                
                .send-button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none;
                    box-shadow: none;
                }
                
                .messages::-webkit-scrollbar {
                    width: 6px;
                }
                
                .messages::-webkit-scrollbar-track {
                    background: transparent;
                }
                
                .messages::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 3px;
                }
                
                .messages::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.3);
                }
                
                .message {
                    padding: 16px 20px;
                    border-radius: 18px;
                    max-width: 85%;
                    word-wrap: break-word;
                    font-size: 0.95em;
                    line-height: 1.5;
                    position: relative;
                    animation: messageSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .user-message {
                    background: linear-gradient(135deg, #007AFF, #5856D6);
                    color: white;
                    align-self: flex-end;
                    margin-left: auto;
                    border-bottom-right-radius: 6px;
                }
                
                .assistant-message {
                    background: rgba(255, 255, 255, 0.05);
                    color: #fff;
                    align-self: flex-start;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-bottom-left-radius: 6px;
                }
                
                .assistant-message.processing {
                    border-color: rgba(0, 122, 255, 0.3);
                    background: rgba(0, 122, 255, 0.05);
                }
                
                .message-content {
                    margin: 0;
                    white-space: pre-wrap;
                }
                
                .message-timestamp {
                    font-size: 0.75em;
                    opacity: 0.6;
                    margin-top: 8px;
                    text-align: right;
                }
                
                .typing-indicator {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 16px 20px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 18px;
                    border-bottom-left-radius: 6px;
                    max-width: 80px;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                }
                
                .typing-dot {
                    width: 6px;
                    height: 6px;
                    background: rgba(255, 255, 255, 0.6);
                    border-radius: 50%;
                    animation: typingPulse 1.4s infinite ease-in-out;
                }
                
                .typing-dot:nth-child(2) { animation-delay: 0.2s; }
                .typing-dot:nth-child(3) { animation-delay: 0.4s; }
                
                .tool-execution-status {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 16px;
                    background: rgba(0, 122, 255, 0.1);
                    border: 1px solid rgba(0, 122, 255, 0.2);
                    border-radius: 12px;
                    font-size: 0.8em;
                    color: rgba(255, 255, 255, 0.8);
                    margin: 8px 0;
                    animation: fadeIn 0.3s ease;
                }
                
                .tool-execution-status .spinner {
                    width: 12px;
                    height: 12px;
                    border: 2px solid rgba(0, 122, 255, 0.3);
                    border-top: 2px solid #007AFF;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                
                .status-dot.active {
                    background: #34C759;
                    box-shadow: 0 0 8px rgba(52, 199, 89, 0.4);
                }
                
                .status-dot.processing {
                    background: #007AFF;
                    box-shadow: 0 0 8px rgba(0, 122, 255, 0.4);
                    animation: pulse 2s infinite;
                }
                
                .status-dot.error {
                    background: #FF3B30;
                    box-shadow: 0 0 8px rgba(255, 59, 48, 0.4);
                }
                
                @keyframes messageSlideIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                
                @keyframes typingPulse {
                    0%, 60%, 100% { transform: scale(1); opacity: 0.6; }
                    30% { transform: scale(1.2); opacity: 1; }
                }
                
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                
                @keyframes fadeOut {
                    from { opacity: 1; transform: translateY(0); }
                    to { opacity: 0; transform: translateY(-5px); }
                }
            `;

            this.shadow.appendChild(style);
            this.assembleSidebar();
        }

        createResizeHandle(position) {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${position}`;
            return handle;
        }

        assembleSidebar() {
            // Clear any existing content
            this.sidebar.innerHTML = '';

            // Add elements to drag handle
            this.dragHandle.appendChild(this.title);
            this.dragHandle.appendChild(this.closeButton);

            // Add elements to status indicator
            this.statusIndicator.appendChild(this.modelSelector);
            this.statusIndicator.appendChild(this.statusDot);
            this.statusIndicator.appendChild(this.statusText);

            // Add elements to input container
            this.inputContainer.appendChild(this.messageInput);
            this.inputContainer.appendChild(this.sendButton);

            // Assemble the sidebar structure
            this.sidebar.appendChild(this.dragHandle);
            this.sidebar.appendChild(this.statusIndicator);
            this.sidebar.appendChild(this.messages);
            this.sidebar.appendChild(this.inputContainer);

            // Add resize handles
            Object.values(this.resizeHandles).forEach(handle => {
                this.sidebar.appendChild(handle);
            });

            // Attach sidebar to shadow DOM
            this.shadow.appendChild(this.sidebar);
        }

        attachEventListeners() {
            // Remove the toggleButton event listener since we don't have a toggle button
            // this.toggleButton.addEventListener('click', () => this.toggleSidebar());

            this.messageInput.addEventListener('input', () => {
                this.handleInput();
                // Update send button state
                this.updateSendButtonState();
            });

            // Add specific focus and click handling for textarea
            this.messageInput.addEventListener('click', (e) => {
                e.stopPropagation();
                this.messageInput.focus();
            });

            this.messageInput.addEventListener('focus', (e) => {
                e.stopPropagation();
                console.log('Textarea focused');
            });

            this.messageInput.addEventListener('blur', (e) => {
                console.log('Textarea blurred');
            });

            this.sendButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!this.sendButton.disabled) {
                    this.sendMessage();
                }
            });

            this.modelSelector.addEventListener('change', () => {
                this.handleModelChange();
            });

            this.modelSelector.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            // Add keyboard shortcut for sending messages
            this.messageInput.addEventListener('keypress', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && !e.shiftKey && !this.sendButton.disabled) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            // Prevent keyboard events from bubbling to page, but allow normal textarea functionality
            this.messageInput.addEventListener('keydown', (e) => {
                e.stopPropagation();
                // Allow normal textarea functionality (don't prevent default)
            });

            this.messageInput.addEventListener('keyup', (e) => {
                e.stopPropagation();
                // Allow normal textarea functionality (don't prevent default)
            });

            // Listen for messages from the background script
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                console.log('Sidebar received message:', message);
                
                try {
                    // Check if extension context is still valid
                    if (!chrome.runtime || !chrome.runtime.sendMessage) {
                        console.log('Extension context invalidated in message listener');
                        this.handleContextInvalidation();
                        sendResponse({ success: false, error: 'Extension context invalidated' });
                        return false;
                    }

                    switch (message.type) {
                        case 'TOGGLE_SIDEBAR':
                            this.toggleSidebar();
                            sendResponse({ success: true, action: 'toggled' });
                            break;
                        case 'SHOW_SIDEBAR_ONCE':
                            console.log('Showing sidebar once...');
                            this.showSidebarOnce();
                            sendResponse({ success: true, action: 'shown' });
                            break;
                        case 'CHECK_SIDEBAR_STATUS':
                            sendResponse({ success: true, isOpen: this.isOpen });
                            break;
                        case 'SHOW_NOTIFICATION':
                            this.showNotification(message.message);
                            sendResponse({ success: true, action: 'notification_shown' });
                            break;
                        default:
                            console.log('Unknown message type:', message.type);
                            sendResponse({ success: false, error: 'Unknown message type: ' + message.type });
                    }
                } catch (error) {
                    console.error('Error handling message:', error);
                    if (error.message && error.message.includes('Extension context invalidated')) {
                        this.handleContextInvalidation();
                    }
                    sendResponse({ success: false, error: error.message });
                }
                
                return true; // Keep the message channel open for async response
            });

            // Enhanced drag functionality for free movement
            let isDragging = false;
            let dragStartX, dragStartY, dragSidebarX, dragSidebarY;

            const dragStart = (e) => {
                // Only start dragging if clicking on the drag handle, not on input elements
                if (e.target.closest('.sidebar-drag-handle') && 
                    !e.target.closest('.message-input') && 
                    !e.target.closest('.model-selector') &&
                    !e.target.closest('button')) {
                    isDragging = true;
                    dragStartX = e.clientX;
                    dragStartY = e.clientY;
                    const rect = this.sidebar.getBoundingClientRect();
                    dragSidebarX = rect.left;
                    dragSidebarY = rect.top;
                    this.sidebar.style.transition = 'none';
                    document.body.style.userSelect = 'none';
                    e.preventDefault(); // Prevent text selection
                }
            };
            
            const drag = (e) => {
                if (isDragging) {
                    e.preventDefault();
                    let newX = dragSidebarX + (e.clientX - dragStartX);
                    let newY = dragSidebarY + (e.clientY - dragStartY);
                    // Keep within viewport
                    newX = Math.max(0, Math.min(window.innerWidth - this.sidebar.offsetWidth, newX));
                    newY = Math.max(0, Math.min(window.innerHeight - this.sidebar.offsetHeight, newY));
                    this.sidebar.style.left = newX + 'px';
                    this.sidebar.style.top = newY + 'px';
                    this.sidebar.style.right = '';
                    this.sidebar.style.bottom = '';
                }
            };
            
            const dragEnd = (e) => {
                if (isDragging) {
                    isDragging = false;
                    this.sidebar.style.transition = '';
                    document.body.style.userSelect = '';
                    this.savePosition();
                }
            };
            
            this.dragHandle.addEventListener('mousedown', dragStart);
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', dragEnd);

            // Enhanced resize functionality
            let isResizing = false;
            let currentHandle = null;
            let originalWidth, originalHeight, originalX, originalY, originalLeft, originalTop;
            const minWidth = 320, minHeight = 400;
            
            const initResize = (e) => {
                if (e.target.classList.contains('resize-handle')) {
                    isResizing = true;
                    currentHandle = e.target.className.split(' ')[1];
                    const rect = this.sidebar.getBoundingClientRect();
                    originalWidth = rect.width;
                    originalHeight = rect.height;
                    originalX = e.clientX;
                    originalY = e.clientY;
                    originalLeft = rect.left;
                    originalTop = rect.top;
                    this.sidebar.style.transition = 'none';
                    document.body.style.userSelect = 'none';
                    e.preventDefault();
                }
            };
            
            const resize = (e) => {
                if (isResizing) {
                    e.preventDefault();
                    let dx = e.clientX - originalX;
                    let dy = e.clientY - originalY;
                    let newWidth = originalWidth, newHeight = originalHeight, newLeft = originalLeft, newTop = originalTop;
                    if (currentHandle.includes('e')) newWidth = Math.max(minWidth, originalWidth + dx);
                    if (currentHandle.includes('s')) newHeight = Math.max(minHeight, originalHeight + dy);
                    if (currentHandle.includes('w')) {
                        newWidth = Math.max(minWidth, originalWidth - dx);
                        newLeft = originalLeft + dx;
                    }
                    if (currentHandle.includes('n')) {
                        newHeight = Math.max(minHeight, originalHeight - dy);
                        newTop = originalTop + dy;
                    }
                    // Keep within viewport
                    newLeft = Math.max(0, Math.min(window.innerWidth - newWidth, newLeft));
                    newTop = Math.max(0, Math.min(window.innerHeight - newHeight, newTop));
                    this.sidebar.style.width = newWidth + 'px';
                    this.sidebar.style.height = newHeight + 'px';
                    this.sidebar.style.left = newLeft + 'px';
                    this.sidebar.style.top = newTop + 'px';
                    this.sidebar.style.right = '';
                    this.sidebar.style.bottom = '';
                }
            };
            
            const stopResize = (e) => {
                if (isResizing) {
                    isResizing = false;
                    currentHandle = null;
                    this.sidebar.style.transition = '';
                    document.body.style.userSelect = '';
                    this.savePosition();
                }
            };
            
            Object.values(this.resizeHandles).forEach(handle => {
                handle.addEventListener('mousedown', initResize);
            });
            document.addEventListener('mousemove', resize);
            document.addEventListener('mouseup', stopResize);

            // Add close button functionality
            this.closeButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent event bubbling
                this.sidebar.style.display = 'none';
                this.isOpen = false;
                // Notify background script that sidebar is closed
                try {
                    if (chrome.runtime && chrome.runtime.sendMessage) {
                        chrome.runtime.sendMessage({ type: 'SIDEBAR_CLOSED' });
                    }
                } catch (error) {
                    console.error('Error notifying background script:', error);
                    if (error.message && error.message.includes('Extension context invalidated')) {
                        this.handleContextInvalidation();
                    }
                }
                
                try {
                    if (chrome.storage && chrome.storage.local) {
                        chrome.storage.local.set({ sidebarOpen: false });
                    }
                } catch (error) {
                    console.error('Error saving sidebar state:', error);
                }
            });

            // Add window resize functionality
            window.addEventListener('resize', () => {
                // Ensure sidebar stays within viewport
                const rect = this.sidebar.getBoundingClientRect();
                if (rect.right > window.innerWidth) {
                    this.sidebar.style.right = '20px';
                    this.sidebar.style.transform = 'none';
                }
                if (rect.bottom > window.innerHeight) {
                    this.sidebar.style.height = `${window.innerHeight - 40}px`;
                }
            });

            // Removed problematic broad keyboard event handling that was interfering with textarea focus
        }

        async loadConfig() {
            try {
                const config = await this.sendMessageToBackground({ type: 'GET_CONFIG' });
                if (config) {
                    this.updateModelSelector(config);
                }
            } catch (error) {
                console.error('Error loading config:', error);
                if (error.message && error.message.includes('Extension context invalidated')) {
                    this.handleContextInvalidation();
                } else {
                    this.showNotification('Error loading configuration');
                }
            }
        }

        handleContextInvalidation() {
            console.log('Extension context invalidated - cleaning up sidebar');
            
            // Show user-friendly message
            this.showNotification('Extension was updated. Please refresh the page to continue using XatBrowser AI.');
            
            // Disable all interactive elements
            this.setUIState(false);
            
            // Add visual indicator
            if (this.statusText) {
                this.statusText.textContent = 'Extension needs refresh';
                this.statusDot.style.backgroundColor = '#FF3B30';
            }
            
            // Remove event listeners to prevent further errors
            this.cleanupEventListeners();
        }

        cleanupEventListeners() {
            try {
                // Remove chrome runtime listeners
                if (chrome.runtime && chrome.runtime.onMessage) {
                    chrome.runtime.onMessage.removeListener();
                }
            } catch (error) {
                console.log('Error cleaning up listeners:', error);
            }
        }

        updateModelSelector(config) {
            this.modelSelector.innerHTML = '<option value="">Select Model</option>';
            let firstModelId = '';
            let firstModelType = '';
            if (config.AzureOpenAi) {
                Object.keys(config.AzureOpenAi).forEach((modelId, idx) => {
                    const option = document.createElement('option');
                    option.value = modelId;
                    option.textContent = `Azure: ${modelId}`;
                    this.modelSelector.appendChild(option);
                    if (idx === 0 && !firstModelId) { firstModelId = modelId; firstModelType = 'Azure'; }
                });
            }
            if (config.ClaudeAi) {
                Object.keys(config.ClaudeAi).forEach((modelId, idx) => {
                    const option = document.createElement('option');
                    option.value = modelId;
                    option.textContent = `Claude: ${modelId}`;
                    this.modelSelector.appendChild(option);
                    if (!firstModelId) { firstModelId = modelId; firstModelType = 'Claude'; }
                });
            }
            // Select the first model by default if available
            if (firstModelId) {
                this.modelSelector.value = firstModelId;
                this.handleModelChange();
            }
        }

        handleModelChange() {
            const selectedModel = this.modelSelector.value;
            this.statusDot.style.backgroundColor = selectedModel ? '#4CAF50' : '#ccc';
            this.statusText.textContent = selectedModel ? 
                `Model selected: ${selectedModel}` : 
                'Select a model to begin';
            
            // Update UI state properly
            this.updateSendButtonState();
        }

        updateSendButtonState() {
            const hasText = this.messageInput.value.trim().length > 0;
            const hasModel = this.modelSelector.value !== '';
            this.sendButton.disabled = !hasText || !hasModel;
            
            // Ensure input is always enabled unless explicitly disabled
            if (!this.isProcessing) {
                this.messageInput.disabled = false;
                this.modelSelector.disabled = false;
            }
        }

        handleInput() {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 100) + 'px';
        }

        preprocessHtml() {
            // Create a temporary div to work with the HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = document.documentElement.innerHTML;

            // Remove unnecessary elements
            const elementsToRemove = [
                'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
                'link', 'meta', 'head', 'footer', 'nav', 'aside',
                '[style*="display: none"]', '[style*="visibility: hidden"]',
                '[aria-hidden="true"]', '[role="presentation"]'
            ];

            elementsToRemove.forEach(selector => {
                const elements = tempDiv.querySelectorAll(selector);
                elements.forEach(el => el.remove());
            });

            // Remove empty elements and comments
            const removeEmptyElements = (element) => {
                const children = Array.from(element.children);
                children.forEach(child => {
                    // Remove empty elements (no text content and no non-empty children)
                    if (!child.textContent.trim() && !child.querySelector('img, video, input, button')) {
                        child.remove();
                    } else {
                        removeEmptyElements(child);
                    }
                });
            };

            removeEmptyElements(tempDiv);

            // Remove inline styles and classes
            const removeAttributes = (element) => {
                const children = Array.from(element.children);
                children.forEach(child => {
                    child.removeAttribute('style');
                    child.removeAttribute('class');
                    child.removeAttribute('id');
                    removeAttributes(child);
                });
            };

            removeAttributes(tempDiv);

            // Get only the main content
            let mainContent = '';
            const mainSelectors = ['main', 'article', '[role="main"]', '#content', '.content', '#main', '.main'];
            
            for (const selector of mainSelectors) {
                const element = tempDiv.querySelector(selector);
                if (element) {
                    mainContent = element.textContent.trim();
                    break;
                }
            }

            // If no main content found, get body content
            if (!mainContent) {
                mainContent = tempDiv.textContent.trim();
            }

            // Clean up the text content
            return mainContent
                .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
                .replace(/\n+/g, '\n') // Replace multiple newlines with single newline
                .trim()
                .substring(0, 50000);  // Limit content length
        }

        async sendMessage() {
            const message = this.messageInput.value.trim();
            if (!message || !this.modelSelector.value) {
                console.log('Cannot send: No message or model selected');
                return;
            }

            try {
                // Check if extension context is still valid
                if (!chrome.runtime || !chrome.runtime.connect) {
                    this.handleContextInvalidation();
                    return;
                }

                // Disable input and button while sending
                this.setUIState(false);
                this.isProcessing = true;

                // Add user message to chat
                this.addMessage(message, 'user');
                
                // Clear input
                this.messageInput.value = '';
                this.messageInput.style.height = 'auto';
                
                // Update status to processing
                this.updateStatus('processing', 'Processing your request...');
                
                // Show typing indicator
                this.showTypingIndicator();

                // Get preprocessed page content
                const pageContent = this.preprocessHtml();
                const pageUrl = document.location.href;
                const pageTitle = document.title;

                // Create a port for streaming with error handling
                let port;
                try {
                    port = chrome.runtime.connect({ name: 'chat' });
                } catch (error) {
                    if (error.message && error.message.includes('Extension context invalidated')) {
                        this.handleContextInvalidation();
                        return;
                    }
                    throw error;
                }
                
                let currentAssistantMessage = null;
                let isFirstChunk = true;
                
                // Set up port message listener with error handling
                port.onMessage.addListener((response) => {
                    try {
                        if (response.error) {
                            this.hideTypingIndicator();
                            this.hideToolExecutionStatus();
                            this.addMessage(`Error: ${response.error}`, 'assistant', true);
                            this.updateStatus('error', 'Error occurred');
                            port.disconnect();
                            this.setUIState(true);
                            this.isProcessing = false;
                        } else if (response.done) {
                            this.hideTypingIndicator();
                            this.hideToolExecutionStatus();
                            this.updateStatus('active', 'Ready');
                            port.disconnect();
                            this.setUIState(true);
                            this.isProcessing = false;
                        } else if (response.type === 'delta' && response.content) {
                            // Handle streaming content
                            const content = response.content;
                            
                            if (content && content.trim()) {
                                if (isFirstChunk) {
                                    this.hideTypingIndicator();
                                    currentAssistantMessage = this.addMessage('', 'assistant');
                                    isFirstChunk = false;
                                }
                                
                                if (currentAssistantMessage) {
                                    const contentDiv = currentAssistantMessage.querySelector('.message-content');
                                    if (contentDiv) {
                                        // Append content and reformat the entire message
                                        const currentText = contentDiv.textContent || '';
                                        const newText = currentText + content;
                                        
                                        // Apply markdown formatting to the complete text
                                        let formattedText = newText;
                                        
                                        // Convert **bold** to HTML
                                        formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                                        
                                        // Convert ### headers to HTML
                                        formattedText = formattedText.replace(/^### (.*$)/gm, '<h3 style="margin: 16px 0 8px 0; color: #fff; font-size: 1.1em; font-weight: 600;">$1</h3>');
                                        
                                        // Convert bullet points to HTML
                                        formattedText = formattedText.replace(/^- (.*$)/gm, '<div style="margin: 4px 0; padding-left: 16px; position: relative;"><span style="position: absolute; left: 0; color: #007AFF;">•</span>$1</div>');
                                        
                                        // Convert numbered lists to HTML
                                        formattedText = formattedText.replace(/^(\d+)\. (.*$)/gm, '<div style="margin: 4px 0; padding-left: 20px; position: relative;"><span style="position: absolute; left: 0; color: #007AFF; font-weight: 600;">$1.</span>$2</div>');
                                        
                                        // Convert URLs to clickable links
                                        formattedText = formattedText.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color: #007AFF; text-decoration: none; border-bottom: 1px solid rgba(0, 122, 255, 0.3);">$1</a>');
                                        
                                        // Preserve line breaks
                                        formattedText = formattedText.replace(/\n/g, '<br>');
                                        
                                        contentDiv.innerHTML = formattedText;
                                    }
                                }
                                this.scrollToBottom();
                            }
                        } else if (response.type === 'tool_execution_inline') {
                            // Handle inline tool execution like Cursor
                            if (!currentAssistantMessage) {
                                currentAssistantMessage = this.addMessage('', 'assistant');
                                isFirstChunk = false;
                            }
                            this.handleInlineToolExecution(response, currentAssistantMessage);
                        } else if (response.type === 'tool_execution') {
                            // Legacy tool execution handling
                            this.showToolExecutionStatus(response.tool, response.status);
                        }
                    } catch (error) {
                        console.error('Error handling port message:', error);
                        if (error.message && error.message.includes('Extension context invalidated')) {
                            this.handleContextInvalidation();
                        }
                    }
                });

                // Handle port disconnection
                port.onDisconnect.addListener(() => {
                    if (chrome.runtime.lastError) {
                        console.error('Port disconnected with error:', chrome.runtime.lastError);
                        if (chrome.runtime.lastError.message && chrome.runtime.lastError.message.includes('Extension context invalidated')) {
                            this.handleContextInvalidation();
                            return;
                        }
                    }
                    
                    this.hideTypingIndicator();
                    this.hideToolExecutionStatus();
                    this.setUIState(true);
                    this.isProcessing = false;
                });

                // Send message to background script with streaming
                try {
                    port.postMessage({
                        type: 'PROCESS_MESSAGE',
                        message: message,
                        modelId: this.modelSelector.value,
                        pageContent: pageContent,
                        pageUrl: pageUrl,
                        pageTitle: pageTitle
                    });
                } catch (error) {
                    if (error.message && error.message.includes('Extension context invalidated')) {
                        this.handleContextInvalidation();
                        return;
                    }
                    throw error;
                }

            } catch (error) {
                console.error('Error sending message:', error);
                this.hideTypingIndicator();
                this.hideToolExecutionStatus();
                
                if (error.message && error.message.includes('Extension context invalidated')) {
                    this.handleContextInvalidation();
                } else {
                    this.addMessage(`Error: ${error.message}`, 'assistant', true);
                    this.updateStatus('error', 'Error occurred');
                    this.setUIState(true);
                    this.isProcessing = false;
                }
            }
        }

        filterToolExecutionFromContent(content) {
            // Filter out tool execution JSON and other technical details
            if (!content) return '';
            
            // Remove JSON tool calls
            const jsonPattern = /\{"tool":\s*"[^"]+",\s*"args":\s*\{[^}]*\}\}/g;
            let filtered = content.replace(jsonPattern, '');
            
            // Remove common tool execution phrases
            const toolPhrases = [
                'I\'ll search for',
                'Let me search for',
                'I\'m searching for',
                'Searching for',
                'I\'ll open a new tab',
                'Opening new tab',
                'I\'ll get the page content',
                'Getting page content',
                'I\'ll analyze the content',
                'Analyzing content'
            ];
            
            toolPhrases.forEach(phrase => {
                const regex = new RegExp(phrase + '[^.]*\\.', 'gi');
                filtered = filtered.replace(regex, '');
            });
            
            // Clean up extra whitespace
            filtered = filtered.replace(/\s+/g, ' ').trim();
            
            return filtered;
        }

        showToolExecutionStatus(toolName, status) {
            this.hideToolExecutionStatus(); // Remove any existing status
            
            const statusDiv = document.createElement('div');
            statusDiv.className = 'tool-execution-status';
            statusDiv.id = 'toolExecutionStatus';
            
            const spinner = document.createElement('div');
            spinner.className = 'spinner';
            
            const text = document.createElement('span');
            text.textContent = this.getToolStatusText(toolName, status);
            
            statusDiv.appendChild(spinner);
            statusDiv.appendChild(text);
            
            this.messages.appendChild(statusDiv);
            this.scrollToBottom();
            
            // Auto-hide after 3 seconds
            setTimeout(() => {
                this.hideToolExecutionStatus();
            }, 3000);
        }

        hideToolExecutionStatus() {
            const status = this.shadow.getElementById('toolExecutionStatus');
            if (status) {
                status.remove();
            }
        }

        getToolStatusText(toolName, status) {
            const toolTexts = {
                'searchWeb': 'Searching the web...',
                'openNewTab': 'Opening new tab...',
                'getActiveTabHtml': 'Analyzing page content...',
                'getActiveTabInfo': 'Getting page information...',
                'generateTool': 'Creating specialized tool...'
            };
            
            return toolTexts[toolName] || 'Processing...';
        }

        updateStatus(type, text) {
            this.statusDot.className = `status-dot ${type}`;
            this.statusText.textContent = text;
        }

        addMessage(text, type, isError = false) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${type}-message${isError ? ' error' : ''}`;
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            
            // Handle different types of content
            if (typeof text === 'object') {
                contentDiv.textContent = JSON.stringify(text, null, 2);
            } else {
                // Basic markdown-like formatting for better readability
                let formattedText = text;
                
                // Convert **bold** to HTML
                formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                
                // Convert ### headers to HTML
                formattedText = formattedText.replace(/^### (.*$)/gm, '<h3 style="margin: 16px 0 8px 0; color: #fff; font-size: 1.1em; font-weight: 600;">$1</h3>');
                
                // Convert bullet points to HTML
                formattedText = formattedText.replace(/^- (.*$)/gm, '<div style="margin: 4px 0; padding-left: 16px; position: relative;"><span style="position: absolute; left: 0; color: #007AFF;">•</span>$1</div>');
                
                // Convert numbered lists to HTML
                formattedText = formattedText.replace(/^(\d+)\. (.*$)/gm, '<div style="margin: 4px 0; padding-left: 20px; position: relative;"><span style="position: absolute; left: 0; color: #007AFF; font-weight: 600;">$1.</span>$2</div>');
                
                // Convert URLs to clickable links
                formattedText = formattedText.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color: #007AFF; text-decoration: none; border-bottom: 1px solid rgba(0, 122, 255, 0.3);">$1</a>');
                
                // Preserve line breaks
                formattedText = formattedText.replace(/\n/g, '<br>');
                
                contentDiv.innerHTML = formattedText;
            }
            
            messageDiv.appendChild(contentDiv);
            
            const timestamp = document.createElement('div');
            timestamp.className = 'message-timestamp';
            timestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            messageDiv.appendChild(timestamp);
            
            this.messages.appendChild(messageDiv);
            this.scrollToBottom();
            return messageDiv;
        }

        showTypingIndicator() {
            this.hideTypingIndicator(); // Remove any existing indicator
            
            const indicator = document.createElement('div');
            indicator.className = 'typing-indicator active';
            indicator.id = 'typingIndicator';
            for (let i = 0; i < 3; i++) {
                const dot = document.createElement('div');
                dot.className = 'typing-dot';
                indicator.appendChild(dot);
            }
            this.messages.appendChild(indicator);
            this.scrollToBottom();
        }

        hideTypingIndicator() {
            const indicator = this.shadow.getElementById('typingIndicator');
            if (indicator) {
                indicator.remove();
            }
        }

        toggleSidebar() {
            if (this.isOpen) {
                this.sidebar.style.display = 'none';
            } else {
                this.sidebar.style.display = 'flex';
            }
            this.isOpen = !this.isOpen;
            // Notify background script of sidebar state
            try {
                if (chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage({
                        type: this.isOpen ? 'SIDEBAR_SHOWN' : 'SIDEBAR_CLOSED'
                    });
                }
            } catch (error) {
                console.error('Error notifying background script:', error);
                if (error.message && error.message.includes('Extension context invalidated')) {
                    this.handleContextInvalidation();
                }
            }
            
            try {
                if (chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ sidebarOpen: this.isOpen });
                }
            } catch (error) {
                console.error('Error saving sidebar state:', error);
            }
        }

        showNotification(message) {
            // Remove any existing notification
            const existingNotification = this.shadow.querySelector('.notification');
            if (existingNotification) {
                existingNotification.remove();
            }
            const notification = document.createElement('div');
            notification.className = 'notification';
            notification.textContent = message;
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background-color: #333;
                color: white;
                padding: 12px 24px;
                border-radius: 4px;
                z-index: 10001;
                font-size: 14px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                animation: slideIn 0.3s ease;
            `;
            // Add animation keyframes
            const style = document.createElement('style');
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translate(-50%, -100%); opacity: 0; }
                    to { transform: translate(-50%, 0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translate(-50%, 0); opacity: 1; }
                    to { transform: translate(-50%, -100%); opacity: 0; }
                }
            `;
            this.shadow.appendChild(style);
            this.shadow.appendChild(notification);
            setTimeout(() => {
                notification.style.animation = 'slideOut 0.3s ease forwards';
                setTimeout(() => notification.remove(), 300);
            }, 3000);
        }

        sendMessageToBackground(message) {
            return new Promise((resolve, reject) => {
                try {
                    if (!chrome.runtime || !chrome.runtime.sendMessage) {
                        reject(new Error('Extension context invalidated'));
                        return;
                    }
                    
                    chrome.runtime.sendMessage(message, response => {
                        if (chrome.runtime.lastError) {
                            const error = chrome.runtime.lastError;
                            if (error.message && error.message.includes('Extension context invalidated')) {
                                this.handleContextInvalidation();
                            }
                            reject(error);
                        } else {
                            resolve(response);
                        }
                    });
                } catch (error) {
                    if (error.message && error.message.includes('Extension context invalidated')) {
                        this.handleContextInvalidation();
                    }
                    reject(error);
                }
            });
        }

        setUIState(enabled) {
            this.messageInput.disabled = !enabled;
            this.sendButton.disabled = !enabled;
            this.modelSelector.disabled = !enabled;
            
            if (enabled) {
                // Update send button state based on current conditions
                const hasText = this.messageInput.value.trim().length > 0;
                const hasModel = this.modelSelector.value !== '';
                this.sendButton.disabled = !hasText || !hasModel;
                
                // Focus the input
                this.messageInput.focus();
            }
        }

        scrollToBottom() {
            requestAnimationFrame(() => {
                this.messages.scrollTop = this.messages.scrollHeight;
            });
        }

        showSidebar() {
            this.sidebar.style.display = 'flex';
            this.isOpen = true;
            // Notify background script that sidebar is shown
            try {
                if (chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage({ type: 'SIDEBAR_SHOWN' });
                }
            } catch (error) {
                console.error('Error notifying background script:', error);
                if (error.message && error.message.includes('Extension context invalidated')) {
                    this.handleContextInvalidation();
                }
            }
            
            try {
                if (chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ sidebarOpen: true });
                }
            } catch (error) {
                console.error('Error saving sidebar state:', error);
            }
        }

        showSidebarOnce() {
            console.log('showSidebarOnce called');
            this.sidebar.style.display = 'flex';
            this.sidebar.style.opacity = '1';
            this.isOpen = true;
            console.log('Sidebar should now be visible');
        }

        savePosition() {
            try {
                if (chrome.storage && chrome.storage.local) {
                    const rect = this.sidebar.getBoundingClientRect();
                    chrome.storage.local.set({ sidebarPosition: {
                        left: rect.left, top: rect.top, width: rect.width, height: rect.height
                    }});
                }
            } catch (error) {
                console.error('Error saving sidebar position:', error);
            }
        }

        loadPosition() {
            try {
                if (chrome.storage && chrome.storage.local) {
                    chrome.storage.local.get(['sidebarPosition'], (result) => {
                        if (chrome.runtime.lastError) {
                            console.error('Error loading position:', chrome.runtime.lastError);
                            return;
                        }
                        
                        if (result.sidebarPosition) {
                            const { left, top, width, height } = result.sidebarPosition;
                            this.sidebar.style.left = left + 'px';
                            this.sidebar.style.top = top + 'px';
                            this.sidebar.style.width = width + 'px';
                            this.sidebar.style.height = height + 'px';
                            this.sidebar.style.right = '';
                            this.sidebar.style.bottom = '';
                        }
                    });
                }
            } catch (error) {
                console.error('Error loading sidebar position:', error);
            }
        }

        loadSidebarState() {
            try {
                if (chrome.storage && chrome.storage.local) {
                    chrome.storage.local.get(['sidebarOpen'], (result) => {
                        if (chrome.runtime.lastError) {
                            console.error('Error loading sidebar state:', chrome.runtime.lastError);
                            return;
                        }
                        
                        const isOpen = result.sidebarOpen !== false; // default to true
                        this.isOpen = isOpen;
                        if (isOpen) {
                            this.sidebar.style.display = 'flex';
                            this.sidebar.style.opacity = '0';
                            requestAnimationFrame(() => {
                                this.sidebar.style.opacity = '1';
                                this.sidebar.style.transform = 'translate(0, 0)';
                            });
                        } else {
                            this.sidebar.style.display = 'none';
                        }
                    });
                }
            } catch (error) {
                console.error('Error loading sidebar state:', error);
            }
        }

        initializeUIState() {
            // Ensure input elements are enabled by default
            if (this.messageInput) {
                this.messageInput.disabled = false;
                this.messageInput.focus();
            }
            if (this.modelSelector) {
                this.modelSelector.disabled = false;
            }
            if (this.sendButton) {
                this.updateSendButtonState();
            }
        }

        handleInlineToolExecution(response, currentAssistantMessage) {
            // Handle inline tool execution like Cursor
            if (!currentAssistantMessage) {
                // Create assistant message if it doesn't exist
                currentAssistantMessage = this.addMessage('', 'assistant');
            }
            
            const contentDiv = currentAssistantMessage.querySelector('.message-content');
            if (!contentDiv) return;
            
            // Create or update tool execution indicator
            let toolIndicator = currentAssistantMessage.querySelector('.tool-execution-indicator');
            
            if (response.status === 'executing') {
                // Add tool execution indicator inline
                if (!toolIndicator) {
                    toolIndicator = document.createElement('div');
                    toolIndicator.className = 'tool-execution-indicator';
                    toolIndicator.style.cssText = `
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 12px 16px;
                        margin: 8px 0;
                        background: linear-gradient(135deg, rgba(0, 122, 255, 0.08), rgba(0, 122, 255, 0.12));
                        border: 1px solid rgba(0, 122, 255, 0.2);
                        border-radius: 12px;
                        font-size: 0.9em;
                        color: rgba(255, 255, 255, 0.9);
                        animation: fadeIn 0.3s ease;
                        backdrop-filter: blur(10px);
                        position: relative;
                        overflow: hidden;
                    `;
                    
                    // Add subtle animated background
                    const bgAnimation = document.createElement('div');
                    bgAnimation.style.cssText = `
                        position: absolute;
                        top: 0;
                        left: -100%;
                        width: 100%;
                        height: 100%;
                        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
                        animation: shimmer 2s infinite;
                    `;
                    toolIndicator.appendChild(bgAnimation);
                    
                    const spinner = document.createElement('div');
                    spinner.className = 'tool-spinner';
                    spinner.style.cssText = `
                        width: 16px;
                        height: 16px;
                        border: 2px solid rgba(0, 122, 255, 0.3);
                        border-top: 2px solid #007AFF;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        flex-shrink: 0;
                    `;
                    
                    const text = document.createElement('span');
                    text.style.cssText = `
                        font-weight: 500;
                        z-index: 1;
                        position: relative;
                    `;
                    text.textContent = this.getToolDisplayMessage(response.tool, response.args, 'executing');
                    
                    toolIndicator.appendChild(spinner);
                    toolIndicator.appendChild(text);
                    currentAssistantMessage.appendChild(toolIndicator);
                    
                    // Add shimmer animation to styles if not already added
                    if (!this.shadow.querySelector('#shimmerStyle')) {
                        const shimmerStyle = document.createElement('style');
                        shimmerStyle.id = 'shimmerStyle';
                        shimmerStyle.textContent = `
                            @keyframes shimmer {
                                0% { left: -100%; }
                                100% { left: 100%; }
                            }
                        `;
                        this.shadow.appendChild(shimmerStyle);
                    }
                }
            } else if (response.status === 'completed') {
                // Update indicator to show completion
                if (toolIndicator) {
                    toolIndicator.style.background = 'linear-gradient(135deg, rgba(52, 199, 89, 0.08), rgba(52, 199, 89, 0.12))';
                    toolIndicator.style.borderColor = 'rgba(52, 199, 89, 0.3)';
                    
                    const spinner = toolIndicator.querySelector('.tool-spinner');
                    if (spinner) {
                        spinner.style.display = 'none';
                    }
                    
                    const checkmark = document.createElement('div');
                    checkmark.innerHTML = '✓';
                    checkmark.style.cssText = `
                        color: #34C759;
                        font-weight: bold;
                        font-size: 16px;
                        width: 16px;
                        height: 16px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-shrink: 0;
                        z-index: 1;
                        position: relative;
                    `;
                    
                    if (spinner) {
                        toolIndicator.replaceChild(checkmark, spinner);
                    }
                    
                    const text = toolIndicator.querySelector('span');
                    if (text) {
                        text.textContent = this.getToolDisplayMessage(response.tool, response.args, 'completed');
                    }
                    
                    // Remove shimmer animation
                    const bgAnimation = toolIndicator.querySelector('div');
                    if (bgAnimation && bgAnimation.style.animation.includes('shimmer')) {
                        bgAnimation.remove();
                    }
                    
                    // Auto-hide after 3 seconds with smooth fade
                    setTimeout(() => {
                        if (toolIndicator && toolIndicator.parentNode) {
                            toolIndicator.style.transition = 'all 0.5s ease';
                            toolIndicator.style.opacity = '0';
                            toolIndicator.style.transform = 'translateY(-10px)';
                            setTimeout(() => {
                                if (toolIndicator && toolIndicator.parentNode) {
                                    toolIndicator.remove();
                                }
                            }, 500);
                        }
                    }, 3000);
                }
            } else if (response.status === 'error') {
                // Update indicator to show error
                if (toolIndicator) {
                    toolIndicator.style.background = 'linear-gradient(135deg, rgba(255, 59, 48, 0.08), rgba(255, 59, 48, 0.12))';
                    toolIndicator.style.borderColor = 'rgba(255, 59, 48, 0.3)';
                    
                    const spinner = toolIndicator.querySelector('.tool-spinner');
                    if (spinner) {
                        spinner.style.display = 'none';
                    }
                    
                    const errorIcon = document.createElement('div');
                    errorIcon.innerHTML = '⚠';
                    errorIcon.style.cssText = `
                        color: #FF3B30;
                        font-weight: bold;
                        font-size: 16px;
                        width: 16px;
                        height: 16px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-shrink: 0;
                        z-index: 1;
                        position: relative;
                    `;
                    
                    if (spinner) {
                        toolIndicator.replaceChild(errorIcon, spinner);
                    }
                    
                    const text = toolIndicator.querySelector('span');
                    if (text) {
                        text.textContent = this.getToolDisplayMessage(response.tool, response.args, 'error', response.error);
                    }
                    
                    // Remove shimmer animation
                    const bgAnimation = toolIndicator.querySelector('div');
                    if (bgAnimation && bgAnimation.style.animation.includes('shimmer')) {
                        bgAnimation.remove();
                    }
                }
            }
            
            this.scrollToBottom();
        }

        getToolDisplayMessage(tool, args, status, error = null) {
            const toolMessages = {
                'searchWeb': {
                    executing: `🔍 Searching for "${args.query}"...`,
                    completed: `✅ Found search results for "${args.query}"`,
                    error: `❌ Search failed: ${error || 'Unknown error'}`
                },
                'getPageContent': {
                    executing: `📄 Extracting content from search results...`,
                    completed: `✅ Content extracted successfully`,
                    error: `❌ Content extraction failed: ${error || 'Unknown error'}`
                },
                'openNewTab': {
                    executing: `🌐 Opening new tab...`,
                    completed: `✅ New tab opened`,
                    error: `❌ Failed to open tab: ${error || 'Unknown error'}`
                },
                'generateTool': {
                    executing: `🔧 Generating specialized tool...`,
                    completed: `✅ Tool generated successfully`,
                    error: `❌ Tool generation failed: ${error || 'Unknown error'}`
                }
            };
            
            return toolMessages[tool]?.[status] || `${status} ${tool}`;
        }
    }

    // Initialize the sidebar when the script is injected
    window.xatBrowserSidebar = new SidebarUI();

    // Notify the background script that the sidebar is ready
    chrome.runtime.sendMessage({ type: 'SIDEBAR_READY' });
}