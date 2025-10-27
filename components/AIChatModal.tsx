import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useRef, useEffect } from 'react';
import { Message } from '../types/Message';
import { useStore } from '../store/useStore';
import { auth } from '../services/firebase';

interface AIChatModalProps {
  visible: boolean;
  onClose: () => void;
  message: Message;
  senderNationality?: string;
}

/**
 * Stream using XMLHttpRequest for React Native
 * Uses readyState polling to get chunks as they arrive
 */
function streamWithXHR(
  url: string,
  options: { method: string; headers: any; body: string },
  onProgress: (text: string) => void,
  onComplete: (text: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method, url, true);

    // Set headers
    Object.keys(options.headers).forEach(key => {
      xhr.setRequestHeader(key, options.headers[key]);
    });

    let fullText = '';
    let lastProcessedIndex = 0;
    let pollInterval: NodeJS.Timeout | null = null;

    // Poll for new data every 50ms while streaming
    const pollForData = () => {
      if (xhr.readyState >= 3 && xhr.responseText.length > lastProcessedIndex) {
        const newText = xhr.responseText.substring(lastProcessedIndex);
        const newLength = xhr.responseText.length;

        console.log(`📊 XHR poll: readyState=${xhr.readyState}, responseLength=${newLength}, newChars=${newText.length}`);

        lastProcessedIndex = newLength;

        // Parse SSE format
        const lines = newText.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                fullText += data.text;
                console.log(`✨ Streaming update: ${fullText.length} chars total`);
                onProgress(fullText);
              } else if (data.error) {
                if (pollInterval) clearInterval(pollInterval);
                reject(new Error(data.error));
                return;
              }
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 3 && !pollInterval) {
        // Start polling when streaming begins
        pollInterval = setInterval(pollForData, 50);
      }
    };

    xhr.onload = () => {
      if (pollInterval) clearInterval(pollInterval);

      // Process any remaining data
      pollForData();

      if (xhr.status === 200) {
        onComplete(fullText);
        resolve();
      } else {
        reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => {
      if (pollInterval) clearInterval(pollInterval);
      reject(new Error('Network error'));
    };

    xhr.send(options.body);
  });
}

export const AIChatModal = ({ visible, onClose, message, senderNationality }: AIChatModalProps) => {
  const [userInput, setUserInput] = useState('');
  const [conversation, setConversation] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);
  const user = useStore((state) => state.user);

  const userLanguage = user?.preferredLanguage || 'en-US';
  const hasPreGeneratedInsight = message.aiInsights && message.aiInsights[userLanguage];
  const preGeneratedInsight = hasPreGeneratedInsight ? message.aiInsights![userLanguage] : null;

  // Auto-stream initial analysis when modal opens
  useEffect(() => {
    if (visible && conversation.length === 0) {
      if (hasPreGeneratedInsight && preGeneratedInsight) {
        // Show pre-generated insight immediately (no streaming)
        setConversation([{
          role: 'assistant',
          content: preGeneratedInsight
        }]);
      } else {
        // Stream initial analysis
        streamInitialAnalysis();
      }
    }
  }, [visible]);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setConversation([]);
      setUserInput('');
      setStreamingText('');
      setIsStreaming(false);
    }
  }, [visible]);

  const streamInitialAnalysis = async () => {
    setIsStreaming(true);
    setStreamingText('');

    try {
      // Get auth token
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('Not authenticated');
      }

      // Get sender info (for relationship context)
      const senderId = message.senderId;

      // Call streaming AI chat endpoint
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_URL || 'https://us-central1-yichat-3f1b4.cloudfunctions.net'}/streamAIChat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            messages: [], // No previous conversation
            messageContext: true,
            messageText: message.text,
            messageLang: message.originalLanguage,
            senderId,
            senderNationality: senderNationality || 'Unknown',
            userNationality: user?.nationality || 'Unknown',
            hasPreGeneratedInsight: false,
            preGeneratedInsight: null,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Stream failed:', response.status, errorText);
        throw new Error(`Stream failed: ${response.status} - ${errorText}`);
      }

      // Check if we're on web (supports ReadableStream) or React Native (needs XHR)
      if (response.body && typeof response.body.getReader === 'function') {
        // Web: Use ReadableStream for true streaming
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                fullText += data.text;
                setStreamingText(fullText);
              } else if (data.done) {
                setConversation([{
                  role: 'assistant',
                  content: fullText
                }]);
                setStreamingText('');
                setIsStreaming(false);
                return;
              } else if (data.error) {
                throw new Error(data.error);
              }
            }
          }
        }
      } else {
        // React Native: Use XMLHttpRequest for streaming via progress events
        await streamWithXHR(
          response.url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              messages: [],
              messageContext: true,
              messageText: message.text,
              messageLang: message.originalLanguage,
              senderId,
              senderNationality: senderNationality || 'Unknown',
              userNationality: user?.nationality || 'Unknown',
              hasPreGeneratedInsight: false,
              preGeneratedInsight: null,
            }),
          },
          (text) => setStreamingText(text),
          (finalText) => {
            setConversation([{
              role: 'assistant',
              content: finalText
            }]);
            setStreamingText('');
            setIsStreaming(false);
          }
        );
      }
    } catch (error) {
      console.error('❌ Streaming error:', error);
      setStreamingText('');
      setIsStreaming(false);
      setConversation([{
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }]);
    }
  };

  const sendMessage = async () => {
    if (!userInput.trim() || isStreaming) return;

    const userMessage = userInput.trim();
    setUserInput('');

    // Add user message to conversation
    const newConversation = [...conversation, { role: 'user' as const, content: userMessage }];
    setConversation(newConversation);

    // Stream AI response
    setIsStreaming(true);
    setStreamingText('');

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_URL || 'https://us-central1-yichat-3f1b4.cloudfunctions.net'}/streamAIChat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            messages: newConversation,
            messageContext: true,
            messageText: message.text,
            messageLang: message.originalLanguage,
            senderId: message.senderId,
            senderNationality: senderNationality || 'Unknown',
            userNationality: user?.nationality || 'Unknown',
            hasPreGeneratedInsight: hasPreGeneratedInsight,
            preGeneratedInsight: preGeneratedInsight || null,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Follow-up stream failed:', response.status, errorText);
        throw new Error(`Stream failed: ${response.status} - ${errorText}`);
      }

      // Handle streaming differently for web vs React Native
      if (response.body && typeof response.body.getReader === 'function') {
        // Web: Use ReadableStream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                fullText += data.text;
                setStreamingText(fullText);
              } else if (data.done) {
                setConversation([...newConversation, {
                  role: 'assistant',
                  content: fullText
                }]);
                setStreamingText('');
                setIsStreaming(false);
                return;
              } else if (data.error) {
                throw new Error(data.error);
              }
            }
          }
        }
      } else {
        // React Native: Use XMLHttpRequest for streaming
        await streamWithXHR(
          response.url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              messages: newConversation,
              messageContext: true,
              messageText: message.text,
              messageLang: message.originalLanguage,
              senderId: message.senderId,
              senderNationality: senderNationality || 'Unknown',
              userNationality: user?.nationality || 'Unknown',
              hasPreGeneratedInsight: hasPreGeneratedInsight,
              preGeneratedInsight: preGeneratedInsight || null,
            }),
          },
          (text) => setStreamingText(text),
          (finalText) => {
            setConversation([...newConversation, {
              role: 'assistant',
              content: finalText
            }]);
            setStreamingText('');
            setIsStreaming(false);
          }
        );
      }
    } catch (error) {
      console.error('❌ Streaming error:', error);
      setStreamingText('');
      setIsStreaming(false);
      setConversation([...newConversation, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }]);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        >
          {/* Header */}
          <View style={styles.header}>
          <Text style={styles.headerTitle}>AI Chat</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Message Context */}
        <View style={styles.messageContext}>
          <Text style={styles.contextLabel}>Discussing this message:</Text>
          <Text style={styles.contextMessage} numberOfLines={3}>
            {message.text}
          </Text>
        </View>

        {/* Conversation */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.conversation}
          contentContainerStyle={styles.conversationContent}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {conversation.map((msg, index) => (
            <View
              key={index}
              style={[
                styles.messageBubble,
                msg.role === 'user' ? styles.userBubble : styles.assistantBubble
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  msg.role === 'user' ? styles.userText : styles.assistantText
                ]}
              >
                {msg.content}
              </Text>
            </View>
          ))}

          {/* Streaming text */}
          {isStreaming && streamingText && (
            <View style={[styles.messageBubble, styles.assistantBubble]}>
              <Text style={[styles.messageText, styles.assistantText]}>
                {streamingText}
              </Text>
              <ActivityIndicator size="small" color="#007AFF" style={styles.streamingIndicator} />
            </View>
          )}

          {/* Initial loading with thinking indicator */}
          {isStreaming && !streamingText && (
            <View style={[styles.messageBubble, styles.assistantBubble]}>
              <View style={styles.thinkingContainer}>
                <ActivityIndicator size="small" color="#007AFF" style={styles.thinkingSpinner} />
                <Text style={styles.thinkingText}>AI is thinking...</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Ask a follow-up question..."
            value={userInput}
            onChangeText={setUserInput}
            onSubmitEditing={sendMessage}
            editable={!isStreaming}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            onPress={sendMessage}
            disabled={!userInput.trim() || isStreaming}
            style={[
              styles.sendButton,
              (!userInput.trim() || isStreaming) && styles.sendButtonDisabled
            ]}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E9E9EB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#007AFF',
  },
  messageContext: {
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E9E9EB',
  },
  contextLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  contextMessage: {
    fontSize: 14,
    color: '#333',
    fontStyle: 'italic',
  },
  conversation: {
    flex: 1,
  },
  conversationContent: {
    padding: 16,
  },
  messageBubble: {
    marginVertical: 4,
    padding: 12,
    borderRadius: 16,
    maxWidth: '85%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#E9E9EB',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userText: {
    color: '#fff',
  },
  assistantText: {
    color: '#000',
  },
  streamingIndicator: {
    marginTop: 8,
  },
  thinkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  thinkingSpinner: {
    marginRight: 4,
  },
  thinkingText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#E9E9EB',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E9E9EB',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    maxHeight: 100,
    fontSize: 15,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sendButtonDisabled: {
    backgroundColor: '#B0D4FF',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
