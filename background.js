import { AzureOpenAIClient, ClaudeClient } from './aiClients.js';

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // Open options page or show welcome message
        chrome.tabs.create({
            url: 'welcome.html'
        });
    }
});

// Check if a URL is injectable
function isInjectableUrl(url) {
    if (!url) return false;
    
    // List of URL patterns where we can't inject scripts
    const restrictedPatterns = [
        'chrome://',
        'chrome-extension://',
        'edge://',
        'about:',
        'file://'
    ];
    
    return !restrictedPatterns.some(pattern => url.startsWith(pattern));
}

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    // Open chat in a new tab
    chrome.tabs.create({ url: 'chat.html' });
});

// Thread management
let activeThreads = new Map();

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request); // Debug log

    if (request.type === 'sendMessage') {
        handleMessage(request, sender, sendResponse);
        return true; // Keep the message channel open for streaming
    }

    if (request.type === 'GET_CONFIG') {
        // Get configuration from storage
        chrome.storage.local.get(['configContent'], (result) => {
            try {
                console.log('Retrieved config from storage:', result); // Debug log
                
                if (!result.configContent) {
                    console.warn('No configuration found in storage');
                    sendResponse({});
                    return;
                }

                const config = JSON.parse(result.configContent);
                console.log('Parsed configuration:', config); // Debug log

                // Validate the configuration structure
                if (!config.AzureOpenAi && !config.ClaudeAi) {
                    console.warn('Configuration missing AI model settings');
                    sendResponse({});
                    return;
                }

                // Add selected model from storage if available
                chrome.storage.local.get(['selectedModel'], (modelResult) => {
                    if (modelResult.selectedModel) {
                        config.selectedModel = modelResult.selectedModel;
                    }
                    console.log('Sending configuration to client:', config); // Debug log
                    sendResponse(config);
                });
            } catch (error) {
                console.error('Error parsing config:', error);
                sendResponse({ error: error.message });
            }
        });
        return true; // Keep the message channel open for async response
    }

    if (request.type === 'PROCESS_MESSAGE') {
        // Process the message using the selected model
        processMessage(request.message, request.modelId)
            .then(response => sendResponse(response))
            .catch(error => sendResponse({ error: error.message }));
        return true; // Keep the message channel open for async response
    }

    if (request.type === 'OPEN_OPTIONS') {
        // Open the options page
        chrome.runtime.openOptionsPage();
        sendResponse({ success: true });
        return true;
    }

    if (request.type === 'SAVE_CONFIG') {
        // Save configuration to storage
        chrome.storage.sync.set({ config: request.config }, () => {
            sendResponse({ success: true });
        });
        return true; // Keep the message channel open for async response
    }

    switch (request.type) {
        case 'GET_PAGE_INFO':
            // Get current page information
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tab = tabs[0];
                sendResponse({
                    url: tab.url,
                    title: tab.title
                });
            });
            return true;

        case 'GET_TAB_INFO':
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tab = tabs[0];
                sendResponse({ id: tab.id, url: tab.url, title: tab.title });
            });
            return true;

        case 'GET_PAGE_HTML':
            chrome.scripting
                .executeScript({
                    target: { tabId: sender.tab.id },
                    func: () => document.documentElement.outerHTML
                })
                .then((res) => sendResponse({ html: res[0].result }))
                .catch((err) => sendResponse({ error: err.message }));
            return true;

        case 'OPEN_TAB':
            chrome.tabs.create({ url: request.url || 'about:blank' }, (tab) => {
                sendResponse({ success: true, tabId: tab.id });
            });
            return true;

        case 'SEARCH_WEB':
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(request.query || '')}`;
            if (request.tabId) {
                chrome.tabs.update(request.tabId, { url: searchUrl }, () => {
                    sendResponse({ success: true, tabId: request.tabId });
                });
            } else {
                chrome.tabs.create({ url: searchUrl }, (tab) => {
                    sendResponse({ success: true, tabId: tab.id });
                });
            }
            return true;

        case 'EXECUTE_ACTION':
            // Handle action execution requests
            handleActionExecution(request.action, sender.tab.id)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ error: error.message }));
            return true;

        case 'VALIDATE_PAGE':
            // Handle page validation requests
            validatePageState(request.requirements, sender.tab.id)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ error: error.message }));
            return true;

        case 'SIDEBAR_READY':
            // Sidebar is ready, update the icon state if needed
            chrome.action.setIcon({
                path: {
                    16: 'icons/icon16.png',
                    48: 'icons/icon48.png',
                    128: 'icons/icon128.png'
                },
                tabId: sender.tab.id
            });
            return true;
    }
});

// Handle tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && isInjectableUrl(tab.url)) {
        // Inject the sidebar script when the page is fully loaded
        chrome.scripting.executeScript({
            target: { tabId },
            files: ['sidebar.js']
        }).catch(error => {
            console.error('Error injecting sidebar script:', error);
        });
    }
});

async function handleActionExecution(action, tabId) {
    try {
        switch (action.type) {
            case 'click':
                await chrome.scripting.executeScript({
                    target: { tabId },
                    func: clickElement,
                    args: [action.selector]
                });
                break;

            case 'type':
                await chrome.scripting.executeScript({
                    target: { tabId },
                    func: typeText,
                    args: [action.selector, action.text]
                });
                break;

            case 'navigate':
                await chrome.tabs.update(tabId, { url: action.url });
                break;

            default:
                throw new Error(`Unsupported action type: ${action.type}`);
        }

        return { success: true };
    } catch (error) {
        console.error('Action execution failed:', error);
        throw error;
    }
}

async function validatePageState(requirements, tabId) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: validateRequirements,
            args: [requirements]
        });

        return results[0].result;
    } catch (error) {
        console.error('Page validation failed:', error);
        throw error;
    }
}

// Functions to be injected into the page
function clickElement(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`Element not found: ${selector}`);
    }
    element.click();
}

function typeText(selector, text) {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`Element not found: ${selector}`);
    }
    element.value = text;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
}

function validateRequirements(requirements) {
    const results = {
        valid: true,
        details: []
    };

    for (const requirement of requirements) {
        let isValid = false;
        let message = '';

        switch (requirement.type) {
            case 'element_exists':
                const element = document.querySelector(requirement.selector);
                isValid = !!element;
                message = isValid ? 
                    `Element found: ${requirement.selector}` :
                    `Element not found: ${requirement.selector}`;
                break;

            case 'page_loaded':
                isValid = document.readyState === 'complete';
                message = isValid ? 
                    'Page fully loaded' :
                    'Page not fully loaded';
                break;

            case 'text_content':
                const textElement = document.querySelector(requirement.selector);
                isValid = textElement && textElement.textContent.includes(requirement.text);
                message = isValid ?
                    `Text found: ${requirement.text}` :
                    `Text not found: ${requirement.text}`;
                break;
        }

        results.details.push({
            type: requirement.type,
            valid: isValid,
            message
        });

        if (!isValid) {
            results.valid = false;
        }
    }

    return results;
}

async function processMessage(message, modelId) {
    try {
        // Get the configuration
        const config = await new Promise((resolve) => {
            chrome.storage.local.get(['configContent'], (result) => {
                try {
                    resolve(result.configContent ? JSON.parse(result.configContent) : null);
                } catch (error) {
                    console.error('Error parsing config:', error);
                    resolve(null);
                }
            });
        });

        if (!config) {
            throw new Error('No configuration found. Please set up your AI models in the extension settings.');
        }

        // Find the model configuration
        let modelConfig = null;
        let client = null;

        if (config.AzureOpenAi && config.AzureOpenAi[modelId]) {
            const models = config.AzureOpenAi[modelId];
            if (Array.isArray(models) && models.length > 0) {
                modelConfig = models[0];
                client = new AzureOpenAIClient(modelConfig);
            }
        } else if (config.ClaudeAi && config.ClaudeAi[modelId]) {
            const models = config.ClaudeAi[modelId];
            if (Array.isArray(models) && models.length > 0) {
                modelConfig = models[0];
                client = new ClaudeClient(modelConfig);
            }
        }

        if (!client) {
            throw new Error('Selected model not found in configuration.');
        }

        // Process the message using the appropriate client
        const response = await client.sendMessage(message);
        return { message: response };
    } catch (error) {
        console.error('Error processing message:', error);
        throw error;
    }
}

// Helper function to get configuration
async function getConfig() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['configContent'], (result) => {
            try {
                const config = result.configContent ? JSON.parse(result.configContent) : null;
                if (!config) {
                    throw new Error('No configuration found. Please set up your AI models in the extension settings.');
                }
                resolve(config);
            } catch (error) {
                console.error('Error parsing config:', error);
                throw new Error('Error loading configuration. Please check your settings.');
            }
        });
    });
}

// Get information about visible tabs
async function getVisibleTabsInfo() {
    try {
        // Only get basic tab information that doesn't require special permissions
        const tabs = await chrome.tabs.query({});
        console.log(`Found ${tabs.length} tabs in total`);
        
        // Filter out restricted URLs
        const visibleTabs = tabs.filter(tab => {
            const url = tab.url || '';
            return !url.startsWith('chrome://') && 
                   !url.startsWith('chrome-extension://') &&
                   !url.startsWith('about:') &&
                   !url.startsWith('file://');
        });
        
        console.log(`Found ${visibleTabs.length} visible tabs after filtering`);
        
        // Return only basic tab information without any attempt to access content
        return visibleTabs.map(tab => {
            return {
                id: tab.id,
                title: tab.title || "Untitled Tab",
                url: tab.url || "",
                isActive: tab.active,
                textContent: "For privacy reasons, tab content is not accessed",
                htmlContent: "",
                basicInfoOnly: true
            };
        });
    } catch (error) {
        console.error('Error getting tab info:', error);
        // Return empty array instead of throwing, to prevent complete failure
        return [{
            id: 0,
            title: "Error retrieving tabs",
            url: "",
            isActive: false,
            textContent: "Error retrieving tab information: " + error.message,
            htmlContent: "",
            error: error.message
        }];
    }
}

// Helper function to format tab context
function formatTabContext(tabs) {
    if (!tabs || tabs.length === 0) {
        return "No accessible tabs found. The AI will respond without browser context.";
    }
    
    return tabs.map(tab => {
        const status = tab.isActive ? '🔵' : '⚪';
        const isBasicInfo = tab.basicInfoOnly || tab.permissionError || tab.error;
        const infoNote = isBasicInfo ? 
            '\n**Note:** Only basic tab information is available to protect your privacy. To enable deeper analysis, open this content in the extension directly.' : '';
            
        return `## ${status} [${tab.title}]
**URL:** ${tab.url}
**Active Tab:** ${tab.isActive ? 'Yes' : 'No'}${infoNote}

${isBasicInfo ? '' : `### Text Content
\`\`\`
${tab.textContent || 'No text content available'}
\`\`\`

### HTML Content
\`\`\`html
${tab.htmlContent || 'No HTML content available'}
\`\`\``}

---`;
    }).join('\n\n');
}

// Handle streaming connections
chrome.runtime.onConnect.addListener((port) => {
    console.log('Connection established on port:', port.name);
    
    if (port.name !== 'chat') return;

    port.onMessage.addListener(async (message) => {
        console.log('Port received message:', message);
        
        if (message.type !== 'PROCESS_MESSAGE') {
            console.warn('Unknown message type on port:', message.type);
            port.postMessage({ error: 'Unknown message type' });
            return;
        }

        try {
            const config = await getConfig();
            let modelConfig = null;
            let client = null;

            // Get basic tab information without accessing content
            console.log('Getting basic tab info...');
            const visibleTabs = await getVisibleTabsInfo();
            console.log('Got basic tab info for', visibleTabs.length, 'tabs');
            
            // Create context from visible tabs in markdown format
            const context = formatTabContext(visibleTabs);
            console.log('Formatted basic tab context');

            // Find the model configuration
            if (config.AzureOpenAi && config.AzureOpenAi[message.modelId]) {
                const models = config.AzureOpenAi[message.modelId];
                if (Array.isArray(models) && models.length > 0) {
                    modelConfig = models[0];
                    client = new AzureOpenAIClient(modelConfig);
                    console.log('Using Azure OpenAI client with model:', models[0].ModelName);
                }
            } else if (config.ClaudeAi && config.ClaudeAi[message.modelId]) {
                const models = config.ClaudeAi[message.modelId];
                if (Array.isArray(models) && models.length > 0) {
                    modelConfig = models[0];
                    client = new ClaudeClient(modelConfig);
                    console.log('Using Claude client with model:', models[0].ModelName);
                }
            }

            if (!client) {
                console.error('Selected model not found in configuration:', message.modelId);
                port.postMessage({ error: 'Selected model not found in configuration.' });
                return;
            }

            // Create system message with tool instructions and current page info
            let systemMessage = `You are a helpful AI assistant with access to browser tools.\n\nUse the \`tool\` field to request an action. Available tools:\n- getActiveTabInfo\n- getActiveTabHtml\n- openNewTab\n- searchWeb\n\nFormat tool requests as JSON, for example: {"tool": "openNewTab", "args": {"url": "https://example.com"}}.\n\nHere is information about the current page and other open tabs:\n\n`;
            
            // Add current page information if available
            if (message.pageUrl && message.pageTitle) {
                systemMessage += `## Current Page
**Title:** ${message.pageTitle}
**URL:** ${message.pageUrl}
${message.pageHtml ? `\n### Page Content\n\`\`\`html\n${message.pageHtml}\n\`\`\`` : ''}\n\n`;
            }
            
            // Add other tabs information
            systemMessage += `## Other Open Tabs\n${context}\n\n`;
            systemMessage += `Provide assistance based on this information. If the user asks about specific content within other pages (not the current page), kindly explain that you don't have access to the full content of those pages for privacy reasons.`;

            // Stream processing functions
            const processStreamChunk = (chunk) => {
                try {
                    console.log('Processing stream chunk for port:', chunk ? typeof chunk : 'null');
                    
                    if (!chunk) {
                        console.warn('Empty chunk received');
                        return;
                    }
                    
                    if (chunk.done) {
                        console.log('Stream complete, sending done signal');
                        port.postMessage({ done: true });
                        return;
                    }
                    
                    let content = '';
                    
                    // Extract content based on format
                    if (chunk.type === 'delta' && chunk.content) {
                        content = chunk.content;
                    } else if (chunk.content) {
                        content = chunk.content;
                    } else if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
                        content = chunk.choices[0].delta.content;
                    } else if (typeof chunk === 'string') {
                        content = chunk;
                    }
                    
                    if (content && content.length > 0) {
                        console.log('Sending content chunk to port:', content.length, 'chars');
                        // Send the content via the port directly
                        port.postMessage({
                            type: 'delta',
                            content: content,
                            role: 'assistant'
                        });
                    }
                } catch (error) {
                    console.error('Error processing stream chunk:', error);
                    port.postMessage({ error: 'Error processing stream: ' + error.message });
                }
            };
            
            // Process message with streaming
            if (message.message && message.message.trim()) {
                try {
                    // Store thread information for later
                    const threadId = message.threadId || 'default';
                    if (!activeThreads.has(threadId)) {
                        activeThreads.set(threadId, {
                            messages: [],
                            lastActive: Date.now()
                        });
                    }
                    
                    const thread = activeThreads.get(threadId);
                    thread.messages.push({ role: 'user', content: message.message });
                    thread.lastActive = Date.now();
                    
                    // Process based on client type
                    if (client instanceof AzureOpenAIClient) {
                        console.log('Starting Azure OpenAI streaming...');
                        const azureMessages = [
                            { role: 'system', content: systemMessage },
                            { role: 'user', content: message.message }
                        ];
                        
                        await client.sendMessage(
                            { messages: azureMessages }, 
                            processStreamChunk
                        );
                    } else {
                        console.log('Starting Claude streaming...');
                        await client.sendMessage(
                            message.message,
                            processStreamChunk,
                            systemMessage
                        );
                    }
                    
                    console.log('AI processing completed for message');
                    
                    // Final done message
                    port.postMessage({ done: true });
                    
                } catch (streamError) {
                    console.error('Streaming error:', streamError);
                    port.postMessage({ error: 'AI processing error: ' + streamError.message });
                }
            } else {
                port.postMessage({ error: 'Empty message received' });
            }
        } catch (error) {
            console.error('Error in message processing:', error);
            port.postMessage({ error: error.message });
        }
    });

    port.onDisconnect.addListener(() => {
        console.log('Port disconnected');
        if (chrome.runtime.lastError) {
            console.error('Port disconnected with error:', chrome.runtime.lastError);
        }
    });
});

async function handleMessage(request, sender, sendResponse) {
    const { message, threadId, modelId, pageHtml, pageUrl, pageTitle } = request;
    
    if (!message || !modelId) {
        sendResponse({ error: 'Message and model ID are required' });
        return;
    }

    try {
        // Get configuration
        const config = await getConfig();
        if (!config) {
            throw new Error('Configuration not found. Please check your settings.');
        }

        // Get basic tab information without accessing content
        console.log('Getting basic tab info for chat...');
        const tabContent = await getVisibleTabsInfo();
        const activeTabs = tabContent.filter(tab => tab.isActive);
        
        // Log tab information
        console.log('Active tabs:', activeTabs.map(tab => ({
            title: tab.title,
            url: tab.url
        })));

        // Format context from tabs
        const context = formatTabContext(tabContent);
        console.log('Formatted basic tab context for chat');

        // Get the appropriate client based on the selected model
        let client = null;
        let isAzureClient = false;
        if (config.AzureOpenAi && config.AzureOpenAi[modelId]) {
            const models = config.AzureOpenAi[modelId];
            if (Array.isArray(models) && models.length > 0) {
                client = new AzureOpenAIClient(models[0]);
                isAzureClient = true;
                console.log('Using Azure OpenAI client with model:', models[0].ModelName);
            }
        } else if (config.ClaudeAi && config.ClaudeAi[modelId]) {
            const models = config.ClaudeAi[modelId];
            if (Array.isArray(models) && models.length > 0) {
                client = new ClaudeClient(models[0]);
                console.log('Using Claude client with model:', models[0].ModelName);
            }
        }

        if (!client) {
            throw new Error('Selected model not found in configuration');
        }

        // Create a descriptive system message with tool instructions
        let systemMessage = `You are a helpful AI assistant with access to browser tools.\n\nUse the \`tool\` field to request an action. Available tools:\n- getActiveTabInfo\n- getActiveTabHtml\n- openNewTab\n- searchWeb\n\nFormat tool requests as JSON, for example: {"tool": "openNewTab", "args": {"url": "https://example.com"}}.\n\nHere is information about the current page and other open tabs:\n\n`;
        
        // Add current page information if available
        if (pageUrl && pageTitle) {
            systemMessage += `## Current Page
**Title:** ${pageTitle}
**URL:** ${pageUrl}
${pageHtml ? `\n### Page Content\n\`\`\`html\n${pageHtml}\n\`\`\`` : ''}\n\n`;
        }
        
        // Add other tabs information
        systemMessage += `## Other Open Tabs\n${context}\n\n`;
        systemMessage += `Provide assistance based on this information. If the user asks about specific content within other pages (not the current page), kindly explain that you don't have access to the full content of those pages for privacy reasons.`;

        // Create streaming callback with debugging
        const onStream = (chunk) => {
            console.log('Received stream chunk:', JSON.stringify(chunk));
            try {
                // Format chunk for the chat UI
                let formattedChunk;
                if (chunk.done) {
                    formattedChunk = { done: true };
                } else {
                    formattedChunk = {
                        choices: [{
                            delta: {
                                content: chunk.content || chunk.choices?.[0]?.delta?.content || '',
                                role: chunk.role || 'assistant'
                            }
                        }]
                    };
                }
                
                console.log('Sending formatted chunk to UI:', JSON.stringify(formattedChunk));
                
                // Send streaming response back to the chat UI
                chrome.tabs.sendMessage(sender.tab.id, {
                    type: 'streamChunk',
                    threadId,
                    chunk: formattedChunk
                }).catch(error => {
                    console.error('Error sending message to tab:', error);
                });
            } catch (error) {
                console.error('Error sending stream chunk:', error);
            }
        };

        // Send initial response
        sendResponse({ stream: true });

        // Process message with streaming
        try {
            if (isAzureClient) {
                // For Azure OpenAI
                console.log('Starting Azure OpenAI streaming...');
                // Azure requires a specific format
                const azureMessages = [
                    { role: 'system', content: systemMessage },
                    { role: 'user', content: message }
                ];
                console.log('Azure streaming messages:', JSON.stringify({
                    system: azureMessages[0].content.length + ' chars',
                    user: azureMessages[1].content 
                }));
                await client.sendMessage({ messages: azureMessages }, (chunk) => {
                    console.log('Azure stream chunk:', chunk);
                    onStream(chunk);
                });
            } else {
                // For Claude
                console.log('Starting Claude streaming...');
                await client.sendMessage(message, systemMessage, onStream);
            }
            console.log('Streaming completed');
        } catch (error) {
            console.error('Error during streaming:', error);
            // Send error to chat UI
            try {
                chrome.tabs.sendMessage(sender.tab.id, {
                    type: 'streamChunk',
                    threadId,
                    chunk: {
                        error: error.message
                    }
                });
            } catch (sendError) {
                console.error('Error sending error message to tab:', sendError);
            }
            throw error;
        }

        // Store thread information
        if (!activeThreads.has(threadId)) {
            activeThreads.set(threadId, {
                messages: [],
                lastActive: Date.now()
            });
        }

        const thread = activeThreads.get(threadId);
        thread.messages.push({ role: 'user', content: message });
        thread.lastActive = Date.now();

    } catch (error) {
        console.error('Error processing message:', error);
        sendResponse({ error: error.message });
    }
}

function getClientForModel(config) {
    if (config.AzureOpenAi && config.AzureOpenAi[config.selectedModel]) {
        const models = config.AzureOpenAi[config.selectedModel];
        if (Array.isArray(models) && models.length > 0) {
            return new AzureOpenAIClient(models[0]);
        }
    } else if (config.ClaudeAi && config.ClaudeAi[config.selectedModel]) {
        const models = config.ClaudeAi[config.selectedModel];
        if (Array.isArray(models) && models.length > 0) {
            return new ClaudeClient(models[0]);
        }
    }
    return null;
} 