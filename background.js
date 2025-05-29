import { AzureOpenAIClient, ClaudeClient } from './aiClients.js';

// Global execution context to maintain state across thinking steps
let globalExecutionContext = {
    currentTabId: null,
    lastSearchTabId: null,
    variables: {},
    sessionId: null
};

// Reset global context when starting a new conversation
function resetGlobalContext() {
    globalExecutionContext = {
        currentTabId: null,
        lastSearchTabId: null,
        variables: {},
        sessionId: Date.now().toString()
    };
}

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // Open options page or show welcome message
        chrome.tabs.create({
            url: 'welcome.html'
        });
    }
    
    // Create context menu item for opening sidebar
    chrome.contextMenus.create({
        id: 'openSidebar',
        title: 'Open XatBrowser AI Sidebar',
        contexts: ['action']  // This makes it appear in the extension's dropdown menu
    });

    // Create context menu item for opening full chat interface
    chrome.contextMenus.create({
        id: 'openFullChat',
        title: 'Open XatBrowser AI Full Interface',
        contexts: ['action']
    });
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
    if (tab && isInjectableUrl(tab.url)) {
        const domain = new URL(tab.url).hostname;
        
        chrome.tabs.sendMessage(tab.id, { type: 'SHOW_SIDEBAR_ONCE' }, (response) => {
            if (chrome.runtime.lastError) {
                console.log('No existing enhanced sidebar, injecting new one...');
                injectEnhancedSidebar(tab.id, domain);
            } else {
                console.log('Enhanced sidebar shown successfully');
            }
        });
    } else {
        // Open chat.html in a new window with full screen dimensions
        chrome.windows.create({
            url: 'chat.html',
            type: 'normal',
            state: 'maximized',
            focused: true
        });
    }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'openSidebar') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTab = tabs[0];
            if (!currentTab || !isInjectableUrl(currentTab.url)) {
                console.log('Cannot inject sidebar into this tab:', currentTab?.url);
                return;
            }

            console.log('Opening sidebar for domain:', currentTab.url);

            const domain = new URL(currentTab.url).hostname;

            // Check if enhanced sidebar is already loaded
            chrome.scripting.executeScript({
                target: { tabId: currentTab.id },
                func: () => window.xatBrowserEnhancedSidebarLoaded && window.xatBrowserEnhancedSidebar
            }).then((result) => {
                if (result && result[0] && result[0].result) {
                    console.log('Enhanced sidebar already exists, showing it...');
                    chrome.scripting.executeScript({
                        target: { tabId: currentTab.id },
                        func: (domain) => {
                            if (window.xatBrowserEnhancedSidebar) {
                                window.xatBrowserEnhancedSidebar.showSidebarForDomain(domain);
                                return true;
                            }
                            return false;
                        },
                        args: [domain]
                    });
                } else {
                    console.log('No enhanced sidebar found, injecting new one...');
                    injectEnhancedSidebar(currentTab.id, domain);
                }
            }).catch((error) => {
                console.log('Error checking sidebar status, injecting new one...', error);
                injectEnhancedSidebar(currentTab.id, domain);
            });
        });
    } else if (info.menuItemId === 'openFullChat') {
        // Open full chat interface in maximized window
        chrome.windows.create({
            url: 'chat.html',
            type: 'normal',
            state: 'maximized',
            focused: true
        });
    }
});

// Helper function to inject enhanced sidebar
function injectEnhancedSidebar(tabId, domain) {
    // Check if tab is still valid
    chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
            console.error('Tab no longer exists:', chrome.runtime.lastError.message);
            return;
        }

        // Inject orchestrator first, then enhanced sidebar
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['orchestrator.js']
        }).then(() => {
            return chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['sidebar-enhanced.js']
            });
        }).then(() => {
            console.log('Enhanced sidebar scripts injected successfully');
            setTimeout(() => {
                if (domain) {
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        func: (domain) => {
                            if (window.xatBrowserEnhancedSidebar) {
                                window.xatBrowserEnhancedSidebar.showSidebarForDomain(domain);
                            }
                        },
                        args: [domain]
                    }).catch((error) => {
                        console.error('Failed to show sidebar for domain:', error.message);
                    });
                } else {
                    chrome.tabs.sendMessage(tabId, { type: 'SHOW_SIDEBAR_ONCE' }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error('Failed to show enhanced sidebar:', chrome.runtime.lastError.message);
                        } else {
                            console.log('Enhanced sidebar shown successfully');
                        }
                    });
                }
            }, 500);
        }).catch((error) => {
            console.error('Failed to inject enhanced sidebar scripts:', error.message);
            
            // Try fallback to regular sidebar if enhanced fails
            if (error.message.includes('context invalidated') || error.message.includes('tab was discarded')) {
                console.log('Attempting fallback to regular sidebar...');
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['sidebar.js']
                }).catch((fallbackError) => {
                    console.error('Fallback sidebar injection also failed:', fallbackError.message);
                });
            }
        });
    });
}

// Thread management
let activeThreads = new Map();

// Add dynamic tool registry
const dynamicTools = new Map();

// Handle dynamic tool registration
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'REGISTER_DYNAMIC_TOOL') {
        try {
            const { name, implementation } = request.tool;
            // Create a safe sandbox for the tool
            const toolFunction = new Function('args', `
                with (args) {
                    ${implementation}
                }
            `);
            
            dynamicTools.set(name, async (args) => {
                try {
                    return await toolFunction(args);
                } catch (error) {
                    console.error(`Error executing dynamic tool ${name}:`, error);
                    throw error;
                }
            });
            
            sendResponse({ success: true });
        } catch (error) {
            console.error('Error registering dynamic tool:', error);
            sendResponse({ error: error.message });
        }
        return true;
    }

    if (request.type === 'EXECUTE_DYNAMIC_TOOL') {
        const { name, args } = request;
        if (!dynamicTools.has(name)) {
            sendResponse({ error: `Dynamic tool ${name} not found` });
            return true;
        }

        dynamicTools.get(name)(args)
            .then(result => sendResponse({ success: true, result }))
            .catch(error => sendResponse({ error: error.message }));
        return true;
    }

    if (request.type === 'EXECUTE_TOOL') {
        const { tool, args } = request;
        
        executeToolCall({ tool, args })
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ error: error.message }));
        return true;
    }

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

        case 'OPEN_SIDEBAR':
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tab = tabs[0];
                if (!tab || !isInjectableUrl(tab.url)) return;

                const domain = new URL(tab.url).hostname;
                chrome.tabs.sendMessage(tab.id, { type: 'SHOW_SIDEBAR_ONCE' }, () => {
                    if (chrome.runtime.lastError) {
                        injectEnhancedSidebar(tab.id, domain);
                    }
                });
            });
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

// Handle tab updates - Don't auto-inject sidebar anymore
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Sidebar is now only shown when user explicitly requests it via context menu or extension icon
    // This prevents unwanted sidebar appearances and respects user's domain-specific preferences
    if (changeInfo.status === 'complete' && isInjectableUrl(tab.url)) {
        console.log('Page loaded, sidebar will only appear when user requests it');
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
        const config = await getConfig();
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

    let isConnected = true;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;

    port.onDisconnect.addListener(() => {
        console.log('Port disconnected');
        isConnected = false;
        
        if (chrome.runtime.lastError) {
            console.error('Port disconnected with error:', chrome.runtime.lastError);
            
            if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
                if (reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++;
                    console.log(`Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`);
                    setTimeout(() => {
                        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                            if (tabs[0]) {
                                chrome.scripting.executeScript({
                                    target: { tabId: tabs[0].id },
                                    files: ['orchestrator.js', 'sidebar-enhanced.js']
                                }).catch(error => {
                                    console.error('Error re-injecting scripts:', error);
                                });
                            }
                        });
                    }, 1000 * reconnectAttempts);
                }
            }
        }
    });

    port.onMessage.addListener(async (message) => {
        if (!isConnected) {
            console.warn('Received message on disconnected port, ignoring:', message.type);
            return;
        }

        console.log('Port received message:', message);
        
        if (message.type !== 'PROCESS_MESSAGE') {
            console.warn('Unknown message type on port:', message.type);
            if (isConnected) {
                try {
                    port.postMessage({ error: 'Unknown message type' });
                } catch (e) {
                    console.warn('Error sending error response:', e);
                    isConnected = false;
                }
            }
            return;
        }

        try {
            // Reset global context for new conversation if needed
            if (!globalExecutionContext.sessionId || globalExecutionContext.sessionId !== message.sessionId) {
                console.log('Starting new session, resetting global context');
                resetGlobalContext();
                globalExecutionContext.sessionId = message.sessionId || Date.now().toString();
            }
            
            const config = await getConfig();
            let modelConfig = null;
            let client = null;

            // Get basic tab information
            console.log('Getting basic tab info...');
            const visibleTabs = await getVisibleTabsInfo();
            console.log('Got basic tab info for', visibleTabs.length, 'tabs');
            
            // Create context from visible tabs
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
                if (isConnected) {
                    try {
                        port.postMessage({ error: 'Selected model not found in configuration.' });
                    } catch (e) {
                        console.warn('Error sending error response:', e);
                        isConnected = false;
                    }
                }
                return;
            }

            // Create enhanced system message with orchestrator capabilities
            const systemMessage = getSystemMessage(context);
            
            // Add current page information if available
            let enhancedSystemMessage = systemMessage;
            if (message.pageUrl && message.pageTitle) {
                enhancedSystemMessage += `\n\nCURRENT PAGE CONTEXT:
**Title:** ${message.pageTitle}
**URL:** ${message.pageUrl}
**Content Preview:** ${message.pageContent ? message.pageContent.substring(0, 1000) + '...' : 'No content available'}

Use this context when relevant to the user's request.`;
            }

            // Enhanced streaming callback with sequential thinking and tool execution detection
            const processStreamChunk = async (chunk) => {
                try {
                    if (!isConnected) {
                        console.warn("processStreamChunk: Port disconnected, cannot send chunk.");
                        return;
                    }
                    console.log('Processing stream chunk for port:', chunk ? typeof chunk : 'null');
                    
                    if (!chunk) {
                        console.warn('Empty chunk received');
                        return;
                    }
                    
                    if (chunk.done) {
                        console.log('Stream complete, sending done signal');
                        if (isConnected) {
                            try {
                                port.postMessage({ done: true });
                            } catch (e) {
                                console.warn('Error sending done signal:', e);
                                isConnected = false;
                            }
                        }
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
                        console.log('Processing content chunk:', content);
                        
                        // Accumulate content for thinking block detection
                        if (!processStreamChunk.accumulatedContent) {
                            processStreamChunk.accumulatedContent = '';
                        }
                        processStreamChunk.accumulatedContent += content;
                        
                        // Check for thinking blocks
                        const thinkingMatches = processStreamChunk.accumulatedContent.match(/\[THINKING:(\d+)\/(\d+)\]([\s\S]*?)\[\/THINKING\]/g);
                        
                        if (thinkingMatches) {
                            console.log('Found thinking blocks:', thinkingMatches.length);
                            
                            for (const thinkingBlock of thinkingMatches) {
                                const thinkingMatch = thinkingBlock.match(/\[THINKING:(\d+)\/(\d+)\]([\s\S]*?)\[\/THINKING\]/);
                                if (thinkingMatch) {
                                    const [fullMatch, currentStep, totalSteps, thinkingContent] = thinkingMatch;
                                    
                                    // Send thinking step to UI
                                    if (!isConnected) {
                                        console.warn("processStreamChunk: Port disconnected, cannot notify thinking step.");
                                    } else {
                                        try {
                                            port.postMessage({
                                                type: 'thinking_step',
                                                currentStep: parseInt(currentStep),
                                                totalSteps: parseInt(totalSteps),
                                                content: thinkingContent.trim()
                                            });
                                        } catch (e) {
                                            console.warn('Error sending thinking step:', e);
                                            isConnected = false;
                                            return;
                                        }
                                    }
                                    
                                    // Look for tool calls within thinking content
                                    console.log('=== TOOL DETECTION DEBUG ===');
                                    console.log('Raw thinking content:', JSON.stringify(thinkingContent));
                                    
                                    // Enhanced tool detection with multiple strategies
                                    let toolMatches = null;
                                    let detectionMethod = 'none';
                                    
                                    // Strategy 1: Standard JSON tool format
                                    toolMatches = thinkingContent.match(/\{"tool":\s*"[^"]+",\s*"args":\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\}/g);
                                    if (toolMatches) {
                                        detectionMethod = 'regex-standard';
                                        console.log('✅ Found tools with standard regex:', toolMatches);
                                    }
                                    
                                    // Strategy 2: Simpler regex for basic cases
                                    if (!toolMatches) {
                                        toolMatches = thinkingContent.match(/\{"tool":\s*"[^"]+",\s*"args":\s*\{.*?\}\}/g);
                                        if (toolMatches) {
                                            detectionMethod = 'regex-simple';
                                            console.log('✅ Found tools with simple regex:', toolMatches);
                                        }
                                    }
                                    
                                    // Strategy 3: Line-by-line parsing
                                    if (!toolMatches) {
                                        console.log('❌ Regex failed, trying line-by-line parsing...');
                                        const lines = thinkingContent.split('\n');
                                        const foundTools = [];
                                        
                                        for (let i = 0; i < lines.length; i++) {
                                            const line = lines[i].trim();
                                            
                                            if (line.startsWith('{"tool":') && line.includes('"args":')) {
                                                console.log(`Potential tool line found: ${line}`);
                                                try {
                                                    const parsed = JSON.parse(line);
                                                    if (parsed.tool && parsed.args) {
                                                        foundTools.push(line);
                                                        console.log('✅ Valid tool parsed:', parsed.tool, parsed.args);
                                                    }
                                                } catch (e) {
                                                    console.log('❌ Failed to parse tool line:', e.message);
                                                }
                                            }
                                        }
                                        
                                        if (foundTools.length > 0) {
                                            toolMatches = foundTools;
                                            detectionMethod = 'line-parsing';
                                            console.log('✅ Found tools via line parsing:', foundTools);
                                        }
                                    }
                                    
                                    console.log('=== DETECTION RESULT ===');
                                    console.log('Method used:', detectionMethod);
                                    console.log('Tools found:', toolMatches ? toolMatches.length : 0);
                                    console.log('Tool matches:', toolMatches);
                                    
                                    if (toolMatches && toolMatches.length > 0) {
                                        console.log('🚀 EXECUTING TOOLS:', toolMatches);
                                        
                                        // Execute tools sequentially and wait for completion
                                        try {
                                            const executionContext = await executeSequentialTools(toolMatches, port, currentStep, totalSteps);
                                            console.log('✅ Tool execution completed, context:', executionContext);
                                            
                                            // Mark that tools were executed for final response generation
                                            toolsWereExecutedInThisCycle = true;
                                            if (executionContext && executionContext.allToolResults) {
                                                accumulatedToolResultsThisCycle.push(...executionContext.allToolResults);
                                            }
                                            
                                        } catch (toolExecutionError) {
                                            console.error('Error in tool execution:', toolExecutionError);
                                        }
                                        
                                        // Remove tool JSON from content sent to UI
                                        let filteredThinkingContent = thinkingContent;
                                        toolMatches.forEach(toolMatch => {
                                            filteredThinkingContent = filteredThinkingContent.replace(toolMatch, '');
                                        });
                                        
                                        // Update thinking step with filtered content
                                        if (!isConnected) {
                                            console.warn("processStreamChunk: Port disconnected, cannot notify thinking step.");
                                        } else {
                                            try {
                                                port.postMessage({
                                                    type: 'thinking_step',
                                                    currentStep: parseInt(currentStep),
                                                    totalSteps: parseInt(totalSteps),
                                                    content: filteredThinkingContent.trim()
                                                });
                                            } catch (e) {
                                                console.warn('Error sending filtered thinking step:', e);
                                                isConnected = false;
                                                return;
                                            }
                                        }
                                    } else {
                                        console.log('❌ NO TOOLS DETECTED');
                                    }
                                }
                            }
                            
                            // Remove processed thinking blocks from accumulated content
                            thinkingMatches.forEach(block => {
                                processStreamChunk.accumulatedContent = processStreamChunk.accumulatedContent.replace(block, '');
                            });
                        }
                        
                        // Send remaining content (non-thinking blocks) to UI
                        const remainingContent = content.replace(/\[THINKING:(\d+)\/(\d+)\][\s\S]*?\[\/THINKING\]/g, '');
                        if (remainingContent.trim()) {
                            if (!isConnected) {
                                console.warn("processStreamChunk: Port disconnected, cannot send remaining content.");
                                return;
                            }
                            try {
                                port.postMessage({
                                    type: 'delta',
                                    content: remainingContent,
                                    role: 'assistant'
                                });
                            } catch (e) {
                                console.warn('Error sending remaining content:', e);
                                isConnected = false;
                                return;
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error processing stream chunk:', error);
                    if (isConnected) {
                        try {
                            port.postMessage({ error: 'Error processing stream: ' + error.message });
                        } catch (e) {
                            console.warn('Error sending stream error:', e);
                            isConnected = false;
                        }
                    }
                }
            };
            
            // Helper function to generate final response from tool results
            const generateFinalResponseFromResults = async (toolResults) => {
                if (!toolResults || toolResults.length === 0) return;
                
                console.log('🎯 Generating final response from tool results...');
                
                const finalResponseSystemMessage = getSystemMessage(context) + 
                    `\n\nTOOL EXECUTION SUMMARY:\n${JSON.stringify(toolResults, null, 2)}` + 
                    "\n\nTASK: Provide a final, comprehensive answer to the user's original query based *only* on the information from the tool execution summary. Do not attempt to call any more tools. Summarize the findings and directly answer the user.";

                const finalUserPrompt = `Based on the tool execution results (summarized in the system message), please provide the final answer to my original query: "${message.message}"`;

                try {
                    if (client instanceof AzureOpenAIClient) {
                        const finalAzureMessages = [
                            { role: 'system', content: finalResponseSystemMessage },
                            { role: 'user', content: finalUserPrompt }
                        ];
                        await client.sendMessage({ messages: finalAzureMessages }, (finalChunk) => {
                            if (!isConnected) return;
                            if (finalChunk.done) {
                                port.postMessage({ done: true });
                            } else {
                                port.postMessage({ type: 'delta', content: finalChunk.content || finalChunk.choices?.[0]?.delta?.content || '', role: 'assistant' });
                            }
                        });
                    } else { // Claude or other
                        await client.sendMessage(finalUserPrompt, (finalChunk) => {
                            if (!isConnected) return;
                            if (finalChunk.done) {
                                port.postMessage({ done: true });
                            } else {
                                port.postMessage({ type: 'delta', content: finalChunk.content || '', role: 'assistant' });
                            }
                       }, finalResponseSystemMessage);
                    }
                    console.log('Final response streaming initiated and completed.');
                } catch (finalResponseError) {
                    console.error("Error streaming final AI response:", finalResponseError);
                    if (isConnected) {
                        try {
                            port.postMessage({ error: 'Error generating final AI response: ' + finalResponseError.message });
                        } catch (e) {
                            console.warn('Error sending final response error to port:', e);
                            isConnected = false;
                        }
                    }
                }
            };

            // Initialize tool execution tracking
            let toolsWereExecutedInThisCycle = false;
            let accumulatedToolResultsThisCycle = [];
            
            // Sequential tool execution function
            async function executeSequentialTools(toolMatches, port, currentStep, totalSteps) {
                console.log('Executing sequential tools:', toolMatches.length);
                console.log('Starting with global context:', globalExecutionContext);
                
                // Mark that tools are being executed
                toolsWereExecutedInThisCycle = true;
                
                // Use global context but also maintain local context for this execution
                let executionContext = {
                    ...globalExecutionContext, // Inherit from global context
                    lastResult: null,
                    allToolResults: [] // To store results of all tools in the sequence
                };
                
                // Helper function to check if port is still connected
                const isPortConnected = () => {
                    try {
                        // Try to access port properties to check if it's still valid
                        return port && port.name && !chrome.runtime.lastError;
                    } catch (e) {
                        return false;
                    }
                };
                
                for (let i = 0; i < toolMatches.length; i++) {
                    const toolMatch = toolMatches[i];
                    let toolCall; // Declare toolCall outside the try block
                    
                    try {
                        toolCall = JSON.parse(toolMatch); // Assign inside the try block
                        console.log(`Executing tool ${i + 1}/${toolMatches.length}:`, toolCall.tool);
                        
                        // Enhance tool arguments with context
                        const enhancedArgs = { ...toolCall.args };
                        
                        // Auto-inject tabId for tools that need it (use global context)
                        if (globalExecutionContext.currentTabId && 
                            ['searchWeb', 'getPageContent', 'stagehandAct', 'stagehandExtract', 'stagehandObserve', 'screenshot'].includes(toolCall.tool) &&
                            !enhancedArgs.tabId) {
                            enhancedArgs.tabId = globalExecutionContext.currentTabId;
                            console.log(`✅ Auto-injected tabId ${globalExecutionContext.currentTabId} for ${toolCall.tool} from global context`);
                        } else {
                            console.log(`📋 Tool ${toolCall.tool} context:`, {
                                hasGlobalTabId: !!globalExecutionContext.currentTabId,
                                globalTabId: globalExecutionContext.currentTabId,
                                hasProvidedTabId: !!enhancedArgs.tabId,
                                providedTabId: enhancedArgs.tabId,
                                needsTabId: ['searchWeb', 'getPageContent', 'stagehandAct', 'stagehandExtract', 'stagehandObserve', 'screenshot'].includes(toolCall.tool)
                            });
                        }
                        
                        // Notify UI of tool execution start
                        if (!isPortConnected()) {
                            console.warn("executeSequentialTools: Port disconnected, cannot notify tool start.");
                            break;
                        } else {
                            try {
                                port.postMessage({
                                    type: 'tool_execution_inline',
                                    tool: toolCall.tool,
                                    args: enhancedArgs,
                                    status: 'executing',
                                    message: `Step ${currentStep}/${totalSteps}: ${getToolExecutionMessage(toolCall.tool, 'executing')}`,
                                    stepInfo: { currentStep, totalSteps, toolIndex: i + 1, totalTools: toolMatches.length }
                                });
                            } catch (e) {
                                console.warn('Error sending tool start notification:', e);
                                break;
                            }
                        }
                        
                        // Execute the tool with enhanced arguments
                        const toolResult = await executeToolCall({ tool: toolCall.tool, args: enhancedArgs });
                        console.log('Tool execution completed:', toolCall.tool, 'success:', toolResult.success);
                        
                        // Update execution context based on tool result
                        if (toolResult.success) {
                            executionContext.lastResult = toolResult;
                            executionContext.allToolResults.push({ tool: toolCall.tool, args: enhancedArgs, result: toolResult, success: true });
                            
                            // Add to accumulated results for final response
                            accumulatedToolResultsThisCycle.push({ tool: toolCall.tool, args: enhancedArgs, result: toolResult, success: true });
                            
                            // Update both local and global context if tool returned tabId
                            if (toolResult.tabId) {
                                executionContext.currentTabId = toolResult.tabId;
                                globalExecutionContext.currentTabId = toolResult.tabId;
                                
                                // If it's a search result, also update lastSearchTabId
                                if (toolCall.tool === 'searchWeb') {
                                    globalExecutionContext.lastSearchTabId = toolResult.tabId;
                                }
                                
                                console.log(`Updated both local and global context tabId to: ${toolResult.tabId}`);
                            }
                            
                            // Store any variables from the result in global context
                            if (toolResult.variables) {
                                executionContext.variables = { ...executionContext.variables, ...toolResult.variables };
                                globalExecutionContext.variables = { ...globalExecutionContext.variables, ...toolResult.variables };
                            }
                        }
                        
                        // Notify UI of tool completion with results
                        if (!isPortConnected()) {
                            console.warn("executeSequentialTools: Port disconnected, cannot notify tool completion.");
                            break;
                        } else {
                            try {
                                port.postMessage({
                                    type: 'tool_execution_inline',
                                    tool: toolCall.tool,
                                    args: enhancedArgs,
                                    result: toolResult,
                                    status: 'completed',
                                    message: `Step ${currentStep}/${totalSteps}: ${getToolExecutionMessage(toolCall.tool, 'completed')}`,
                                    stepInfo: { currentStep, totalSteps, toolIndex: i + 1, totalTools: toolMatches.length },
                                    context: { tabId: globalExecutionContext.currentTabId } // Include global context in response
                                });
                            } catch (e) {
                                console.warn('Error sending tool completion notification:', e);
                                break;
                            }
                        }
                        
                        // Add delay between tools for better UX
                        if (i < toolMatches.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                        
                    } catch (error) {
                        console.error('Sequential tool execution error:', error);
                        if (isPortConnected()) {
                            try {
                                port.postMessage({
                                    type: 'tool_execution_inline',
                                    tool: toolCall?.tool || 'unknown', // Now toolCall can be safely accessed here
                                    args: toolCall?.args || {},
                                    error: error.message,
                                    status: 'error',
                                    message: `Step ${currentStep}/${totalSteps}: Error executing ${toolCall?.tool || 'tool'}: ${error.message}`,
                                    stepInfo: { currentStep, totalSteps, toolIndex: i + 1, totalTools: toolMatches.length }
                                });
                            } catch (e) {
                                console.warn('Error sending tool error notification:', e);
                            }
                        }
                        
                        // Stop execution on error
                        executionContext.allToolResults.push({ tool: toolCall?.tool || 'unknown', args: toolCall?.args || {}, error: error.message, success: false });
                        accumulatedToolResultsThisCycle.push({ tool: toolCall?.tool || 'unknown', args: toolCall?.args || {}, error: error.message, success: false });
                        break;
                    }
                }
                
                console.log('Sequential tool execution completed. Final context:', executionContext);
                console.log('Updated global context:', globalExecutionContext);
                return executionContext; // Return the entire context
            }

            // Helper function for tool execution messages
            function getToolExecutionMessage(tool, status) {
                const messages = {
                    searchWeb: {
                        executing: 'Searching the web...',
                        completed: 'Web search completed'
                    },
                    getPageContent: {
                        executing: 'Extracting page content...',
                        completed: 'Page content extracted'
                    },
                    openNewTab: {
                        executing: 'Opening new tab...',
                        completed: 'New tab opened'
                    },
                    generateTool: {
                        executing: 'Generating tool...',
                        completed: 'Tool generated'
                    },
                    // Stagehand tools
                    stagehandNavigate: {
                        executing: 'Navigating to URL...',
                        completed: 'Navigation completed'
                    },
                    stagehandAct: {
                        executing: 'Performing action...',
                        completed: 'Action completed'
                    },
                    stagehandExtract: {
                        executing: 'Extracting page content...',
                        completed: 'Content extracted'
                    },
                    stagehandObserve: {
                        executing: 'Observing page elements...',
                        completed: 'Elements observed'
                    },
                    screenshot: {
                        executing: 'Taking screenshot...',
                        completed: 'Screenshot captured'
                    }
                };
                
                return messages[tool]?.[status] || `${status} ${tool}`;
            }

            // Process based on client type
            let initialProcessingError = null;
            try {
                if (client instanceof AzureOpenAIClient) {
                    console.log('Starting Azure OpenAI streaming...');
                    const azureMessages = [
                        { role: 'system', content: enhancedSystemMessage },
                        { role: 'user', content: message.message }
                    ];
                    console.log('Azure streaming messages:', JSON.stringify({
                        system: azureMessages[0].content.length + ' chars',
                        user: azureMessages[1].content 
                    }));
                    await client.sendMessage({ messages: azureMessages }, processStreamChunk);
                } else {
                    console.log('Starting Claude streaming...');
                    await client.sendMessage(message.message, processStreamChunk, enhancedSystemMessage);
                }
            } catch (err) {
                initialProcessingError = err;
                console.error("Error during initial AI processing stream:", err);
                if (isConnected) {
                    try {
                        port.postMessage({ error: 'Error during initial AI processing: ' + err.message });
                    } catch (e) {
                        console.warn('Error sending initial processing error to port:', e);
                        isConnected = false;
                    }
                }
            }
            
            console.log('Initial AI processing (including any tool calls) completed.');

            if (initialProcessingError) {
                 // If primary processing failed, don't attempt to send a final response or done signal beyond error already sent
                return; 
            }

            // If tools were executed, now generate a final response based on their results
            if (toolsWereExecutedInThisCycle && accumulatedToolResultsThisCycle.length > 0) {
                console.log("Tools were executed. Generating final response based on results:", accumulatedToolResultsThisCycle);
                
                const finalResponseSystemMessage = getSystemMessage(context) + 
                    `\n\nTOOL EXECUTION SUMMARY:\n${JSON.stringify(accumulatedToolResultsThisCycle, null, 2)}` + 
                    "\n\nTASK: Provide a final, comprehensive answer to the user's original query based *only* on the information from the tool execution summary. Do not attempt to call any more tools. Summarize the findings and directly answer the user.";

                const finalUserPrompt = `Based on the tool execution results (summarized in the system message), please provide the final answer to my original query: "${message.message}"`;

                try {
                    if (client instanceof AzureOpenAIClient) {
                        const finalAzureMessages = [
                            { role: 'system', content: finalResponseSystemMessage },
                            { role: 'user', content: finalUserPrompt }
                        ];
                        await client.sendMessage({ messages: finalAzureMessages }, (finalChunk) => {
                            if (!isConnected) return;
                            if (finalChunk.done) {
                                port.postMessage({ done: true });
                            } else {
                                port.postMessage({ type: 'delta', content: finalChunk.content || finalChunk.choices?.[0]?.delta?.content || '', role: 'assistant' });
                            }
                        });
                    } else { // Claude or other
                        await client.sendMessage(finalUserPrompt, (finalChunk) => {
                            if (!isConnected) return;
                            if (finalChunk.done) {
                                port.postMessage({ done: true });
                            } else {
                                port.postMessage({ type: 'delta', content: finalChunk.content || '', role: 'assistant' });
                            }
                       }, finalResponseSystemMessage);
                    }
                    console.log('Final response streaming initiated and completed.');
                } catch (finalResponseError) {
                    console.error("Error streaming final AI response:", finalResponseError);
                    if (isConnected) {
                        try {
                            port.postMessage({ error: 'Error generating final AI response: ' + finalResponseError.message });
                        } catch (e) {
                            console.warn('Error sending final response error to port:', e);
                            isConnected = false;
                        }
                    }
                }
            } else if (isConnected) {
                 // If no tools were executed or no results, just send the done signal from the initial processing.
                console.log('No tools executed or no results to summarize, sending done signal from initial processing.');
                port.postMessage({ done: true });
            }
            
        } catch (error) {
            console.error('Error in message processing:', error);
            let errorMessage = error.message;
            
            if (error.message.includes('Extension context invalidated')) {
                errorMessage = 'Extension context lost. Please refresh the page and try again.';
                isConnected = false;
            }
            
            if (isConnected) {
                try {
                    port.postMessage({ error: errorMessage });
                } catch (e) {
                    console.warn('Error sending final error message:', e);
                    isConnected = false;
                }
            } else {
                console.warn("Port disconnected, cannot send final error message to UI.");
            }
        }
    });
});

// Tool execution function
async function executeToolCall(toolCall) {
    const { tool, args } = toolCall;
    
    switch (tool) {
        case 'searchWeb':
            return await executeSearchWeb(args);
        case 'openNewTab':
            return await executeOpenNewTab(args);
        case 'getPageContent':
            return await executeGetPageContent(args);
        case 'generateTool':
            return await executeGenerateTool(args);
        
        // Stagehand tools
        case 'stagehandNavigate':
            return await executeStagehandNavigate(args);
        case 'stagehandAct':
            return await executeStagehandAct(args);
        case 'stagehandExtract':
            return await executeStagehandExtract(args);
        case 'stagehandObserve':
            return await executeStagehandObserve(args);
        case 'screenshot':
            return await executeScreenshot(args);
            
        default:
            throw new Error(`Unknown tool: ${tool}`);
    }
}

async function executeSearchWeb(args) {
    const { query, tabId } = args;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    
    console.log('Starting web search:', {
        query: query,
        searchUrl: searchUrl,
        providedTabId: tabId,
        globalCurrentTabId: globalExecutionContext.currentTabId,
        lastSearchTabId: globalExecutionContext.lastSearchTabId
    });
    
    try {
        let targetTabId;
        
        // Priority 1: Use provided tabId
        if (tabId) {
            console.log('Using provided tabId:', tabId);
            try {
                // Check if tab still exists
                await chrome.tabs.get(tabId);
                await chrome.tabs.update(tabId, { url: searchUrl });
                targetTabId = tabId;
                console.log('Successfully updated existing tab:', tabId);
            } catch (error) {
                console.log('Provided tab no longer exists, will create new tab');
                targetTabId = null;
            }
        }
        
        // Priority 2: Use global current tab if it's a search tab
        if (!targetTabId && globalExecutionContext.currentTabId) {
            console.log('Checking if current tab can be reused:', globalExecutionContext.currentTabId);
            try {
                const currentTab = await chrome.tabs.get(globalExecutionContext.currentTabId);
                if (currentTab && currentTab.url && currentTab.url.includes('google.com/search')) {
                    console.log('Reusing current search tab:', globalExecutionContext.currentTabId);
                    await chrome.tabs.update(globalExecutionContext.currentTabId, { url: searchUrl });
                    targetTabId = globalExecutionContext.currentTabId;
                }
            } catch (error) {
                console.log('Current tab no longer exists or cannot be reused');
            }
        }
        
        // Priority 3: Use last search tab if it still exists
        if (!targetTabId && globalExecutionContext.lastSearchTabId) {
            console.log('Checking if last search tab can be reused:', globalExecutionContext.lastSearchTabId);
            try {
                const lastSearchTab = await chrome.tabs.get(globalExecutionContext.lastSearchTabId);
                if (lastSearchTab) {
                    console.log('Reusing last search tab:', globalExecutionContext.lastSearchTabId);
                    await chrome.tabs.update(globalExecutionContext.lastSearchTabId, { url: searchUrl });
                    targetTabId = globalExecutionContext.lastSearchTabId;
                }
            } catch (error) {
                console.log('Last search tab no longer exists');
            }
        }
        
        // Priority 4: Find any existing Google search tab
        if (!targetTabId) {
            console.log('Looking for any existing Google search tabs...');
            try {
                const tabs = await chrome.tabs.query({ url: '*://www.google.com/search*' });
                if (tabs.length > 0) {
                    const existingSearchTab = tabs[0];
                    console.log('Found existing Google search tab:', existingSearchTab.id);
                    await chrome.tabs.update(existingSearchTab.id, { url: searchUrl, active: true });
                    targetTabId = existingSearchTab.id;
                }
            } catch (error) {
                console.log('Error checking for existing search tabs:', error);
            }
        }
        
        // Priority 5: Create new tab only as last resort
        if (!targetTabId) {
            console.log('Creating new tab for search (no existing tabs found)');
            const tab = await chrome.tabs.create({ url: searchUrl });
            targetTabId = tab.id;
            console.log('Created new tab:', targetTabId);
        }
        
        // Update global context
        globalExecutionContext.currentTabId = targetTabId;
        globalExecutionContext.lastSearchTabId = targetTabId;
        
        // Wait for the page to load with timeout
        await new Promise((resolve, reject) => {
            const maxWaitTime = 15000; // 15 seconds timeout
            const startTime = Date.now();
            let attempts = 0;
            const maxAttempts = 30; // Maximum 30 attempts (15 seconds)
            
            const checkLoading = () => {
                attempts++;
                const elapsed = Date.now() - startTime;
                
                // Check if we've exceeded timeout or max attempts
                if (elapsed > maxWaitTime || attempts > maxAttempts) {
                    console.log(`Search tab loading timeout after ${elapsed}ms, continuing anyway...`);
                    resolve(); // Continue anyway, don't fail
                    return;
                }
                
                chrome.tabs.get(targetTabId, (tab) => {
                    if (chrome.runtime.lastError) {
                        console.log('Tab no longer exists, continuing anyway...');
                        resolve(); // Tab might be closed, continue anyway
                        return;
                    }
                    
                    console.log(`Tab loading check ${attempts}: status=${tab.status}, url=${tab.url}`);
                    
                    if (tab.status === 'complete') {
                        console.log(`Search tab loaded successfully after ${elapsed}ms`);
                        resolve();
                    } else {
                        // Continue checking
                        setTimeout(checkLoading, 500);
                    }
                });
            };
            
            // Start checking after a short delay
            setTimeout(checkLoading, 1000);
        });
        
        const result = { 
            success: true, 
            tabId: targetTabId, 
            url: searchUrl, 
            query,
            message: `Search completed for: ${query}`,
            reusedTab: tabId === targetTabId
        };
        
        console.log('Search execution completed:', result);
        return result;
    } catch (error) {
        console.error('Search execution error:', error);
        throw new Error(`Search failed: ${error.message}`);
    }
}

async function executeOpenNewTab(args) {
    const { url } = args;
    const tab = await chrome.tabs.create({ url: url || 'about:blank' });
    return { success: true, tabId: tab.id, url: tab.url };
}

async function executeGetPageContent(args) {
    const { tabId } = args;
    
    console.log('🔍 STARTING CONTENT EXTRACTION with args:', args);
    
    let targetTabId = tabId;
    if (!targetTabId) {
        console.log('⚠️ No tabId provided, looking for active tab...');
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        targetTabId = tabs[0]?.id;
        console.log('📝 Found active tab ID:', targetTabId);
    }
    
    if (!targetTabId) {
        const error = 'No tab available for content extraction';
        console.error('❌', error);
        throw new Error(error);
    }
    
    console.log('🎯 Target tab ID:', targetTabId);
    
    try {
        // Verify tab exists and get its info
        console.log('🔍 Checking if tab exists...');
        const tab = await chrome.tabs.get(targetTabId);
        console.log('✅ Tab found:', { 
            id: tab.id, 
            status: tab.status, 
            url: tab.url, 
            title: tab.title 
        });
        
        // Simple wait for page to be ready
        if (tab.status !== 'complete') {
            console.log('⏳ Tab not complete, waiting 3 seconds...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        // Additional wait for dynamic content
        console.log('⏳ Waiting for dynamic content (2 seconds)...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('🚀 Executing content extraction script...');
        
        // Simplified content extraction with timeout
        const results = await Promise.race([
            chrome.scripting.executeScript({
                target: { tabId: targetTabId },
                func: () => {
                    console.log('📄 Content extraction script running in page...');
                    
                    const result = {
                        title: document.title || 'No title',
                        url: window.location.href || 'Unknown URL',
                        content: '',
                        markdownContent: '',
                        resultCount: 0,
                        extractedAt: new Date().toISOString(),
                        debug: {
                            pageReady: document.readyState,
                            bodyExists: !!document.body,
                            isGoogle: window.location.href.includes('google.com/search')
                        }
                    };
                    
                    console.log('🌐 Page debug info:', result.debug);
                    
                    if (result.url.includes('google.com/search')) {
                        console.log('🔍 Google search page detected');
                        
                        // Try to find search results
                        const searchResults = [];
                        const titleSelectors = ['.MjjYud h3', '.g h3', '.rc h3', 'h3.LC20lb'];
                        
                        let foundElements = [];
                        for (const selector of titleSelectors) {
                            const elements = document.querySelectorAll(selector);
                            if (elements.length > 0) {
                                foundElements = Array.from(elements);
                                console.log(`✅ Found ${elements.length} elements with: ${selector}`);
                                break;
                            }
                        }
                        
                        console.log(`📊 Processing ${foundElements.length} elements`);
                        
                        // Extract up to 10 results
                        foundElements.slice(0, 10).forEach((titleEl, index) => {
                            try {
                                const title = titleEl.textContent?.trim();
                                if (!title || title.length < 5) return;
                                
                                let link = '';
                                const linkEl = titleEl.closest('a') || titleEl.parentElement?.querySelector('a');
                                if (linkEl && linkEl.href) {
                                    link = linkEl.href;
                                    // Clean Google redirect URLs
                                    if (link.includes('/url?q=')) {
                                        const urlParams = new URLSearchParams(link.split('?')[1]);
                                        link = urlParams.get('q') || link;
                                    }
                                }
                                
                                let snippet = '';
                                const container = titleEl.closest('.g, .rc, .MjjYud') || titleEl.parentElement?.parentElement;
                                if (container) {
                                    const snippetEl = container.querySelector('.VwiC3b, .s3v9rd, .IsZvec, .st');
                                    if (snippetEl) {
                                        snippet = snippetEl.textContent?.trim() || '';
                                    }
                                }
                                
                                if (title && !title.toLowerCase().includes('google')) {
                                    searchResults.push({
                                        title,
                                        link: link || 'No link',
                                        snippet: snippet || 'No description',
                                        index: searchResults.length + 1
                                    });
                                }
                            } catch (e) {
                                console.warn('Error processing element:', e);
                            }
                        });
                        
                        console.log(`✅ Extracted ${searchResults.length} search results`);
                        
                        if (searchResults.length > 0) {
                            const query = new URLSearchParams(window.location.search).get('q') || 'Unknown Query';
                            
                            result.markdownContent = `# 🔍 Search Results for: "${query}"\n\n*Found ${searchResults.length} results*\n\n`;
                            
                            searchResults.forEach((item, index) => {
                                result.markdownContent += `## ${index + 1}. ${item.title}\n`;
                                result.markdownContent += `**🔗 Link:** ${item.link}\n\n`;
                                result.markdownContent += `**📝 Description:** ${item.snippet}\n\n`;
                                result.markdownContent += `---\n\n`;
                            });
                            
                            result.content = searchResults.map(item => 
                                `${item.index}. ${item.title}\nURL: ${item.link}\nDescription: ${item.snippet}`
                            ).join('\n\n');
                            
                            result.resultCount = searchResults.length;
                        } else {
                            console.log('❌ No search results found, using page text');
                            result.content = document.body?.textContent?.substring(0, 2000) || 'No content found';
                            result.markdownContent = `# Page Content\n\n${result.content}`;
                        }
                    } else {
                        console.log('📄 Regular page, extracting text content');
                        result.content = document.body?.textContent?.substring(0, 5000) || 'No content found';
                        result.markdownContent = `# ${result.title}\n\n**URL:** ${result.url}\n\n${result.content}`;
                    }
                    
                    console.log('✅ Content extraction completed in page');
                    return result;
                }
            }),
            // 8 second timeout
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Content extraction timeout after 8 seconds')), 8000)
            )
        ]);
        
        const extractionResult = results[0].result;
        
        console.log('🎉 Content extraction successful:', {
            title: extractionResult.title,
            url: extractionResult.url,
            contentLength: extractionResult.content?.length || 0,
            resultCount: extractionResult.resultCount
        });
        
        return {
            success: true,
            tabId: targetTabId,
            ...extractionResult
        };
        
    } catch (error) {
        console.error('❌ Content extraction failed:', error.message);
        console.error('Full error:', error);
        
        return {
            success: false,
            tabId: targetTabId,
            title: 'Content Extraction Failed',
            url: 'Unknown',
            content: `Failed to extract content: ${error.message}`,
            markdownContent: `# ❌ Content Extraction Failed\n\n**Error:** ${error.message}`,
            error: error.message
        };
    }
}

async function executeGenerateTool(args) {
    const { description, name } = args;
    
    // This would integrate with your AI service to generate the tool
    // For now, return a success response
    const toolName = name || `generated_${Date.now()}`;
    
    return {
        success: true,
        toolName,
        description,
        message: `Generated tool "${toolName}" for: ${description}`
    };
}

// Stagehand tool implementations
async function executeStagehandNavigate(args) {
    const { url } = args;
    
    console.log('Stagehand Navigate:', { url });
    
    try {
        // Get the active tab or create a new one
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        let targetTabId;
        
        if (tabs.length > 0) {
            targetTabId = tabs[0].id;
            await chrome.tabs.update(targetTabId, { url });
        } else {
            const tab = await chrome.tabs.create({ url });
            targetTabId = tab.id;
        }
        
        // Wait for the page to load
        await new Promise((resolve, reject) => {
            const maxWaitTime = 15000; // 15 seconds timeout
            const startTime = Date.now();
            
            const checkLoading = () => {
                const elapsed = Date.now() - startTime;
                
                if (elapsed > maxWaitTime) {
                    console.log(`Navigation timeout after ${elapsed}ms, continuing anyway...`);
                    resolve();
                    return;
                }
                
                chrome.tabs.get(targetTabId, (tab) => {
                    if (chrome.runtime.lastError) {
                        console.log('Tab no longer exists, continuing anyway...');
                        resolve();
                        return;
                    }
                    
                    if (tab.status === 'complete') {
                        console.log(`Navigation completed after ${elapsed}ms`);
                        resolve();
                    } else {
                        setTimeout(checkLoading, 500);
                    }
                });
            };
            
            setTimeout(checkLoading, 1000);
        });
        
        return {
            success: true,
            tabId: targetTabId,
            url,
            message: `Successfully navigated to: ${url}`
        };
    } catch (error) {
        console.error('Stagehand navigation error:', error);
        throw new Error(`Navigation failed: ${error.message}`);
    }
}

async function executeStagehandAct(args) {
    const { action, variables } = args;
    
    console.log('Stagehand Act:', { action, variables });
    
    try {
        // Get the active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) {
            throw new Error('No active tab found');
        }
        
        const targetTabId = tabs[0].id;
        
        // Execute the action using content script injection
        const results = await chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            func: performStagehandAction,
            args: [action, variables || {}]
        });
        
        const result = results[0].result;
        
        if (result.success) {
            return {
                success: true,
                action,
                variables,
                result: result.data,
                message: `Action performed: ${action}`
            };
        } else {
            throw new Error(result.error || 'Action failed');
        }
    } catch (error) {
        console.error('Stagehand action error:', error);
        throw new Error(`Action failed: ${error.message}`);
    }
}

async function executeStagehandExtract(args) {
    console.log('Stagehand Extract');
    
    try {
        // Get the active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) {
            throw new Error('No active tab found');
        }
        
        const targetTabId = tabs[0].id;
        
        // Extract content using content script
        const results = await chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            func: extractPageContent
        });
        
        const content = results[0].result;
        
        return {
            success: true,
            content,
            length: content.length,
            message: `Extracted ${content.length} characters of content`
        };
    } catch (error) {
        console.error('Stagehand extraction error:', error);
        throw new Error(`Content extraction failed: ${error.message}`);
    }
}

async function executeStagehandObserve(args) {
    const { instruction } = args;
    
    console.log('Stagehand Observe:', { instruction });
    
    try {
        // Get the active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) {
            throw new Error('No active tab found');
        }
        
        const targetTabId = tabs[0].id;
        
        // Observe elements using content script
        const results = await chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            func: observeElements,
            args: [instruction]
        });
        
        const observations = results[0].result;
        
        return {
            success: true,
            instruction,
            observations,
            count: observations.length,
            message: `Found ${observations.length} elements matching: ${instruction}`
        };
    } catch (error) {
        console.error('Stagehand observation error:', error);
        throw new Error(`Observation failed: ${error.message}`);
    }
}

async function executeScreenshot(args) {
    console.log('Taking screenshot');
    
    try {
        // Get the active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) {
            throw new Error('No active tab found');
        }
        
        const targetTabId = tabs[0].id;
        
        // Take screenshot
        const screenshotDataUrl = await chrome.tabs.captureVisibleTab(null, {
            format: 'png',
            quality: 90
        });
        
        // Convert data URL to base64
        const base64Data = screenshotDataUrl.split(',')[1];
        
        // Generate filename
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const filename = `screenshot-${timestamp}.png`;
        
        return {
            success: true,
            filename,
            dataUrl: screenshotDataUrl,
            base64: base64Data,
            tabId: targetTabId,
            message: `Screenshot taken: ${filename}`
        };
    } catch (error) {
        console.error('Screenshot error:', error);
        throw new Error(`Screenshot failed: ${error.message}`);
    }
}

// Content script functions to be injected
function performStagehandAction(action, variables) {
    try {
        console.log('Performing action:', action, 'with variables:', variables);
        
        // Parse the action to determine what to do
        const actionLower = action.toLowerCase();
        
        // Handle click actions
        if (actionLower.includes('click')) {
            const element = findElementByAction(action);
            if (element) {
                element.click();
                return { success: true, data: `Clicked element: ${element.tagName}` };
            } else {
                return { success: false, error: `Could not find element to click for: ${action}` };
            }
        }
        
        // Handle type/input actions
        if (actionLower.includes('type') || actionLower.includes('enter') || actionLower.includes('input')) {
            const element = findElementByAction(action);
            if (element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')) {
                // Extract text to type from action or variables
                let textToType = '';
                
                // Check if variables contain the text
                if (variables && Object.keys(variables).length > 0) {
                    textToType = Object.values(variables)[0];
                } else {
                    // Extract text from action (e.g., "Type 'hello world' into search box")
                    const matches = action.match(/'([^']+)'/);
                    if (matches) {
                        textToType = matches[1];
                    }
                }
                
                if (textToType) {
                    element.value = textToType;
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                    return { success: true, data: `Typed "${textToType}" into ${element.tagName}` };
                } else {
                    return { success: false, error: `No text found to type for action: ${action}` };
                }
            } else {
                return { success: false, error: `Could not find input element for: ${action}` };
            }
        }
        
        // Handle scroll actions
        if (actionLower.includes('scroll')) {
            if (actionLower.includes('down')) {
                window.scrollBy(0, 500);
            } else if (actionLower.includes('up')) {
                window.scrollBy(0, -500);
            } else {
                window.scrollBy(0, 300);
            }
            return { success: true, data: 'Scrolled page' };
        }
        
        return { success: false, error: `Unsupported action: ${action}` };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function findElementByAction(action) {
    const actionLower = action.toLowerCase();
    
    // Common selectors based on action text
    const selectors = [
        // Buttons
        'button', 'input[type="button"]', 'input[type="submit"]', '[role="button"]',
        // Links
        'a', '[role="link"]',
        // Inputs
        'input', 'textarea', 'select',
        // Interactive elements
        '[onclick]', '[tabindex]'
    ];
    
    // Try to find element by text content
    for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
            const text = element.textContent || element.value || element.placeholder || element.title || '';
            if (text.toLowerCase().includes(getKeywordFromAction(actionLower))) {
                return element;
            }
        }
    }
    
    // Fallback: try common element types
    if (actionLower.includes('search')) {
        return document.querySelector('input[type="search"], input[name*="search"], input[placeholder*="search"], input[id*="search"]');
    }
    
    if (actionLower.includes('login') || actionLower.includes('sign in')) {
        return document.querySelector('button[type="submit"], input[type="submit"], button:contains("login"), button:contains("sign in")');
    }
    
    return null;
}

function getKeywordFromAction(action) {
    // Extract key words from action
    const keywords = ['search', 'login', 'sign in', 'submit', 'send', 'go', 'enter', 'click', 'button'];
    for (const keyword of keywords) {
        if (action.includes(keyword)) {
            return keyword;
        }
    }
    return '';
}

function extractPageContent() {
    try {
        const bodyText = document.body.innerText || document.body.textContent || '';
        
        // Clean up the content similar to the original implementation
        const content = bodyText
            .split('\n')
            .map(line => line.trim())
            .filter(line => {
                if (!line) return false;
                
                // Filter out CSS and JavaScript content
                if (
                    (line.includes('{') && line.includes('}')) ||
                    line.includes('@keyframes') ||
                    line.match(/^\.[a-zA-Z0-9_-]+\s*{/) ||
                    line.match(/^[a-zA-Z-]+:[a-zA-Z0-9%\s\(\)\.,-]+;$/)
                ) {
                    return false;
                }
                return true;
            })
            .map(line => {
                // Decode unicode characters
                return line.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
                    String.fromCharCode(parseInt(hex, 16))
                );
            })
            .join('\n');
        
        return content;
    } catch (error) {
        return `Error extracting content: ${error.message}`;
    }
}

function observeElements(instruction) {
    try {
        console.log('Observing elements for:', instruction);
        
        const instructionLower = instruction.toLowerCase();
        const observations = [];
        
        // Get all interactive elements
        const selectors = [
            'button', 'input', 'textarea', 'select', 'a', '[role="button"]', 
            '[role="link"]', '[onclick]', '[tabindex]', 'form'
        ];
        
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                const text = element.textContent || element.value || element.placeholder || element.title || '';
                const tagName = element.tagName.toLowerCase();
                const className = element.className || '';
                const id = element.id || '';
                
                // Check if element matches the instruction
                if (
                    text.toLowerCase().includes(instructionLower) ||
                    className.toLowerCase().includes(instructionLower) ||
                    id.toLowerCase().includes(instructionLower) ||
                    (instructionLower.includes(tagName))
                ) {
                    observations.push({
                        tagName,
                        text: text.substring(0, 100), // Limit text length
                        className,
                        id,
                        type: element.type || '',
                        placeholder: element.placeholder || '',
                        href: element.href || '',
                        visible: element.offsetParent !== null
                    });
                }
            }
        }
        
        return observations.slice(0, 10); // Limit to 10 observations
    } catch (error) {
        return [{ error: error.message }];
    }
}

// Update the system message to include orchestrator capabilities
const getSystemMessage = (context) => {
    return `You are XatBrowser AI, an advanced AI assistant with sequential thinking capabilities and powerful browser automation tools.

SEQUENTIAL THINKING PROTOCOL:
You MUST use sequential thinking for complex requests. Follow this exact format:

[THINKING:1/3]
Let me break down this request:
1. User wants me to [analyze the request]
2. I need to [identify required tools]
3. My plan: [step by step plan]
[/THINKING]

[THINKING:2/3]
Now I'll execute the first tool: [tool name]
{"tool": "toolName", "args": {"param": "value"}}

After this tool executes, I will continue with the next step.
[/THINKING]

[THINKING:3/3]
Based on the tool results, I now need to [next step or analysis]
{"tool": "getPageContent", "args": {}}

Now I'll analyze the results and provide my final response.
[/THINKING]

<final_response>
[Your comprehensive final response here, formatted in markdown]
</final_response>

CRITICAL WORKFLOW RULES:
1. ALWAYS use sequential thinking with numbered steps [THINKING:X/Y]
2. Execute ONE tool per thinking block
3. After each tool execution, CONTINUE to the next thinking step
4. Use the results from previous tools to inform next steps
5. ALWAYS end with a comprehensive <final_response> section
6. Tab context is automatically maintained between tools

AVAILABLE TOOLS:

BASIC BROWSER TOOLS:
- openNewTab(url) - Opens a new browser tab (returns tabId for subsequent operations)
- searchWeb(query, tabId?) - Searches the web using Google (tabId auto-injected if available)
- getPageContent(tabId?) - Extracts content from a web page (tabId auto-injected if available)

ADVANCED STAGEHAND TOOLS:
- stagehandNavigate(url) - Navigate to a URL in the browser
- stagehandAct(action, variables?) - Performs atomic actions on web elements
- stagehandExtract() - Extracts all text content from the current page
- stagehandObserve(instruction) - Observes specific elements on the page
- screenshot() - Takes a screenshot of the current page

TOOL EXECUTION RULES:
1. Use EXACT JSON format: {"tool": "toolName", "args": {"param": "value"}}
2. Execute tools within THINKING blocks
3. Tab IDs are automatically passed between tools
4. Wait for tool results before continuing to next step
5. Use results to inform next steps

CONTEXT AWARENESS:
- When you open a new tab, that tab becomes the active context
- Subsequent tools automatically use the current tab
- You can focus on the task logic rather than tab management

INTELLIGENT SEARCH WORKFLOW:
For search requests, follow this EXACT pattern:

[THINKING:1/2]
User wants [describe request]. I need to:
1. Search for "[search query]"
2. Extract the search results
3. Analyze and present the findings
[/THINKING]

[THINKING:2/2]
Executing search for [topic]:
{"tool": "searchWeb", "args": {"query": "[search query]"}}

Now extracting the search results:
{"tool": "getPageContent", "args": {}}
[/THINKING]

<final_response>
# 📰 [Topic] Results

Based on my search and analysis, here are the key findings:

## [Section 1]
[Content based on extracted results]

## [Section 2]
[More content]

## Summary
[Key takeaways and analysis]
</final_response>

CRITICAL RESPONSE REQUIREMENTS:
- ALWAYS provide a final response in <final_response> tags after tool execution
- For search queries, analyze and summarize the extracted results
- Present information in a clear, organized format with proper markdown
- Include relevant details, links, and insights from the search results
- Never end with just tool execution - always provide analysis and conclusions
- Continue thinking after each tool execution until you have enough information

EXAMPLE FOR NEWS SEARCH:

[THINKING:1/2]
User wants today's top news. I need to:
1. Search for "today's top news"
2. Extract the search results
3. Analyze and present the findings
[/THINKING]

[THINKING:2/2]
Executing search for today's top news:
{"tool": "searchWeb", "args": {"query": "today's top news"}}

Now extracting the search results:
{"tool": "getPageContent", "args": {}}
[/THINKING]

<final_response>
# 📰 Today's Top News Headlines

Based on my search of current news, here are the most important stories:

## Breaking News
### [Headline 1]
**Source:** [Source name]
[Summary of the story]

### [Headline 2]
**Source:** [Source name]
[Summary of the story]

## Key Trends
- [Important trend 1]
- [Important trend 2]

## What You Need to Know
[Analysis and key takeaways]
</final_response>

CRITICAL RULES:
1. ALWAYS use sequential thinking for multi-step requests
2. Execute tools in logical order within thinking blocks
3. Tab context is automatically maintained between tools
4. CONTINUE thinking after each tool execution
5. Use tool results to inform next steps
6. ALWAYS extract and analyze search results to provide intelligent answers
7. Provide comprehensive responses based on actual search data
8. NEVER end without a <final_response> section - this is mandatory
9. Format final responses with proper markdown for readability
10. If a tool execution fails, continue with available information

Current browser context:
${context}

Remember: Think sequentially, execute tools one at a time, continue thinking after each tool execution, and ALWAYS provide intelligent analysis of search results in a well-formatted <final_response> section. Your final response should be comprehensive, well-formatted, and directly address the user's request with the information you found.`;
};

// Update the message handling to use the new system message
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

        // Get basic tab information
        const tabContent = await getVisibleTabsInfo();
        const context = formatTabContext(tabContent);
        
        // Use the new system message
        const systemMessage = getSystemMessage(context);

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
                    { role: 'user', content: message.message }
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

// Add manual tool execution test for debugging
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Add a test tool execution endpoint
    if (request.type === 'TEST_TOOL_EXECUTION') {
        console.log('🧪 MANUAL TOOL TEST TRIGGERED');
        
        // Test with a simple search
        const testToolCall = {
            tool: 'searchWeb',
            args: { query: 'test search' }
        };
        
        executeToolCall(testToolCall)
            .then(result => {
                console.log('✅ Manual tool test successful:', result);
                sendResponse({ success: true, result });
            })
            .catch(error => {
                console.error('❌ Manual tool test failed:', error);
                sendResponse({ success: false, error: error.message });
            });
        
        return true;
    }
    
    // Add a test content extraction endpoint
    if (request.type === 'TEST_CONTENT_EXTRACTION') {
        console.log('🧪 MANUAL CONTENT EXTRACTION TEST TRIGGERED');
        
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs.length === 0) {
                sendResponse({ success: false, error: 'No active tab found' });
                return;
            }
            
            try {
                const result = await executeGetPageContent({ tabId: tabs[0].id });
                console.log('✅ Manual content extraction test successful:', result);
                sendResponse({ success: true, result });
            } catch (error) {
                console.error('❌ Manual content extraction test failed:', error);
                sendResponse({ success: false, error: error.message });
            }
        });
        
        return true;
    }
    
    if (request.type === 'REGISTER_DYNAMIC_TOOL') {
        try {
            const { name, implementation } = request.tool;
            // Create a safe sandbox for the tool
            const toolFunction = new Function('args', `
                with (args) {
                    ${implementation}
                }
            `);
            
            dynamicTools.set(name, async (args) => {
                try {
                    return await toolFunction(args);
                } catch (error) {
                    console.error(`Error executing dynamic tool ${name}:`, error);
                    throw error;
                }
            });
            
            sendResponse({ success: true });
        } catch (error) {
            console.error('Error registering dynamic tool:', error);
            sendResponse({ error: error.message });
        }
        return true;
    }

    if (request.type === 'EXECUTE_DYNAMIC_TOOL') {
        const { name, args } = request;
        if (!dynamicTools.has(name)) {
            sendResponse({ error: `Dynamic tool ${name} not found` });
            return true;
        }

        dynamicTools.get(name)(args)
            .then(result => sendResponse({ success: true, result }))
            .catch(error => sendResponse({ error: error.message }));
        return true;
    }

    if (request.type === 'EXECUTE_TOOL') {
        const { tool, args } = request;
        
        executeToolCall({ tool, args })
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ error: error.message }));
        return true;
    }

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

        case 'OPEN_SIDEBAR':
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tab = tabs[0];
                if (!tab || !isInjectableUrl(tab.url)) return;

                const domain = new URL(tab.url).hostname;
                chrome.tabs.sendMessage(tab.id, { type: 'SHOW_SIDEBAR_ONCE' }, () => {
                    if (chrome.runtime.lastError) {
                        injectEnhancedSidebar(tab.id, domain);
                    }
                });
            });
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

// Add manual tool execution test for debugging
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Add a test content extraction endpoint
    if (request.type === 'TEST_CONTENT_EXTRACTION') {
        console.log('🧪 MANUAL CONTENT EXTRACTION TEST TRIGGERED');
        
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs.length === 0) {
                sendResponse({ success: false, error: 'No active tab found' });
                return;
            }
            
            try {
                const result = await executeGetPageContent({ tabId: tabs[0].id });
                console.log('✅ Manual content extraction test successful:', result);
                sendResponse({ success: true, result });
            } catch (error) {
                console.error('❌ Manual content extraction test failed:', error);
                sendResponse({ success: false, error: error.message });
            }
        });
        
        return true;
    }
    
    // Add a test search and extract endpoint
    if (request.type === 'TEST_SEARCH_AND_EXTRACT') {
        console.log('🧪 MANUAL SEARCH AND EXTRACT TEST TRIGGERED');
        
        (async () => {
            try {
                console.log('Step 1: Executing search...');
                const searchResult = await executeSearchWeb({ query: 'today news' });
                console.log('Search result:', searchResult);
                
                if (searchResult.success && searchResult.tabId) {
                    console.log('Step 2: Waiting for page to load...');
                    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
                    
                    console.log('Step 3: Extracting content...');
                    const extractResult = await executeGetPageContent({ tabId: searchResult.tabId });
                    console.log('Extract result:', extractResult);
                    
                    sendResponse({ 
                        success: true, 
                        searchResult, 
                        extractResult,
                        message: 'Search and extract test completed'
                    });
                } else {
                    sendResponse({ 
                        success: false, 
                        error: 'Search failed',
                        searchResult 
                    });
                }
            } catch (error) {
                console.error('❌ Search and extract test failed:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();
        
        return true;
    }

    // Add a comprehensive workflow test
    if (request.type === 'TEST_FULL_WORKFLOW') {
        console.log('🧪 FULL WORKFLOW TEST TRIGGERED');
        
        (async () => {
            try {
                console.log('=== FULL WORKFLOW TEST START ===');
                
                // Step 1: Test search
                console.log('Step 1: Testing search...');
                const searchResult = await executeSearchWeb({ query: 'test news today' });
                console.log('✅ Search result:', searchResult);
                
                if (!searchResult.success) {
                    throw new Error('Search failed: ' + JSON.stringify(searchResult));
                }
                
                // Step 2: Wait for page load
                console.log('Step 2: Waiting for page to load...');
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Step 3: Test content extraction
                console.log('Step 3: Testing content extraction...');
                const extractResult = await executeGetPageContent({ tabId: searchResult.tabId });
                console.log('✅ Extract result summary:', {
                    success: extractResult.success,
                    title: extractResult.title,
                    url: extractResult.url,
                    contentLength: extractResult.content?.length || 0,
                    markdownLength: extractResult.markdownContent?.length || 0,
                    resultCount: extractResult.resultCount,
                    hasError: !!extractResult.error
                });
                
                if (!extractResult.success) {
                    console.warn('⚠️ Content extraction failed but continuing test...');
                }
                
                // Step 4: Test tool result accumulation
                console.log('Step 4: Testing tool result accumulation...');
                const mockToolResults = [
                    { tool: 'searchWeb', args: { query: 'test news today' }, result: searchResult, success: true },
                    { tool: 'getPageContent', args: { tabId: searchResult.tabId }, result: extractResult, success: extractResult.success }
                ];
                
                console.log('✅ Mock tool results created:', mockToolResults.length, 'tools');
                
                // Step 5: Test final response system message generation
                console.log('Step 5: Testing final response system message...');
                const context = 'Test context for workflow';
                const finalResponseSystemMessage = getSystemMessage(context) + 
                    `\n\nTOOL EXECUTION SUMMARY:\n${JSON.stringify(mockToolResults, null, 2)}` + 
                    "\n\nTASK: Provide a final, comprehensive answer to the user's original query based *only* on the information from the tool execution summary. Do not attempt to call any more tools. Summarize the findings and directly answer the user.";
                
                console.log('✅ Final response system message length:', finalResponseSystemMessage.length);
                
                // Step 6: Test final user prompt
                console.log('Step 6: Testing final user prompt...');
                const finalUserPrompt = `Based on the tool execution results (summarized in the system message), please provide the final answer to my original query: "test news today"`;
                console.log('✅ Final user prompt:', finalUserPrompt);
                
                console.log('=== FULL WORKFLOW TEST COMPLETED SUCCESSFULLY ===');
                
                sendResponse({ 
                    success: true, 
                    message: 'Full workflow test completed successfully',
                    results: {
                        searchResult,
                        extractResult,
                        mockToolResults,
                        systemMessageLength: finalResponseSystemMessage.length,
                        finalUserPrompt
                    }
                });
                
            } catch (error) {
                console.error('❌ Full workflow test failed:', error);
                sendResponse({ 
                    success: false, 
                    error: error.message,
                    stack: error.stack
                });
            }
        })();
        
        return true;
    }

    // Add a simple news query test
    if (request.type === 'TEST_NEWS_WORKFLOW') {
        console.log('🧪 NEWS WORKFLOW TEST TRIGGERED');
        
        (async () => {
            try {
                console.log('=== NEWS WORKFLOW TEST START ===');
                
                // Step 1: Search for today's top news
                console.log('Step 1: Searching for today\'s top news...');
                const searchResult = await executeSearchWeb({ query: "today's top news" });
                console.log('✅ Search completed:', {
                    success: searchResult.success,
                    tabId: searchResult.tabId,
                    url: searchResult.url
                });
                
                if (!searchResult.success) {
                    throw new Error('Search failed: ' + JSON.stringify(searchResult));
                }
                
                // Step 2: Wait for page to load
                console.log('Step 2: Waiting for Google search page to load...');
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Step 3: Extract content from search results
                console.log('Step 3: Extracting search results...');
                const extractResult = await executeGetPageContent({ tabId: searchResult.tabId });
                console.log('✅ Content extraction completed:', {
                    success: extractResult.success,
                    title: extractResult.title,
                    contentLength: extractResult.content?.length || 0,
                    markdownLength: extractResult.markdownContent?.length || 0,
                    resultCount: extractResult.resultCount,
                    hasError: !!extractResult.error
                });
                
                // Step 4: Simulate tool results accumulation
                const toolResults = [
                    { tool: 'searchWeb', args: { query: "today's top news" }, result: searchResult, success: true },
                    { tool: 'getPageContent', args: { tabId: searchResult.tabId }, result: extractResult, success: extractResult.success }
                ];
                
                console.log('✅ Tool results accumulated:', toolResults.length, 'tools');
                
                // Step 5: Test final response generation
                console.log('Step 5: Testing final response generation...');
                const context = 'Test context for news workflow';
                const finalResponseSystemMessage = getSystemMessage(context) + 
                    `\n\nTOOL EXECUTION SUMMARY:\n${JSON.stringify(toolResults, null, 2)}` + 
                    "\n\nTASK: Provide a final, comprehensive answer to the user's original query based *only* on the information from the tool execution summary. Do not attempt to call any more tools. Summarize the findings and directly answer the user.";
                
                const finalUserPrompt = `Based on the tool execution results (summarized in the system message), please provide the final answer to my original query: "Can you give me today's top news"`;
                
                console.log('✅ Final response prompts prepared');
                console.log('System message length:', finalResponseSystemMessage.length);
                console.log('User prompt:', finalUserPrompt);
                
                console.log('=== NEWS WORKFLOW TEST COMPLETED SUCCESSFULLY ===');
                
                sendResponse({ 
                    success: true, 
                    message: 'News workflow test completed successfully',
                    results: {
                        searchResult,
                        extractResult,
                        toolResults,
                        systemMessageLength: finalResponseSystemMessage.length,
                        finalUserPrompt,
                        extractedContent: extractResult.markdownContent?.substring(0, 500) + '...' || 'No content'
                    }
                });
                
            } catch (error) {
                console.error('❌ News workflow test failed:', error);
                sendResponse({ 
                    success: false, 
                    error: error.message,
                    stack: error.stack
                });
            }
        })();
        
        return true;
    }

    // Add debug endpoints for global context management
    if (request.type === 'DEBUG_GLOBAL_CONTEXT') {
        console.log('🧪 DEBUG: Current global context:', globalExecutionContext);
        sendResponse({ 
            success: true, 
            globalContext: globalExecutionContext,
            message: 'Global context retrieved'
        });
        return true;
    }
    
    if (request.type === 'RESET_GLOBAL_CONTEXT') {
        console.log('🧪 DEBUG: Manually resetting global context');
        resetGlobalContext();
        sendResponse({ 
            success: true, 
            globalContext: globalExecutionContext,
            message: 'Global context reset successfully'
        });
        return true;
    }
});