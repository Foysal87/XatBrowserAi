import { AzureOpenAIClient, ClaudeClient } from './aiClients.js';

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
            port.postMessage({ error: 'Connection lost. Please refresh the page.' });
            return;
        }

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
                port.postMessage({ error: 'Selected model not found in configuration.' });
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

            // Enhanced streaming callback with tool execution detection
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
                        console.log('Processing content chunk:', content);
                        
                        // Detect and extract tool execution patterns
                        const toolPatterns = [
                            /\{"tool":\s*"([^"]+)",\s*"args":\s*\{[^}]*\}\}/g,
                            /\{\s*"tool"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*\{[^}]*\}\s*\}/g,
                            /\{"tool":"([^"]+)","args":\{[^}]*\}\}/g
                        ];
                        
                        let toolMatches = null;
                        let usedPattern = null;
                        
                        for (const pattern of toolPatterns) {
                            const matches = content.match(pattern);
                            if (matches && matches.length > 0) {
                                toolMatches = matches;
                                usedPattern = pattern;
                                break;
                            }
                        }
                        
                        // Check for tool intention patterns if no JSON found
                        if (!toolMatches) {
                            const intentionPatterns = [
                                { pattern: /I'll search for|I will search for|Let me search for|Searching for/i, tool: 'searchWeb' },
                                { pattern: /I'll get the page content|I will get the page content|Let me get the page content/i, tool: 'getPageContent' },
                                { pattern: /I'll open a new tab|I will open a new tab|Let me open a new tab/i, tool: 'openNewTab' }
                            ];
                            
                            for (const { pattern, tool } of intentionPatterns) {
                                if (pattern.test(content)) {
                                    console.log('Detected tool intention without proper JSON format');
                                    if (tool === 'searchWeb' && message.message) {
                                        const fallbackToolCall = {
                                            tool: 'searchWeb',
                                            args: { query: message.message }
                                        };
                                        toolMatches = [JSON.stringify(fallbackToolCall)];
                                        break;
                                    }
                                }
                            }
                        }
                        
                        // Process tool executions if found
                        if (toolMatches) {
                            console.log('Processing tool executions:', toolMatches);
                            processToolExecutions(toolMatches, port, client, enhancedSystemMessage, message);
                            
                            // Filter out tool JSON and intention phrases from user-visible content
                            let filteredContent = content;
                            
                            // Remove JSON tool calls
                            if (usedPattern) {
                                filteredContent = filteredContent.replace(usedPattern, '').trim();
                            }
                            
                            // Remove tool intention phrases
                            const intentionPhrases = [
                                /I'll search for[^.]*\.\s*/gi,
                                /Let me search for[^.]*\.\s*/gi,
                                /I will search for[^.]*\.\s*/gi,
                                /Searching for[^.]*\.\s*/gi,
                                /I'll get the page content[^.]*\.\s*/gi,
                                /Let me get the page content[^.]*\.\s*/gi,
                                /I will get the page content[^.]*\.\s*/gi,
                                /I'll open a new tab[^.]*\.\s*/gi,
                                /Let me open a new tab[^.]*\.\s*/gi,
                                /I will open a new tab[^.]*\.\s*/gi
                            ];
                            
                            intentionPhrases.forEach(phrase => {
                                filteredContent = filteredContent.replace(phrase, '');
                            });
                            
                            // Clean up extra whitespace
                            filteredContent = filteredContent.replace(/\s+/g, ' ').trim();
                            
                            // Only send content if there's meaningful text left
                            if (filteredContent && filteredContent.length > 10) {
                                console.log('Sending filtered content chunk to port:', filteredContent.length, 'chars');
                                port.postMessage({
                                    type: 'delta',
                                    content: filteredContent,
                                    role: 'assistant'
                                });
                            }
                        } else {
                            // No tool execution detected, send content as-is
                            console.log('Sending content chunk to port:', content.length, 'chars');
                            port.postMessage({
                                type: 'delta',
                                content: content,
                                role: 'assistant'
                            });
                        }
                    }
                } catch (error) {
                    console.error('Error processing stream chunk:', error);
                    port.postMessage({ error: 'Error processing stream: ' + error.message });
                }
            };
            
            // New function to handle tool execution chain
            async function processToolExecutions(toolMatches, port, client, systemMessage, originalMessage) {
                console.log('Processing tool executions:', toolMatches.length, 'tools found');
                const toolResults = [];
                
                for (const match of toolMatches) {
                    try {
                        const toolCall = JSON.parse(match);
                        console.log('Executing tool:', toolCall.tool, 'with args:', toolCall.args);
                        
                        // Notify UI of tool execution start (inline with response)
                        port.postMessage({
                            type: 'tool_execution_inline',
                            tool: toolCall.tool,
                            args: toolCall.args,
                            status: 'executing',
                            message: getToolExecutionMessage(toolCall.tool, 'executing')
                        });
                        
                        // Execute the tool
                        const toolResult = await executeToolCall(toolCall);
                        console.log('Tool execution completed:', toolCall.tool, 'success:', toolResult.success);
                        
                        // Notify UI of tool completion
                        port.postMessage({
                            type: 'tool_execution_inline',
                            tool: toolCall.tool,
                            args: toolCall.args,
                            result: toolResult,
                            status: 'completed',
                            message: getToolExecutionMessage(toolCall.tool, 'completed')
                        });
                        
                        toolResults.push({
                            tool: toolCall.tool,
                            args: toolCall.args,
                            result: toolResult
                        });
                        
                        // Add delay between tool executions for proper sequencing
                        if (toolCall.tool === 'searchWeb') {
                            console.log('Search completed, waiting before next step...');
                            await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced delay
                        }
                        
                    } catch (error) {
                        console.error('Tool execution error for tool:', match, 'Error:', error);
                        port.postMessage({
                            type: 'tool_execution_inline',
                            tool: toolCall?.tool || 'unknown',
                            args: toolCall?.args || {},
                            error: error.message,
                            status: 'error',
                            message: `Error executing ${toolCall?.tool || 'tool'}: ${error.message}`
                        });
                    }
                }
                
                console.log('All tools executed, continuing with results. Total results:', toolResults.length);
                
                // Continue conversation with tool results
                if (toolResults.length > 0) {
                    await continueConversationWithToolResults(toolResults, port, client, systemMessage, originalMessage);
                } else {
                    console.log('No successful tool results, sending error response');
                    port.postMessage({ error: 'No tools were executed successfully' });
                }
            }

            // Function to continue conversation with tool results
            async function continueConversationWithToolResults(toolResults, port, client, systemMessage, originalMessage) {
                try {
                    // Check if we just completed a search and need to extract content
                    const searchResult = toolResults.find(result => result.tool === 'searchWeb' && result.result.success);
                    
                    if (searchResult && searchResult.result.tabId) {
                        console.log('Search completed, now extracting page content...');
                        
                        // Wait for the search page to fully load
                        await new Promise(resolve => setTimeout(resolve, 2000)); // Reduced from 3000ms
                        
                        // Automatically execute getPageContent
                        try {
                            port.postMessage({
                                type: 'tool_execution_inline',
                                tool: 'getPageContent',
                                args: { tabId: searchResult.result.tabId },
                                status: 'executing',
                                message: 'Extracting search results...'
                            });
                            
                            console.log('Executing getPageContent for tab:', searchResult.result.tabId);
                            const contentResult = await executeGetPageContent({ tabId: searchResult.result.tabId });
                            console.log('Content extraction result:', contentResult);
                            
                            if (contentResult.success) {
                                port.postMessage({
                                    type: 'tool_execution_inline',
                                    tool: 'getPageContent',
                                    args: { tabId: searchResult.result.tabId },
                                    result: contentResult,
                                    status: 'completed',
                                    message: 'Search results extracted successfully'
                                });
                            } else {
                                port.postMessage({
                                    type: 'tool_execution_inline',
                                    tool: 'getPageContent',
                                    args: { tabId: searchResult.result.tabId },
                                    result: contentResult,
                                    status: 'error',
                                    message: 'Content extraction failed, but continuing with search results'
                                });
                            }
                            
                            // Add the content extraction result to tool results regardless of success
                            toolResults.push({
                                tool: 'getPageContent',
                                args: { tabId: searchResult.result.tabId },
                                result: contentResult
                            });
                            
                        } catch (error) {
                            console.error('Error extracting page content:', error);
                            port.postMessage({
                                type: 'tool_execution_inline',
                                tool: 'getPageContent',
                                args: { tabId: searchResult.result.tabId },
                                error: error.message,
                                status: 'error',
                                message: `Error extracting content: ${error.message}`
                            });
                            
                            // Add failed result to tool results so we can still continue
                            toolResults.push({
                                tool: 'getPageContent',
                                args: { tabId: searchResult.result.tabId },
                                result: {
                                    success: false,
                                    error: error.message,
                                    content: 'Content extraction failed'
                                }
                            });
                        }
                    }
                    
                    // Format tool results for AI with better structure
                    const toolResultsText = toolResults.map(result => {
                        if (result.tool === 'getPageContent') {
                            if (result.result.success && result.result.content) {
                                // Use markdown content if available, otherwise fall back to regular content
                                const contentToUse = result.result.markdownContent || result.result.content;
                                return `SEARCH RESULTS EXTRACTED:
URL: ${result.result.url}
Title: ${result.result.title}
Results Found: ${result.result.resultCount || 'Unknown'}
Extracted At: ${result.result.extractedAt}

CONTENT (MARKDOWN FORMAT):
${contentToUse}`;
                            } else {
                                // Handle failed content extraction
                                return `CONTENT EXTRACTION ATTEMPTED:
Status: Failed
Error: ${result.result.error || 'Unknown error'}
Note: Search was completed but content extraction failed. Please provide a response based on the search query.`;
                            }
                        } else if (result.tool === 'searchWeb') {
                            return `SEARCH EXECUTED:
Query: ${result.args.query}
Search URL: ${result.result.url}
Status: ${result.result.success ? 'Success' : 'Failed'}
Tab ID: ${result.result.tabId}`;
                        }
                        return `TOOL: ${result.tool}
Args: ${JSON.stringify(result.args)}
Result: ${JSON.stringify(result.result, null, 2)}`;
                    }).join('\n\n');
                    
                    const followUpMessage = `Based on the search results below, provide a comprehensive and well-formatted response to the user's request: "${originalMessage.message}"

TOOL EXECUTION RESULTS:
${toolResultsText}

INSTRUCTIONS:
1. If content was successfully extracted, analyze the search results thoroughly and provide specific, current information
2. Use the extracted search results to provide accurate, up-to-date information about the topic
3. Format your response with proper markdown (use **bold** for important points, bullet points for lists, headers for sections)
4. Include relevant links from the search results when mentioning specific information
5. Organize the information logically with clear sections and headers
6. If multiple search results cover the same topic, synthesize the information
7. Be comprehensive but concise, focusing on the most relevant and recent information
8. If content extraction failed, provide a helpful response based on the search query and general knowledge

Please provide a professional, informative response based on the actual search results. Structure your response with clear headings and include specific details from the search results.`;
                    
                    // Create follow-up stream processor that filters out any additional tool calls
                    const followUpProcessor = (chunk) => {
                        try {
                            if (chunk.done) {
                                port.postMessage({ done: true });
                                return;
                            }
                            
                            let content = '';
                            if (chunk.type === 'delta' && chunk.content) {
                                content = chunk.content;
                            } else if (chunk.content) {
                                content = chunk.content;
                            } else if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
                                content = chunk.choices[0].delta.content;
                            } else if (typeof chunk === 'string') {
                                content = chunk;
                            }
                            
                            if (content) {
                                // Filter out any additional tool calls in the follow-up response
                                let filteredContent = content;
                                
                                // Remove any JSON tool patterns
                                const toolJsonPattern = /\{"tool":[^}]+\}/g;
                                filteredContent = filteredContent.replace(toolJsonPattern, '');
                                
                                // Remove tool intention phrases
                                const intentionPhrases = [
                                    /I'll search for[^.]*\.\s*/gi,
                                    /Let me search for[^.]*\.\s*/gi,
                                    /I will search for[^.]*\.\s*/gi,
                                    /Searching for[^.]*\.\s*/gi
                                ];
                                
                                intentionPhrases.forEach(phrase => {
                                    filteredContent = filteredContent.replace(phrase, '');
                                });
                                
                                filteredContent = filteredContent.trim();
                                
                                if (filteredContent) {
                                    port.postMessage({
                                        type: 'delta',
                                        content: filteredContent,
                                        role: 'assistant'
                                    });
                                }
                            }
                        } catch (error) {
                            console.error('Error in follow-up processing:', error);
                        }
                    };
                    
                    // Send follow-up request to AI
                    if (client instanceof AzureOpenAIClient) {
                        const followUpMessages = [
                            { role: 'system', content: systemMessage },
                            { role: 'user', content: followUpMessage }
                        ];
                        await client.sendMessage({ messages: followUpMessages }, followUpProcessor);
                    } else {
                        await client.sendMessage(followUpMessage, followUpProcessor, systemMessage);
                    }
                    
                } catch (error) {
                    console.error('Error in follow-up conversation:', error);
                    port.postMessage({ error: 'Error processing tool results: ' + error.message });
                }
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
                    }
                };
                
                return messages[tool]?.[status] || `${status} ${tool}`;
            }

            // Process based on client type
            if (client instanceof AzureOpenAIClient) {
                console.log('Starting Azure OpenAI streaming...');
                const azureMessages = [
                    { role: 'system', content: enhancedSystemMessage },
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
                    enhancedSystemMessage
                );
            }
            
            console.log('AI processing completed for message');
            port.postMessage({ done: true });
            
        } catch (error) {
            console.error('Error in message processing:', error);
            let errorMessage = error.message;
            
            if (error.message.includes('Extension context invalidated')) {
                errorMessage = 'Extension context lost. Please refresh the page and try again.';
                isConnected = false;
            }
            
            port.postMessage({ error: errorMessage });
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
        tabId: tabId
    });
    
    try {
        let targetTabId;
        
        if (tabId) {
            console.log('Updating existing tab:', tabId);
            await chrome.tabs.update(tabId, { url: searchUrl });
            targetTabId = tabId;
        } else {
            console.log('Creating new tab for search');
            const tab = await chrome.tabs.create({ url: searchUrl });
            targetTabId = tab.id;
            console.log('Created new tab:', targetTabId);
        }
        
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
            message: `Search completed for: ${query}`
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
    
    let targetTabId = tabId;
    if (!targetTabId) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        targetTabId = tabs[0]?.id;
    }
    
    if (!targetTabId) {
        throw new Error('No tab available for content extraction');
    }
    
    try {
        console.log('Extracting content from tab:', targetTabId);
        
        // First, check if the tab still exists and is accessible
        const tab = await chrome.tabs.get(targetTabId);
        if (!tab) {
            throw new Error('Target tab no longer exists');
        }
        
        console.log('Tab status:', tab.status, 'URL:', tab.url);
        
        // Wait a bit more for dynamic content to load
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Add timeout to script execution
        const results = await Promise.race([
            chrome.scripting.executeScript({
                target: { tabId: targetTabId },
                func: () => {
                    try {
                        console.log('Starting content extraction...');
                        let content = '';
                        let title = document.title || 'No title';
                        let url = window.location.href || 'Unknown URL';
                        let markdownContent = '';
                        
                        if (url.includes('google.com/search')) {
                            console.log('Extracting Google search results...');
                            
                            // Multiple selector strategies for Google search results
                            const searchResults = [];
                            
                            // Try different selectors for search results
                            const selectors = [
                                'div[data-ved] h3',
                                '.g h3',
                                '.rc h3', 
                                '.MjjYud h3',
                                'h3[class*="LC20lb"]',
                                'h3.LC20lb',
                                '[data-header-feature] h3',
                                '.yuRUbf h3'
                            ];
                            
                            let resultElements = [];
                            for (const selector of selectors) {
                                const elements = document.querySelectorAll(selector);
                                if (elements.length > 0) {
                                    resultElements = Array.from(elements);
                                    console.log(`Found ${elements.length} results with selector: ${selector}`);
                                    break;
                                }
                            }
                            
                            // If no results found with h3, try broader search
                            if (resultElements.length === 0) {
                                console.log('No h3 elements found, trying broader search...');
                                const broadSelectors = [
                                    '.g',
                                    '.MjjYud',
                                    '.rc',
                                    '[data-ved]'
                                ];
                                
                                for (const selector of broadSelectors) {
                                    const containers = document.querySelectorAll(selector);
                                    if (containers.length > 0) {
                                        resultElements = Array.from(containers).map(container => {
                                            return container.querySelector('h3, a[href*="http"]') || container;
                                        }).filter(el => el);
                                        console.log(`Found ${resultElements.length} results with container selector: ${selector}`);
                                        break;
                                    }
                                }
                            }
                            
                            console.log('Total result elements found:', resultElements.length);
                            
                            resultElements.forEach((element, index) => {
                                if (index < 15) { // Increased to top 15 results
                                    try {
                                        let titleText = '';
                                        let link = '';
                                        let snippet = '';
                                        
                                        // Extract title
                                        if (element.tagName === 'H3') {
                                            titleText = element.textContent.trim();
                                            const linkElement = element.closest('a') || element.querySelector('a');
                                            link = linkElement ? linkElement.href : '';
                                        } else {
                                            const titleEl = element.querySelector('h3, a[href*="http"]');
                                            if (titleEl) {
                                                titleText = titleEl.textContent.trim();
                                                if (titleEl.tagName === 'A') {
                                                    link = titleEl.href;
                                                } else {
                                                    const linkEl = titleEl.closest('a') || titleEl.querySelector('a');
                                                    link = linkEl ? linkEl.href : '';
                                                }
                                            }
                                        }
                                        
                                        // Extract snippet from parent container
                                        const container = element.closest('.g, .rc, [data-ved], .MjjYud, .yuRUbf') || element.parentElement;
                                        if (container) {
                                            // Look for snippet in various places
                                            const snippetSelectors = [
                                                '.VwiC3b',
                                                '.s3v9rd',
                                                '.st',
                                                '[data-sncf]',
                                                '.IsZvec'
                                            ];
                                            
                                            for (const snippetSelector of snippetSelectors) {
                                                const snippetEl = container.querySelector(snippetSelector);
                                                if (snippetEl) {
                                                    snippet = snippetEl.textContent.trim();
                                                    break;
                                                }
                                            }
                                            
                                            // Fallback: look for any text content in spans/divs
                                            if (!snippet) {
                                                const textElements = container.querySelectorAll('span, div');
                                                for (const el of textElements) {
                                                    const text = el.textContent.trim();
                                                    if (text.length > 50 && text.length < 800 && 
                                                        !text.includes('http') && 
                                                        !text.includes('›') &&
                                                        !text.includes('...') &&
                                                        text !== titleText) {
                                                        snippet = text;
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                        
                                        // Clean up the link
                                        if (link && link.includes('/url?q=')) {
                                            try {
                                                const urlParams = new URLSearchParams(link.split('?')[1]);
                                                link = urlParams.get('q') || link;
                                            } catch (e) {
                                                // Keep original link if parsing fails
                                            }
                                        }
                                        
                                        if (titleText && titleText.length > 3 && !titleText.includes('Search') && !titleText.includes('Google')) {
                                            searchResults.push({
                                                title: titleText,
                                                link: link || 'No link available',
                                                snippet: snippet || 'No snippet available',
                                                index: index + 1
                                            });
                                        }
                                    } catch (elementError) {
                                        console.error('Error processing search result element:', elementError);
                                    }
                                }
                            });
                            
                            console.log('Extracted search results:', searchResults.length);
                            
                            if (searchResults.length > 0) {
                                // Create markdown formatted content
                                markdownContent = `# Search Results for: ${decodeURIComponent(url.split('q=')[1]?.split('&')[0] || 'Unknown Query')}\n\n`;
                                
                                searchResults.forEach((result, index) => {
                                    markdownContent += `## ${index + 1}. ${result.title}\n`;
                                    markdownContent += `**Link:** ${result.link}\n\n`;
                                    markdownContent += `${result.snippet}\n\n`;
                                    markdownContent += `---\n\n`;
                                });
                                
                                // Also create plain text version
                                content = searchResults.map(result => 
                                    `${result.index}. ${result.title}\nURL: ${result.link}\nDescription: ${result.snippet}\n---`
                                ).join('\n\n');
                            } else {
                                console.log('No search results found, using fallback extraction');
                                // Fallback to general text extraction
                                const bodyText = document.body.textContent || '';
                                content = bodyText.substring(0, 10000) || 'No content found';
                                markdownContent = `# Page Content\n\n${content}`;
                            }
                        } else {
                            console.log('Extracting regular page content...');
                            // Regular page content extraction
                            const bodyText = document.body.textContent || '';
                            content = bodyText.substring(0, 50000) || 'No content found';
                            
                            // Create markdown version
                            markdownContent = `# ${title}\n\n`;
                            markdownContent += `**URL:** ${url}\n\n`;
                            markdownContent += content;
                        }
                        
                        const result = {
                            title: title,
                            url: url,
                            content: content,
                            markdownContent: markdownContent,
                            html: document.documentElement.outerHTML.substring(0, 100000),
                            extractedAt: new Date().toISOString(),
                            resultCount: url.includes('google.com/search') ? (content.match(/---/g) || []).length : 0
                        };
                        
                        console.log('Content extraction completed:', {
                            title: result.title,
                            url: result.url,
                            contentLength: result.content?.length || 0,
                            markdownLength: result.markdownContent?.length || 0,
                            resultCount: result.resultCount
                        });
                        
                        return result;
                    } catch (extractionError) {
                        console.error('Content extraction error:', extractionError);
                        return {
                            title: document.title || 'Error',
                            url: window.location.href || 'Unknown',
                            content: 'Error extracting content: ' + extractionError.message,
                            markdownContent: '# Error\n\nFailed to extract content',
                            html: '',
                            error: extractionError.message
                        };
                    }
                }
            }),
            // Timeout after 15 seconds (increased for better extraction)
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Content extraction timeout')), 15000)
            )
        ]);
        
        console.log('Content extraction successful:', {
            title: results[0].result.title,
            url: results[0].result.url,
            contentLength: results[0].result.content?.length || 0,
            markdownLength: results[0].result.markdownContent?.length || 0,
            resultCount: results[0].result.resultCount
        });
        
        return {
            success: true,
            tabId: targetTabId,
            ...results[0].result
        };
    } catch (error) {
        console.error('Content extraction failed:', error);
        
        // Return a partial result instead of throwing
        return {
            success: false,
            tabId: targetTabId,
            title: 'Content Extraction Failed',
            url: 'Unknown',
            content: `Failed to extract content: ${error.message}`,
            markdownContent: `# Content Extraction Failed\n\n${error.message}`,
            html: '',
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

// Update the system message to include orchestrator capabilities
const getSystemMessage = (context) => {
    return `You are XatBrowser AI, a professional AI assistant with advanced browser automation capabilities.

CRITICAL TOOL EXECUTION RULES:
1. When users ask for current information, news, or data that requires web search, you MUST execute tools immediately
2. Use EXACT JSON format for tool calls: {"tool": "toolName", "args": {"param": "value"}}
3. Do NOT explain what you're going to do - just execute the tools
4. After tool execution completes, provide a comprehensive response based on the results

AVAILABLE TOOLS:
- searchWeb(query, tabId?) - Search the web using Google
- getPageContent(tabId?) - Extract content from a web page (automatically called after search)
- openNewTab(url) - Open new browser tabs
- generateTool(description, name?) - Create specialized tools

TOOL EXECUTION EXAMPLES:
User: "What are the latest tax news in USA?"
Response: {"tool": "searchWeb", "args": {"query": "latest tax news USA 2024"}}

User: "Open Google"
Response: {"tool": "openNewTab", "args": {"url": "https://google.com"}}

RESPONSE FORMATTING RULES:
1. Use markdown formatting for better readability
2. Use **bold** for important points and headlines
3. Use ### for section headers
4. Use bullet points (-) for lists
5. Use numbered lists when showing steps or rankings
6. Include relevant URLs when available

IMPORTANT: 
- Execute tools FIRST when users request current information
- Do NOT say "I'll search for..." or "Let me search..." - just execute the tool
- After tools complete, provide comprehensive responses with actual data
- Format responses professionally with proper markdown

Current browser context:
${context}

Remember: Execute tools immediately for current information requests, then provide detailed responses based on actual results.`;
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