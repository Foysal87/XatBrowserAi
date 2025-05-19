class SidebarUI {
    constructor() {
        this.initializeElements();
        this.attachEventListeners();
        this.loadConfig();
        this.isOpen = false;
    }

    initializeElements() {
        // Create sidebar container
        this.sidebar = document.createElement('div');
        this.sidebar.className = 'xatbrowser-sidebar';
        this.sidebar.style.cssText = `
            position: fixed;
            top: 0;
            right: -400px;
            width: 400px;
            height: 100vh;
            background: white;
            box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
            z-index: 10000;
            transition: right 0.3s ease;
            display: flex;
            flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        // Create header
        this.header = document.createElement('div');
        this.header.className = 'sidebar-header';
        this.header.style.cssText = `
            padding: 16px;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: #f8f9fa;
        `;

        // Create title
        this.title = document.createElement('h2');
        this.title.textContent = 'XatBrowser AI';
        this.title.style.cssText = `
            margin: 0;
            color: #007AFF;
            font-size: 1.2em;
        `;

        // Create model selector
        this.modelSelector = document.createElement('select');
        this.modelSelector.className = 'model-selector';
        this.modelSelector.style.cssText = `
            padding: 6px 12px;
            border-radius: 4px;
            border: 1px solid #ccc;
            font-size: 0.9em;
            background-color: white;
        `;

        // Create status indicator
        this.statusIndicator = document.createElement('div');
        this.statusIndicator.className = 'status-indicator';
        this.statusIndicator.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.8em;
            color: #666;
            padding: 8px 16px;
            background-color: #f8f9fa;
            border-bottom: 1px solid #e0e0e0;
        `;

        this.statusDot = document.createElement('div');
        this.statusDot.className = 'status-dot';
        this.statusDot.style.cssText = `
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: #ccc;
        `;

        this.statusText = document.createElement('span');
        this.statusText.textContent = 'Select a model to begin';

        // Create chat container
        this.chatContainer = document.createElement('div');
        this.chatContainer.className = 'chat-container';
        this.chatContainer.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

        // Create messages container
        this.messages = document.createElement('div');
        this.messages.className = 'messages';
        this.messages.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        `;

        // Create input container
        this.inputContainer = document.createElement('div');
        this.inputContainer.className = 'input-container';
        this.inputContainer.style.cssText = `
            padding: 12px;
            border-top: 1px solid #e0e0e0;
            background-color: white;
            display: flex;
            gap: 8px;
        `;

        // Create message input
        this.messageInput = document.createElement('textarea');
        this.messageInput.className = 'message-input';
        this.messageInput.placeholder = 'Ask me to do something...';
        this.messageInput.style.cssText = `
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #ccc;
            border-radius: 20px;
            outline: none;
            font-size: 0.9em;
            resize: none;
            min-height: 20px;
            max-height: 100px;
            overflow-y: auto;
        `;

        // Create send button
        this.sendButton = document.createElement('button');
        this.sendButton.className = 'send-button';
        this.sendButton.textContent = 'Send';
        this.sendButton.disabled = true;
        this.sendButton.style.cssText = `
            padding: 8px 16px;
            background-color: #007AFF;
            color: white;
            border: none;
            border-radius: 20px;
            cursor: pointer;
            font-size: 0.9em;
        `;

        // Create toggle button
        this.toggleButton = document.createElement('button');
        this.toggleButton.className = 'toggle-button';
        this.toggleButton.textContent = '≡';
        this.toggleButton.title = 'Toggle Sidebar';
        this.toggleButton.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 40px;
            height: 40px;
            background-color: #007AFF;
            color: white;
            border: none;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            z-index: 10000;
            transition: transform 0.3s ease;
        `;

        // Assemble the sidebar
        this.header.appendChild(this.title);
        this.header.appendChild(this.modelSelector);
        this.statusIndicator.appendChild(this.statusDot);
        this.statusIndicator.appendChild(this.statusText);
        this.inputContainer.appendChild(this.messageInput);
        this.inputContainer.appendChild(this.sendButton);
        this.chatContainer.appendChild(this.messages);
        this.chatContainer.appendChild(this.inputContainer);
        this.sidebar.appendChild(this.header);
        this.sidebar.appendChild(this.statusIndicator);
        this.sidebar.appendChild(this.chatContainer);
        document.body.appendChild(this.sidebar);
        document.body.appendChild(this.toggleButton);

        // Add styles for messages
        const style = document.createElement('style');
        style.textContent = `
            .message {
                max-width: 85%;
                padding: 8px 12px;
                border-radius: 12px;
                margin: 4px 0;
                font-size: 0.9em;
                line-height: 1.4;
            }
            .user-message {
                align-self: flex-end;
                background-color: #007AFF;
                color: white;
            }
            .assistant-message {
                align-self: flex-start;
                background-color: #f0f0f0;
                color: #333;
            }
            .typing-indicator {
                display: none;
                padding: 8px 12px;
                background-color: #f0f0f0;
                border-radius: 12px;
                align-self: flex-start;
                margin: 4px 0;
            }
            .typing-indicator.active {
                display: flex;
                gap: 4px;
            }
            .typing-dot {
                width: 8px;
                height: 8px;
                background-color: #999;
                border-radius: 50%;
                animation: typing 1s infinite ease-in-out;
            }
            .typing-dot:nth-child(2) { animation-delay: 0.2s; }
            .typing-dot:nth-child(3) { animation-delay: 0.4s; }
            @keyframes typing {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-4px); }
            }
        `;
        document.head.appendChild(style);
    }

    attachEventListeners() {
        this.toggleButton.addEventListener('click', () => this.toggleSidebar());
        this.messageInput.addEventListener('input', () => this.handleInput());
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.modelSelector.addEventListener('change', () => this.handleModelChange());

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

        // Add settings button to header
        const settingsButton = document.createElement('button');
        settingsButton.className = 'settings-button';
        settingsButton.innerHTML = '⚙️';
        settingsButton.title = 'Open Settings';
        settingsButton.style.cssText = `
            background: none;
            border: none;
            font-size: 1.2em;
            cursor: pointer;
            padding: 4px 8px;
            margin-left: 8px;
            color: #666;
            transition: color 0.2s ease;
        `;
        settingsButton.addEventListener('mouseover', () => {
            settingsButton.style.color = '#007AFF';
        });
        settingsButton.addEventListener('mouseout', () => {
            settingsButton.style.color = '#666';
        });
        settingsButton.addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
        });
        this.header.appendChild(settingsButton);
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
        if (!message || !this.modelSelector.value) return;

        // Add user message to chat
        this.addMessage(message, 'user');
        this.messageInput.value = '';
        this.messageInput.style.height = 'auto';
        this.sendButton.disabled = true;

        // Show typing indicator
        this.showTypingIndicator();

        try {
            // Send message to background script for processing
            const response = await this.sendMessageToBackground({
                type: 'PROCESS_MESSAGE',
                message,
                modelId: this.modelSelector.value
            });

            // Hide typing indicator
            this.hideTypingIndicator();

            // Add assistant's response to chat
            if (response.error) {
                this.addMessage(`Error: ${response.error}`, 'assistant');
            } else {
                this.addMessage(response.message, 'assistant');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.hideTypingIndicator();
            this.addMessage('Error: Failed to process message', 'assistant');
        }

        this.sendButton.disabled = false;
    }

    addMessage(text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;
        messageDiv.textContent = text;
        this.messages.appendChild(messageDiv);
        this.messages.scrollTop = this.messages.scrollHeight;
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
        this.isOpen = !this.isOpen;
        this.sidebar.style.right = this.isOpen ? '0' : '-400px';
        this.toggleButton.style.transform = this.isOpen ? 'translateX(-320px)' : 'translateX(0)';
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
}

// Initialize the sidebar when the script is injected
const sidebar = new SidebarUI();

// Notify the background script that the sidebar is ready
chrome.runtime.sendMessage({ type: 'SIDEBAR_READY' }); 