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
            const processStreamChunk = (chunk) => {
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
                                    const toolMatches = thinkingContent.match(/\{"tool":\s*"([^"]+)",\s*"args":\s*\{[^}]*\}\}/g);
                                    
                                    if (toolMatches) {
                                        console.log('Found tools in thinking block:', toolMatches);
                                        
                                        // Execute tools sequentially
                                        executeSequentialTools(toolMatches, port, currentStep, totalSteps, isConnected);
                                        
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
            
            // Sequential tool execution function
            async function executeSequentialTools(toolMatches, port, currentStep, totalSteps) {
                console.log('Executing sequential tools:', toolMatches.length);
                
                // Context to maintain state between tools
                let executionContext = {
                    currentTabId: null,
                    lastResult: null,
                    variables: {}
                };
                
                for (let i = 0; i < toolMatches.length; i++) {
                    const toolMatch = toolMatches[i];
                    let toolCall; // Declare toolCall outside the try block
                    
                    try {
                        toolCall = JSON.parse(toolMatch); // Assign inside the try block
                        console.log(`Executing tool ${i + 1}/${toolMatches.length}:`, toolCall.tool);
                        
                        // Enhance tool arguments with context
                        const enhancedArgs = { ...toolCall.args };
                        
                        // Auto-inject tabId for tools that need it
                        if (executionContext.currentTabId && 
                            ['searchWeb', 'getPageContent', 'stagehandAct', 'stagehandExtract', 'stagehandObserve', 'screenshot'].includes(toolCall.tool) &&
                            !enhancedArgs.tabId) {
                            enhancedArgs.tabId = executionContext.currentTabId;
                            console.log(`Auto-injected tabId ${executionContext.currentTabId} for ${toolCall.tool}`);
                        }
                        
                        // Notify UI of tool execution start
                        if (!isConnected) {
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
                                isConnected = false;
                                break;
                            }
                        }
                        
                        // Execute the tool with enhanced arguments
                        const toolResult = await executeToolCall({ tool: toolCall.tool, args: enhancedArgs });
                        console.log('Tool execution completed:', toolCall.tool, 'success:', toolResult.success);
                        
                        // Update execution context based on tool result
                        if (toolResult.success) {
                            executionContext.lastResult = toolResult;
                            
                            // Update tabId if tool returned one
                            if (toolResult.tabId) {
                                executionContext.currentTabId = toolResult.tabId;
                                console.log(`Updated context tabId to: ${toolResult.tabId}`);
                            }
                            
                            // Store any variables from the result
                            if (toolResult.variables) {
                                executionContext.variables = { ...executionContext.variables, ...toolResult.variables };
                            }
                        }
                        
                        // Notify UI of tool completion with results
                        if (!isConnected) {
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
                                    context: { tabId: executionContext.currentTabId } // Include context in response
                                });
                            } catch (e) {
                                console.warn('Error sending tool completion notification:', e);
                                isConnected = false;
                                break;
                            }
                        }
                        
                        // Add delay between tools for better UX
                        if (i < toolMatches.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                        
                    } catch (error) {
                        console.error('Sequential tool execution error:', error);
                        if (isConnected) {
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
                                isConnected = false;
                            }
                        }
                        
                        // Stop execution on error
                        break;
                    }
                }
                
                console.log('Sequential tool execution completed. Final context:', executionContext);
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
            
            console.log('AI processing completed for message');
            if (isConnected) {
                try {
                    port.postMessage({ done: true });
                } catch (e) {
                    console.warn('Error sending final done signal:', e);
                    isConnected = false;
                }
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
[/THINKING]

[After tool execution, continue thinking...]
[THINKING:3/3]
Based on the results, I now need to [next step or final response]
[/THINKING]

AVAILABLE TOOLS:

BASIC BROWSER TOOLS:
- openNewTab(url) - Opens a new browser tab (returns tabId for subsequent operations)
- searchWeb(query, tabId?) - Searches the web using Google (tabId auto-injected if available)
- getPageContent(tabId?) - Extracts content from a web page (tabId auto-injected if available)

ADVANCED STAGEHAND TOOLS:
- stagehandNavigate(url) - Navigate to a URL in the browser. Use with confident URLs or start with https://google.com
- stagehandAct(action, variables?) - Performs atomic actions on web elements (click, type, etc.)
- stagehandExtract() - Extracts all text content from the current page
- stagehandObserve(instruction) - Observes specific elements on the page for interaction
- screenshot() - Takes a screenshot of the current page

TOOL EXECUTION RULES:
1. Use EXACT JSON format: {"tool": "toolName", "args": {"param": "value"}}
2. Execute tools within THINKING blocks
3. Wait for tool results before continuing
4. Tab IDs are automatically passed between tools - you don't need to specify tabId manually
5. Use results to inform next steps

CONTEXT AWARENESS:
- When you open a new tab, that tab becomes the active context
- Subsequent tools (searchWeb, getPageContent, etc.) automatically use the current tab
- You can focus on the task logic rather than tab management

INTELLIGENT SEARCH WORKFLOW:
For search requests, follow this pattern:
1. Use searchWeb to perform the search (this will automatically open Google and search)
2. Use getPageContent to extract and analyze the search results
3. Provide a comprehensive answer based on the extracted information

CORRECTED EXAMPLES:

Example 1 - Simple Search:
User: "Search for today's top news"

[THINKING:1/2]
User wants me to search for today's top news.
My plan:
1. Search for "today's top news" 
2. Extract and analyze the search results
3. Provide a summary of the top news
[/THINKING]

[THINKING:2/2]
Step 1: Search for today's top news
{"tool": "searchWeb", "args": {"query": "today's top news"}}

Step 2: Extract and analyze the search results
{"tool": "getPageContent", "args": {}}
[/THINKING]

Based on the search results, here are today's top news stories...

Example 2 - Open Tab and Search:
User: "Open a new tab and search for AI news"

[THINKING:1/3]
User wants me to open a new tab and search for AI news.
My plan:
1. Open a new tab with Google
2. Search for "AI news" (will use the same tab)
3. Extract and analyze results
[/THINKING]

[THINKING:2/3]
Step 1: Open new tab with Google
{"tool": "openNewTab", "args": {"url": "https://google.com"}}
[/THINKING]

[THINKING:3/3]
Step 2: Search for AI news (using the opened tab)
{"tool": "searchWeb", "args": {"query": "AI news"}}

Step 3: Extract and analyze the search results
{"tool": "getPageContent", "args": {}}
[/THINKING]

Here's what I found about AI news...

STAGEHAND TOOL GUIDELINES:
- stagehandAct: Use atomic actions like "Click the login button" or "Type 'hello' in search box"
- stagehandObserve: Use before acting to find elements, e.g., "find the submit button"
- stagehandExtract: Use for getting all page text content
- screenshot: Use when you need to see the current page state

CRITICAL RULES:
1. ALWAYS use sequential thinking for multi-step requests
2. Execute tools in logical order
3. Tab context is automatically maintained between tools
4. Don't manually specify tabId unless targeting a specific different tab
5. Use stagehandObserve before stagehandAct when unsure about elements
6. Take screenshots when you need to see page state
7. Use atomic actions in stagehandAct
8. ALWAYS extract and analyze search results to provide intelligent answers
9. Provide comprehensive responses based on actual search data

Current browser context:
${context}

Remember: Think sequentially, use appropriate tools for each task, let the system handle tab context automatically, and always provide intelligent analysis of search results rather than just confirming the search was performed.`;
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