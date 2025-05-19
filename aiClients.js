class AzureOpenAIClient {
    constructor(config) {
        this.apiUrl = config.ApiUrl;
        this.apiKey = config.ApiKey;
        this.modelName = config.ModelName;
        this.apiVersion = config.ApiVersion || '2024-02-15-preview';
        this.maxTokens = config.MaxTokens || 1000;
        this.temperature = config.Temperature || 0.7;
        this.presencePenalty = config.PresencePenalty || 0;
        this.frequencyPenalty = config.FrequencyPenalty || 0;
        this.topP = config.NucleusSamplingFactor || 1;
        
        console.log('Initialized AzureOpenAIClient with model:', this.modelName, 
                    'API version:', this.apiVersion);
    }

    async sendMessage(message, onStream = null) {
        try {
            let requestBody;
            
            // Handle different message formats
            if (typeof message === 'object' && message.messages) {
                // Use provided messages array
                requestBody = {
                    messages: message.messages,
                    max_tokens: this.maxTokens,
                    temperature: this.temperature,
                    presence_penalty: this.presencePenalty,
                    frequency_penalty: this.frequencyPenalty,
                    top_p: this.topP,
                    stream: !!onStream
                };
            } else {
                // Use normal string message format
                requestBody = {
                    messages: [
                        { role: 'user', content: message }
                    ],
                    max_tokens: this.maxTokens,
                    temperature: this.temperature,
                    presence_penalty: this.presencePenalty,
                    frequency_penalty: this.frequencyPenalty,
                    top_p: this.topP,
                    stream: !!onStream
                };
            }

            console.log('Azure OpenAI request:', { 
                endpoint: this.apiUrl,
                model: this.modelName,
                messageCount: requestBody.messages.length,
                streaming: !!onStream
            });

            if (onStream) {
                return this.streamResponse(requestBody, onStream);
            }

            const response = await fetch(`${this.apiUrl}/openai/deployments/${this.modelName}/chat/completions?api-version=${this.apiVersion}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': this.apiKey
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || `Azure OpenAI API error: ${response.status}`);
            }

            const data = await response.json();
            return this.parseResponse(data);
        } catch (error) {
            console.error('Azure OpenAI API error:', error);
            throw new Error(`Failed to get response from Azure OpenAI: ${error.message}`);
        }
    }

    async streamResponse(requestBody, onStream) {
        try {
            console.log('Starting Azure OpenAI stream request');
            const response = await fetch(`${this.apiUrl}/openai/deployments/${this.modelName}/chat/completions?api-version=${this.apiVersion}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': this.apiKey
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || `Azure OpenAI API error: ${response.status}`);
            }

            console.log('Azure OpenAI stream response started');
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let chunkCount = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    console.log('Azure stream reader done, total chunks:', chunkCount);
                    onStream({ done: true });
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            console.log('Azure stream: [DONE]');
                            onStream({ done: true });
                            return;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            chunkCount++;
                            const content = parsed.choices?.[0]?.delta?.content || '';
                            
                            if (content) {
                                console.log(`Azure stream chunk ${chunkCount}, content length:`, content.length);
                                onStream({
                                    type: 'delta',
                                    content: content,
                                    role: parsed.choices[0]?.delta?.role || 'assistant'
                                });
                            }
                        } catch (e) {
                            console.error('Error parsing Azure stream data:', e);
                            onStream({ error: 'Error parsing stream data: ' + e.message });
                        }
                    }
                }
            }
            
            // Ensure completion is signaled
            onStream({ done: true });
            
        } catch (error) {
            console.error('Azure OpenAI streaming error:', error);
            onStream({ error: `Failed to stream from Azure OpenAI: ${error.message}` });
            throw error;
        }
    }

    parseResponse(data) {
        return {
            content: data.choices[0]?.message?.content || '',
            role: data.choices[0]?.message?.role || 'assistant',
            model: data.model,
            usage: {
                promptTokens: data.usage?.prompt_tokens,
                completionTokens: data.usage?.completion_tokens,
                totalTokens: data.usage?.total_tokens
            }
        };
    }
}

class ClaudeClient {
    constructor(config) {
        this.apiUrl = config.ApiUrl || 'https://api.anthropic.com';
        this.apiKey = config.ApiKey;
        this.modelName = config.ModelName;
        this.maxTokens = config.MaxTokens || 1000;
        this.temperature = config.Temperature || 0.7;
        this.apiVersion = config.ApiVersion || '2023-06-01';
        
        // Log configuration (excluding API key)
        console.log('Initialized ClaudeClient with model:', this.modelName, 
                   'API version:', this.apiVersion);
    }

    async sendMessage(message, onStream = null, systemMessage = '') {
        try {
            // Check if onStream is a callback (second arg) or a system message (third arg)
            if (typeof onStream === 'string' && systemMessage === '') {
                systemMessage = onStream;
                onStream = null;
            }
            
            const requestBody = {
                model: this.modelName,
                messages: [
                    { role: 'user', content: message }
                ],
                max_tokens: this.maxTokens,
                temperature: this.temperature,
                stream: !!onStream
            };

            if (systemMessage) {
                requestBody.system = systemMessage;
            }

            // Log request details (excluding sensitive data)
            console.log('Claude API Request:', {
                url: `${this.apiUrl}/v1/messages`,
                model: this.modelName,
                maxTokens: this.maxTokens,
                temperature: this.temperature,
                stream: !!onStream,
                hasSystemMessage: !!systemMessage
            });

            if (onStream) {
                return this.streamResponse(requestBody, onStream);
            }

            const response = await fetch(`${this.apiUrl}/v1/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': this.apiVersion
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || `Claude API error: ${response.status}`);
            }

            const data = await response.json();
            return data.content[0]?.text || '';
            
        } catch (error) {
            console.error('Claude API error:', error);
            throw new Error(`Failed to get response from Claude API: ${error.message}`);
        }
    }

    async streamResponse(requestBody, onStream) {
        try {
            console.log('Starting Claude stream request');
            const response = await fetch(`${this.apiUrl}/v1/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': this.apiVersion
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || `Claude API error: ${response.status}`);
            }

            console.log('Claude stream response started');
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let chunkCount = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    console.log('Claude stream reader done, total chunks:', chunkCount);
                    onStream({ done: true });
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            console.log('Claude stream: [DONE]');
                            onStream({ done: true });
                            return;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            chunkCount++;
                            
                            // Anthropic streaming event types
                            if (parsed.type === 'content_block_delta') {
                                const content = parsed.delta?.text || '';
                                if (content) {
                                    console.log(`Claude stream chunk ${chunkCount}, content length:`, content.length);
                                    onStream({
                                        type: 'delta',
                                        content: content,
                                        role: 'assistant'
                                    });
                                }
                            } else if (parsed.type === 'message_delta') {
                                // End of message
                                onStream({ done: true });
                            } else if (parsed.type === 'message_start') {
                                // Optionally handle start
                                console.log('Claude stream started');
                            }
                        } catch (e) {
                            console.error('Error parsing Claude stream data:', e);
                            onStream({ error: 'Error parsing stream data: ' + e.message });
                        }
                    }
                }
            }
            
            // Ensure completion is signaled
            onStream({ done: true });
            
        } catch (error) {
            console.error('Claude streaming error:', error);
            onStream({ error: `Failed to stream from Claude: ${error.message}` });
            throw error;
        }
    }

    parseResponse(data) {
        return {
            content: data.content[0]?.text || '',
            role: 'assistant',
            model: data.model,
            usage: data.usage
        };
    }
}

export { AzureOpenAIClient, ClaudeClient };