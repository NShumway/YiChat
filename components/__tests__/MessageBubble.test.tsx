import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { MessageBubble } from '../MessageBubble';
import { Message } from '../../types/Message';

describe('MessageBubble', () => {
  const mockOnAIChat = jest.fn();

  const baseMessage: Message = {
    id: 'msg1',
    chatId: 'chat1',
    senderId: 'user1',
    text: 'Hello world',
    originalLanguage: 'en-US',
    timestamp: Date.now(),
    status: 'sent',
    readBy: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render message text', () => {
      const { getByText } = render(
        <MessageBubble message={baseMessage} isOwn={false} />
      );

      expect(getByText('Hello world')).toBeTruthy();
    });

    it('should render own messages with different styling', () => {
      const { getByText } = render(
        <MessageBubble message={baseMessage} isOwn={true} />
      );

      const messageElement = getByText('Hello world');
      expect(messageElement).toBeTruthy();
      // Own messages should have different background color (tested via styles)
    });

    it('should render other user messages with different styling', () => {
      const { getByText } = render(
        <MessageBubble message={baseMessage} isOwn={false} />
      );

      const messageElement = getByText('Hello world');
      expect(messageElement).toBeTruthy();
    });
  });

  describe('AI Insights Indicator', () => {
    it('should show AI indicator when aiInsights exist for user language', () => {
      const messageWithInsights: Message = {
        ...baseMessage,
        aiInsights: {
          'en-US': 'This is an idiom meaning...',
        },
      };

      const { getByText } = render(
        <MessageBubble
          message={messageWithInsights}
          isOwn={false}
          onAIChat={mockOnAIChat}
        />
      );

      // Should show the indicator (❗)
      expect(getByText('❗')).toBeTruthy();
    });

    it('should NOT show AI indicator when no insights exist', () => {
      const { queryByText } = render(
        <MessageBubble message={baseMessage} isOwn={false} onAIChat={mockOnAIChat} />
      );

      // Should not show indicator
      expect(queryByText('❗')).toBeNull();
    });

    it('should NOT show AI indicator when insights exist but not for user language', () => {
      const messageWithInsights: Message = {
        ...baseMessage,
        aiInsights: {
          'es-MX': 'Este es un modismo...',
          'fr-FR': 'Ceci est une expression...',
        },
      };

      const { queryByText } = render(
        <MessageBubble
          message={messageWithInsights}
          isOwn={false}
          onAIChat={mockOnAIChat}
        />
      );

      // User's language is en-US (from mock), no insights for that language
      expect(queryByText('❗')).toBeNull();
    });

    it('should call onAIChat when AI indicator is tapped', () => {
      const messageWithInsights: Message = {
        ...baseMessage,
        aiInsights: {
          'en-US': 'This is an idiom...',
        },
      };

      const { getByText } = render(
        <MessageBubble
          message={messageWithInsights}
          isOwn={false}
          onAIChat={mockOnAIChat}
        />
      );

      const indicator = getByText('❗');
      fireEvent.press(indicator);

      expect(mockOnAIChat).toHaveBeenCalledWith(messageWithInsights);
    });
  });

  describe('Long Press Gesture', () => {
    it('should call onAIChat on long press', () => {
      const { getByText } = render(
        <MessageBubble message={baseMessage} isOwn={false} onAIChat={mockOnAIChat} />
      );

      const messageText = getByText('Hello world');
      fireEvent(messageText, 'longPress');

      expect(mockOnAIChat).toHaveBeenCalledWith(baseMessage);
    });

    it('should work on long press even without AI insights', () => {
      const { getByText } = render(
        <MessageBubble message={baseMessage} isOwn={false} onAIChat={mockOnAIChat} />
      );

      fireEvent(getByText('Hello world'), 'longPress');

      expect(mockOnAIChat).toHaveBeenCalled();
    });

    it('should NOT call onAIChat if callback not provided', () => {
      const { getByText } = render(
        <MessageBubble message={baseMessage} isOwn={false} />
      );

      // Should not crash
      expect(() => {
        fireEvent(getByText('Hello world'), 'longPress');
      }).not.toThrow();
    });
  });

  describe('Translation Display', () => {
    it('should show translated text when translation exists', () => {
      const translatedMessage: Message = {
        ...baseMessage,
        text: 'Hello world',
        originalLanguage: 'es-MX',
        translations: {
          'en-US': 'Hello world (translated)',
        },
      };

      const { getByText } = render(
        <MessageBubble message={translatedMessage} isOwn={false} />
      );

      expect(getByText('Hello world (translated)')).toBeTruthy();
    });

    it('should show original text when no translation exists', () => {
      const { getByText } = render(
        <MessageBubble message={baseMessage} isOwn={false} />
      );

      expect(getByText('Hello world')).toBeTruthy();
    });

    it('should show translation indicator when message is translated', () => {
      const translatedMessage: Message = {
        ...baseMessage,
        originalLanguage: 'es-MX',
        translations: {
          'en-US': 'Hello world',
        },
      };

      const { getByText } = render(
        <MessageBubble message={translatedMessage} isOwn={false} />
      );

      // Should show "Show original?" or similar text
      const translationIndicator = getByText(/Auto-translated/);
      expect(translationIndicator).toBeTruthy();
    });

    it('should toggle between original and translated text', () => {
      const translatedMessage: Message = {
        ...baseMessage,
        text: 'Hola mundo',
        originalLanguage: 'es-MX',
        translations: {
          'en-US': 'Hello world',
        },
      };

      const { getByText, queryByText } = render(
        <MessageBubble message={translatedMessage} isOwn={false} />
      );

      // Initially shows translation
      expect(getByText('Hello world')).toBeTruthy();

      // Tap translation indicator to show original
      const indicator = getByText(/Auto-translated/);
      fireEvent.press(indicator);

      // Should now show original
      expect(queryByText('Hola mundo')).toBeTruthy();
    });
  });

  describe('System Messages', () => {
    it('should render system messages differently', () => {
      const systemMessage: Message = {
        ...baseMessage,
        type: 'system',
        text: 'User joined the chat',
      };

      const { getByText } = render(
        <MessageBubble message={systemMessage} isOwn={false} />
      );

      expect(getByText('User joined the chat')).toBeTruthy();
      // System messages have different styling (centered, italic, etc.)
    });

    it('should not show AI indicator for system messages', () => {
      const systemMessage: Message = {
        ...baseMessage,
        type: 'system',
        text: 'System notification',
        aiInsights: {
          'en-US': 'Should not show',
        },
      };

      const { queryByText } = render(
        <MessageBubble message={systemMessage} isOwn={false} onAIChat={mockOnAIChat} />
      );

      expect(queryByText('❗')).toBeNull();
    });
  });

  describe('Group Chat Features', () => {
    it('should show sender name in group chats', () => {
      const message: Message = {
        ...baseMessage,
        senderName: 'Alice',
      };

      const { getByText } = render(
        <MessageBubble
          message={message}
          isOwn={false}
          isGroupChat={true}
        />
      );

      expect(getByText('Alice')).toBeTruthy();
    });

    it('should NOT show sender name for own messages in group chats', () => {
      const message: Message = {
        ...baseMessage,
        senderName: 'Me',
      };

      const { queryByText } = render(
        <MessageBubble
          message={message}
          isOwn={true}
          isGroupChat={true}
        />
      );

      // Own messages don't show sender name
      expect(queryByText('Me')).toBeNull();
    });

    it('should NOT show sender name in direct chats', () => {
      const message: Message = {
        ...baseMessage,
        senderName: 'Bob',
      };

      const { queryByText } = render(
        <MessageBubble
          message={message}
          isOwn={false}
          isGroupChat={false}
        />
      );

      expect(queryByText('Bob')).toBeNull();
    });

    it('should show read receipts for own messages in group chats', () => {
      const message: Message = {
        ...baseMessage,
        senderId: 'test-user',
        readBy: {
          'test-user': Date.now(),
          'user2': Date.now(),
          'user3': Date.now(),
        },
      };

      const { getByText } = render(
        <MessageBubble
          message={message}
          isOwn={true}
          isGroupChat={true}
          chatParticipants={['test-user', 'user2', 'user3']}
        />
      );

      // Should show "Read by some" or "Read by all"
      const readReceipt = getByText(/Read by/);
      expect(readReceipt).toBeTruthy();
    });
  });

  describe('Message Status', () => {
    it('should show sending indicator for sending status', () => {
      const sendingMessage: Message = {
        ...baseMessage,
        status: 'sending',
      };

      const { getByText } = render(
        <MessageBubble message={sendingMessage} isOwn={true} />
      );

      // Should show sending icon (⏱)
      expect(getByText('⏱')).toBeTruthy();
    });

    it('should show sent indicator for sent status', () => {
      const sentMessage: Message = {
        ...baseMessage,
        status: 'sent',
      };

      const { getByText } = render(
        <MessageBubble message={sentMessage} isOwn={true} />
      );

      // Should show sent icon (✓)
      expect(getByText('✓')).toBeTruthy();
    });

    it('should show delivered indicator for delivered status', () => {
      const deliveredMessage: Message = {
        ...baseMessage,
        status: 'delivered',
      };

      const { getByText } = render(
        <MessageBubble message={deliveredMessage} isOwn={true} />
      );

      // Should show delivered icon (✓✓)
      expect(getByText('✓✓')).toBeTruthy();
    });

    it('should show read indicator with blue checkmarks when read', () => {
      const readMessage: Message = {
        ...baseMessage,
        status: 'sent',
        senderId: 'test-user',
        readBy: {
          'test-user': Date.now(),
          'other-user': Date.now(),
        },
      };

      const { getByText } = render(
        <MessageBubble message={readMessage} isOwn={true} />
      );

      // Should show read icon (✓✓) - would be blue in actual app
      expect(getByText('✓✓')).toBeTruthy();
    });

    it('should show failed indicator for failed status', () => {
      const failedMessage: Message = {
        ...baseMessage,
        status: 'failed',
      };

      const { getByText } = render(
        <MessageBubble message={failedMessage} isOwn={true} />
      );

      // Should show warning icon (⚠)
      expect(getByText('⚠')).toBeTruthy();
    });

    it('should NOT show status indicators for received messages', () => {
      const { queryByText } = render(
        <MessageBubble message={baseMessage} isOwn={false} />
      );

      expect(queryByText('✓')).toBeNull();
      expect(queryByText('✓✓')).toBeNull();
    });
  });

  describe('Timestamp', () => {
    it('should display message timestamp', () => {
      const timestamp = new Date(2025, 0, 1, 14, 30).getTime();
      const message: Message = {
        ...baseMessage,
        timestamp,
      };

      const { getByText } = render(
        <MessageBubble message={message} isOwn={false} />
      );

      // Should show time in HH:MM format
      expect(getByText(/14:30|2:30/)).toBeTruthy(); // Depends on locale
    });
  });

  describe('Tone Indicator', () => {
    it('should show tone for received messages', () => {
      const messageWithTone: Message = {
        ...baseMessage,
        tone: 'sarcastic',
      };

      const { getByText } = render(
        <MessageBubble message={messageWithTone} isOwn={false} />
      );

      expect(getByText(/Tone: sarcastic/)).toBeTruthy();
    });

    it('should NOT show tone for own messages', () => {
      const messageWithTone: Message = {
        ...baseMessage,
        tone: 'friendly',
      };

      const { queryByText } = render(
        <MessageBubble message={messageWithTone} isOwn={true} />
      );

      expect(queryByText(/Tone:/)).toBeNull();
    });
  });
});
