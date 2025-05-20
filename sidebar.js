class SidebarUI {
    constructor() {
        this.isOpen = true;
        this.initializeElements();
        this.attachEventListeners();
        this.loadConfig();
        
        // Show the sidebar initially
        this.sidebar.style.display = 'flex';
        this.sidebar.style.opacity = '1';
        
        // Add to document body if not already added
        if (!document.body.contains(this.sidebar)) {
            document.body.appendChild(this.sidebar);
        }
    }

    initializeElements() {
        // Create sidebar container
        this.sidebar = document.createElement('div');
        this.sidebar.className = 'xatbrowser-sidebar';
        this.sidebar.style.cssText = 'position: fixed; top: 20px; right: 20px; width: 400px; height: 600px; background: #1a1a1a; border-radius: 12px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); z-index: 10000; display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #ffffff; border: 1px solid #333; overflow: hidden;';

        // Create drag handle
        this.dragHandle = document.createElement('div');
        this.dragHandle.className = 'sidebar-drag-handle';
        this.dragHandle.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; height: 40px; background: #2a2a2a; border-radius: 12px 12px 0 0; cursor: move; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; border-bottom: 1px solid #333; z-index: 2;';

        // Create title
        this.title = document.createElement('h2');
        this.title.textContent = 'XatBrowser AI';
        this.title.style.cssText = 'margin: 0; color: #fff; font-size: 1.2em; font-weight: 500;';

        // Create close button
        this.closeButton = document.createElement('button');
        this.closeButton.className = 'sidebar-close-button';
        this.closeButton.innerHTML = '×';
        this.closeButton.style.cssText = 'background: none; border: none; color: #fff; font-size: 24px; cursor: pointer; padding: 4px 8px; border-radius: 4px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;';

        // Create model selector
        this.modelSelector = document.createElement('select');
        this.modelSelector.className = 'model-selector';
        this.modelSelector.style.cssText = 'padding: 8px 12px; border-radius: 6px; border: 1px solid #444; background-color: #333; color: #fff; cursor: pointer; min-width: 200px; height: 36px; margin-left: auto;';

        // Create status indicator
        this.statusIndicator = document.createElement('div');
        this.statusIndicator.className = 'status-indicator';
        this.statusIndicator.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 12px 16px; background-color: #2a2a2a; border-bottom: 1px solid #333; margin-top: 40px;';

        // Create status dot
        this.statusDot = document.createElement('div');
        this.statusDot.className = 'status-dot';
        this.statusDot.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; background-color: #ccc;';

        // Create status text
        this.statusText = document.createElement('span');
        this.statusText.className = 'status-text';
        this.statusText.textContent = 'Select a model to begin';

        // Create messages container
        this.messages = document.createElement('div');
        this.messages.className = 'messages';
        this.messages.style.cssText = 'flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; background-color: #1a1a1a;';

        // Create input container
        this.inputContainer = document.createElement('div');
        this.inputContainer.className = 'input-container';
        this.inputContainer.style.cssText = 'padding: 16px; background-color: #2a2a2a; border-top: 1px solid #333; display: flex; gap: 8px;';

        // Create message input
        this.messageInput = document.createElement('textarea');
        this.messageInput.className = 'message-input';
        this.messageInput.placeholder = 'Ask me something...';
        this.messageInput.style.cssText = 'flex: 1; padding: 12px; border: 1px solid #444; border-radius: 8px; outline: none; font-size: 0.9em; resize: none; min-height: 24px; max-height: 120px; background-color: #333; color: #fff;';

        // Create send button
        this.sendButton = document.createElement('button');
        this.sendButton.className = 'send-button';
        this.sendButton.textContent = 'Send';
        this.sendButton.style.cssText = 'padding: 8px 16px; background-color: #007AFF; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 0.9em; display: flex; align-items: center; gap: 6px;';

        // Create resize handle
        this.resizeHandle = document.createElement('div');
        this.resizeHandle.className = 'sidebar-resize-handle';
        this.resizeHandle.style.cssText = 'position: absolute; bottom: 0; right: 0; width: 20px; height: 20px; cursor: se-resize; background: linear-gradient(135deg, transparent 50%, #333 50%); z-index: 2;';

        // Assemble the sidebar
        this.sidebar.innerHTML = ''; // Clear any existing content

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
        this.sidebar.appendChild(this.resizeHandle);

        // Add global styles
        const style = document.createElement('style');
        style.textContent = `
            .xatbrowser-sidebar { position: fixed; top: 20px; right: 20px; width: 400px; height: 600px; background: #1a1a1a; border-radius: 12px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); z-index: 10000; display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #ffffff; border: 1px solid #333; overflow: hidden; }
            .sidebar-drag-handle { position: absolute; top: 0; left: 0; right: 0; height: 40px; background: #2a2a2a; border-radius: 12px 12px 0 0; cursor: move; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; border-bottom: 1px solid #333; z-index: 2; user-select: none; }
            .status-indicator { margin-top: 40px; padding: 12px 16px; background: #2a2a2a; border-bottom: 1px solid #333; display: flex; align-items: center; gap: 8px; }
            .messages { flex: 1; overflow-y: auto; padding: 16px; background: #1a1a1a; display: flex; flex-direction: column; gap: 8px; }
            .input-container { padding: 16px; background: #2a2a2a; border-top: 1px solid #333; display: flex; gap: 8px; }
            .model-selector { padding: 8px 12px; border-radius: 6px; border: 1px solid #444; background: #333; color: #fff; cursor: pointer; min-width: 200px; }
            .message-input { flex: 1; padding: 12px; border: 1px solid #444; border-radius: 8px; background: #333; color: #fff; resize: none; min-height: 24px; max-height: 120px; }
            .send-button { padding: 8px 16px; background: #007AFF; color: white; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
            .send-button:disabled { opacity: 0.5; cursor: not-allowed; }
            .message { max-width: 85%; padding: 12px 16px; border-radius: 12px; margin: 8px 0; font-size: 0.9em; line-height: 1.4; position: relative; animation: messageSlide 0.3s ease; word-wrap: break-word; }
            .user-message { align-self: flex-end; background-color: #007AFF; color: white; margin-left: auto; border-bottom-right-radius: 4px; }
            .assistant-message { align-self: flex-start; background-color: #333; color: #fff; margin-right: auto; border-bottom-left-radius: 4px; }
            .message.error { background-color: #ff4444; color: white; }
            .message-content { margin-bottom: 4px; }
            .message-timestamp { font-size: 0.75em; color: rgba(255, 255, 255, 0.6); margin-top: 4px; text-align: right; }
            @keyframes messageSlide { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        `;
        document.head.appendChild(style);
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

        // Add drag functionality
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;

        const dragStart = (e) => {
            if (e.target.closest('.sidebar-drag-handle')) {
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;
                isDragging = true;
            }
        };

        const drag = (e) => {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;

                xOffset = currentX;
                yOffset = currentY;

                this.sidebar.style.transform = `translate(${currentX}px, ${currentY}px)`;
            }
        };

        const dragEnd = () => {
            isDragging = false;
        };

        this.dragHandle.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        // Add resize functionality
        let isResizing = false;
        let originalWidth;
        let originalHeight;
        let originalX;
        let originalY;

        const initResize = (e) => {
            if (e.target === this.resizeHandle) {
                isResizing = true;
                originalWidth = this.sidebar.offsetWidth;
                originalHeight = this.sidebar.offsetHeight;
                originalX = e.clientX;
                originalY = e.clientY;
            }
        };

        const resize = (e) => {
            if (isResizing) {
                const width = Math.max(300, originalWidth + (e.clientX - originalX));
                const height = Math.max(400, originalHeight + (e.clientY - originalY));
                
                this.sidebar.style.width = `${width}px`;
                this.sidebar.style.height = `${height}px`;
            }
        };

        const stopResize = () => {
            isResizing = false;
        };

        this.resizeHandle.addEventListener('mousedown', initResize);
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
        });

        // Add window resize functionality
        window.addEventListener('resize', () => {
            // Ensure sidebar stays within viewport
            const rect = this.sidebar.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                this.sidebar.style.right = '20px';
                this.sidebar.style.transform = 'none';
                xOffset = 0;
                yOffset = 0;
            }
            if (rect.bottom > window.innerHeight) {
                this.sidebar.style.height = `${window.innerHeight - 40}px`;
            }
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
        
        if (config.AzureOpenAi) {
            Object.keys(config.AzureOpenAi).forEach(modelId => {
                const option = document.createElement('option');
                option.value = modelId;
                option.textContent = `Azure: ${modelId}`;
                this.modelSelector.appendChild(option);
            });
        }

        if (config.ClaudeAi) {
            Object.keys(config.ClaudeAi).forEach(modelId => {
                const option = document.createElement('option');
                option.value = modelId;
                option.textContent = `Claude: ${modelId}`;
                this.modelSelector.appendChild(option);
            });
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

            // Send message to background script
            const response = await this.sendMessageToBackground({
                type: 'PROCESS_MESSAGE',
                message: message,
                modelId: this.modelSelector.value
            });

            // Hide typing indicator
            this.hideTypingIndicator();

            // Add assistant's response to chat
            if (response.error) {
                this.addMessage(`Error: ${response.error}`, 'assistant', true);
                this.showNotification('Error: ' + response.error);
            } else if (typeof response.message === 'string') {
                this.addMessage(response.message, 'assistant');
            } else if (response.message && typeof response.message === 'object') {
                // Handle object response
                const messageText = response.message.content || 
                                  response.message.text || 
                                  JSON.stringify(response.message, null, 2);
                this.addMessage(messageText, 'assistant');
            } else {
                this.addMessage('Received invalid response format', 'assistant', true);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.hideTypingIndicator();
            this.addMessage(`Error: ${error.message}`, 'assistant', true);
            this.showNotification('Error: ' + error.message);
        } finally {
            // Re-enable input and button
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
        const indicator = document.getElementById('typingIndicator');
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
    }

    showNotification(message) {
        // Remove any existing notification
        const existingNotification = document.querySelector('.notification');
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
        document.head.appendChild(style);

        document.body.appendChild(notification);

        // Remove notification after 3 seconds with animation
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
    }
}

// Initialize the sidebar when the script is injected
const sidebar = new SidebarUI();

// Notify the background script that the sidebar is ready
chrome.runtime.sendMessage({ type: 'SIDEBAR_READY' }); 