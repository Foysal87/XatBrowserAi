class SidebarUI {
    constructor() {
        this.isOpen = true;
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
    }

    initializeElements() {
        // Create sidebar container with glassmorphism effect
        this.sidebar = document.createElement('div');
        this.sidebar.className = 'xatbrowser-sidebar';
        this.sidebar.style.cssText = 'position: fixed; left: 50px; top: 50px; width: 400px; height: 600px; background: rgba(30, 30, 30, 0.7); backdrop-filter: blur(16px) saturate(180%); border-radius: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.25); z-index: 10000; display: flex; flex-direction: column; font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #fff; border: 1px solid rgba(255,255,255,0.18); overflow: hidden; transition: box-shadow 0.2s, border 0.2s;';

        // Create drag handle with gradient
        this.dragHandle = document.createElement('div');
        this.dragHandle.className = 'sidebar-drag-handle';
        this.dragHandle.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; height: 48px; background: linear-gradient(90deg, rgba(42, 42, 42, 0.95), rgba(26, 26, 26, 0.95)); border-radius: 16px 16px 0 0; cursor: move; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); z-index: 2; user-select: none; transition: background 0.3s ease;';

        // Create title with modern styling
        this.title = document.createElement('h2');
        this.title.textContent = 'XatBrowser AI';
        this.title.style.cssText = 'margin: 0; color: #fff; font-size: 1.2em; font-weight: 600; background: linear-gradient(90deg, #fff, #a8b2ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; display: flex; align-items: center; gap: 8px;';

        // Add AI icon to title
        const aiIcon = document.createElement('span');
        aiIcon.innerHTML = '🤖';
        aiIcon.style.fontSize = '1.2em';
        this.title.prepend(aiIcon);

        // Create close button with hover effect
        this.closeButton = document.createElement('button');
        this.closeButton.className = 'sidebar-close-button';
        this.closeButton.innerHTML = '×';
        this.closeButton.style.cssText = 'background: rgba(255, 255, 255, 0.1); border: none; color: #fff; font-size: 24px; cursor: pointer; padding: 4px 8px; border-radius: 8px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;';

        // Create model selector with modern styling
        this.modelSelector = document.createElement('select');
        this.modelSelector.className = 'model-selector';
        this.modelSelector.style.cssText = 'padding: 10px 16px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.05); color: #fff; cursor: pointer; min-width: 220px; height: 40px; margin-left: auto; font-size: 0.9em; transition: all 0.2s ease; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'white\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; background-size: 16px; padding-right: 40px;';

        // Create status indicator with modern design
        this.statusIndicator = document.createElement('div');
        this.statusIndicator.className = 'status-indicator';
        this.statusIndicator.style.cssText = 'display: flex; align-items: center; gap: 12px; padding: 16px 20px; background: rgba(42, 42, 42, 0.5); border-bottom: 1px solid rgba(255, 255, 255, 0.1); margin-top: 48px; backdrop-filter: blur(5px);';

        // Create status dot with pulse animation
        this.statusDot = document.createElement('div');
        this.statusDot.className = 'status-dot';
        this.statusDot.style.cssText = 'width: 10px; height: 10px; border-radius: 50%; background-color: #ccc; position: relative;';

        // Create status text with modern styling
        this.statusText = document.createElement('span');
        this.statusText.className = 'status-text';
        this.statusText.textContent = 'Select a model to begin';
        this.statusText.style.cssText = 'font-size: 0.9em; color: rgba(255, 255, 255, 0.8);';

        // Create tool panel with quick actions
        this.toolPanel = document.createElement('div');
        this.toolPanel.className = 'tool-panel';
        this.tools = [
            {
                icon: '🗂',
                label: 'Open Tab',
                action: () => this.sendMessageToBackground({ type: 'OPEN_TAB', url: 'https://example.com' })
                    .then(() => this.showNotification('Opened new tab'))
            },
            {
                icon: 'ℹ️',
                label: 'Tab Info',
                action: async () => {
                    const info = await this.sendMessageToBackground({ type: 'GET_TAB_INFO' });
                    if (info && info.title) {
                        this.showNotification(info.title);
                    }
                }
            },
            {
                icon: '📄',
                label: 'Page HTML',
                action: () => this.sendMessageToBackground({ type: 'GET_PAGE_HTML' })
                    .then(() => this.showNotification('HTML retrieved'))
            }
        ];
        this.tools.forEach(t => {
            const btn = document.createElement('div');
            btn.className = 'tool-button';
            btn.innerHTML = `<span class="tool-icon">${t.icon}</span><span class="tool-label">${t.label}</span>`;
            btn.addEventListener('click', t.action);
            this.toolPanel.appendChild(btn);
        });

        // Create messages container with modern scrollbar
        this.messages = document.createElement('div');
        this.messages.className = 'messages';
        this.messages.style.cssText = 'flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px; background: rgba(26, 26, 26, 0.5); scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.2) transparent;';

        // Create input container with glassmorphism
        this.inputContainer = document.createElement('div');
        this.inputContainer.className = 'input-container';
        this.inputContainer.style.cssText = 'padding: 20px; background: rgba(42, 42, 42, 0.5); border-top: 1px solid rgba(255, 255, 255, 0.1); display: flex; gap: 12px; backdrop-filter: blur(5px);';

        // Create message input with modern styling
        this.messageInput = document.createElement('textarea');
        this.messageInput.className = 'message-input';
        this.messageInput.placeholder = 'Ask me something...';
        this.messageInput.style.cssText = 'flex: 1; padding: 14px; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; outline: none; font-size: 0.95em; resize: none; min-height: 24px; max-height: 120px; background: rgba(255, 255, 255, 0.05); color: #fff; transition: all 0.2s ease; scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.2) transparent;';

        // Create send button with gradient and hover effect
        this.sendButton = document.createElement('button');
        this.sendButton.className = 'send-button';
        this.sendButton.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Send';
        this.sendButton.style.cssText = 'padding: 12px 20px; background: linear-gradient(135deg, #007AFF, #5856D6); color: white; border: none; border-radius: 12px; cursor: pointer; font-size: 0.95em; display: flex; align-items: center; gap: 8px; transition: all 0.2s ease; font-weight: 500;';

        // Create resize handles (multiple for better control)
        this.resizeHandles = {
            se: this.createResizeHandle('se'),
            sw: this.createResizeHandle('sw'),
            ne: this.createResizeHandle('ne'),
            nw: this.createResizeHandle('nw')
        };

        // Add global styles
        const style = document.createElement('style');
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
            .xatbrowser-sidebar {
                --primary-gradient: linear-gradient(135deg, #007AFF, #5856D6);
                --glass-bg: rgba(30, 30, 30, 0.7);
                --glass-border: rgba(255, 255, 255, 0.18);
                --hover-bg: rgba(255, 255, 255, 0.1);
                box-shadow: 0 12px 40px 0 rgba(0,0,0,0.35);
                border-radius: 24px;
                border: 1.5px solid var(--glass-border);
                backdrop-filter: blur(18px) saturate(180%);
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            .xatbrowser-sidebar * { box-sizing: border-box; }
            .sidebar-drag-handle {
                background: linear-gradient(90deg, rgba(42, 42, 42, 0.85), rgba(26, 26, 26, 0.85));
                border-radius: 24px 24px 0 0;
                min-height: 56px;
                padding: 0 28px;
                font-size: 1.1em;
                font-weight: 600;
                letter-spacing: 0.01em;
            }
            .sidebar-drag-handle:hover {
                background: linear-gradient(90deg, rgba(52, 52, 52, 0.95), rgba(36, 36, 36, 0.95));
            }
            .sidebar-close-button {
                background: rgba(255,255,255,0.12);
                border: none;
                color: #fff;
                font-size: 26px;
                cursor: pointer;
                padding: 4px 10px;
                border-radius: 12px;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s, transform 0.2s;
            }
            .sidebar-close-button:hover {
                background: rgba(255,255,255,0.22);
                transform: scale(1.08);
            }
            .status-indicator {
                margin-top: 56px;
                padding: 18px 28px 10px 28px;
                background: transparent;
                border-bottom: none;
                display: flex;
                align-items: center;
                gap: 14px;
            }
            .model-selector {
                background: #23232b !important;
                color: #fff !important;
                border: 1.5px solid var(--glass-border);
                border-radius: 12px;
                padding: 10px 18px;
                font-size: 1em;
                min-width: 210px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                transition: border 0.2s, box-shadow 0.2s;
            }
            .model-selector option {
                background: #23232b;
                color: #fff;
            }
            .model-selector:focus {
                outline: none;
                border-color: #007AFF;
                box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.18);
            }
            .status-dot {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background-color: #ccc;
                margin-left: 8px;
            }
            .status-text {
                font-size: 0.93em;
                color: rgba(255,255,255,0.7);
                margin-left: 8px;
                font-weight: 400;
            }
            .messages {
                flex: 1;
                overflow-y: auto;
                padding: 28px 28px 18px 28px;
                display: flex;
                flex-direction: column;
                gap: 18px;
                background: transparent;
                scrollbar-width: thin;
                scrollbar-color: rgba(255,255,255,0.18) transparent;
            }
            .input-container {
                padding: 22px 28px 22px 28px;
                background: rgba(42,42,42,0.32);
                border-top: 1.5px solid var(--glass-border);
                display: flex;
                gap: 14px;
                backdrop-filter: blur(8px);
            }
            .message-input {
                flex: 1;
                padding: 16px 18px;
                border: 1.5px solid var(--glass-border);
                border-radius: 14px;
                outline: none;
                font-size: 1em;
                resize: none;
                min-height: 32px;
                max-height: 120px;
                background: rgba(255,255,255,0.07);
                color: #fff;
                transition: border 0.2s, box-shadow 0.2s;
                box-shadow: 0 1px 4px rgba(0,0,0,0.08);
            }
            .message-input:focus {
                border-color: #007AFF;
                box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.18);
            }
            .send-button {
                padding: 0 28px;
                background: linear-gradient(135deg, #007AFF, #5856D6);
                color: white;
                border: none;
                border-radius: 14px;
                cursor: pointer;
                font-size: 1.1em;
                display: flex;
                align-items: center;
                gap: 10px;
                transition: background 0.2s, transform 0.2s, box-shadow 0.2s;
                font-weight: 500;
                height: 48px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.10);
            }
            .send-button:hover {
                transform: translateY(-2px) scale(1.04);
                box-shadow: 0 6px 18px rgba(0,122,255,0.18);
            }
            .send-button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
                box-shadow: none;
            }
            .message {
                max-width: 85%;
                padding: 16px 22px;
                border-radius: 18px;
                margin: 8px 0;
                font-size: 1.05em;
                line-height: 1.6;
                position: relative;
                animation: messageSlide 0.3s ease;
                word-wrap: break-word;
                backdrop-filter: blur(6px);
                box-shadow: 0 2px 8px rgba(0,0,0,0.10);
            }
            .user-message {
                align-self: flex-end;
                background: var(--primary-gradient);
                color: white;
                margin-left: auto;
                border-bottom-right-radius: 6px;
            }
            .assistant-message {
                align-self: flex-start;
                background: rgba(255,255,255,0.10);
                color: #fff;
                margin-right: auto;
                border-bottom-left-radius: 6px;
            }
            .message.error {
                background: linear-gradient(135deg, #ff4444, #ff6b6b);
                color: white;
            }
            .message-content { margin-bottom: 8px; }
            .message-timestamp {
                font-size: 0.85em;
                color: rgba(255,255,255,0.6);
                margin-top: 6px;
                text-align: right;
            }
            .typing-indicator {
                display: flex;
                gap: 6px;
                padding: 14px 20px;
                background: rgba(255,255,255,0.10);
                border-radius: 18px;
                width: fit-content;
                margin: 8px 0;
            }
            .typing-dot {
                width: 10px;
                height: 10px;
                background: rgba(255,255,255,0.5);
                border-radius: 50%;
                animation: typingBounce 1.4s infinite ease-in-out;
            }
            .typing-dot:nth-child(1) { animation-delay: 0s; }
            .typing-dot:nth-child(2) { animation-delay: 0.2s; }
            .typing-dot:nth-child(3) { animation-delay: 0.4s; }
            .tool-panel {
                display: flex;
                justify-content: space-around;
                padding: 10px 20px;
                background: rgba(42,42,42,0.4);
                border-bottom: 1px solid var(--glass-border);
                gap: 10px;
            }
            .tool-button {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 4px;
                font-size: 0.75em;
                color: #fff;
                cursor: pointer;
                padding: 6px 10px;
                border-radius: 8px;
                transition: background 0.2s;
            }
            .tool-button:hover {
                background: rgba(255,255,255,0.12);
            }
            .tool-icon {
                font-size: 1.2em;
            }
            .resize-handle {
                position: absolute;
                width: 14px;
                height: 14px;
                background: rgba(255,255,255,0.10);
                border: 1.5px solid var(--glass-border);
                border-radius: 3px;
                z-index: 3;
                transition: background 0.2s, border 0.2s;
            }
            .resize-handle:hover {
                background: rgba(255,255,255,0.18);
                border-color: #007AFF;
            }
            .resize-handle.se { bottom: 0; right: 0; cursor: se-resize; }
            .resize-handle.sw { bottom: 0; left: 0; cursor: sw-resize; }
            .resize-handle.ne { top: 0; right: 0; cursor: ne-resize; }
            .resize-handle.nw { top: 0; left: 0; cursor: nw-resize; }
            @keyframes messageSlide { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes typingBounce { 0%, 80%, 100% { transform: scale(0.6); } 40% { transform: scale(1); } }
            .messages::-webkit-scrollbar { width: 8px; }
            .messages::-webkit-scrollbar-track { background: transparent; }
            .messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 4px; }
            .messages::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.28); }
            .status-dot::after { content: ""; position: absolute; top: 0; left: 0; right: 0; bottom: 0; border-radius: 50%; animation: pulse 2s infinite; }
            @keyframes pulse { 0% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(2); opacity: 0; } 100% { transform: scale(1); opacity: 0; } }
        `;
        // Append sidebar and style to shadow root
        this.shadow.appendChild(style);
        this.shadow.appendChild(this.sidebar);
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
        this.sidebar.appendChild(this.toolPanel);
        this.sidebar.appendChild(this.messages);
        this.sidebar.appendChild(this.inputContainer);

        // Add resize handles
        Object.values(this.resizeHandles).forEach(handle => {
            this.sidebar.appendChild(handle);
        });
    }

    attachEventListeners() {
        // Remove the toggleButton event listener since we don't have a toggle button
        // this.toggleButton.addEventListener('click', () => this.toggleSidebar());

        this.messageInput.addEventListener('input', () => {
            this.handleInput();
            // Update send button state
            const hasText = this.messageInput.value.trim().length > 0;
            const hasModel = this.modelSelector.value !== '';
            this.sendButton.disabled = !hasText || !hasModel;
        });

        this.sendButton.addEventListener('click', (e) => {
            e.preventDefault();
            if (!this.sendButton.disabled) {
                this.sendMessage();
            }
        });

        this.modelSelector.addEventListener('change', () => {
            this.handleModelChange();
            // Update send button state
            const hasText = this.messageInput.value.trim().length > 0;
            const hasModel = this.modelSelector.value !== '';
            this.sendButton.disabled = !hasText || !hasModel;
        });

        // Add keyboard shortcut for sending messages
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !this.sendButton.disabled) {
                e.preventDefault();
                e.stopPropagation();
                this.sendMessage();
            }
        });

        // Listen for messages from the background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.type) {
                case 'TOGGLE_SIDEBAR':
                    this.toggleSidebar();
                    break;
                case 'CHECK_SIDEBAR_STATUS':
                    sendResponse(this.isOpen);
                    break;
                case 'SHOW_NOTIFICATION':
                    this.showNotification(message.message);
                    break;
            }
        });

        // Enhanced drag functionality for free movement
        let isDragging = false;
        let dragStartX, dragStartY, dragSidebarX, dragSidebarY;

        const dragStart = (e) => {
            if (e.target.closest('.sidebar-drag-handle')) {
                isDragging = true;
                dragStartX = e.clientX;
                dragStartY = e.clientY;
                const rect = this.sidebar.getBoundingClientRect();
                dragSidebarX = rect.left;
                dragSidebarY = rect.top;
                this.sidebar.style.transition = 'none';
                document.body.style.userSelect = 'none';
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
        const dragEnd = () => {
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
            }
        };
        const resize = (e) => {
            if (isResizing) {
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
        const stopResize = () => {
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
            chrome.runtime.sendMessage({ type: 'SIDEBAR_CLOSED' });
            chrome.storage.local.set({ sidebarOpen: false });
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

        ['keydown', 'keyup', 'keypress'].forEach(eventType => {
            this.messageInput.addEventListener(eventType, (e) => {
                e.stopPropagation();
            });
        });
    }

    async loadConfig() {
        try {
            const config = await this.sendMessageToBackground({ type: 'GET_CONFIG' });
            if (config) {
                this.updateModelSelector(config);
            }
        } catch (error) {
            console.error('Error loading config:', error);
            this.showNotification('Error loading configuration');
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
        this.sendButton.disabled = !selectedModel;
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
            // Disable input and button while sending
            this.setUIState(false);

            // Add user message to chat
            this.addMessage(message, 'user');
            
            // Clear input
            this.messageInput.value = '';
            this.messageInput.style.height = 'auto';
            
            // Show typing indicator
            this.showTypingIndicator();

            // Get preprocessed page content
            const pageContent = this.preprocessHtml();
            const pageUrl = document.location.href;
            const pageTitle = document.title;

            // Create a port for streaming
            const port = chrome.runtime.connect({ name: 'chat' });
            
            // Set up port message listener
            port.onMessage.addListener((response) => {
                if (response.error) {
                    this.hideTypingIndicator();
                    this.addMessage(`Error: ${response.error}`, 'assistant', true);
                    this.showNotification('Error: ' + response.error);
                    port.disconnect();
                    this.setUIState(true);  // Re-enable UI on error
                } else if (response.done) {
                    this.hideTypingIndicator();
                    port.disconnect();
                    this.setUIState(true);  // Re-enable UI when done
                } else if (response.type === 'delta' && response.content) {
                    // Handle streaming content
                    const lastMessage = this.messages.querySelector('.assistant-message:last-child');
                    if (lastMessage && lastMessage.querySelector('.message-content')) {
                        lastMessage.querySelector('.message-content').textContent += response.content;
                    } else {
                        this.addMessage(response.content, 'assistant');
                    }
                    this.scrollToBottom();
                }
            });

            // Send message to background script with streaming
            port.postMessage({
                type: 'PROCESS_MESSAGE',
                message: message,
                modelId: this.modelSelector.value,
                pageContent: pageContent,
                pageUrl: pageUrl,
                pageTitle: pageTitle
            });

        } catch (error) {
            console.error('Error sending message:', error);
            this.hideTypingIndicator();
            this.addMessage(`Error: ${error.message}`, 'assistant', true);
            this.showNotification('Error: ' + error.message);
            this.setUIState(true);
        }
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
            contentDiv.textContent = text;
        }
        
        messageDiv.appendChild(contentDiv);
        
        const timestamp = document.createElement('div');
        timestamp.className = 'message-timestamp';
        timestamp.textContent = new Date().toLocaleTimeString();
        messageDiv.appendChild(timestamp);
        
        this.messages.appendChild(messageDiv);
        this.scrollToBottom();
        return messageDiv;
    }

    showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator active';
        indicator.id = 'typingIndicator';
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.className = 'typing-dot';
            indicator.appendChild(dot);
        }
        this.messages.appendChild(indicator);
        this.messages.scrollTop = this.messages.scrollHeight;
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
        chrome.runtime.sendMessage({
            type: this.isOpen ? 'SIDEBAR_SHOWN' : 'SIDEBAR_CLOSED'
        });
        chrome.storage.local.set({ sidebarOpen: this.isOpen });
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
            chrome.runtime.sendMessage(message, response => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response);
                }
            });
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
        chrome.runtime.sendMessage({ type: 'SIDEBAR_SHOWN' });
        chrome.storage.local.set({ sidebarOpen: true });
    }

    savePosition() {
        const rect = this.sidebar.getBoundingClientRect();
        chrome.storage.local.set({ sidebarPosition: {
            left: rect.left, top: rect.top, width: rect.width, height: rect.height
        }});
    }

    loadPosition() {
        chrome.storage.local.get(['sidebarPosition'], (result) => {
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

    loadSidebarState() {
        chrome.storage.local.get(['sidebarOpen'], (result) => {
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
}

// Initialize the sidebar when the script is injected
const sidebar = new SidebarUI();

// Notify the background script that the sidebar is ready
chrome.runtime.sendMessage({ type: 'SIDEBAR_READY' }); 