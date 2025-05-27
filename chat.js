class ChatUI {
    constructor() {
        this.currentMessage = null;
        this.currentThread = 'default';
        this.threads = new Map();
        this.threads.set('default', {
            messages: [],
            title: 'Current Chat'
        });
        this.isProcessing = false;
        this.currentContent = '';

        // Initialize UI elements
        this.initializeElements();
        this.initializeEventListeners();
        this.initializeLogging();
        this.loadThreads();
        
        // Show privacy info
        this.showPrivacyInfo();
        
        // Load configuration and models
        this.loadConfig().catch(error => {
            this.log(this.logLevels.ERROR, 'Failed to load configuration', { error: error.message });
            this.showNotification('Error loading configuration. Please check your settings.');
        });
    }

    initializeElements() {
        this.modelSelector = document.getElementById('modelSelector');
        this.settingsButton = document.getElementById('settingsButton');
        this.fullscreenButton = document.getElementById('fullscreenButton');
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.messagesContainer = document.getElementById('messages');

        // New elements
        this.threadList = document.querySelector('.thread-list');
        this.newThreadBtn = document.querySelector('.new-thread-btn');
        this.logContent = document.getElementById('logContent');
        this.logToggle = document.querySelector('.log-toggle');

        // Enable send button if model is selected
        this.handleModelChange();
    }

    initializeEventListeners() {
        this.modelSelector.addEventListener('change', () => this.handleModelChange());
        this.settingsButton.addEventListener('click', () => this.openSettings());
        this.fullscreenButton.addEventListener('click', () => this.toggleFullscreen());
        this.messageInput.addEventListener('input', () => {
            const hasText = this.messageInput.value.trim().length > 0;
            const hasModel = this.modelSelector.value !== '';
            this.sendButton.disabled = !hasText || !hasModel;
        });
        this.messageInput.addEventListener('keydown', (e) => this.handleKeyPress(e));
        this.sendButton.addEventListener('click', () => {
            if (!this.sendButton.disabled) {
                this.handleSendMessage();
            }
        });

        // Add keyboard shortcut for sending messages
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !this.sendButton.disabled) {
                e.preventDefault();
                this.handleSendMessage();
            }
        });

        // New listeners
        this.newThreadBtn.addEventListener('click', () => this.createNewThread());
        this.logToggle.addEventListener('click', () => this.toggleLogPanel());
        this.threadList.addEventListener('click', (e) => {
            const threadItem = e.target.closest('.thread-item');
            if (threadItem) {
                this.switchThread(threadItem.dataset.threadId);
            }
        });

        // Add keyboard shortcut for fullscreen (F11)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F11') {
                e.preventDefault();
                this.toggleFullscreen();
            }
        });

        // Listen for fullscreen changes (e.g., when user presses Escape)
        document.addEventListener('fullscreenchange', () => {
            if (document.fullscreenElement) {
                this.fullscreenButton.textContent = '🗗';
                this.fullscreenButton.title = 'Exit Fullscreen';
            } else {
                this.fullscreenButton.textContent = '🖥️';
                this.fullscreenButton.title = 'Enter Fullscreen';
            }
        });
    }

    initializeLogging() {
        this.logs = [];
        this.maxLogs = 1000; // Maximum number of logs to keep
        this.logLevels = {
            INFO: 'info',
            WARNING: 'warning',
            ERROR: 'error'
        };
    }

    log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            data
        };

        this.logs.push(logEntry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // Only log important events
        if (level === this.logLevels.ERROR || 
            message.includes('Error') || 
            message.includes('Active tabs') ||
            message.includes('Stream')) {
            this.addLogEntry(logEntry);
        }

        // Always log to console for debugging
        console.log(`[${level.toUpperCase()}] ${message}`, data || '');
    }

    addLogEntry(logEntry) {
        const entryElement = document.createElement('div');
        entryElement.className = `log-entry ${logEntry.level}`;
        
        const timestamp = document.createElement('span');
        timestamp.className = 'timestamp';
        timestamp.textContent = new Date(logEntry.timestamp).toLocaleTimeString();
        
        const level = document.createElement('span');
        level.className = 'level';
        level.textContent = logEntry.level.toUpperCase();
        
        const message = document.createElement('span');
        message.textContent = logEntry.message;
        
        entryElement.appendChild(timestamp);
        entryElement.appendChild(level);
        entryElement.appendChild(message);

        if (logEntry.data) {
            const dataElement = document.createElement('pre');
            dataElement.textContent = JSON.stringify(logEntry.data, null, 2);
            entryElement.appendChild(dataElement);
        }

        this.logContent.appendChild(entryElement);
        this.logContent.scrollTop = this.logContent.scrollHeight;
    }

    toggleLogPanel() {
        const logPanel = document.querySelector('.log-panel');
        const isCollapsed = logPanel.style.display === 'none';
        logPanel.style.display = isCollapsed ? 'flex' : 'none';
        this.logToggle.textContent = isCollapsed ? '▼' : '▲';
    }

    createNewThread() {
        const threadId = `thread_${Date.now()}`;
        const threadTitle = `New Thread ${this.threads.size + 1}`;
        
        this.threads.set(threadId, {
            messages: [],
            title: threadTitle
        });

        this.addThreadToList(threadId, threadTitle);
        this.switchThread(threadId);
        this.log(this.logLevels.INFO, `Created new thread: ${threadTitle}`);
    }

    addThreadToList(threadId, title) {
        const threadItem = document.createElement('div');
        threadItem.className = 'thread-item';
        threadItem.dataset.threadId = threadId;
        
        const icon = document.createElement('span');
        icon.className = 'thread-icon';
        icon.textContent = '💬';
        
        const titleSpan = document.createElement('span');
        titleSpan.textContent = title;
        
        threadItem.appendChild(icon);
        threadItem.appendChild(titleSpan);
        this.threadList.appendChild(threadItem);
    }

    switchThread(threadId) {
        // Update active thread
        document.querySelectorAll('.thread-item').forEach(item => {
            item.classList.toggle('active', item.dataset.threadId === threadId);
        });

        this.currentThread = threadId;
        this.clearMessages();
        this.loadThreadMessages(threadId);
        this.log(this.logLevels.INFO, `Switched to thread: ${this.threads.get(threadId).title}`);
    }

    loadThreadMessages(threadId) {
        const thread = this.threads.get(threadId);
        if (!thread) return;

        thread.messages.forEach(msg => {
            this.addMessageToUI(msg.role, msg.content, msg.isError);
        });
    }

    loadThreads() {
        // Load threads from storage
        chrome.storage.local.get(['chatThreads'], (result) => {
            if (result.chatThreads) {
                this.threads = new Map(Object.entries(result.chatThreads));
                this.threads.forEach((thread, threadId) => {
                    this.addThreadToList(threadId, thread.title);
                });
            }
        });
    }

    saveThreads() {
        const threadsObj = Object.fromEntries(this.threads);
        chrome.storage.local.set({ chatThreads: threadsObj });
    }

    async loadConfig() {
        try {
            this.log(this.logLevels.INFO, 'Loading configuration...');
            const response = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
            
            if (!response) {
                throw new Error('No configuration received');
            }

            this.log(this.logLevels.INFO, 'Configuration loaded', { 
                hasAzureOpenAi: !!response.AzureOpenAi,
                hasClaudeAi: !!response.ClaudeAi
            });

            if (response.AzureOpenAi || response.ClaudeAi) {
                this.updateModelSelector(response);
                this.log(this.logLevels.INFO, 'Models updated in selector');
            } else {
                this.showNotification('No AI models configured. Please add your settings in the extension options.');
                this.statusText.textContent = 'No models available';
                this.statusDot.style.backgroundColor = '#ff4444';
                this.log(this.logLevels.WARNING, 'No AI models found in configuration');
            }
        } catch (error) {
            this.log(this.logLevels.ERROR, 'Error loading configuration', { error: error.message });
            this.showNotification('Error loading configuration. Please check your settings.');
            this.statusText.textContent = 'Error loading models';
            this.statusDot.style.backgroundColor = '#ff4444';
            throw error;
        }
    }

    updateModelSelector(config) {
        this.log(this.logLevels.INFO, 'Updating model selector', { config });
        
        // Clear existing options
        this.modelSelector.innerHTML = '<option value="">Select Model</option>';
        
        let modelCount = 0;

        if (config.AzureOpenAi) {
            Object.entries(config.AzureOpenAi).forEach(([modelId, models]) => {
                if (Array.isArray(models) && models.length > 0) {
                    const model = models[0];
                    const option = document.createElement('option');
                    option.value = modelId;
                    option.textContent = `Azure: ${model.ModelName || modelId}`;
                    this.modelSelector.appendChild(option);
                    modelCount++;
                    this.log(this.logLevels.INFO, 'Added Azure model', { modelId, modelName: model.ModelName });
                }
            });
        }

        if (config.ClaudeAi) {
            Object.entries(config.ClaudeAi).forEach(([modelId, models]) => {
                if (Array.isArray(models) && models.length > 0) {
                    const model = models[0];
                    const option = document.createElement('option');
                    option.value = modelId;
                    option.textContent = `Claude: ${model.ModelName || modelId}`;
                    this.modelSelector.appendChild(option);
                    modelCount++;
                    this.log(this.logLevels.INFO, 'Added Claude model', { modelId, modelName: model.ModelName });
                }
            });
        }

        // Update status based on available models
        const hasModels = modelCount > 0;
        this.statusDot.style.backgroundColor = hasModels ? '#4CAF50' : '#ff4444';
        this.statusText.textContent = hasModels ? 
            'Select a model to begin' : 
            'No models available';
        this.sendButton.disabled = !hasModels;

        this.log(this.logLevels.INFO, 'Model selector updated', { 
            totalModels: modelCount,
            hasModels
        });
    }

    handleModelChange() {
        const selectedModel = this.modelSelector.value;
        this.statusDot.className = selectedModel ? 'status-dot active' : 'status-dot';
        this.statusText.textContent = selectedModel ? 
            `Model selected: ${selectedModel}` : 
            'Select a model to begin';
        
        // Update send button state
        this.handleInputChange();
    }

    handleInputChange() {
        const hasText = this.messageInput.value.trim().length > 0;
        const hasModel = this.modelSelector.value !== '';
        this.sendButton.disabled = !hasText || !hasModel || this.isProcessing;
    }

    handleKeyPress(e) {
        if (e.key === 'Enter' && !e.shiftKey && !this.sendButton.disabled) {
            e.preventDefault();
            this.handleSendMessage();
        }
    }

    async handleSendMessage() {
        if (this.isProcessing) {
            this.log(this.logLevels.WARNING, 'Already processing a message, ignoring new request');
            return;
        }

        const message = this.messageInput.value.trim();
        if (!message || !this.modelSelector.value) {
            this.log(this.logLevels.WARNING, 'Invalid input', {
                hasMessage: !!message,
                selectedModel: this.modelSelector.value
            });
            this.showNotification('Please select a model and enter a message');
            return;
        }

        this.isProcessing = true;
        let port = null;

        try {
            this.log(this.logLevels.INFO, 'Starting message processing', {
                modelId: this.modelSelector.value,
                messageLength: message.length,
                threadId: this.currentThread
            });

            // Update status to processing
            this.updateStatus('processing', 'Processing your request...');

            // Clear input first
            this.messageInput.value = '';
            this.handleInputChange();

            // Disable UI elements
            this.setUIState(false);

            // Add user message to UI and thread
            const userMessageDiv = this.addMessageToUI('user', message);
            this.addMessageToThread('user', message);

            // Show typing indicator
            this.showTypingIndicator();

            // Create initial assistant message
            this.currentMessage = this.addMessageToUI('assistant', '');
            this.currentContent = '';

            // Create a dedicated port for this conversation
            port = chrome.runtime.connect({ name: 'chat' });
            let isFirstChunk = true;
            
            // Set up port message listener with enhanced tool execution handling
            port.onMessage.addListener((response) => {
                this.log(this.logLevels.INFO, 'Received port message', { 
                    type: response.type,
                    hasContent: !!response.content,
                    isDone: !!response.done,
                    hasError: !!response.error
                });
                
                if (response.error) {
                    this.hideTypingIndicator();
                    this.removeStreamingIndicator();
                    throw new Error(response.error);
                }
                
                if (response.type === 'delta' && response.content) {
                    // Handle streaming content
                    const content = response.content;
                    
                    if (content && content.trim()) {
                        if (isFirstChunk) {
                            this.hideTypingIndicator();
                            isFirstChunk = false;
                        }
                        
                        this.handleStreamingContent(content);
                    }
                } else if (response.type === 'tool_execution_inline') {
                    // Handle inline tool execution like Cursor
                    if (!this.currentMessage) {
                        this.currentMessage = this.addMessageToUI('assistant', '');
                        isFirstChunk = false;
                    }
                    this.handleInlineToolExecution(response, this.currentMessage);
                } else if (response.done) {
                    this.hideTypingIndicator();
                    this.removeStreamingIndicator();
                    this.updateStatus('active', 'Ready');
                    this.log(this.logLevels.INFO, 'Stream complete', { 
                        contentLength: this.currentContent.length
                    });
                    
                    if (this.currentContent.trim()) {
                        this.addMessageToThread('assistant', this.currentContent);
                    }
                    
                    this.currentMessage = null;
                    this.currentContent = '';
                    port.disconnect();
                }
            });
            
            // Handle port disconnect
            port.onDisconnect.addListener(() => {
                if (chrome.runtime.lastError) {
                    this.log(this.logLevels.ERROR, 'Port disconnected with error', {
                        error: chrome.runtime.lastError.message
                    });
                }
            });

            // Get page content for context
            const pageContent = this.preprocessHtml();
            const pageUrl = window.location.href;
            const pageTitle = document.title;

            // Send the message through the port
            this.log(this.logLevels.INFO, 'Sending message through port', {
                modelId: this.modelSelector.value,
                threadId: this.currentThread
            });
            
            port.postMessage({
                type: 'PROCESS_MESSAGE',
                message: message,
                threadId: this.currentThread,
                modelId: this.modelSelector.value,
                pageContent: pageContent,
                pageUrl: pageUrl,
                pageTitle: pageTitle
            });

        } catch (error) {
            this.log(this.logLevels.ERROR, 'Error in message processing', {
                error: error.message,
                stack: error.stack
            });
            
            // Parse the error message for better user feedback
            let errorMessage = error.message;
            if (error.message.includes('permission')) {
                errorMessage = 'This extension uses only basic tab information for privacy purposes.';
            } else if (error.message.includes('API') || error.message.includes('key')) {
                errorMessage = 'API error: Please check your API keys and endpoints in settings.';
            } else if (error.message.includes('network')) {
                errorMessage = 'Network error: Please check your connection and API endpoints.';
            } else if (error.message.includes('configuration')) {
                errorMessage = 'Configuration error: Please check your AI model settings in the options page.';
            }
            
            // Show error in UI
            if (this.currentMessage) {
                this.currentMessage.textContent = `Error: ${errorMessage}`;
                this.currentMessage.classList.add('error');
            } else {
                this.addMessageToUI('assistant', `Error: ${errorMessage}`, true);
            }
            this.addMessageToThread('assistant', `Error: ${errorMessage}`, true);
            
            // Update status to error
            this.updateStatus('error', 'Error occurred');
            
            // Show notification
            this.showNotification(`Error: ${errorMessage}`);
            
            // Automatically show log panel when there's an error
            const logPanel = document.querySelector('.log-panel');
            if (logPanel) {
                logPanel.style.display = 'flex';
                this.logToggle.textContent = '▼';
            }
            
            // Disconnect port if it exists
            if (port) {
                try {
                    port.disconnect();
                } catch (e) {
                    // Ignore errors on disconnect
                }
            }
        } finally {
            // Re-enable UI
            this.setUIState(true);
            this.hideTypingIndicator();
            this.isProcessing = false;
            
            // Restore status if not in error state
            if (!this.statusDot.classList.contains('error')) {
                this.updateStatus('active', 'Ready');
            }
            
            this.log(this.logLevels.INFO, 'Message processing completed');
        }
    }

    setUIState(enabled) {
        this.messageInput.disabled = !enabled;
        this.sendButton.disabled = !enabled;
        this.modelSelector.disabled = !enabled;
        
        if (enabled) {
            this.messageInput.focus();
            this.handleInputChange();
        }
    }

    handleStreamingContent(content) {
        if (!content) {
            this.log(this.logLevels.WARNING, 'Received empty content chunk');
            return;
        }
        
        if (!this.currentMessage) {
            this.log(this.logLevels.WARNING, 'No current message element for content');
            return;
        }
        
        this.log(this.logLevels.INFO, 'Adding content from chunk', {
            contentLength: content.length,
            totalLength: (this.currentContent + content).length
        });
        
        // Add streaming indicator if not present
        let contentDiv = this.currentMessage.querySelector('.message-content');
        if (!contentDiv) {
            contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            this.currentMessage.insertBefore(contentDiv, this.currentMessage.firstChild);
        }
        
        // Add streaming indicator
        let indicator = this.currentMessage.querySelector('.streaming-indicator');
        if (!indicator) {
            indicator = document.createElement('span');
            indicator.className = 'streaming-indicator';
            indicator.textContent = ' (streaming...)';
            indicator.style.cssText = 'color: #666; font-style: italic; font-size: 0.9em; margin-left: 8px; animation: pulse 1.5s infinite;';
            this.currentMessage.appendChild(indicator);
        }
        
        // Append content and reformat the entire message
        this.currentContent += content;
        
        // Apply markdown formatting to the complete text
        let formattedText = this.currentContent;
        
        // Convert **bold** to HTML
        formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Convert ### headers to HTML
        formattedText = formattedText.replace(/^### (.*$)/gm, '<h3 style="margin: 16px 0 8px 0; color: #e0e0e0; font-size: 1.1em; font-weight: 600;">$1</h3>');
        
        // Convert bullet points to HTML
        formattedText = formattedText.replace(/^- (.*$)/gm, '<div style="margin: 4px 0; padding-left: 16px; position: relative;"><span style="position: absolute; left: 0; color: #007AFF;">•</span>$1</div>');
        
        // Convert numbered lists to HTML
        formattedText = formattedText.replace(/^(\d+)\. (.*$)/gm, '<div style="margin: 4px 0; padding-left: 20px; position: relative;"><span style="position: absolute; left: 0; color: #007AFF; font-weight: 600;">$1.</span>$2</div>');
        
        // Convert URLs to clickable links
        formattedText = formattedText.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color: #007AFF; text-decoration: none; border-bottom: 1px solid rgba(0, 122, 255, 0.3);">$1</a>');
        
        // Preserve line breaks
        formattedText = formattedText.replace(/\n/g, '<br>');
        
        contentDiv.innerHTML = formattedText;
        this.scrollToBottom();
    }

    handleInlineToolExecution(response, currentAssistantMessage) {
        // Handle inline tool execution like Cursor
        if (!currentAssistantMessage) {
            // Create assistant message if it doesn't exist
            currentAssistantMessage = this.addMessageToUI('assistant', '');
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
                    color: rgba(224, 224, 224, 0.9);
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
                if (!document.querySelector('#shimmerStyle')) {
                    const shimmerStyle = document.createElement('style');
                    shimmerStyle.id = 'shimmerStyle';
                    shimmerStyle.textContent = `
                        @keyframes shimmer {
                            0% { left: -100%; }
                            100% { left: 100%; }
                        }
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                        @keyframes fadeIn {
                            from { opacity: 0; transform: translateY(-5px); }
                            to { opacity: 1; transform: translateY(0); }
                        }
                    `;
                    document.head.appendChild(shimmerStyle);
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

    // Add this method to remove streaming indicator when done
    removeStreamingIndicator() {
        if (this.currentMessage) {
            const indicator = this.currentMessage.querySelector('.streaming-indicator');
            if (indicator) {
                indicator.remove();
            }
        }
    }

    addMessageToUI(role, content, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message${isError ? ' error' : ''}`;
        
        // Create message content container
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Handle different types of content with markdown formatting
        if (typeof content === 'object') {
            contentDiv.textContent = JSON.stringify(content, null, 2);
        } else {
            // Basic markdown-like formatting for better readability
            let formattedText = content;
            
            // Convert **bold** to HTML
            formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            
            // Convert ### headers to HTML
            formattedText = formattedText.replace(/^### (.*$)/gm, '<h3 style="margin: 16px 0 8px 0; color: #e0e0e0; font-size: 1.1em; font-weight: 600;">$1</h3>');
            
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
        
        // Add timestamp
        const timestamp = document.createElement('div');
        timestamp.className = 'message-timestamp';
        timestamp.textContent = new Date().toLocaleTimeString();
        timestamp.style.cssText = 'font-size: 0.75em; opacity: 0.6; margin-top: 8px; text-align: right;';
        messageDiv.appendChild(timestamp);
        
        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
        return messageDiv;
    }

    scrollToBottom() {
        requestAnimationFrame(() => {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        });
    }

    addMessageToThread(role, content, isError = false) {
        const thread = this.threads.get(this.currentThread);
        if (thread) {
            thread.messages.push({
                role,
                content,
                isError,
                timestamp: Date.now()
            });
            this.saveThreads();
        }
    }

    clearMessages() {
        while (this.messagesContainer.firstChild) {
            this.messagesContainer.removeChild(this.messagesContainer.firstChild);
        }
    }

    showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.id = 'typingIndicator';
        
        const dots = document.createElement('div');
        dots.className = 'typing-dots';
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.className = 'typing-dot';
            dots.appendChild(dot);
        }
        indicator.appendChild(dots);
        
        this.messagesContainer.appendChild(indicator);
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) {
            indicator.remove();
        }
    }

    openSettings() {
        chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
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
        document.body.appendChild(notification);

        // Remove notification after 3 seconds with animation
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    sendMessageToBackground(message, onStream = null) {
        return new Promise((resolve, reject) => {
            if (onStream) {
                // For streaming, we'll use a long-lived connection
                const port = chrome.runtime.connect({ name: 'chat' });
                
                port.onMessage.addListener((response) => {
                    if (response.error) {
                        port.disconnect();
                        reject(new Error(response.error));
                        return;
                    }
                    
                    // Log the response for debugging
                    console.log('Streaming response:', response);
                    
                    onStream(response);
                    
                    if (response.done) {
                        port.disconnect();
                        resolve();
                    }
                });

                port.onDisconnect.addListener(() => {
                    if (chrome.runtime.lastError) {
                        console.error('Port disconnected with error:', chrome.runtime.lastError);
                        reject(new Error(chrome.runtime.lastError.message));
                    }
                });

                port.postMessage(message);
            } else {
                // For non-streaming messages, use the regular message passing
                chrome.runtime.sendMessage(message, response => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(response);
                    }
                });
            }
        });
    }

    showPrivacyInfo() {
        // Add privacy information message at the start
        const privacyDiv = document.createElement('div');
        privacyDiv.className = 'privacy-info';
        privacyDiv.innerHTML = `
            <div class="info-icon">ℹ️</div>
            <div class="info-text">
                <strong>Privacy Notice:</strong> For your privacy, this extension only accesses 
                basic information about your open tabs (URLs and titles), not their content.
            </div>
        `;
        
        const style = document.createElement('style');
        style.textContent = `
            .privacy-info {
                background-color: #e3f2fd;
                border-radius: 8px;
                padding: 10px 15px;
                margin: 10px 0;
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 0.9em;
                color: #0d47a1;
            }
            .info-icon {
                font-size: 1.5em;
            }
        `;
        document.head.appendChild(style);
        
        // Add to the messages container as the first item
        if (this.messagesContainer.firstChild) {
            this.messagesContainer.insertBefore(privacyDiv, this.messagesContainer.firstChild);
        } else {
            this.messagesContainer.appendChild(privacyDiv);
        }
    }

    updateStatus(type, text) {
        this.statusDot.className = `status-dot ${type}`;
        this.statusText.textContent = text;
    }

    toggleFullscreen() {
        try {
            if (document.fullscreenElement) {
                // Exit fullscreen
                document.exitFullscreen().then(() => {
                    this.fullscreenButton.textContent = '🖥️';
                    this.fullscreenButton.title = 'Enter Fullscreen';
                    this.log(this.logLevels.INFO, 'Exited fullscreen mode');
                }).catch((error) => {
                    console.error('Error exiting fullscreen:', error);
                    this.log(this.logLevels.ERROR, 'Failed to exit fullscreen', error);
                });
            } else {
                // Enter fullscreen
                document.documentElement.requestFullscreen().then(() => {
                    this.fullscreenButton.textContent = '🗗';
                    this.fullscreenButton.title = 'Exit Fullscreen';
                    this.log(this.logLevels.INFO, 'Entered fullscreen mode');
                }).catch((error) => {
                    console.error('Error entering fullscreen:', error);
                    this.log(this.logLevels.ERROR, 'Failed to enter fullscreen', error);
                    this.showNotification('Fullscreen not supported or blocked');
                });
            }
        } catch (error) {
            console.error('Fullscreen API error:', error);
            this.log(this.logLevels.ERROR, 'Fullscreen API not supported', error);
            this.showNotification('Fullscreen not supported in this browser');
        }
    }
}

// Add CSS styles
const style = document.createElement('style');
style.textContent = `
    .message {
        margin: 8px 0;
        padding: 12px;
        border-radius: 8px;
        max-width: 85%;
        word-wrap: break-word;
        position: relative;
    }

    .user-message {
        background-color: #e3f2fd;
        margin-left: auto;
        color: #1565c0;
    }

    .assistant-message {
        background-color: #f5f5f5;
        margin-right: auto;
        color: #333;
    }

    .message.error {
        background-color: #ffebee;
        color: #c62828;
    }

    .message-content {
        margin-bottom: 4px;
    }

    .message-timestamp {
        font-size: 0.75em;
        color: #666;
        text-align: right;
    }

    .typing-indicator {
        padding: 12px;
        margin: 8px 0;
        background-color: #f5f5f5;
        border-radius: 8px;
        display: inline-block;
    }

    .typing-dots {
        display: flex;
        gap: 4px;
    }

    .typing-dot {
        width: 8px;
        height: 8px;
        background-color: #666;
        border-radius: 50%;
        animation: typing 1s infinite ease-in-out;
    }

    .typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .typing-dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes typing {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
    }

    #messages {
        display: flex;
        flex-direction: column;
        padding: 16px;
        overflow-y: auto;
        height: calc(100vh - 200px);
    }

    .notification {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: #333;
        color: white;
        padding: 12px 24px;
        border-radius: 4px;
        animation: slideIn 0.3s ease;
        z-index: 1000;
    }

    @keyframes slideIn {
        from { transform: translateY(100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }

    @keyframes slideOut {
        from { transform: translateY(0); opacity: 1; }
        to { transform: translateY(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Initialize the chat UI when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.chatUI = new ChatUI();
}); 