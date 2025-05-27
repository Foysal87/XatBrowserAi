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
        // Main elements
        this.modelSelector = document.getElementById('modelSelector');
        this.settingsBtn = document.getElementById('settingsBtn');
        this.fullscreenBtn = document.getElementById('fullscreenBtn');
        this.logToggleBtn = document.getElementById('logToggleBtn');
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.messagesContainer = document.getElementById('messagesContainer');

        // New elements
        this.chatList = document.getElementById('chatList');
        this.newChatBtn = document.getElementById('newChatBtn');
        this.logContent = document.getElementById('logContent');
        this.logToggle = document.getElementById('logToggle');
        this.logPanel = document.getElementById('logPanel');
        this.themeSelector = document.getElementById('themeSelector');
        this.sidebar = document.getElementById('sidebar');

        // Enable send button if model is selected
        this.handleModelChange();
    }

    initializeEventListeners() {
        // Model and settings
        this.modelSelector.addEventListener('change', () => this.handleModelChange());
        this.settingsBtn.addEventListener('click', () => this.openSettings());
        this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        this.logToggleBtn.addEventListener('click', () => this.toggleLogPanel());
        this.themeSelector.addEventListener('change', (e) => this.changeTheme(e.target.value));

        // Input handling
        this.messageInput.addEventListener('input', () => this.handleInputChange());
        this.messageInput.addEventListener('keydown', (e) => this.handleKeyPress(e));
        this.sendBtn.addEventListener('click', () => {
            if (!this.sendBtn.disabled) {
                this.handleSendMessage();
            }
        });

        // Auto-resize textarea
        this.messageInput.addEventListener('input', () => {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 150) + 'px';
        });

        // Chat management
        this.newChatBtn.addEventListener('click', () => this.createNewThread());
        this.logToggle.addEventListener('click', () => this.toggleLogPanel());
        this.chatList.addEventListener('click', (e) => {
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
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                this.toggleLogPanel();
            }
        });

        // Fullscreen change detection
        document.addEventListener('fullscreenchange', () => {
            if (document.fullscreenElement) {
                this.fullscreenBtn.textContent = '🗗';
                this.fullscreenBtn.title = 'Exit Fullscreen';
            } else {
                this.fullscreenBtn.textContent = '🖥️';
                this.fullscreenBtn.title = 'Enter Fullscreen';
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
        this.themeSelector.value = savedTheme;
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

        this.logContent.appendChild(entryElement);
        this.logContent.scrollTop = this.logContent.scrollHeight;
    }

    toggleLogPanel() {
        this.logPanel.classList.toggle('collapsed');
        const isCollapsed = this.logPanel.classList.contains('collapsed');
        this.logToggle.textContent = isCollapsed ? '▲' : '▼';
        this.logToggleBtn.style.opacity = isCollapsed ? '0.6' : '1';
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
        
        this.chatList.appendChild(chatItem);
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
        const hasModel = this.modelSelector.value !== '';
        const hasText = this.messageInput.value.trim().length > 0;
        
        this.sendBtn.disabled = !hasText || !hasModel;
        
        if (hasModel) {
            localStorage.setItem('selectedModel', this.modelSelector.value);
            this.updateStatus('connected', `Connected to ${this.modelSelector.value.split(':')[1]}`);
        } else {
            this.updateStatus('', 'Select a model to begin');
        }
    }

    handleInputChange() {
        const hasText = this.messageInput.value.trim().length > 0;
        const hasModel = this.modelSelector.value !== '';
        this.sendBtn.disabled = !hasText || !hasModel;
    }

    handleKeyPress(e) {
        if (e.key === 'Enter' && !e.shiftKey && !this.sendBtn.disabled) {
            e.preventDefault();
            this.handleSendMessage();
        }
    }

    async handleSendMessage() {
        const message = this.messageInput.value.trim();
        if (!message || !this.modelSelector.value) {
            return;
        }

        // Add user message to UI and thread
        this.addMessageToThread('user', message);
        this.addMessageToUI('user', message);
        
        // Clear input and show typing indicator
        this.messageInput.value = '';
        this.handleInputChange();
        this.showTypingIndicator();
        this.setUIState(false);

        try {
            // Create assistant message container
            this.currentMessage = this.addMessageToUI('assistant', '');
            this.currentContent = '';

            // Send message using streaming
            await this.sendMessageToBackground(message, (content) => {
                this.handleStreamingContent(content);
            });

        } catch (error) {
            console.error('Error sending message:', error);
            this.hideTypingIndicator();
            
            // Show error message
            const errorMessage = `Error: ${error.message}`;
            this.addMessageToThread('assistant', errorMessage, true);
            this.addMessageToUI('assistant', errorMessage, true);
        } finally {
            this.setUIState(true);
        }
    }

    setUIState(enabled) {
        this.isProcessing = !enabled;
        this.modelSelector.disabled = !enabled;
        this.sendBtn.disabled = !enabled || !this.messageInput.value.trim() || !this.modelSelector.value;
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
        
        const stepDiv = document.createElement('div');
        stepDiv.className = `thinking-step ${isRevision ? 'revision' : 'active'}`;
        stepDiv.innerHTML = `
            <div class="thinking-number ${isRevision ? 'revision' : ''}">${currentStep}</div>
            <div class="thinking-content">
                ${this.parseBasicMarkdown(content)}
                <div class="thinking-meta">
                    Step ${currentStep} of ${totalSteps}${isRevision ? ' (Revision)' : ''}
                </div>
            </div>
        `;
        
        thinkingContainer.appendChild(stepDiv);
        
        // Mark previous steps as completed
        const allSteps = thinkingContainer.querySelectorAll('.thinking-step');
        allSteps.forEach((step, index) => {
            if (index < allSteps.length - 1) {
                step.classList.remove('active');
                step.classList.add('completed');
                const number = step.querySelector('.thinking-number');
                if (number) number.classList.add('completed');
            }
        });
        
        this.scrollToBottom();
    }

    getOrCreateThinkingContainer() {
        let container = this.messagesContainer.querySelector('.thinking-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'thinking-container';
            container.style.cssText = `
                margin: 1rem 0;
                padding: 1rem;
                background: var(--bg-card);
                border: 1px solid var(--border);
                border-radius: 12px;
                border-left: 4px solid var(--primary);
            `;
            
            const header = document.createElement('div');
            header.style.cssText = `
                font-weight: 600;
                color: var(--primary);
                margin-bottom: 1rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            `;
            header.innerHTML = '🧠 AI Thinking Process';
            
            container.appendChild(header);
            this.messagesContainer.appendChild(container);
        }
        return container;
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

    handleInlineToolExecution(response, currentAssistantMessage) {
        console.log('Handling inline tool execution:', response);
        
        if (!currentAssistantMessage) {
            currentAssistantMessage = this.addMessageToUI('assistant', '');
        }
        
        let toolIndicator = currentAssistantMessage.querySelector('.tool-indicator');
        
        if (response.status === 'executing') {
            if (!toolIndicator) {
                toolIndicator = document.createElement('div');
                toolIndicator.className = 'tool-indicator executing';
                
                const icon = document.createElement('div');
                icon.className = 'tool-icon executing';
                icon.textContent = '⚙️';
                
                const text = document.createElement('div');
                text.className = 'tool-text';
                text.textContent = this.getToolDisplayMessage(response.tool, response.args, 'executing');
                
                toolIndicator.appendChild(icon);
                toolIndicator.appendChild(text);
                currentAssistantMessage.appendChild(toolIndicator);
                
                this.scrollToBottom();
            }
        } else if (response.status === 'completed') {
            if (toolIndicator) {
                toolIndicator.className = 'tool-indicator completed';
                const icon = toolIndicator.querySelector('.tool-icon');
                const text = toolIndicator.querySelector('.tool-text');
                
                if (icon) {
                    icon.className = 'tool-icon completed';
                    icon.textContent = '✅';
                }
                
                if (text) {
                    text.textContent = this.getToolDisplayMessage(response.tool, response.args, 'completed');
                }
                
                // Auto-hide after 3 seconds
                setTimeout(() => {
                    if (toolIndicator && toolIndicator.parentNode) {
                        toolIndicator.style.opacity = '0';
                        toolIndicator.style.transform = 'translateY(-10px)';
                        setTimeout(() => {
                            if (toolIndicator && toolIndicator.parentNode) {
                                toolIndicator.remove();
                            }
                        }, 300);
                    }
                }, 3000);
            }
        } else if (response.status === 'error') {
            if (toolIndicator) {
                toolIndicator.className = 'tool-indicator error';
                const icon = toolIndicator.querySelector('.tool-icon');
                const text = toolIndicator.querySelector('.tool-text');
                
                if (icon) {
                    icon.className = 'tool-icon error';
                    icon.textContent = '❌';
                }
                
                if (text) {
                    text.textContent = this.getToolDisplayMessage(response.tool, response.args, 'error', response.error);
                }
            }
        }
    }

    getToolDisplayMessage(tool, args, status, error = null) {
        const toolNames = {
            'get_active_tabs': 'Getting active tabs',
            'extract_content': 'Extracting page content',
            'search_web': 'Searching the web',
            'take_screenshot': 'Taking screenshot'
        };

        const toolName = toolNames[tool] || tool;

        switch (status) {
            case 'executing':
                return `${toolName}...`;
            case 'completed':
                return `${toolName} completed`;
            case 'error':
                return `${toolName} failed${error ? `: ${error}` : ''}`;
            default:
                return toolName;
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
        
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (content) {
            if (typeof marked !== 'undefined' && role === 'assistant') {
                contentDiv.innerHTML = marked.parse(content);
                if (typeof Prism !== 'undefined') {
                    Prism.highlightAllUnder(contentDiv);
                }
                this.addCopyButtonsToCodeBlocks(contentDiv);
            } else {
                contentDiv.textContent = content;
            }
        }
        
        bubbleDiv.appendChild(contentDiv);
        messageDiv.appendChild(bubbleDiv);
        this.messagesContainer.appendChild(messageDiv);
        
        this.scrollToBottom();
        return messageDiv;
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
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
        const thread = this.threads.get(this.currentThread);
        if (thread) {
            thread.messages = [];
            this.saveThreads();
        }
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

    async sendMessageToBackground(message, onStream = null) {
        return new Promise((resolve, reject) => {
            this.currentMessage = null;
            this.currentContent = '';
            let isCompleted = false;
            let timeoutId = null;
            
            // Set a timeout to prevent hanging
            timeoutId = setTimeout(() => {
                if (!isCompleted) {
                    console.warn('Message processing timeout, forcing completion');
                    this.hideTypingIndicator();
                    
                    if (this.currentContent && this.currentContent.trim()) {
                        this.addMessageToThread('assistant', this.currentContent);
                        this.updateThreadPreview();
                    } else {
                        // Add a timeout message if no content was received
                        const timeoutMessage = "I apologize, but the request timed out. Please try again.";
                        this.addMessageToThread('assistant', timeoutMessage, true);
                        this.addMessageToUI('assistant', timeoutMessage, true);
                    }
                    
                    isCompleted = true;
                    resolve();
                }
            }, 60000); // 60 second timeout
            
            const completeResponse = () => {
                if (isCompleted) return;
                
                isCompleted = true;
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                
                console.log('Completing response');
                this.hideTypingIndicator();
                
                if (this.currentContent && this.currentContent.trim()) {
                    console.log('Saving final content to thread:', this.currentContent.length, 'characters');
                    this.addMessageToThread('assistant', this.currentContent);
                    this.updateThreadPreview();
                }
                
                this.currentMessage = null;
                this.currentContent = '';
                resolve();
            };
            
            try {
                // Create port connection for streaming
                const port = chrome.runtime.connect({ name: 'chat' });
                
                // Handle streaming messages
                port.onMessage.addListener((response) => {
                    console.log('Received port message:', response);
                    
                    if (response.error) {
                        console.error('Received error from background:', response.error);
                        if (!isCompleted) {
                            isCompleted = true;
                            if (timeoutId) clearTimeout(timeoutId);
                            this.hideTypingIndicator();
                            reject(new Error(response.error));
                        }
                        return;
                    }

                    // Handle different response types
                    if (response.type === 'delta' && response.content) {
                        if (onStream) {
                            onStream(response.content);
                        }
                    } else if (response.type === 'stream' && response.content) {
                        if (onStream) {
                            onStream(response.content);
                        }
                    } else if (response.type === 'complete' || response.done) {
                        console.log('Stream completed, finalizing response');
                        port.disconnect();
                        completeResponse();
                    } else if (response.type === 'tool_execution_inline') {
                        console.log('Handling tool execution:', response.tool, response.status);
                        // Handle inline tool execution updates
                        this.handleInlineToolExecution(response, this.currentMessage);
                    } else if (response.choices && response.choices[0] && response.choices[0].delta && response.choices[0].delta.content) {
                        // Handle Azure OpenAI format
                        if (onStream) {
                            onStream(response.choices[0].delta.content);
                        }
                    } else {
                        console.log('Unhandled response type:', response);
                    }
                });

                // Handle port disconnection
                port.onDisconnect.addListener(() => {
                    console.log('Port disconnected');
                    if (chrome.runtime.lastError) {
                        console.error('Port disconnected with error:', chrome.runtime.lastError);
                        if (!isCompleted) {
                            isCompleted = true;
                            if (timeoutId) clearTimeout(timeoutId);
                            this.hideTypingIndicator();
                            reject(new Error(chrome.runtime.lastError.message));
                        }
                    } else {
                        // Normal disconnection - ensure we complete properly
                        console.log('Normal port disconnection, completing response');
                        completeResponse();
                    }
                });

                // Send message using the format expected by background script
                console.log('Sending message to background:', {
                    type: 'PROCESS_MESSAGE',
                    message: message,
                    modelId: this.modelSelector.value
                });
                
                port.postMessage({
                    type: 'PROCESS_MESSAGE',
                    message: message,
                    modelId: this.modelSelector.value,
                    pageContent: '',  // Chat UI doesn't have page content
                    pageUrl: window.location.href,
                    pageTitle: document.title
                });

            } catch (error) {
                console.error('Error in sendMessageToBackground:', error);
                if (!isCompleted) {
                    isCompleted = true;
                    if (timeoutId) clearTimeout(timeoutId);
                    this.hideTypingIndicator();
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