import ConfigManager from './configManager.js';
import BrowserAgent from './agent.js';

class PopupUI {
    constructor() {
        this.configManager = new ConfigManager();
        this.agent = new BrowserAgent(this.configManager);
        this.initializeElements();
        this.attachEventListeners();
        this.loadModels();
    }

    initializeElements() {
        this.modelSelector = document.getElementById('modelSelector');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.messagesContainer = document.getElementById('messages');
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.mouseTracker = document.getElementById('mouseTracker');
        this.openSidebarButton = document.getElementById('openSidebarButton');
    }

    attachEventListeners() {
        this.modelSelector.addEventListener('change', () => this.onModelSelect());
        this.messageInput.addEventListener('input', () => this.updateSendButton());
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !this.sendButton.disabled) {
                this.sendMessage();
            }
        });
        this.openSidebarButton.addEventListener('click', () => this.openSidebar());
    }

    async loadModels() {
        try {
            const success = await this.configManager.loadConfig();
            if (success) {
                const models = this.configManager.getAvailableModels();
                this.populateModelSelector(models);
            } else {
                this.updateStatus('Failed to load models', false);
            }
        } catch (error) {
            console.error('Error loading models:', error);
            this.updateStatus('Error loading models', false);
        }
    }

    populateModelSelector(models) {
        this.modelSelector.innerHTML = '<option value="">Select Model</option>';
        models.forEach(modelId => {
            const option = document.createElement('option');
            option.value = modelId;
            option.textContent = modelId;
            this.modelSelector.appendChild(option);
        });
    }

    async onModelSelect() {
        const modelId = this.modelSelector.value;
        if (!modelId) {
            this.updateStatus('Select a model to begin', false);
            this.sendButton.disabled = true;
            return;
        }

        try {
            await this.agent.setModel(modelId);
            this.updateStatus('Ready', true);
            this.sendButton.disabled = false;
        } catch (error) {
            console.error('Error setting model:', error);
            this.updateStatus('Error setting model', false);
            this.sendButton.disabled = true;
        }
    }

    updateStatus(message, isActive) {
        this.statusText.textContent = message;
        this.statusDot.classList.toggle('active', isActive);
    }

    updateSendButton() {
        this.sendButton.disabled = !this.messageInput.value.trim() || !this.agent.currentModel;
    }

    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message) return;

        // Add user message to chat
        this.addMessage(message, 'user');
        this.messageInput.value = '';
        this.updateSendButton();

        // Disable input while processing
        this.setProcessingState(true);

        try {
            // Process the message
            const result = await this.agent.processUserQuery(message);
            
            // Add assistant response to chat
            this.addMessage(result.explanation, 'assistant');

            // Show mouse movement if needed
            if (result.mouseMovements) {
                this.animateMouseMovements(result.mouseMovements);
            }
        } catch (error) {
            console.error('Error processing message:', error);
            this.addMessage(`Error: ${error.message}`, 'assistant');
        } finally {
            this.setProcessingState(false);
        }
    }

    addMessage(text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;
        messageDiv.textContent = text;
        this.messagesContainer.appendChild(messageDiv);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    setProcessingState(isProcessing) {
        this.messageInput.disabled = isProcessing;
        this.sendButton.disabled = isProcessing;
        this.modelSelector.disabled = isProcessing;
        this.updateStatus(isProcessing ? 'Processing...' : 'Ready', !isProcessing);
    }

    openSidebar() {
        chrome.runtime.sendMessage({ type: 'OPEN_SIDEBAR' });
    }

    animateMouseMovements(movements) {
        // Show the mouse tracker
        this.mouseTracker.style.display = 'block';

        // Animate each movement
        movements.forEach((movement, index) => {
            setTimeout(() => {
                this.mouseTracker.style.left = `${movement.x}px`;
                this.mouseTracker.style.top = `${movement.y}px`;
                
                // Hide tracker after last movement
                if (index === movements.length - 1) {
                    setTimeout(() => {
                        this.mouseTracker.style.display = 'none';
                    }, 500);
                }
            }, index * 500); // 500ms between movements
        });
    }
}

// Initialize the popup UI when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PopupUI();
}); 