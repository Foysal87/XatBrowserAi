class ModernChatUI {
    constructor() {
        this.currentMessage = null;
        this.currentThread = 'default';
        this.threads = new Map();
        this.threads.set('default', {
            messages: [],
            title: 'Current Chat',
            preview: 'Start a conversation...'
        });
        this.isProcessing = false;
        this.currentContent = '';
        this.currentTheme = 'dark';

        // Initialize marked.js for markdown parsing
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                highlight: function(code, lang) {
                    if (typeof Prism !== 'undefined' && Prism.languages[lang]) {
                        return Prism.highlight(code, Prism.languages[lang], lang);
                    }
                    return code;
                },
                breaks: true,
                gfm: true
            });
        }

        // Initialize UI elements
        this.initializeElements();
        this.initializeEventListeners();
        this.initializeLogging();
        this.loadThreads();
        this.initializeTheme();
        
        // Show privacy info
        this.showPrivacyInfo();
        
        // Load configuration and models
        this.loadConfig().catch(error => {
            this.log(this.logLevels.ERROR, 'Failed to load configuration', { error: error.message });
            this.showNotification('Error loading configuration. Please check your settings.', 'error');
        });
    }

    initializeElements() {
        // Get references to existing HTML elements
        this.modelSelector = document.getElementById('modelSelector');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendBtn');
        this.settingsButton = document.getElementById('settingsBtn');
        this.newThreadButton = document.getElementById('newChatBtn');
        this.threadList = document.getElementById('chatList');
        this.statusText = document.getElementById('statusText');
        this.statusDot = document.getElementById('statusDot');
        this.themeSelector = document.getElementById('themeSelector');
        this.fullscreenButton = document.getElementById('fullscreenBtn');
        this.logToggleButton = document.getElementById('logToggleBtn');
        this.logPanel = document.getElementById('logPanel');
        this.logContent = document.getElementById('logContent');

        // Verify all elements exist
        const requiredElements = [
            'modelSelector', 'messagesContainer', 'messageInput', 'sendButton', 
            'settingsButton', 'newThreadButton', 'threadList', 'statusText', 'statusDot'
        ];

        for (const elementName of requiredElements) {
            if (!this[elementName]) {
                console.error(`Required element not found: ${elementName}`);
                this.log(this.logLevels.ERROR, `Required element not found: ${elementName}`);
            }
        }

        // Set initial state
        if (this.sendButton) {
            this.sendButton.disabled = true;
        }
        
        if (this.statusText) {
            this.statusText.textContent = 'Select a model to begin';
        }
        
        if (this.statusDot) {
            this.statusDot.className = 'status-dot offline';
        }
    }

    initializeEventListeners() {
        // Model and settings
        this.modelSelector.addEventListener('change', () => this.handleModelChange());
        this.settingsButton.addEventListener('click', () => this.openSettings());
        this.newThreadButton.addEventListener('click', () => this.createNewThread());

        // Theme selector
        if (this.themeSelector) {
            this.themeSelector.addEventListener('change', (e) => this.changeTheme(e.target.value));
        }

        // Fullscreen button
        if (this.fullscreenButton) {
            this.fullscreenButton.addEventListener('click', () => this.toggleFullscreen());
        }

        // Input handling
        this.messageInput.addEventListener('input', () => this.handleInputChange());
        this.messageInput.addEventListener('keydown', (e) => this.handleKeyPress(e));
        this.sendButton.addEventListener('click', () => {
            if (!this.sendButton.disabled) {
                this.handleSendMessage();
            }
        });

        // Auto-resize textarea
        this.messageInput.addEventListener('input', () => {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
        });

        // Chat management
        this.threadList.addEventListener('click', (e) => {
            const chatItem = e.target.closest('.chat-item');
            if (chatItem) {
                this.switchThread(chatItem.dataset.chatId);
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F11') {
                e.preventDefault();
                this.toggleFullscreen();
            }
            if (e.ctrlKey && e.key === 'n') {
                e.preventDefault();
                this.createNewThread();
            }
        });

        // Fullscreen change detection
        document.addEventListener('fullscreenchange', () => {
            if (this.fullscreenButton) {
                if (document.fullscreenElement) {
                    this.fullscreenButton.textContent = '🗗';
                    this.fullscreenButton.title = 'Exit Fullscreen';
                } else {
                    this.fullscreenButton.textContent = '🖥️';
                    this.fullscreenButton.title = 'Enter Fullscreen';
                }
            }
        });
    }

    initializeLogging() {
        this.logs = [];
        this.maxLogs = 1000;
        this.logLevels = {
            INFO: 'info',
            WARNING: 'warning',
            ERROR: 'error'
        };
    }

    initializeTheme() {
        const savedTheme = localStorage.getItem('chatTheme') || 'dark';
        if (this.themeSelector) {
            this.themeSelector.value = savedTheme;
        }
        this.changeTheme(savedTheme);
    }

    changeTheme(theme) {
        this.currentTheme = theme;
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('chatTheme', theme);
        this.log(this.logLevels.INFO, `Theme changed to: ${theme}`);
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
            message.includes('Stream') ||
            message.includes('Theme')) {
            this.addLogEntry(logEntry);
        }

        console.log(`[${level.toUpperCase()}] ${message}`, data || '');
    }

    addLogEntry(logEntry) {
        const entryElement = document.createElement('div');
        entryElement.className = `log-entry ${logEntry.level}`;
        
        const timestamp = document.createElement('div');
        timestamp.className = 'log-timestamp';
        timestamp.textContent = new Date(logEntry.timestamp).toLocaleTimeString();
        
        const level = document.createElement('div');
        level.className = 'log-level';
        level.textContent = logEntry.level;
        
        const message = document.createElement('div');
        message.className = 'log-message';
        message.textContent = logEntry.message;
        
        entryElement.appendChild(timestamp);
        entryElement.appendChild(level);
        entryElement.appendChild(message);

        if (logEntry.data) {
            const dataElement = document.createElement('pre');
            dataElement.textContent = JSON.stringify(logEntry.data, null, 2);
            dataElement.style.marginTop = '0.5rem';
            dataElement.style.fontSize = '0.7rem';
            dataElement.style.opacity = '0.8';
            entryElement.appendChild(dataElement);
        }

        this.messagesContainer.appendChild(entryElement);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    createNewThread() {
        const threadId = `thread_${Date.now()}`;
        const threadTitle = `New Chat ${this.threads.size}`;
        
        this.threads.set(threadId, {
            messages: [],
            title: threadTitle,
            preview: 'Start a conversation...'
        });

        this.addThreadToList(threadId, threadTitle, 'Start a conversation...');
        this.switchThread(threadId);
        this.log(this.logLevels.INFO, `Created new thread: ${threadTitle}`);
    }

    addThreadToList(threadId, title, preview) {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.chatId = threadId;
        
        const titleDiv = document.createElement('div');
        titleDiv.className = 'chat-title';
        titleDiv.textContent = title;
        
        const previewDiv = document.createElement('div');
        previewDiv.className = 'chat-preview';
        previewDiv.textContent = preview;
        
        chatItem.appendChild(titleDiv);
        chatItem.appendChild(previewDiv);
        
        this.threadList.appendChild(chatItem);
    }

    switchThread(threadId) {
        // Update active chat item
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-chat-id="${threadId}"]`).classList.add('active');

        this.currentThread = threadId;
        this.loadThreadMessages(threadId);
        this.saveThreads();
    }

    loadThreadMessages(threadId) {
        const thread = this.threads.get(threadId);
        if (!thread) return;

        this.messagesContainer.innerHTML = '';
        thread.messages.forEach(msg => {
            this.addMessageToUI(msg.role, msg.content, msg.isError);
        });
        this.scrollToBottom();
    }

    loadThreads() {
        try {
            const saved = localStorage.getItem('chatThreads');
            if (saved) {
                const threadsData = JSON.parse(saved);
                this.threads = new Map(threadsData);
            }
        } catch (error) {
            this.log(this.logLevels.ERROR, 'Failed to load threads', { error: error.message });
        }
    }

    saveThreads() {
        try {
            localStorage.setItem('chatThreads', JSON.stringify([...this.threads]));
        } catch (error) {
            this.log(this.logLevels.ERROR, 'Failed to save threads', { error: error.message });
        }
    }

    async loadConfig() {
        try {
            console.log('Loading configuration...');
            const response = await chrome.runtime.sendMessage({
                type: 'GET_CONFIG'  // Use the correct message type expected by background script
            });

            console.log('Configuration response:', response);

            if (response && (response.AzureOpenAi || response.ClaudeAi)) {
                this.updateModelSelector(response);
                this.log(this.logLevels.INFO, 'Configuration loaded successfully');
            } else if (response && response.error) {
                throw new Error(response.error);
            } else {
                console.warn('No valid configuration found:', response);
                this.showNotification('No AI models configured. Please set up your models in the extension settings.', 'error');
                this.updateStatus('error', 'No models configured');
            }
        } catch (error) {
            console.error('Configuration loading error:', error);
            this.log(this.logLevels.ERROR, 'Failed to load configuration', { error: error.message });
            this.showNotification('Failed to load configuration. Please check your settings.', 'error');
            this.updateStatus('error', 'Configuration error');
        }
    }

    updateModelSelector(config) {
        this.modelSelector.innerHTML = '<option value="">Select AI Model</option>';
        
        let firstModel = null;
        let modelCount = 0;

        // Handle Azure OpenAI models
        if (config.AzureOpenAi) {
            Object.entries(config.AzureOpenAi).forEach(([modelId, models]) => {
                if (Array.isArray(models) && models.length > 0) {
                    const model = models[0];
                    const optgroup = document.createElement('optgroup');
                    optgroup.label = 'Azure OpenAI';
                    
                    const option = document.createElement('option');
                    option.value = modelId;
                    option.textContent = `Azure: ${model.ModelName || modelId}`;
                    optgroup.appendChild(option);
                    
                    this.modelSelector.appendChild(optgroup);
                    
                    if (!firstModel) {
                        firstModel = modelId;
                    }
                    modelCount++;
                }
            });
        }

        // Handle Claude AI models
        if (config.ClaudeAi) {
            Object.entries(config.ClaudeAi).forEach(([modelId, models]) => {
                if (Array.isArray(models) && models.length > 0) {
                    const model = models[0];
                    const optgroup = document.createElement('optgroup');
                    optgroup.label = 'Claude AI';
                    
                    const option = document.createElement('option');
                    option.value = modelId;
                    option.textContent = `Claude: ${model.ModelName || modelId}`;
                    optgroup.appendChild(option);
                    
                    this.modelSelector.appendChild(optgroup);
                    
                    if (!firstModel) {
                        firstModel = modelId;
                    }
                    modelCount++;
                }
            });
        }

        // Load saved model selection or auto-select first model
        const savedModel = localStorage.getItem('selectedModel');
        if (savedModel && this.modelSelector.querySelector(`option[value="${savedModel}"]`)) {
            this.modelSelector.value = savedModel;
        } else if (firstModel) {
            // Auto-select the first available model
            this.modelSelector.value = firstModel;
            localStorage.setItem('selectedModel', firstModel);
            this.log(this.logLevels.INFO, `Auto-selected first available model: ${firstModel}`);
        }

        // Update UI state
        this.handleModelChange();
        
        if (modelCount === 0) {
            this.showNotification('No AI models configured. Please add your settings in the extension options.', 'error');
            this.updateStatus('error', 'No models available');
            this.showConfigurationHelp();
        } else {
            this.log(this.logLevels.INFO, `Loaded ${modelCount} AI models`);
        }
    }

    handleModelChange() {
        const selectedOption = this.modelSelector.options[this.modelSelector.selectedIndex];
        const modelName = selectedOption ? selectedOption.text : "undefined";
        
        const hasModel = this.modelSelector.value !== '';
        const hasText = this.messageInput.value.trim().length > 0;
        
        this.sendButton.disabled = !hasText || !hasModel;
        
        if (hasModel) {
            localStorage.setItem('selectedModel', this.modelSelector.value);
            this.updateStatus('connected', `Connected to ${modelName}`);
        } else {
            this.updateStatus('', 'Select a model to begin');
        }
    }

    handleInputChange() {
        // Auto-resize textarea
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
        
        // Update send button state
        this.sendButton.disabled = !this.messageInput.value.trim() || !this.modelSelector.value || this.isProcessing;
    }

    handleKeyPress(e) {
        if (e.key === 'Enter' && !e.shiftKey && !this.sendButton.disabled) {
            e.preventDefault();
            this.handleSendMessage();
        }
    }

    async handleSendMessage() {
        const userInput = this.messageInput.value.trim();
        if (!userInput || !this.modelSelector.value || this.isProcessing) {
            return;
        }

        this.isProcessing = true;
        this.setUIState(false);

        // Add user message to UI and thread
        this.addMessageToUI('user', userInput);
        this.addMessageToThread('user', userInput);

        // Clear input
        this.messageInput.value = '';
        this.handleInputChange();

        // Create assistant message container
        const assistantMessageDiv = this.addMessageToUI('assistant', '');
        let fullResponse = '';
        let currentThinkingContainer = null;
        let thinkingSteps = new Map(); // Track thinking steps

        try {
            // Create streaming connection with better error handling
            let port;
            try {
                port = chrome.runtime.connect({ name: 'chat' });
            } catch (connectionError) {
                console.error('Failed to create port connection:', connectionError);
                const messageContent = assistantMessageDiv.querySelector('.message-content');
                if (messageContent) {
                    messageContent.innerHTML = '<div class="error-message">Error: Could not connect to AI service. Please refresh the page and try again.</div>';
                }
                assistantMessageDiv.classList.add('error');
                this.setUIState(true);
                this.isProcessing = false;
                return;
            }

            let hasReceivedContent = false;
            let processingTimeout;
            let isPortConnected = true;

            // Set up timeout for processing
            const startProcessingTimeout = () => {
                processingTimeout = setTimeout(() => {
                    console.warn('Processing timeout - no content received');
                    if (!hasReceivedContent && isPortConnected) {
                        const messageContent = assistantMessageDiv.querySelector('.message-content');
                        if (messageContent) {
                            messageContent.innerHTML = '<em>Request timed out. Please try again.</em>';
                        }
                        this.setUIState(true);
                        this.isProcessing = false;
                        if (port) {
                            try {
                                port.disconnect();
                            } catch (e) {
                                console.warn('Error disconnecting port on timeout:', e);
                            }
                        }
                    }
                }, 30000); // 30 second timeout
            };

            startProcessingTimeout();

            port.onMessage.addListener((response) => {
                try {
                    // Clear timeout on any response
                    if (processingTimeout) {
                        clearTimeout(processingTimeout);
                        processingTimeout = null;
                    }

                    if (!isPortConnected) {
                        console.warn("Port already disconnected, ignoring response:", response);
                        return;
                    }

                    if (response.error) {
                        console.error('Received error:', response.error);
                        const messageContent = assistantMessageDiv.querySelector('.message-content');
                        if (messageContent) {
                            messageContent.innerHTML = `<div class="error-message">Error: ${this.escapeHtml(response.error)}</div>`;
                        }
                        assistantMessageDiv.classList.add('error');
                        this.disconnectPort(port);
                        isPortConnected = false;
                        this.setUIState(true);
                        this.isProcessing = false;
                        return;
                    }

                    // Handle thinking steps
                    if (response.type === 'thinking_step') {
                        hasReceivedContent = true;
                        this.handleThinkingStep(response, assistantMessageDiv);
                        return;
                    }

                    // Handle tool execution
                    if (response.type === 'tool_execution_inline') {
                        hasReceivedContent = true;
                        this.handleInlineToolExecution(response, assistantMessageDiv);
                        return;
                    }

                    // Handle regular content
                    if (response.type === 'delta' && response.content) {
                        hasReceivedContent = true;
                        fullResponse += response.content;
                        
                        const messageContent = assistantMessageDiv.querySelector('.message-content');
                        if (messageContent) {
                            // Update the final response section
                            let finalResponseDiv = messageContent.querySelector('.final-response');
                            if (!finalResponseDiv) {
                                finalResponseDiv = document.createElement('div');
                                finalResponseDiv.className = 'final-response';
                                messageContent.appendChild(finalResponseDiv);
                            }
                            finalResponseDiv.innerHTML = this.parseBasicMarkdown(fullResponse);
                            this.addCopyButtonsToCodeBlocks(finalResponseDiv);
                        }
                        
                        this.scrollToBottom();
                    }

                    if (response.done) {
                        console.log('Stream completed');
                        
                        // Ensure we have some content
                        if (!hasReceivedContent || !fullResponse.trim()) {
                            const messageContent = assistantMessageDiv.querySelector('.message-content');
                            if (messageContent && !messageContent.querySelector('.thinking-container') && !messageContent.querySelector('.tool-execution')) {
                                messageContent.innerHTML = '<em>No response received. Please try again.</em>';
                            }
                        }
                        
                        // Add final response to thread
                        if (fullResponse.trim()) {
                            this.addMessageToThread('assistant', fullResponse);
                        }
                        
                        this.disconnectPort(port);
                        isPortConnected = false;
                        this.setUIState(true);
                        this.isProcessing = false;
                        this.updateThreadPreview();
                    }
                } catch (error) {
                    console.error('Error handling port message:', error);
                    const messageContent = assistantMessageDiv.querySelector('.message-content');
                    if (messageContent) {
                        messageContent.innerHTML = `<div class="error-message">Error: ${this.escapeHtml(error.message)}</div>`;
                    }
                    assistantMessageDiv.classList.add('error');
                    this.setUIState(true);
                    this.isProcessing = false;
                }
            });

            port.onDisconnect.addListener(() => {
                isPortConnected = false;
                
                if (processingTimeout) {
                    clearTimeout(processingTimeout);
                }
                
                if (chrome.runtime.lastError) {
                    console.error('Port disconnected with error:', chrome.runtime.lastError.message);
                    if (chrome.runtime.lastError.message.includes("Extension context invalidated")) {
                        // Handle context invalidation more gracefully
                        this.log(this.logLevels.ERROR, "Extension context invalidated. Chat features disabled until refresh.");
                        this.updateStatus('error', "Extension updated. Please refresh page.");
                    } else if (chrome.runtime.lastError.message.includes("Could not establish connection")) {
                        this.log(this.logLevels.ERROR, "Could not establish connection with background script.");
                        this.updateStatus('error', "Connection error. Try refreshing.");
                    }
                } else {
                    console.log("Port disconnected normally.");
                }
                
                // Only update UI if processing was active and no content received, or if an error wasn't already shown
                const messageContent = assistantMessageDiv.querySelector('.message-content');
                const hasErrorDisplayed = messageContent && messageContent.querySelector('.error-message');

                if (this.isProcessing && !hasReceivedContent && !hasErrorDisplayed) {
                    if (messageContent && !messageContent.querySelector('.thinking-container') && !messageContent.querySelector('.tool-execution')) {
                        messageContent.innerHTML = '<em>Connection lost. Please try again.</em>';
                    }
                }

                this.setUIState(true);
                this.isProcessing = false;
            });

            // Send message with better error handling
            try {
                if (!isPortConnected) {
                    throw new Error("Port is not connected before sending message.");
                }
                
                port.postMessage({
                    type: 'PROCESS_MESSAGE',
                    message: userInput,
                    modelId: this.modelSelector.value
                });
                
                console.log('Message sent successfully via port');
            } catch (sendError) {
                console.error("Error sending message via port:", sendError);
                const messageContent = assistantMessageDiv.querySelector('.message-content');
                if (messageContent) {
                    messageContent.innerHTML = `<div class="error-message">Error: Could not send message. ${this.escapeHtml(sendError.message)}</div>`;
                }
                assistantMessageDiv.classList.add('error');
                this.disconnectPort(port);
                isPortConnected = false;
                this.setUIState(true);
                this.isProcessing = false;
                return;
            }

        } catch (error) {
            console.error('Error in handleSendMessage:', error);
            const messageContent = assistantMessageDiv.querySelector('.message-content');
            if (messageContent) {
                messageContent.innerHTML = `<div class="error-message">Error: ${this.escapeHtml(error.message)}</div>`;
            }
            assistantMessageDiv.classList.add('error');
            this.setUIState(true);
            this.isProcessing = false;
        }
    }

    // Helper method to safely disconnect port
    disconnectPort(port) {
        try {
            if (port) {
                port.disconnect();
            }
        } catch (error) {
            console.warn('Error disconnecting port:', error);
        }
    }

    // New method to handle thinking steps
    handleThinkingStep(response, assistantMessageDiv) {
        const { currentStep, totalSteps, content } = response;
        
        const messageContent = assistantMessageDiv.querySelector('.message-content');
        if (!messageContent) return;

        // Get or create thinking container
        let thinkingContainer = messageContent.querySelector('.thinking-container');
        if (!thinkingContainer) {
            thinkingContainer = document.createElement('div');
            thinkingContainer.className = 'thinking-container';
            
            // Create thinking header
            const thinkingHeader = document.createElement('div');
            thinkingHeader.className = 'thinking-header';
            
            const titleSection = document.createElement('div');
            titleSection.className = 'thinking-title-section';
            
            const thinkingIcon = document.createElement('div');
            thinkingIcon.className = 'thinking-icon';
            thinkingIcon.textContent = '🧠';
            
            const thinkingTitle = document.createElement('div');
            thinkingTitle.className = 'thinking-title';
            thinkingTitle.textContent = 'Sequential Thinking';
            
            const thinkingProgress = document.createElement('div');
            thinkingProgress.className = 'thinking-progress';
            thinkingProgress.textContent = 'Processing...';
            
            titleSection.appendChild(thinkingIcon);
            titleSection.appendChild(thinkingTitle);
            
            thinkingHeader.appendChild(titleSection);
            thinkingHeader.appendChild(thinkingProgress);
            
            // Create thinking steps container
            const thinkingSteps = document.createElement('div');
            thinkingSteps.className = 'thinking-steps';
            
            thinkingContainer.appendChild(thinkingHeader);
            thinkingContainer.appendChild(thinkingSteps);
            
            // Add to the current assistant message or create a new one
            const lastMessage = this.messagesContainer.lastElementChild;
            if (lastMessage && lastMessage.classList.contains('message') && lastMessage.classList.contains('assistant')) {
                const messageContent = lastMessage.querySelector('.message-content');
                if (messageContent) {
                    messageContent.appendChild(thinkingContainer);
                }
            } else {
                // Create a new assistant message for thinking
                const assistantMessage = this.addMessageToUI('assistant', '');
                const messageContent = assistantMessage.querySelector('.message-content');
                if (messageContent) {
                    messageContent.appendChild(thinkingContainer);
                }
            }
        }
        
        // Update progress indicator
        const thinkingProgress = thinkingContainer.querySelector('.thinking-progress');
        if (thinkingProgress) {
            thinkingProgress.textContent = `${currentStep}/${totalSteps}`;
        }
        
        // Check if step already exists
        let stepDiv = thinkingContainer.querySelector('.thinking-steps').querySelector(`[data-step="${currentStep}"]`);
        
        if (!stepDiv) {
            // Create new step
            stepDiv = document.createElement('div');
            stepDiv.className = 'thinking-step active';
            stepDiv.setAttribute('data-step', currentStep);
            
            // Create step header
            const stepHeader = document.createElement('div');
            stepHeader.className = 'step-header';
            
            const stepNumber = document.createElement('div');
            stepNumber.className = 'step-number';
            stepNumber.textContent = `Step ${currentStep}`;
            
            const stepStatus = document.createElement('div');
            stepStatus.className = 'step-status';
            stepStatus.textContent = 'THINKING';
            
            stepHeader.appendChild(stepNumber);
            stepHeader.appendChild(stepStatus);
            
            // Create step content
            const stepContent = document.createElement('div');
            stepContent.className = 'step-content';
            stepContent.innerHTML = this.parseBasicMarkdown(content);
            
            stepDiv.appendChild(stepHeader);
            stepDiv.appendChild(stepContent);
            
            thinkingContainer.querySelector('.thinking-steps').appendChild(stepDiv);
        } else {
            // Update existing step
            const stepContent = stepDiv.querySelector('.step-content');
            const stepStatus = stepDiv.querySelector('.step-status');
            
            if (stepContent) {
                stepContent.innerHTML = this.parseBasicMarkdown(content);
            }
            
            if (stepStatus) {
                stepStatus.textContent = 'THINKING';
                stepStatus.className = 'step-status';
            }
        }
        
        // Mark previous steps as completed
        const allSteps = thinkingContainer.querySelector('.thinking-steps').querySelectorAll('.thinking-step');
        allSteps.forEach((step, index) => {
            const stepNum = parseInt(step.getAttribute('data-step'));
            if (stepNum < currentStep) {
                step.className = 'thinking-step completed';
                const status = step.querySelector('.step-status');
                if (status) {
                    status.textContent = 'COMPLETED';
                    status.className = 'step-status completed';
                }
            }
        });
        
        this.scrollToBottom();
    }

    setUIState(enabled) {
        this.messageInput.disabled = !enabled;
        this.sendButton.disabled = !enabled || !this.messageInput.value.trim() || !this.modelSelector.value;
        this.modelSelector.disabled = !enabled;
    }

    handleStreamingContent(content) {
        if (!this.currentMessage) {
            this.hideTypingIndicator();
            this.currentMessage = this.addMessageToUI('assistant', '');
            this.currentContent = '';
        }

        const contentDiv = this.currentMessage.querySelector('.message-content');
        if (!contentDiv) return;

        // Append content and reformat the entire message
        this.currentContent += content;
        
        // Check for sequential thinking patterns
        const thinkingMatch = this.currentContent.match(/\[THINKING:(\d+)\/(\d+)\](.*?)\[\/THINKING\]/s);
        if (thinkingMatch) {
            const [fullMatch, currentStep, totalSteps, thinkingContent] = thinkingMatch;
            this.addThinkingStep(parseInt(currentStep), parseInt(totalSteps), thinkingContent.trim());
            
            // Remove thinking content from main response
            this.currentContent = this.currentContent.replace(fullMatch, '');
        }
        
        // Check for tool execution patterns
        const toolMatch = this.currentContent.match(/\[TOOL:(.*?)\](.*?)\[\/TOOL\]/s);
        if (toolMatch) {
            const [fullMatch, toolName, toolResult] = toolMatch;
            this.showToolExecution(toolName, toolResult);
            
            // Remove tool content from main response
            this.currentContent = this.currentContent.replace(fullMatch, '');
        }
        
        // Use marked.js for markdown parsing if available
        let formattedContent;
        if (typeof marked !== 'undefined') {
            formattedContent = marked.parse(this.currentContent);
        } else {
            // Fallback to basic markdown formatting
            formattedContent = this.parseBasicMarkdown(this.currentContent);
        }
        
        contentDiv.innerHTML = formattedContent;
        
        // Highlight code blocks if Prism is available
        if (typeof Prism !== 'undefined') {
            Prism.highlightAllUnder(contentDiv);
        }
        
        // Add copy buttons to code blocks
        this.addCopyButtonsToCodeBlocks(contentDiv);
        
        this.scrollToBottom();
    }

    addThinkingStep(currentStep, totalSteps, content, isRevision = false) {
        const thinkingContainer = this.getOrCreateThinkingContainer();
        const thinkingSteps = thinkingContainer.querySelector('.thinking-steps');
        const thinkingProgress = thinkingContainer.querySelector('.thinking-progress');
        
        // Update progress indicator
        if (thinkingProgress) {
            thinkingProgress.textContent = `${currentStep}/${totalSteps}`;
        }
        
        // Check if step already exists
        let stepDiv = thinkingSteps.querySelector(`[data-step="${currentStep}"]`);
        
        if (!stepDiv) {
            // Create new step
            stepDiv = document.createElement('div');
            stepDiv.className = 'thinking-step active';
            stepDiv.setAttribute('data-step', currentStep);
            
            // Create step header
            const stepHeader = document.createElement('div');
            stepHeader.className = 'step-header';
            
            const stepNumber = document.createElement('div');
            stepNumber.className = 'step-number';
            stepNumber.textContent = `Step ${currentStep}`;
            
            const stepStatus = document.createElement('div');
            stepStatus.className = 'step-status';
            stepStatus.textContent = isRevision ? 'REVISING' : 'THINKING';
            
            stepHeader.appendChild(stepNumber);
            stepHeader.appendChild(stepStatus);
            
            // Create step content
            const stepContent = document.createElement('div');
            stepContent.className = 'step-content';
            stepContent.innerHTML = this.parseBasicMarkdown(content);
            
            stepDiv.appendChild(stepHeader);
            stepDiv.appendChild(stepContent);
            
            thinkingSteps.appendChild(stepDiv);
        } else {
            // Update existing step
            const stepContent = stepDiv.querySelector('.step-content');
            const stepStatus = stepDiv.querySelector('.step-status');
            
            if (stepContent) {
                stepContent.innerHTML = this.parseBasicMarkdown(content);
            }
            
            if (stepStatus) {
                stepStatus.textContent = isRevision ? 'REVISING' : 'THINKING';
                stepStatus.className = isRevision ? 'step-status revision' : 'step-status';
            }
            
            if (isRevision) {
                stepDiv.className = 'thinking-step revision';
            }
        }
        
        // Mark previous steps as completed
        const allSteps = thinkingSteps.querySelectorAll('.thinking-step');
        allSteps.forEach((step, index) => {
            const stepNum = parseInt(step.getAttribute('data-step'));
            if (stepNum < currentStep) {
                step.className = 'thinking-step completed';
                const status = step.querySelector('.step-status');
                if (status) {
                    status.textContent = 'COMPLETED';
                    status.className = 'step-status completed';
                }
            }
        });
        
        this.scrollToBottom();
        return stepDiv;
    }

    getOrCreateThinkingContainer() {
        let thinkingContainer = this.messagesContainer.querySelector('.thinking-container');
        
        if (!thinkingContainer) {
            thinkingContainer = document.createElement('div');
            thinkingContainer.className = 'thinking-container';
            
            // Create thinking header
            const thinkingHeader = document.createElement('div');
            thinkingHeader.className = 'thinking-header';
            
            const titleSection = document.createElement('div');
            titleSection.className = 'thinking-title-section';
            
            const thinkingIcon = document.createElement('div');
            thinkingIcon.className = 'thinking-icon';
            thinkingIcon.textContent = '🧠';
            
            const thinkingTitle = document.createElement('div');
            thinkingTitle.className = 'thinking-title';
            thinkingTitle.textContent = 'Sequential Thinking';
            
            const thinkingProgress = document.createElement('div');
            thinkingProgress.className = 'thinking-progress';
            thinkingProgress.textContent = 'Processing...';
            
            titleSection.appendChild(thinkingIcon);
            titleSection.appendChild(thinkingTitle);
            
            thinkingHeader.appendChild(titleSection);
            thinkingHeader.appendChild(thinkingProgress);
            
            // Create thinking steps container
            const thinkingSteps = document.createElement('div');
            thinkingSteps.className = 'thinking-steps';
            
            thinkingContainer.appendChild(thinkingHeader);
            thinkingContainer.appendChild(thinkingSteps);
            
            // Add to the current assistant message or create a new one
            const lastMessage = this.messagesContainer.lastElementChild;
            if (lastMessage && lastMessage.classList.contains('message') && lastMessage.classList.contains('assistant')) {
                const messageContent = lastMessage.querySelector('.message-content');
                if (messageContent) {
                    messageContent.appendChild(thinkingContainer);
                }
            } else {
                // Create a new assistant message for thinking
                const assistantMessage = this.addMessageToUI('assistant', '');
                const messageContent = assistantMessage.querySelector('.message-content');
                if (messageContent) {
                    messageContent.appendChild(thinkingContainer);
                }
            }
        }
        
        return thinkingContainer;
    }

    showToolExecution(toolName, result) {
        const toolDiv = document.createElement('div');
        toolDiv.className = 'tool-indicator completed';
        toolDiv.innerHTML = `
            <div class="tool-icon completed">🔧</div>
            <div class="tool-text">
                <strong>${this.formatToolName(toolName)}</strong>: ${result}
            </div>
        `;
        
        if (this.currentMessage) {
            this.currentMessage.appendChild(toolDiv);
        } else {
            this.messagesContainer.appendChild(toolDiv);
        }
        
        this.scrollToBottom();
    }

    formatToolName(toolName) {
        const toolNames = {
            'openNewTab': 'Open New Tab',
            'searchWeb': 'Web Search',
            'getPageContent': 'Extract Content',
            'generateTool': 'Generate Tool'
        };
        return toolNames[toolName] || toolName;
    }

    parseBasicMarkdown(text) {
        let html = text;
        
        // Headers
        html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
        
        // Bold and italic
        html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // Code blocks
        html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code class="language-${lang || 'text'}">${this.escapeHtml(code.trim())}</code></pre>`;
        });
        
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Lists
        html = html.replace(/^- (.*$)/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        html = html.replace(/^(\d+)\. (.*$)/gm, '<li>$2</li>');
        
        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        html = html.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
        
        // Blockquotes
        html = html.replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>');
        
        // Line breaks
        html = html.replace(/\n/g, '<br>');
        
        return html;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    addCopyButtonsToCodeBlocks(container) {
        const codeBlocks = container.querySelectorAll('pre code');
        codeBlocks.forEach(codeBlock => {
            const pre = codeBlock.parentElement;
            if (pre.querySelector('.copy-btn')) return; // Already has copy button
            
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.textContent = 'Copy';
            copyBtn.style.position = 'absolute';
            copyBtn.style.top = '0.5rem';
            copyBtn.style.right = '0.5rem';
            
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(codeBlock.textContent).then(() => {
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => {
                        copyBtn.textContent = 'Copy';
                    }, 2000);
                });
            });
            
            pre.style.position = 'relative';
            pre.appendChild(copyBtn);
        });
    }

    handleInlineToolExecution(response, assistantMessageDiv) {
        const { tool, args, status, message, result, error, stepInfo, context } = response;
        
        const messageContent = assistantMessageDiv.querySelector('.message-content');
        if (!messageContent) return;

        // Get the current thinking step if we have step info
        let targetContainer = messageContent;
        if (stepInfo && stepInfo.currentStep) {
            const thinkingContainer = messageContent.querySelector('.thinking-container');
            if (thinkingContainer) {
                const stepDiv = thinkingContainer.querySelector(`[data-step="${stepInfo.currentStep}"]`);
                if (stepDiv) {
                    targetContainer = stepDiv.querySelector('.step-content');
                }
            }
        }

        // Create or update tool execution element
        let toolExecutionDiv = targetContainer.querySelector(`[data-tool-execution="${tool}"]`);
        
        if (!toolExecutionDiv) {
            toolExecutionDiv = document.createElement('div');
            toolExecutionDiv.className = 'tool-execution-inline';
            toolExecutionDiv.setAttribute('data-tool-execution', tool);
            targetContainer.appendChild(toolExecutionDiv);
        }

        // Update tool execution display based on status
        let iconClass = 'executing';
        let iconText = '⚡';
        let statusClass = 'executing';

        if (status === 'completed') {
            iconClass = 'completed';
            iconText = '✓';
            statusClass = 'completed';
        } else if (status === 'error') {
            iconClass = 'error';
            iconText = '✗';
            statusClass = 'error';
        }

        // Build step info display
        let stepInfoText = '';
        if (stepInfo) {
            stepInfoText = `<div class="tool-step-info">Tool ${stepInfo.toolIndex}/${stepInfo.totalTools} in Step ${stepInfo.currentStep}/${stepInfo.totalSteps}</div>`;
        }

        // Build context info display
        let contextInfoText = '';
        if (context && context.tabId && status === 'completed') {
            contextInfoText = `<div class="tool-context-info">🔗 Tab context: ${context.tabId}</div>`;
        }

        // Update the tool execution display
        toolExecutionDiv.className = `tool-execution-inline ${statusClass}`;
        toolExecutionDiv.innerHTML = `
            <div class="tool-icon ${iconClass}">${iconText}</div>
            <div class="tool-details">
                <div class="tool-name">${this.formatToolName(tool)}</div>
                <div class="tool-message">${this.escapeHtml(message || 'Processing...')}</div>
                ${stepInfoText}
                ${contextInfoText}
                ${result && status === 'completed' ? this.formatToolResult(tool, result) : ''}
                ${error ? `<div class="tool-error">Error: ${this.escapeHtml(error)}</div>` : ''}
            </div>
        `;

        this.scrollToBottom();
    }

    formatToolResult(toolName, result) {
        if (!result || !result.success) return '';

        switch (toolName) {
            case 'openNewTab':
                const tabInfo = result.tabId ? ` (Tab ID: ${result.tabId})` : '';
                return `<div class="tool-result">✅ New tab opened successfully${tabInfo}</div>`;
            
            case 'searchWeb':
                const searchTabInfo = result.tabId ? ` in tab ${result.tabId}` : '';
                return `<div class="tool-result">✅ Search completed for: "${result.query || 'unknown'}"${searchTabInfo}</div>`;
            
            case 'getPageContent':
                const contentLength = result.content?.length || result.markdownContent?.length || 0;
                const resultCount = result.resultCount || 0;
                const contentTabInfo = result.tabId ? ` from tab ${result.tabId}` : '';
                if (resultCount > 0) {
                    return `<div class="tool-result">✅ Extracted ${resultCount} search results (${contentLength} characters)${contentTabInfo}</div>`;
                } else {
                    return `<div class="tool-result">✅ Page content extracted (${contentLength} characters)${contentTabInfo}</div>`;
                }
            
            // Stagehand tools
            case 'stagehandNavigate':
                const navTabInfo = result.tabId ? ` (Tab ID: ${result.tabId})` : '';
                return `<div class="tool-result">✅ Successfully navigated to: ${result.url}${navTabInfo}</div>`;
            
            case 'stagehandAct':
                return `<div class="tool-result">✅ Action completed: ${result.action}</div>`;
            
            case 'stagehandExtract':
                return `<div class="tool-result">✅ Extracted ${result.length} characters of content</div>`;
            
            case 'stagehandObserve':
                return `<div class="tool-result">✅ Found ${result.count} elements matching: "${result.instruction}"</div>`;
            
            case 'screenshot':
                const screenshotTabInfo = result.tabId ? ` from tab ${result.tabId}` : '';
                const screenshotHtml = result.dataUrl ? 
                    `<div class="tool-result">✅ Screenshot captured: ${result.filename}${screenshotTabInfo}</div>
                     <div class="screenshot-preview">
                         <img src="${result.dataUrl}" alt="Screenshot" style="max-width: 300px; max-height: 200px; border-radius: 8px; border: 1px solid var(--border-color); margin-top: 8px;" onclick="window.open('${result.dataUrl}', '_blank')">
                         <div style="font-size: 0.75em; color: var(--text-tertiary); margin-top: 4px;">Click to view full size</div>
                     </div>` :
                    `<div class="tool-result">✅ Screenshot captured: ${result.filename}${screenshotTabInfo}</div>`;
                return screenshotHtml;
            
            default:
                return `<div class="tool-result">✅ ${toolName} completed successfully</div>`;
        }
    }

    removeStreamingIndicator() {
        const indicator = this.messagesContainer.querySelector('.streaming-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    addMessageToUI(role, content, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}${isError ? ' error' : ''}`;
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        if (content) {
            if (role === 'user') {
                messageContent.textContent = content;
            } else {
                messageContent.innerHTML = this.parseBasicMarkdown(content);
                // Add copy buttons to code blocks after parsing
                setTimeout(() => this.addCopyButtonsToCodeBlocks(messageContent), 100);
            }
        }
        
        messageDiv.appendChild(messageContent);
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
                timestamp: new Date().toISOString()
            });
            this.saveThreads();
        }
    }

    clearMessages() {
        this.messagesContainer.innerHTML = '';
    }

    showTypingIndicator() {
        this.hideTypingIndicator(); // Remove any existing indicator
        
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        
        const dotsDiv = document.createElement('div');
        dotsDiv.className = 'typing-dots';
        
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.className = 'typing-dot';
            dotsDiv.appendChild(dot);
        }
        
        const textSpan = document.createElement('span');
        textSpan.textContent = 'AI is thinking...';
        
        typingDiv.appendChild(dotsDiv);
        typingDiv.appendChild(textSpan);
        this.messagesContainer.appendChild(typingDiv);
        
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        const indicator = this.messagesContainer.querySelector('.typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    openSettings() {
        chrome.runtime.openOptionsPage();
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1) reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 3000);
    }

    async sendMessageToBackground(userInput, assistantResponseDiv, onStreamCallback) {
        return new Promise((resolve, reject) => {
            let promiseSettled = false;
            let hasReceivedContentOrDoneSignal = false; // Track if meaningful data came through

            const port = chrome.runtime.connect({ name: 'chat' });

            const timeoutDuration = 60000; 
            const timeoutId = setTimeout(() => {
                if (!promiseSettled) {
                    promiseSettled = true;
                    console.warn('Message processing timeout, disconnecting port.');
                    port.disconnect(); 
                    reject(new Error('Message processing timeout'));
                }
            }, timeoutDuration);

            const settlePromise = (fn, value) => {
                if (!promiseSettled) {
                    promiseSettled = true;
                    clearTimeout(timeoutId);
                    // It's generally safer to let onDisconnect handle the actual port.disconnect()
                    // if the disconnection is due to an error or natural end.
                    // However, if settlePromise is called due to an internal logic (e.g. explicit resolve/reject path not from port events),
                    // then disconnecting here is fine.
                    try { port.disconnect(); } catch(e) { console.warn("Error disconnecting port in settlePromise (might be already disconnected):", e); }
                    fn(value);
                }
            };

            port.onMessage.addListener((bgResponse) => {
                if (promiseSettled) return;

                if (bgResponse.error) {
                    console.error('Received error from background:', bgResponse.error);
                    settlePromise(reject, new Error(bgResponse.error));
                    return;
                }

                if (bgResponse.type === 'tool_execution_inline') {
                    this.handleInlineToolExecution(bgResponse, assistantResponseDiv);
                    // Tool execution itself is a form of content/activity
                    hasReceivedContentOrDoneSignal = true; 
                } else if (bgResponse.type === 'delta' && bgResponse.content) {
                    if (onStreamCallback) onStreamCallback(bgResponse.content);
                    hasReceivedContentOrDoneSignal = true;
                } else if (bgResponse.choices && bgResponse.choices[0] && bgResponse.choices[0].delta && bgResponse.choices[0].delta.content) { 
                    if (onStreamCallback) onStreamCallback(bgResponse.choices[0].delta.content);
                    hasReceivedContentOrDoneSignal = true;
                } else if (bgResponse.type === 'complete' || bgResponse.done) {
                    console.log('Stream completed signal received from background.');
                    hasReceivedContentOrDoneSignal = true;
                    settlePromise(resolve);
                } else {
                    console.log('Unhandled response type or empty delta in sendMessageToBackground:', bgResponse);
                }
            });

            port.onDisconnect.addListener(() => {
                if (!promiseSettled) { 
                    promiseSettled = true;
                    clearTimeout(timeoutId);
                    if (chrome.runtime.lastError) {
                        console.error('Port disconnected with error:', chrome.runtime.lastError.message);
                        reject(new Error(chrome.runtime.lastError.message || 'Port disconnected unexpectedly'));
                    } else if (!hasReceivedContentOrDoneSignal) {
                        // Normal disconnect, but nothing meaningful was exchanged (no content, no 'done')
                        console.warn('Port disconnected before any content or completion signal was received.');
                        reject(new Error('Connection closed prematurely by the background script without data.'));
                    } else {
                        // Normal disconnect after content/done signal implies success
                        console.log('Port disconnected normally after processing. Assuming completion.');
                        resolve(); 
                    }
                }
            });

            try {
                port.postMessage({
                    type: 'PROCESS_MESSAGE',
                    message: userInput,
                    modelId: this.modelSelector.value,
                    pageUrl: window.location.href, 
                    pageTitle: document.title
                });
            } catch (error) {
                if (!promiseSettled) {
                    promiseSettled = true;
                    clearTimeout(timeoutId);
                    console.error('Failed to post message to port:', error);
                    reject(error);
                }
            }
        });
    }

    showPrivacyInfo() {
        const hasShownPrivacy = localStorage.getItem('hasShownPrivacyInfo');
        if (!hasShownPrivacy) {
            setTimeout(() => {
                this.showNotification('Your conversations are private and stored locally. No data is sent to external servers except for AI processing.', 'info');
                localStorage.setItem('hasShownPrivacyInfo', 'true');
            }, 2000);
        }
    }

    updateStatus(type, text) {
        this.statusText.textContent = text;
        this.statusDot.className = `status-dot ${type}`;
    }

    toggleFullscreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            document.documentElement.requestFullscreen();
        }
    }

    showConfigurationHelp() {
        // Clear messages and show help
        this.messagesContainer.innerHTML = '';
        
        const helpDiv = document.createElement('div');
        helpDiv.className = 'configuration-help';
        helpDiv.innerHTML = `
            <div class="help-content">
                <h2>🚀 Welcome to XatBrowser AI!</h2>
                <p>To get started, you need to configure your AI models:</p>
                
                <div class="help-steps">
                    <div class="help-step">
                        <div class="step-number">1</div>
                        <div class="step-content">
                            <h3>Open Settings</h3>
                            <p>Click the settings button (⚙️) in the header above</p>
                        </div>
                    </div>
                    
                    <div class="help-step">
                        <div class="step-number">2</div>
                        <div class="step-content">
                            <h3>Add Your API Keys</h3>
                            <p>Configure Azure OpenAI or Claude AI with your API credentials</p>
                        </div>
                    </div>
                    
                    <div class="help-step">
                        <div class="step-number">3</div>
                        <div class="step-content">
                            <h3>Start Chatting</h3>
                            <p>Return here and select a model to begin your AI conversation</p>
                        </div>
                    </div>
                </div>
                
                <button class="help-settings-btn" onclick="window.chatUI.openSettings()">
                    ⚙️ Open Settings Now
                </button>
            </div>
        `;
        
        this.messagesContainer.appendChild(helpDiv);
        
        // Add styles for the help content
        if (!document.getElementById('help-styles')) {
            const style = document.createElement('style');
            style.id = 'help-styles';
            style.textContent = `
                .configuration-help {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    padding: 2rem;
                }
                
                .help-content {
                    max-width: 500px;
                    text-align: center;
                    background: var(--bg-card);
                    padding: 2rem;
                    border-radius: 16px;
                    border: 1px solid var(--border);
                    box-shadow: 0 8px 24px var(--shadow-lg);
                }
                
                .help-content h2 {
                    color: var(--primary);
                    margin-bottom: 1rem;
                    font-size: 1.5rem;
                }
                
                .help-content p {
                    color: var(--text-secondary);
                    margin-bottom: 1.5rem;
                    line-height: 1.6;
                }
                
                .help-steps {
                    text-align: left;
                    margin: 2rem 0;
                }
                
                .help-step {
                    display: flex;
                    align-items: flex-start;
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }
                
                .step-number {
                    width: 32px;
                    height: 32px;
                    background: linear-gradient(135deg, var(--primary), var(--secondary));
                    color: white;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 600;
                    flex-shrink: 0;
                }
                
                .step-content h3 {
                    color: var(--text-primary);
                    margin-bottom: 0.5rem;
                    font-size: 1rem;
                }
                
                .step-content p {
                    color: var(--text-secondary);
                    margin: 0;
                    font-size: 0.875rem;
                }
                
                .help-settings-btn {
                    background: linear-gradient(135deg, var(--primary), var(--primary-hover));
                    color: white;
                    border: none;
                    padding: 0.75rem 1.5rem;
                    border-radius: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    font-size: 1rem;
                    box-shadow: 0 4px 12px var(--shadow);
                }
                
                .help-settings-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 24px var(--shadow-lg);
                }
            `;
            document.head.appendChild(style);
        }
    }

    updateThreadPreview() {
        const thread = this.threads.get(this.currentThread);
        if (thread && thread.messages.length > 0) {
            const lastMessage = thread.messages[thread.messages.length - 1];
            if (lastMessage.role === 'user') {
                thread.preview = lastMessage.content.length > 50 ? 
                    lastMessage.content.substring(0, 50) + '...' : 
                    lastMessage.content;
            }
            
            const chatItem = document.querySelector(`[data-chat-id="${this.currentThread}"] .chat-preview`);
            if (chatItem) {
                chatItem.textContent = thread.preview;
            }
        }
    }
}

// Initialize the chat UI when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.chatUI = new ModernChatUI();
}); 