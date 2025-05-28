// Enhanced Sidebar with Cursor-like UI and Real-time Tool Execution
if (typeof window.xatBrowserEnhancedSidebarLoaded !== 'undefined') {
    console.log('Enhanced sidebar already loaded, skipping redeclaration');
} else {
    window.xatBrowserEnhancedSidebarLoaded = true;

    class EnhancedSidebarUI {
        constructor() {
            this.isInitialized = false;
            this.isContextValid = true; // Track context validity
            this.currentDomain = this.getCurrentDomain();
            this.isOpen = false;
            this.isMinimized = false;
            this.isProcessing = false;
            this.currentStreamingMessage = null;
            this.orchestrator = null;
            this.activeExecutions = new Map();
            this.executionHistory = [];
            this.isResizing = false;
            this.currentToolIndicator = null;
            
            // Check context validity before initialization
            if (!isExtensionContextValid()) {
                console.warn('Extension context invalid during sidebar initialization');
                this.isContextValid = false;
                return;
            }

            this.initializeUIState();
            this.initializeOrchestrator();
            this.initializeElements();
            this.assembleSidebar();
            this.attachEventListeners();
            this.loadConfig();
            this.loadPosition();
            this.loadSidebarState();
            
            this.isInitialized = true;
            console.log('Enhanced sidebar initialized for domain:', this.currentDomain);
        }

        initializeUIState() {
            // Prevent multiple instances
            if (document.getElementById('xatbrowser-enhanced-sidebar-container')) {
                console.log('Enhanced sidebar container already exists, removing old one...');
                document.getElementById('xatbrowser-enhanced-sidebar-container').remove();
            }
            
            // Create container and shadow root
            this.container = document.createElement('div');
            this.container.id = 'xatbrowser-enhanced-sidebar-container';
            this.shadow = this.container.attachShadow({ mode: 'open' });
            
            if (!document.body.contains(this.container)) {
                document.body.appendChild(this.container);
            }
        }

        getCurrentDomain() {
            try {
                return window.location.hostname || 'unknown';
            } catch (error) {
                console.error('Error getting domain:', error);
                return 'unknown';
            }
        }

        initializeOrchestrator() {
            // Load orchestrator if not already loaded
            if (typeof ToolOrchestrator === 'undefined') {
                const script = document.createElement('script');
                script.src = chrome.runtime.getURL('orchestrator.js');
                script.onload = () => {
                    this.setupOrchestrator();
                };
                document.head.appendChild(script);
            } else {
                this.setupOrchestrator();
            }
        }

        setupOrchestrator() {
            this.orchestrator = new ToolOrchestrator();
            
            // Set up UI callbacks for real-time feedback
            this.orchestrator.setUICallbacks({
                onToolStart: (data) => {
                    console.log('Tool started:', data);
                    this.handleToolStart(data);
                },
                onToolProgress: (data) => {
                    console.log('Tool progress:', data);
                    this.handleToolProgress(data);
                },
                onToolComplete: (data) => {
                    console.log('Tool completed:', data);
                    this.handleToolComplete(data);
                },
                onToolError: (data) => {
                    console.log('Tool error:', data);
                    this.handleToolError(data);
                },
                onExecutionStart: (data) => {
                    console.log('Execution started:', data);
                    this.handleExecutionStart(data);
                },
                onExecutionComplete: (data) => {
                    console.log('Execution completed:', data);
                    this.handleExecutionComplete(data);
                }
            });
        }

        initializeElements() {
            // Create enhanced sidebar with Cursor-like design
            this.sidebar = document.createElement('div');
            this.sidebar.className = 'xatbrowser-enhanced-sidebar';
            this.sidebar.tabIndex = -1; // Make sidebar focusable
            this.sidebar.style.cssText = `
                position: fixed;
                right: 20px;
                top: 20px;
                width: 420px;
                height: calc(100vh - 40px);
                max-height: calc(100vh - 40px);
                background: rgba(24, 24, 27, 0.95);
                backdrop-filter: blur(20px) saturate(180%);
                border-radius: 16px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                box-shadow: 
                    0 32px 64px rgba(0, 0, 0, 0.4),
                    0 0 0 1px rgba(255, 255, 255, 0.05),
                    inset 0 1px 0 rgba(255, 255, 255, 0.1);
                z-index: 10000;
                display: flex;
                flex-direction: column;
                font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                color: #fff;
                overflow: hidden;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                resize: vertical;
                min-height: 400px;
                outline: none;
            `;

            this.createHeader();
            this.createToolExecutionPanel();
            this.createMessagesArea();
            this.createInputArea();
            this.createRestoreButton();
            this.createStyles();
            this.assembleSidebar();
            
            // Set up focus trap
            this.setupFocusTrap();
        }

        setupFocusTrap() {
            // Capture all keyboard events within the sidebar
            this.sidebar.addEventListener('keydown', (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                // Handle Escape key to close sidebar
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.minimizeSidebar();
                    return;
                }
                
                // Handle Tab navigation within sidebar
                if (e.key === 'Tab') {
                    this.handleTabNavigation(e);
                }
            }, true); // Use capture phase

            this.sidebar.addEventListener('keyup', (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
            }, true);

            this.sidebar.addEventListener('keypress', (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
            }, true);

            // Focus the sidebar when it becomes visible
            this.sidebar.addEventListener('click', () => {
                this.sidebar.focus();
            });
        }

        handleTabNavigation(e) {
            const focusableElements = this.sidebar.querySelectorAll(
                'input, textarea, button, select, [tabindex]:not([tabindex="-1"])'
            );
            const focusableArray = Array.from(focusableElements);
            const currentIndex = focusableArray.indexOf(document.activeElement);

            if (e.shiftKey) {
                // Shift+Tab - go to previous element
                const prevIndex = currentIndex <= 0 ? focusableArray.length - 1 : currentIndex - 1;
                focusableArray[prevIndex]?.focus();
            } else {
                // Tab - go to next element
                const nextIndex = currentIndex >= focusableArray.length - 1 ? 0 : currentIndex + 1;
                focusableArray[nextIndex]?.focus();
            }
            
            e.preventDefault();
        }

        createHeader() {
            this.header = document.createElement('div');
            this.header.className = 'sidebar-header';
            this.header.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 16px 20px;
                background: rgba(30, 30, 35, 0.95);
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 16px 16px 0 0;
                backdrop-filter: blur(10px);
            `;

            // Title section
            const titleSection = document.createElement('div');
            titleSection.style.cssText = `
                display: flex;
                align-items: center;
                gap: 12px;
                flex: 1;
            `;

            const logo = document.createElement('div');
            logo.style.cssText = `
                width: 32px;
                height: 32px;
                background: linear-gradient(135deg, #3b82f6, #8b5cf6);
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
            `;
            logo.textContent = '🧠';

            const title = document.createElement('h2');
            title.style.cssText = `
                margin: 0;
                font-size: 1.1em;
                font-weight: 600;
                color: rgba(255, 255, 255, 0.95);
                letter-spacing: -0.02em;
            `;
            title.textContent = 'XatBrowser AI';

            titleSection.appendChild(logo);
            titleSection.appendChild(title);

            // Model selector with improved styling
            this.modelSelector = document.createElement('select');
            this.modelSelector.className = 'model-selector';
            this.modelSelector.style.cssText = `
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 8px;
                color: rgba(255, 255, 255, 0.9);
                padding: 8px 32px 8px 12px;
                font-size: 0.85em;
                font-family: inherit;
                cursor: pointer;
                outline: none;
                appearance: none;
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.7)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
                background-repeat: no-repeat;
                background-position: right 8px center;
                background-size: 16px;
                min-width: 140px;
                transition: all 0.2s ease;
            `;

            // Window controls
            const windowControls = document.createElement('div');
            windowControls.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                margin-left: 12px;
            `;

            // Minimize button
            this.minimizeButton = document.createElement('button');
            this.minimizeButton.className = 'window-control minimize';
            this.minimizeButton.innerHTML = '−';
            this.minimizeButton.style.cssText = `
                width: 28px;
                height: 28px;
                border: none;
                border-radius: 6px;
                background: rgba(255, 255, 255, 0.08);
                color: rgba(255, 255, 255, 0.8);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                font-weight: 300;
                transition: all 0.2s ease;
            `;

            // Close button
            this.closeButton = document.createElement('button');
            this.closeButton.className = 'window-control close';
            this.closeButton.innerHTML = '×';
            this.closeButton.style.cssText = `
                width: 28px;
                height: 28px;
                border: none;
                border-radius: 6px;
                background: rgba(255, 255, 255, 0.08);
                color: rgba(255, 255, 255, 0.8);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                font-weight: 300;
                transition: all 0.2s ease;
            `;

            windowControls.appendChild(this.minimizeButton);
            windowControls.appendChild(this.closeButton);

            this.header.appendChild(titleSection);
            this.header.appendChild(this.modelSelector);
            this.header.appendChild(windowControls);
        }

        createToolExecutionPanel() {
            this.toolExecutionPanel = document.createElement('div');
            this.toolExecutionPanel.className = 'tool-execution-panel';
            this.toolExecutionPanel.style.display = 'none'; // Initially hidden
            
            const header = document.createElement('div');
            header.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
                font-size: 0.85em;
                font-weight: 600;
                color: rgba(255, 255, 255, 0.8);
            `;
            header.innerHTML = `
                <span>⚡</span>
                <span>Tool Execution</span>
            `;
            
            this.toolExecutionList = document.createElement('div');
            this.toolExecutionList.className = 'tool-execution-list';
            
            this.toolExecutionPanel.appendChild(header);
            this.toolExecutionPanel.appendChild(this.toolExecutionList);
            
            console.log('Tool execution panel created');
        }

        createMessagesArea() {
            this.messages = document.createElement('div');
            this.messages.className = 'messages';
            this.messages.style.cssText = `
                flex: 1;
                overflow-y: auto;
                padding: 16px 20px;
                display: flex;
                flex-direction: column;
                gap: 12px;
                scrollbar-width: thin;
                scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
                background: transparent;
            `;
        }

        createInputArea() {
            this.inputContainer = document.createElement('div');
            this.inputContainer.className = 'input-container';
            this.inputContainer.style.cssText = `
                padding: 16px 20px 20px 20px;
                background: rgba(39, 39, 42, 0.6);
                border-top: 1px solid rgba(255, 255, 255, 0.06);
                display: flex;
                gap: 10px;
                align-items: flex-end;
                backdrop-filter: blur(10px);
                border-radius: 0 0 16px 16px;
            `;

            this.messageInput = document.createElement('textarea');
            this.messageInput.placeholder = 'Ask me anything...';
            this.messageInput.style.cssText = `
                flex: 1;
                padding: 12px 16px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 8px;
                outline: none;
                font-size: 14px;
                resize: none;
                min-height: 20px;
                max-height: 100px;
                background: rgba(255, 255, 255, 0.04);
                color: #f1f5f9;
                font-family: inherit;
                line-height: 1.4;
                transition: all 0.2s ease;
                scrollbar-width: thin;
                scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
            `;

            this.sendButton = document.createElement('button');
            this.sendButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;
            this.sendButton.style.cssText = `
                padding: 12px;
                background: linear-gradient(135deg, #3b82f6, #8b5cf6);
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                min-width: 44px;
                height: 44px;
                box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
            `;

            this.inputContainer.appendChild(this.messageInput);
            this.inputContainer.appendChild(this.sendButton);
        }

        createRestoreButton() {
            this.restoreButton = document.createElement('button');
            this.restoreButton.className = 'restore-button';
            this.restoreButton.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span>XatBrowser AI</span>
            `;
            this.restoreButton.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: rgba(24, 24, 27, 0.95);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 12px;
                color: rgba(255, 255, 255, 0.9);
                padding: 12px 16px;
                cursor: pointer;
                display: none;
                align-items: center;
                gap: 8px;
                font-size: 0.85em;
                font-weight: 500;
                font-family: inherit;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                z-index: 9999;
                animation: slideInFromBottom 0.3s ease;
            `;

            // Add to document body (not shadow DOM) so it's always visible
            document.body.appendChild(this.restoreButton);
        }

        createStyles() {
            const style = document.createElement('style');
            style.textContent = `
                * {
                    box-sizing: border-box;
                }

                .xatbrowser-enhanced-sidebar {
                    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }

                /* Model selector improvements */
                .model-selector {
                    position: relative;
                }

                .model-selector:hover {
                    background: rgba(255, 255, 255, 0.12);
                    border-color: rgba(255, 255, 255, 0.2);
                }

                .model-selector:focus {
                    background: rgba(255, 255, 255, 0.12);
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
                }

                .model-selector option {
                    background: rgba(24, 24, 27, 0.98) !important;
                    color: rgba(255, 255, 255, 0.9) !important;
                    padding: 8px 12px !important;
                    border: none !important;
                }

                .model-selector option:hover {
                    background: rgba(59, 130, 246, 0.2) !important;
                }

                .model-selector option:checked {
                    background: rgba(59, 130, 246, 0.3) !important;
                }

                /* Window controls */
                .window-control:hover {
                    background: rgba(255, 255, 255, 0.15);
                    transform: scale(1.05);
                }

                .window-control.close:hover {
                    background: rgba(239, 68, 68, 0.2);
                    color: #ef4444;
                }

                .window-control.minimize:hover {
                    background: rgba(59, 130, 246, 0.2);
                    color: #3b82f6;
                }

                /* Restore button animations */
                .restore-button:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
                    background: rgba(30, 30, 35, 0.98);
                }

                @keyframes slideInFromBottom {
                    from {
                        transform: translateY(100px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }

                /* Message input improvements */
                .message-input {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 12px;
                    color: rgba(255, 255, 255, 0.95);
                    padding: 12px 16px;
                    font-size: 0.9em;
                    font-family: inherit;
                    resize: none;
                    outline: none;
                    transition: all 0.2s ease;
                    line-height: 1.5;
                    min-height: 44px;
                    max-height: 120px;
                }

                .message-input:hover {
                    background: rgba(255, 255, 255, 0.08);
                    border-color: rgba(255, 255, 255, 0.15);
                }

                .message-input:focus {
                    background: rgba(255, 255, 255, 0.08);
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
                }

                .message-input::placeholder {
                    color: rgba(255, 255, 255, 0.5);
                }

                /* Send button improvements */
                .send-button {
                    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
                    border: none;
                    border-radius: 12px;
                    color: white;
                    padding: 12px 20px;
                    font-size: 0.9em;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    min-width: 80px;
                }

                .send-button:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 8px 25px rgba(59, 130, 246, 0.3);
                }

                .send-button:active:not(:disabled) {
                    transform: translateY(0);
                }

                .send-button:disabled {
                    background: rgba(255, 255, 255, 0.1);
                    color: rgba(255, 255, 255, 0.4);
                    cursor: not-allowed;
                    transform: none;
                    box-shadow: none;
                }

                /* Messages area */
                .messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
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

                /* Message bubbles */
                .message {
                    max-width: 85%;
                    padding: 12px 16px;
                    border-radius: 16px;
                    font-size: 0.9em;
                    line-height: 1.5;
                    word-wrap: break-word;
                    animation: messageSlideIn 0.3s ease;
                }

                .user-message {
                    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
                    color: white;
                    align-self: flex-end;
                    border-bottom-right-radius: 6px;
                }

                .assistant-message {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    color: rgba(255, 255, 255, 0.95);
                    align-self: flex-start;
                    border-bottom-left-radius: 6px;
                }

                .assistant-message.error {
                    background: rgba(239, 68, 68, 0.1);
                    border-color: rgba(239, 68, 68, 0.3);
                    color: #fca5a5;
                }

                @keyframes messageSlideIn {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .inline-tool-execution {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 16px;
                    margin: 8px 0;
                    background: rgba(59, 130, 246, 0.08);
                    border: 1px solid rgba(59, 130, 246, 0.15);
                    border-radius: 12px;
                    font-size: 0.85em;
                    color: rgba(255, 255, 255, 0.9);
                    animation: slideInFromLeft 0.3s ease;
                }

                .inline-tool-execution .spinner {
                    width: 14px;
                    height: 14px;
                    border: 2px solid rgba(59, 130, 246, 0.3);
                    border-top: 2px solid #3b82f6;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                .tool-execution-panel {
                    background: rgba(30, 30, 35, 0.95);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                    padding: 12px 20px;
                    max-height: 120px;
                    overflow-y: auto;
                    transition: all 0.3s ease;
                    transform: translateY(-100%);
                    opacity: 0;
                }

                .tool-execution-panel.visible {
                    transform: translateY(0);
                    opacity: 1;
                }

                .tool-execution-list {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .tool-execution-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 8px 12px;
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 8px;
                    font-size: 0.85em;
                    transition: all 0.2s ease;
                }

                .tool-execution-item.running {
                    border-color: rgba(59, 130, 246, 0.3);
                    background: rgba(59, 130, 246, 0.08);
                }

                .tool-execution-item.completed {
                    border-color: rgba(34, 197, 94, 0.3);
                    background: rgba(34, 197, 94, 0.08);
                }

                .tool-execution-item.error {
                    border-color: rgba(239, 68, 68, 0.3);
                    background: rgba(239, 68, 68, 0.08);
                }

                .tool-icon {
                    width: 20px;
                    height: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 600;
                }

                .tool-icon.running {
                    background: rgba(59, 130, 246, 0.2);
                    color: #3b82f6;
                    animation: pulse 2s infinite;
                }

                .tool-icon.completed {
                    background: rgba(34, 197, 94, 0.2);
                    color: #22c55e;
                }

                .tool-icon.error {
                    background: rgba(239, 68, 68, 0.2);
                    color: #ef4444;
                }

                .tool-details {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .tool-name {
                    font-weight: 600;
                    color: rgba(255, 255, 255, 0.9);
                    font-size: 0.9em;
                }

                .tool-message {
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 0.8em;
                    line-height: 1.3;
                }

                .tool-duration {
                    color: rgba(255, 255, 255, 0.5);
                    font-size: 0.75em;
                    margin-left: auto;
                }

                @keyframes slideInFromLeft {
                    from {
                        opacity: 0;
                        transform: translateX(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }

                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.6; }
                }
            `;

            this.shadow.appendChild(style);
        }

        assembleSidebar() {
            this.sidebar.appendChild(this.header);
            this.sidebar.appendChild(this.toolExecutionPanel);
            this.sidebar.appendChild(this.messages);
            this.sidebar.appendChild(this.inputContainer);
            this.shadow.appendChild(this.sidebar);
        }

        attachEventListeners() {
            // Message input handling with event isolation
            this.messageInput.addEventListener('input', (e) => {
                e.stopPropagation();
                this.handleInput();
                this.updateSendButtonState();
            });
            
            // Add specific focus and click handling for textarea
            this.messageInput.addEventListener('click', (e) => {
                e.stopPropagation();
                this.messageInput.focus();
            });

            this.messageInput.addEventListener('focus', (e) => {
                e.stopPropagation();
                console.log('Enhanced textarea focused');
            });

            this.messageInput.addEventListener('blur', (e) => {
                console.log('Enhanced textarea blurred');
            });
            
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

            // Send button
            this.sendButton.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.sendButton.disabled) {
                    this.sendMessage();
                }
            });

            // Model selector with event isolation
            this.modelSelector.addEventListener('change', (e) => {
                e.stopPropagation();
                this.handleModelChange();
            });

            this.modelSelector.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            this.modelSelector.addEventListener('keydown', (e) => {
                e.stopPropagation();
            });

            // Window controls
            this.minimizeButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.minimizeSidebar();
            });
            
            this.closeButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeSidebar();
            });
            
            this.restoreButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.restoreSidebar();
            });

            // Drag functionality
            this.makeDraggable();

            // Listen for messages from background
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                try {
                    // Check if extension context is still valid
                    if (!chrome.runtime || !chrome.runtime.sendMessage) {
                        console.log('Extension context invalidated in message listener');
                        this.handleContextInvalidation();
                        sendResponse({ success: false, error: 'Extension context invalidated' });
                        return false;
                    }

                    switch (message.type) {
                        case 'SHOW_SIDEBAR_ONCE':
                            this.showSidebarForDomain(this.currentDomain);
                            sendResponse({ success: true });
                            break;
                        case 'TOGGLE_SIDEBAR':
                            this.toggleSidebar();
                            sendResponse({ success: true });
                            break;
                        default:
                            sendResponse({ success: false, error: 'Unknown message type' });
                    }
                } catch (error) {
                    console.error('Error handling message:', error);
                    if (error.message && error.message.includes('Extension context invalidated')) {
                        this.handleContextInvalidation();
                    }
                    sendResponse({ success: false, error: error.message });
                }
                return true;
            });

            // Handle window resize to maintain sidebar within viewport
            window.addEventListener('resize', () => this.constrainToViewport());

            // Prevent all keyboard events from bubbling to the page when sidebar is focused
            this.sidebar.addEventListener('keydown', (e) => {
                e.stopPropagation();
            });

            this.sidebar.addEventListener('keyup', (e) => {
                e.stopPropagation();
            });

            this.sidebar.addEventListener('keypress', (e) => {
                e.stopPropagation();
            });
        }

        makeDraggable() {
            let isDragging = false;
            let dragStartX, dragStartY, dragSidebarX, dragSidebarY;

            this.header.addEventListener('mousedown', (e) => {
                // Only start dragging if not clicking on input elements or buttons
                if (e.target.closest('button') || 
                    e.target.closest('select') || 
                    e.target.closest('.message-input') ||
                    e.target.closest('.model-selector')) {
                    return;
                }
                
                isDragging = true;
                dragStartX = e.clientX;
                dragStartY = e.clientY;
                const rect = this.sidebar.getBoundingClientRect();
                dragSidebarX = rect.left;
                dragSidebarY = rect.top;
                this.sidebar.style.transition = 'none';
                document.body.style.userSelect = 'none';
                this.sidebar.style.cursor = 'grabbing';
                e.preventDefault(); // Prevent text selection
            });

            document.addEventListener('mousemove', (e) => {
                if (isDragging) {
                    e.preventDefault();
                    let newX = dragSidebarX + (e.clientX - dragStartX);
                    let newY = dragSidebarY + (e.clientY - dragStartY);
                    
                    // Constrain to viewport
                    newX = Math.max(10, Math.min(window.innerWidth - this.sidebar.offsetWidth - 10, newX));
                    newY = Math.max(10, Math.min(window.innerHeight - this.sidebar.offsetHeight - 10, newY));
                    
                    this.sidebar.style.left = newX + 'px';
                    this.sidebar.style.top = newY + 'px';
                    this.sidebar.style.right = 'auto';
                    this.sidebar.style.bottom = 'auto';
                }
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    this.sidebar.style.transition = '';
                    this.sidebar.style.cursor = '';
                    document.body.style.userSelect = '';
                    this.savePosition();
                }
            });
        }

        constrainToViewport() {
            if (this.isMinimized || !this.isContextValid) return;
            
            const rect = this.sidebar.getBoundingClientRect();
            let newX = rect.left;
            let newY = rect.top;
            let changed = false;

            if (rect.right > window.innerWidth - 10) {
                newX = window.innerWidth - rect.width - 10;
                changed = true;
            }
            if (rect.bottom > window.innerHeight - 10) {
                newY = window.innerHeight - rect.height - 10;
                changed = true;
            }
            if (rect.left < 10) {
                newX = 10;
                changed = true;
            }
            if (rect.top < 10) {
                newY = 10;
                changed = true;
            }

            if (changed) {
                this.sidebar.style.left = newX + 'px';
                this.sidebar.style.top = newY + 'px';
                this.sidebar.style.right = 'auto';
                this.sidebar.style.bottom = 'auto';
                this.savePosition();
            }
        }

        minimizeSidebar() {
            console.log('Minimizing sidebar');
            
            // Hide the main sidebar
            this.sidebar.style.transform = 'translateX(100%)';
            this.sidebar.style.opacity = '0';
            
            setTimeout(() => {
                this.sidebar.style.display = 'none';
                
                // Show restore button with animation
                this.restoreButton.style.display = 'flex';
                this.restoreButton.style.transform = 'translateY(0)';
                this.restoreButton.style.opacity = '1';
                
                console.log('Sidebar minimized, restore button shown');
            }, 300);

            // Save minimized state for this domain
            if (this.isContextValid) {
                const domain = this.getCurrentDomain();
                safeChromeCaller(() => {
                    chrome.storage.local.set({ 
                        [`sidebarOpen_${domain}`]: false,
                        [`sidebarMinimized_${domain}`]: true 
                    });
                });
            }
        }

        restoreSidebar() {
            console.log('Restoring sidebar');
            
            // Hide restore button
            this.restoreButton.style.transform = 'translateY(100px)';
            this.restoreButton.style.opacity = '0';
            
            setTimeout(() => {
                this.restoreButton.style.display = 'none';
                
                // Show main sidebar
                this.sidebar.style.display = 'flex';
                
                // Trigger reflow
                this.sidebar.offsetHeight;
                
                // Animate in
                this.sidebar.style.transform = 'translateX(0)';
                this.sidebar.style.opacity = '1';
                
                // Focus the message input
                setTimeout(() => {
                    this.messageInput.focus();
                }, 100);
                
                console.log('Sidebar restored');
            }, 200);

            // Save restored state for this domain
            if (this.isContextValid) {
                const domain = this.getCurrentDomain();
                safeChromeCaller(() => {
                    chrome.storage.local.set({ 
                        [`sidebarOpen_${domain}`]: true,
                        [`sidebarMinimized_${domain}`]: false 
                    });
                });
            }
        }

        // Tool execution handlers with improved feedback
        handleToolStart(data) {
            console.log('Tool started:', data);
            this.showToolPanel();
            
            // Remove any existing indicators
            if (this.currentToolIndicator) {
                this.currentToolIndicator.remove();
            }
            
            // Add new execution item to panel
            this.addToolExecutionItem(data);
            
            // Add inline indicator
            const inlineIndicator = document.createElement('div');
            inlineIndicator.className = 'inline-tool-execution';
            inlineIndicator.id = `inline-${data.executionId}`;
            inlineIndicator.innerHTML = `
                <div class="spinner"></div>
                <span>${data.message || `Executing ${data.tool.displayTitle}...`}</span>
            `;
            this.messages.appendChild(inlineIndicator);
            this.scrollToBottom();
            this.currentToolIndicator = inlineIndicator;
        }

        handleToolProgress(data) {
            console.log('Tool progress:', data);
            this.updateToolExecutionItem(data);
            
            // Update inline indicator
            const indicator = this.shadow.getElementById(`inline-${data.executionId}`);
            if (indicator) {
                const span = indicator.querySelector('span');
                if (span) {
                    span.textContent = data.message || 'Processing...';
                }
            }
        }

        handleToolComplete(data) {
            console.log('Tool completed:', data);
            this.completeToolExecutionItem(data);
            
            // Update inline indicator
            const indicator = this.shadow.getElementById(`inline-${data.executionId}`);
            if (indicator) {
                indicator.innerHTML = `
                    <span style="color: #4ade80;">✓</span>
                    <span>${data.message || 'Completed successfully'}</span>
                `;
                
                // Remove after delay
                setTimeout(() => {
                    if (indicator && indicator.parentNode) {
                        indicator.remove();
                    }
                }, 2000);
            }
        }

        handleToolError(data) {
            console.log('Tool error:', data);
            this.errorToolExecutionItem(data);
            
            // Update inline indicator
            const indicator = this.shadow.getElementById(`inline-${data.executionId}`);
            if (indicator) {
                indicator.innerHTML = `
                    <span style="color: #f87171;">✗</span>
                    <span>${data.message || 'Execution failed'}</span>
                `;
                indicator.style.background = 'rgba(239, 68, 68, 0.08)';
                indicator.style.borderColor = 'rgba(239, 68, 68, 0.15)';
            }
        }

        handleExecutionStart(data) {
            console.log('Execution chain started:', data);
            this.showToolPanel();
            
            // Add chain indicator
            const chainIndicator = document.createElement('div');
            chainIndicator.className = 'inline-tool-execution';
            chainIndicator.innerHTML = `
                <div class="spinner"></div>
                <span>Starting tool execution chain (${data.toolCount} tools)...</span>
            `;
            this.messages.appendChild(chainIndicator);
            this.scrollToBottom();
        }

        handleExecutionComplete(data) {
            console.log('Execution chain completed:', data);
            
            // Hide tool panel after delay
            setTimeout(() => {
                this.hideToolPanel();
            }, 3000);
            
            // Add completion indicator
            const completionIndicator = document.createElement('div');
            completionIndicator.className = 'inline-tool-execution';
            completionIndicator.innerHTML = `
                <span style="color: #4ade80;">✓</span>
                <span>Tool execution completed. ${data.success ? 'All tools executed successfully.' : 'Some tools encountered errors.'}</span>
            `;
            this.messages.appendChild(completionIndicator);
            this.scrollToBottom();
            
            // Remove after delay
            setTimeout(() => {
                if (completionIndicator && completionIndicator.parentNode) {
                    completionIndicator.remove();
                }
            }, 3000);
        }

        showToolPanel() {
            if (this.toolExecutionPanel) {
                this.toolExecutionPanel.classList.add('visible');
                this.toolExecutionPanel.style.display = 'block';
                console.log('Tool panel shown');
            }
        }

        hideToolPanel() {
            if (this.toolExecutionPanel) {
                this.toolExecutionPanel.classList.remove('visible');
                // Keep it in DOM but hidden for smooth transitions
                setTimeout(() => {
                    if (!this.toolExecutionPanel.classList.contains('visible')) {
                        this.toolExecutionPanel.style.display = 'none';
                    }
                }, 300); // Match transition duration
                console.log('Tool panel hidden');
            }
        }

        addToolExecutionItem(data) {
            if (!this.toolExecutionList) return;
            
            const item = document.createElement('div');
            item.className = 'tool-execution-item running';
            item.id = `tool-${data.executionId}`;
            item.innerHTML = `
                <div class="tool-icon running">⚡</div>
                <div class="tool-details">
                    <div class="tool-name">${data.tool.displayTitle || data.tool.name}</div>
                    <div class="tool-message">${data.message || 'Starting execution...'}</div>
                </div>
            `;
            
            this.toolExecutionList.appendChild(item);
            console.log('Added tool execution item:', data.executionId);
        }

        updateToolExecutionItem(data) {
            const item = this.shadow.getElementById(`tool-${data.executionId}`);
            if (item) {
                const messageEl = item.querySelector('.tool-message');
                if (messageEl) {
                    messageEl.textContent = data.message || 'Processing...';
                }
                console.log('Updated tool execution item:', data.executionId);
            }
        }

        completeToolExecutionItem(data) {
            const item = this.shadow.getElementById(`tool-${data.executionId}`);
            if (item) {
                item.className = 'tool-execution-item completed';
                
                const icon = item.querySelector('.tool-icon');
                if (icon) {
                    icon.className = 'tool-icon completed';
                    icon.textContent = '✓';
                }
                
                const messageEl = item.querySelector('.tool-message');
                if (messageEl) {
                    messageEl.textContent = data.message || 'Completed successfully';
                }
                
                // Add duration if available
                if (data.duration) {
                    const durationEl = document.createElement('div');
                    durationEl.className = 'tool-duration';
                    durationEl.textContent = `${data.duration}ms`;
                    item.appendChild(durationEl);
                }
                
                console.log('Completed tool execution item:', data.executionId);
            }
        }

        errorToolExecutionItem(data) {
            const item = this.shadow.getElementById(`tool-${data.executionId}`);
            if (item) {
                item.className = 'tool-execution-item error';
                
                const icon = item.querySelector('.tool-icon');
                if (icon) {
                    icon.className = 'tool-icon error';
                    icon.textContent = '✗';
                }
                
                const messageEl = item.querySelector('.tool-message');
                if (messageEl) {
                    messageEl.textContent = data.message || 'Execution failed';
                }
                
                console.log('Error in tool execution item:', data.executionId);
            }
        }

        async sendMessage() {
            const message = this.messageInput.value.trim();
            if (!message || !this.modelSelector.value || this.isProcessing) {
                return;
            }

            // Check if extension context is still valid
            if (!this.isContextValid || !isExtensionContextValid()) {
                this.handleContextInvalidation();
                return;
            }

            this.isProcessing = true;
            this.setUIState(false);

            // Add user message
            this.addMessage(message, 'user');
            this.messageInput.value = '';
            this.handleInput();

            try {
                // Check if message requires tool execution
                const needsTools = this.analyzeMessageForTools(message);
                
                if (needsTools && this.orchestrator) {
                    // Execute tools first, then get AI response
                    await this.executeToolsForMessage(message);
                }

                // Create AI response message
                const assistantMessage = this.addMessage('', 'assistant');
                let responseContent = '';

                // Create streaming connection with error handling
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
                
                port.onMessage.addListener((response) => {
                    try {
                        if (response.error) {
                            const errorMsg = `Error: ${response.error}`;
                            assistantMessage.querySelector('.message-content').innerHTML = this.formatMessageContent(errorMsg);
                            assistantMessage.classList.add('error');
                            port.disconnect();
                            this.setUIState(true);
                            this.isProcessing = false;
                            return;
                        }

                        if (response.type === 'delta' && response.content) {
                            responseContent += response.content;
                            const contentDiv = assistantMessage.querySelector('.message-content');
                            contentDiv.innerHTML = this.formatMessageContent(responseContent);
                            this.scrollToBottom();
                        }

                        if (response.done) {
                            port.disconnect();
                            this.setUIState(true);
                            this.isProcessing = false;
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
                    
                    this.setUIState(true);
                    this.isProcessing = false;
                });

                // Send message with enhanced system prompt
                try {
                    port.postMessage({
                        type: 'PROCESS_MESSAGE',
                        message: message,
                        modelId: this.modelSelector.value,
                        pageContent: this.getPageContent(),
                        pageUrl: window.location.href,
                        pageTitle: document.title
                    });
                } catch (error) {
                    if (error.message && error.message.includes('Extension context invalidated')) {
                        this.handleContextInvalidation();
                        return;
                    }
                    throw error;
                }

            } catch (error) {
                console.error('Error in sendMessage:', error);
                if (error.message && error.message.includes('Extension context invalidated')) {
                    this.handleContextInvalidation();
                } else {
                    const errorMsg = `Error: ${error.message}`;
                    this.addMessage(errorMsg, 'assistant', true);
                    this.setUIState(true);
                    this.isProcessing = false;
                }
            }
        }

        analyzeMessageForTools(message) {
            const toolKeywords = [
                'search', 'find', 'look up', 'news', 'information',
                'open', 'navigate', 'go to', 'visit',
                'analyze', 'extract', 'get content', 'read page'
            ];
            
            const lowerMessage = message.toLowerCase();
            return toolKeywords.some(keyword => lowerMessage.includes(keyword));
        }

        async executeToolsForMessage(message) {
            if (!this.orchestrator) {
                console.log('Orchestrator not available');
                return;
            }

            try {
                // Show tool execution panel
                this.showToolPanel();
                
                // Determine which tools to execute based on message
                const toolCalls = this.planToolExecution(message);
                
                if (toolCalls.length > 0) {
                    console.log('Executing tools:', toolCalls);
                    
                    // Add a visual indicator that tools are being executed
                    this.addToolExecutionIndicator('Analyzing request and preparing tools...');
                    
                    // Execute tools with the orchestrator
                    const results = await this.orchestrator.executeToolChain(toolCalls);
                    console.log('Tool execution results:', results);
                    
                    // Hide the panel after a delay
                    setTimeout(() => {
                        this.hideToolPanel();
                    }, 3000);
                    
                    return results;
                }
            } catch (error) {
                console.error('Error executing tools:', error);
                this.addToolExecutionError(`Tool execution failed: ${error.message}`);
            }
        }

        planToolExecution(message) {
            const lowerMessage = message.toLowerCase();
            const toolCalls = [];

            // Check for search-related requests
            if (lowerMessage.includes('news') || lowerMessage.includes('search') || lowerMessage.includes('find')) {
                // Extract search query
                let query = message;
                if (lowerMessage.includes('news about') || lowerMessage.includes('news of')) {
                    query = message.replace(/.*news (about|of)\s*/i, '');
                } else if (lowerMessage.includes('search for')) {
                    query = message.replace(/.*search for\s*/i, '');
                }
                
                toolCalls.push({
                    tool: 'searchWeb',
                    args: { query: query.trim() }
                });
            }

            // Check for page analysis requests
            if (lowerMessage.includes('analyze') || lowerMessage.includes('content') || lowerMessage.includes('page')) {
                toolCalls.push({
                    tool: 'getPageContent',
                    args: {}
                });
            }

            return toolCalls;
        }

        addMessage(text, type, isError = false) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${type}-message${isError ? ' error' : ''}`;
            
            // Create content container
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            
            // Process markdown and format text
            const formattedText = this.formatMessageContent(text);
            contentDiv.innerHTML = formattedText;
            
            messageDiv.appendChild(contentDiv);
            
            // Add timestamp
            const timestamp = document.createElement('div');
            timestamp.className = 'message-timestamp';
            timestamp.textContent = new Date().toLocaleTimeString();
            messageDiv.appendChild(timestamp);
            
            this.messages.appendChild(messageDiv);
            this.scrollToBottom();
            return messageDiv;
        }

        formatMessageContent(text) {
            if (!text) return '';
            
            // Convert markdown-like formatting to HTML
            let formatted = text
                // Convert **bold** to <strong>
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                // Convert *italic* to <em>
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                // Convert ### headers to h3
                .replace(/^### (.*$)/gm, '<h3>$1</h3>')
                // Convert ## headers to h2
                .replace(/^## (.*$)/gm, '<h2>$1</h2>')
                // Convert # headers to h1
                .replace(/^# (.*$)/gm, '<h1>$1</h1>')
                // Convert - list items to ul/li
                .replace(/^- (.*$)/gm, '<li>$1</li>')
                // Convert numbered lists
                .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
                // Convert newlines to <br>
                .replace(/\n/g, '<br>')
                // Convert code blocks ```
                .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
                // Convert inline code `
                .replace(/`([^`]+)`/g, '<code>$1</code>');
            
            // Wrap consecutive <li> elements in <ul>
            formatted = formatted.replace(/(<li>.*?<\/li>)(\s*<li>.*?<\/li>)*/g, (match) => {
                return '<ul>' + match + '</ul>';
            });
            
            return formatted;
        }

        handleInput() {
            // Auto-resize textarea
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
            
            // Update send button state
            this.updateSendButtonState();
        }

        handleModelChange() {
            const selectedModel = this.modelSelector.value;
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

        setUIState(enabled) {
            this.messageInput.disabled = !enabled;
            this.sendButton.disabled = !enabled;
            this.modelSelector.disabled = !enabled;
            
            if (enabled) {
                this.handleInput();
                this.messageInput.focus();
            }
        }

        scrollToBottom() {
            requestAnimationFrame(() => {
                this.messages.scrollTop = this.messages.scrollHeight;
            });
        }

        getPageContent() {
            // Simple content extraction
            return document.body.textContent.substring(0, 10000);
        }

        async loadConfig() {
            if (!this.isContextValid) {
                console.log('Context invalid, skipping config load');
                return;
            }
            
            try {
                const response = await safeChromeCaller(() => {
                    return chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
                });
                
                if (response && (response.AzureOpenAi || response.ClaudeAi)) {
                    this.updateModelSelector(response);
                    console.log('Configuration loaded successfully');
                } else {
                    console.warn('No AI models found in configuration');
                }
            } catch (error) {
                console.error('Error loading configuration:', error);
                if (error.message && error.message.includes('Extension context invalidated')) {
                    this.handleContextInvalidation();
                } else {
                    console.warn('Failed to load configuration');
                }
            }
        }

        updateModelSelector(config) {
            // Clear existing options
            this.modelSelector.innerHTML = '';
            
            let firstModelId = null;
            let modelCount = 0;

            // Add Azure OpenAI models
            if (config.AzureOpenAi) {
                Object.entries(config.AzureOpenAi).forEach(([modelId, models]) => {
                    if (Array.isArray(models) && models.length > 0) {
                        const model = models[0];
                        const option = document.createElement('option');
                        option.value = modelId;
                        option.textContent = `Azure: ${model.ModelName || modelId}`;
                        option.style.cssText = `
                            background: rgba(24, 24, 27, 0.95);
                            color: rgba(255, 255, 255, 0.9);
                            padding: 8px;
                        `;
                        this.modelSelector.appendChild(option);
                        
                        if (!firstModelId) {
                            firstModelId = modelId;
                        }
                        modelCount++;
                    }
                });
            }

            // Add Claude AI models
            if (config.ClaudeAi) {
                Object.entries(config.ClaudeAi).forEach(([modelId, models]) => {
                    if (Array.isArray(models) && models.length > 0) {
                        const model = models[0];
                        const option = document.createElement('option');
                        option.value = modelId;
                        option.textContent = `Claude: ${model.ModelName || modelId}`;
                        option.style.cssText = `
                            background: rgba(24, 24, 27, 0.95);
                            color: rgba(255, 255, 255, 0.9);
                            padding: 8px;
                        `;
                        this.modelSelector.appendChild(option);
                        
                        if (!firstModelId) {
                            firstModelId = modelId;
                        }
                        modelCount++;
                    }
                });
            }

            // Auto-select first model if available
            if (firstModelId && modelCount > 0) {
                this.modelSelector.value = firstModelId;
                this.handleModelChange();
                console.log(`Auto-selected first model: ${firstModelId}`);
            }

            // Add placeholder if no models
            if (modelCount === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'No models available';
                option.disabled = true;
                this.modelSelector.appendChild(option);
            }

            console.log(`Updated model selector with ${modelCount} models`);
        }

        showSidebarForDomain(domain) {
            console.log('Showing sidebar for domain:', domain);
            
            // Update current domain
            this.currentDomain = domain;
            
            // Check if sidebar was minimized for this domain
            safeChromeCaller(() => {
                chrome.storage.local.get([`sidebarMinimized_${domain}`], (result) => {
                    const wasMinimized = result[`sidebarMinimized_${domain}`] || false;
                    
                    if (wasMinimized) {
                        // Show restore button instead of full sidebar
                        this.restoreButton.style.display = 'flex';
                        this.restoreButton.style.transform = 'translateY(0)';
                        this.restoreButton.style.opacity = '1';
                        this.sidebar.style.display = 'none';
                        console.log('Sidebar was minimized for this domain, showing restore button');
                    } else {
                        // Show full sidebar
                        this.restoreButton.style.display = 'none';
                        this.sidebar.style.display = 'flex';
                        this.sidebar.style.transform = 'translateX(0)';
                        this.sidebar.style.opacity = '1';
                        
                        // Focus the message input after a short delay
                        setTimeout(() => {
                            if (this.messageInput) {
                                this.messageInput.focus();
                            }
                        }, 100);
                        
                        console.log('Showing full sidebar for domain');
                    }
                    
                    // Mark as open for this domain
                    chrome.storage.local.set({ [`sidebarOpen_${domain}`]: true });
                });
            });
        }

        toggleSidebar() {
            if (this.isMinimized) {
                this.restoreSidebar();
            } else if (this.isOpen) {
                this.minimizeSidebar();
            } else {
                this.showSidebarForDomain(this.currentDomain);
            }
        }

        closeSidebar() {
            console.log('Closing sidebar');
            
            // Hide both sidebar and restore button
            this.sidebar.style.transform = 'translateX(100%)';
            this.sidebar.style.opacity = '0';
            this.restoreButton.style.display = 'none';
            
            setTimeout(() => {
                this.sidebar.style.display = 'none';
            }, 300);

            // Save closed state for this domain
            const domain = this.getCurrentDomain();
            safeChromeCaller(() => {
                chrome.storage.local.set({ 
                    [`sidebarOpen_${domain}`]: false,
                    [`sidebarMinimized_${domain}`]: false 
                });
            });
        }

        showSidebarOnce() {
            // Use domain-based showing instead
            this.showSidebarForDomain(this.currentDomain);
        }

        savePosition() {
            if (!this.isContextValid) {
                console.log('Context invalid, skipping position save');
                return;
            }
            
            safeChromeCaller(() => {
                const rect = this.sidebar.getBoundingClientRect();
                chrome.storage.local.set({
                    [`sidebarPosition_${this.currentDomain}`]: {
                        left: rect.left,
                        top: rect.top,
                        width: rect.width,
                        height: rect.height
                    }
                });
            });
        }

        loadPosition() {
            safeChromeCaller(() => {
                const domain = this.getCurrentDomain();
                chrome.storage.local.get([`sidebarPosition_${domain}`], (result) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error loading position:', chrome.runtime.lastError);
                        return;
                    }
                    
                    const position = result[`sidebarPosition_${domain}`];
                    if (position) {
                        this.sidebar.style.left = position.left + 'px';
                        this.sidebar.style.top = position.top + 'px';
                        this.sidebar.style.width = position.width + 'px';
                        this.sidebar.style.height = position.height + 'px';
                    }
                });
            });
        }

        loadSidebarState() {
            safeChromeCaller(() => {
                const domain = this.getCurrentDomain();
                chrome.storage.local.get([`sidebarOpen_${domain}`, `sidebarMinimized_${domain}`], (result) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error loading sidebar state:', chrome.runtime.lastError);
                        return;
                    }
                    
                    const isOpen = result[`sidebarOpen_${domain}`] !== false;
                    const isMinimized = result[`sidebarMinimized_${domain}`] || false;
                    
                    if (!isOpen || isMinimized) {
                        this.sidebar.style.display = 'none';
                        this.restoreButton.style.display = 'flex';
                    } else {
                        this.sidebar.style.display = 'flex';
                        this.restoreButton.style.display = 'none';
                    }
                });
            });
        }

        addToolExecutionIndicator(message) {
            // Add to tool panel
            const indicator = document.createElement('div');
            indicator.className = 'tool-execution-item running';
            indicator.innerHTML = `
                <div class="tool-icon running">⚡</div>
                <div class="tool-details">
                    <div class="tool-name">Tool Execution</div>
                    <div class="tool-message">${message}</div>
                </div>
            `;
            this.toolExecutionList.appendChild(indicator);

            // Add inline indicator to chat
            const inlineIndicator = document.createElement('div');
            inlineIndicator.className = 'inline-tool-execution';
            inlineIndicator.innerHTML = `
                <div class="spinner"></div>
                <span>${message}</span>
            `;
            this.messages.appendChild(inlineIndicator);
            this.scrollToBottom();

            // Store reference for cleanup
            this.currentToolIndicator = inlineIndicator;
        }

        addToolExecutionError(message) {
            if (this.currentToolIndicator) {
                this.currentToolIndicator.innerHTML = `
                    <span style="color: #f87171;">✗</span>
                    <span>${message}</span>
                `;
                this.currentToolIndicator.style.background = 'rgba(239, 68, 68, 0.08)';
                this.currentToolIndicator.style.borderColor = 'rgba(239, 68, 68, 0.15)';
            }
        }

        handleContextInvalidation() {
            console.log('Extension context invalidated - cleaning up enhanced sidebar');
            
            // Set context as invalid to prevent further operations
            this.isContextValid = false;
            
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

        showNotification(message) {
            // Create a simple notification that doesn't rely on chrome APIs
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(255, 59, 48, 0.9);
                color: white;
                padding: 16px 20px;
                border-radius: 12px;
                font-size: 14px;
                font-weight: 500;
                z-index: 10001;
                max-width: 300px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.1);
            `;
            notification.textContent = message;
            
            document.body.appendChild(notification);
            
            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 5000);
        }
    }

    // Initialize the enhanced sidebar only if context is valid
    if (isExtensionContextValid()) {
        window.xatBrowserEnhancedSidebar = new EnhancedSidebarUI();

        // Notify background script safely
        safeChromeCaller(() => {
            chrome.runtime.sendMessage({ type: 'SIDEBAR_READY' });
        });
    } else {
        console.warn('Extension context invalid, skipping sidebar initialization');
    }
}

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
            if (window.xatBrowserEnhancedSidebar && 
                typeof window.xatBrowserEnhancedSidebar.handleContextInvalidation === 'function' &&
                window.xatBrowserEnhancedSidebar.isContextValid) {
                window.xatBrowserEnhancedSidebar.handleContextInvalidation();
            }
        }
        return fallback;
    }
} 