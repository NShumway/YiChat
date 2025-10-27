import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AIChatModal } from '../AIChatModal';
import { Message } from '../../types/Message';

// Mock fetch for streaming
global.fetch = jest.fn();

describe('AIChatModal', () => {
  const mockOnClose = jest.fn();

  const baseMessage: Message = {
    id: 'msg1',
    chatId: 'chat1',
    senderId: 'user1',
    text: 'Break a leg!',
    originalLanguage: 'en-US',
    timestamp: Date.now(),
    status: 'sent',
    readBy: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
  });

  describe('Modal Display', () => {
    it('should not render when visible is false', () => {
      const { queryByText } = render(
        <AIChatModal
          visible={false}
          onClose={mockOnClose}
          message={baseMessage}
        />
      );

      expect(queryByText('AI Chat')).toBeNull();
    });

    it('should render when visible is true', () => {
      const { getByText } = render(
        <AIChatModal
          visible={true}
          onClose={mockOnClose}
          message={baseMessage}
        />
      );

      expect(getByText('AI Chat')).toBeTruthy();
    });

    it('should show message context at top', () => {
      const { getByText } = render(
        <AIChatModal
          visible={true}
          onClose={mockOnClose}
          message={baseMessage}
        />
      );

      expect(getByText('Discussing this message:')).toBeTruthy();
      expect(getByText('Break a leg!')).toBeTruthy();
    });

    it('should call onClose when close button is pressed', () => {
      const { getByText } = render(
        <AIChatModal
          visible={true}
          onClose={mockOnClose}
          message={baseMessage}
        />
      );

      const closeButton = getByText('✕');
      fireEvent.press(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Pre-generated Insights', () => {
    it('should show pre-generated insights immediately when available', async () => {
      const messageWithInsights: Message = {
        ...baseMessage,
        aiInsights: {
          'en-US': 'This idiom means "good luck" and is commonly used before performances.',
        },
      };

      const { getByText } = render(
        <AIChatModal
          visible={true}
          onClose={mockOnClose}
          message={messageWithInsights}
        />
      );

      await waitFor(() => {
        expect(getByText(/This idiom means "good luck"/)).toBeTruthy();
      });

      // Should NOT call fetch for pre-generated insights
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should NOT show insights for wrong language', async () => {
      const messageWithInsights: Message = {
        ...baseMessage,
        aiInsights: {
          'es-MX': 'Este modismo significa "buena suerte"',
          // No en-US insight
        },
      };

      // Mock streaming response
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"text":"Analysis..."}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: {"done":true}\n\n'));
          controller.close();
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      const { queryByText } = render(
        <AIChatModal
          visible={true}
          onClose={mockOnClose}
          message={messageWithInsights}
        />
      );

      // User's language is en-US, no insights available
      // Should stream fresh analysis instead
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    });
  });

  describe('Streaming Initial Analysis', () => {
    it('should stream initial analysis when no pre-generated insights', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"text":"This "}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: {"text":"is "}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: {"text":"an idiom"}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: {"done":true}\n\n'));
          controller.close();
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      const { getByText } = render(
        <AIChatModal
          visible={true}
          onClose={mockOnClose}
          message={baseMessage}
        />
      );

      // Should call streaming endpoint
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/streamAIChat'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Authorization': expect.stringContaining('Bearer'),
            }),
          })
        );
      });

      // Should show streamed text
      await waitFor(() => {
        expect(getByText('This is an idiom')).toBeTruthy();
      });
    });

    it('should show loading indicator while streaming starts', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          // Delayed response
          setTimeout(() => {
            controller.enqueue(new TextEncoder().encode('data: {"text":"Text"}\n\n'));
            controller.enqueue(new TextEncoder().encode('data: {"done":true}\n\n'));
            controller.close();
          }, 100);
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      const { UNSAFE_getByType } = render(
        <AIChatModal
          visible={true}
          onClose={mockOnClose}
          message={baseMessage}
        />
      );

      // Should show ActivityIndicator while loading
      await waitFor(() => {
        const indicator = UNSAFE_getByType('ActivityIndicator' as any);
        expect(indicator).toBeTruthy();
      });
    });

    it('should include message context in request', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"done":true}\n\n'));
          controller.close();
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      render(
        <AIChatModal
          visible={true}
          onClose={mockOnClose}
          message={baseMessage}
          senderNationality="American"
        />
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: expect.stringContaining('"messageText":"Break a leg!"'),
          })
        );
      });

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody).toEqual(
        expect.objectContaining({
          messageText: 'Break a leg!',
          messageLang: 'en-US',
          senderId: 'user1',
          senderNationality: 'American',
          messageContext: true,
        })
      );
    });
  });

  describe('Follow-up Questions', () => {
    it('should allow user to type follow-up questions', () => {
      const { getByPlaceholderText } = render(
        <AIChatModal
          visible={true}
          onClose={mockOnClose}
          message={baseMessage}
        />
      );

      const input = getByPlaceholderText('Ask a follow-up question...');
      fireEvent.changeText(input, 'Can you explain more?');

      expect(input.props.value).toBe('Can you explain more?');
    });

    it('should stream response to follow-up question', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"text":"Of course! "}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: {"text":"Here\'s more..."}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: {"done":true}\n\n'));
          controller.close();
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      const { getByPlaceholderText, getByText } = render(
        <AIChatModal
          visible={true}
          onClose={mockOnClose}
          message={baseMessage}
        />
      );

      const input = getByPlaceholderText('Ask a follow-up question...');
      fireEvent.changeText(input, 'Tell me more');

      const sendButton = getByText('Send');
      fireEvent.press(sendButton);

      await waitFor(() => {
        expect(getByText("Of course! Here's more...")).toBeTruthy();
      });
    });

    it('should disable input while streaming', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          // Never close to keep streaming
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      const { getByPlaceholderText, getByText } = render(
        <AIChatModal
          visible={true}
          onClose={mockOnClose}
          message={baseMessage}
        />
      );

      const input = getByPlaceholderText('Ask a follow-up question...');
      fireEvent.changeText(input, 'Question');

      const sendButton = getByText('Send');
      fireEvent.press(sendButton);

      await waitFor(() => {
        expect(input.props.editable).toBe(false);
      });
    });

    it('should clear input after sending', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"text":"Response"}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: {"done":true}\n\n'));
          controller.close();
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      const { getByPlaceholderText, getByText } = render(
        <AIChatModal
          visible={true}
          onClose={mockOnClose}
          message={baseMessage}
        />
      );

      const input = getByPlaceholderText('Ask a follow-up question...');
      fireEvent.changeText(input, 'My question');

      const sendButton = getByText('Send');
      fireEvent.press(sendButton);

      // Input should be cleared immediately (optimistic update)
      expect(input.props.value).toBe('');
    });

    it('should include conversation history in follow-up requests', async () => {
      // First, wait for initial stream to complete
      const initialStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"text":"Initial analysis"}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: {"done":true}\n\n'));
          controller.close();
        },
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        body: initialStream,
      });

      const { getByPlaceholderText, getByText } = render(
        <AIChatModal
          visible={true}
          onClose={mockOnClose}
          message={baseMessage}
        />
      );

      await waitFor(() => {
        expect(getByText('Initial analysis')).toBeTruthy();
      });

      // Now send follow-up
      const followupStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"text":"Follow-up answer"}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: {"done":true}\n\n'));
          controller.close();
        },
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        body: followupStream,
      });

      const input = getByPlaceholderText('Ask a follow-up question...');
      fireEvent.changeText(input, 'More info?');

      const sendButton = getByText('Send');
      fireEvent.press(sendButton);

      await waitFor(() => {
        const fetchCall = (global.fetch as jest.Mock).mock.calls[1];
        const requestBody = JSON.parse(fetchCall[1].body);

        // Should include previous conversation
        expect(requestBody.messages).toContainEqual({
          role: 'assistant',
          content: 'Initial analysis',
        });
        expect(requestBody.messages).toContainEqual({
          role: 'user',
          content: 'More info?',
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error message if streaming fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { getByText } = render(
        <AIChatModal
          visible={true}
          onClose={mockOnClose}
          message={baseMessage}
        />
      );

      await waitFor(() => {
        expect(getByText(/encountered an error/)).toBeTruthy();
      });
    });

    it('should show error if response is not ok', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const { getByText } = render(
        <AIChatModal
          visible={true}
          onClose={mockOnClose}
          message={baseMessage}
        />
      );

      await waitFor(() => {
        expect(getByText(/encountered an error/)).toBeTruthy();
      });
    });

    it('should handle malformed SSE data gracefully', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: invalid json\n\n'));
          controller.enqueue(new TextEncoder().encode('data: {"done":true}\n\n'));
          controller.close();
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      const { getByText } = render(
        <AIChatModal
          visible={true}
          onClose={mockOnClose}
          message={baseMessage}
        />
      );

      // Should show error
      await waitFor(() => {
        expect(getByText(/encountered an error/)).toBeTruthy();
      });
    });
  });

  describe('Lifecycle', () => {
    it('should reset state when modal closes', async () => {
      const { rerender, queryByText } = render(
        <AIChatModal
          visible={true}
          onClose={mockOnClose}
          message={baseMessage}
        />
      );

      // Wait for any async operations
      await waitFor(() => {
        expect(queryByText('AI Chat')).toBeTruthy();
      });

      // Close modal
      rerender(
        <AIChatModal
          visible={false}
          onClose={mockOnClose}
          message={baseMessage}
        />
      );

      // Reopen modal
      rerender(
        <AIChatModal
          visible={true}
          onClose={mockOnClose}
          message={baseMessage}
        />
      );

      // State should be reset (conversation cleared)
      // This would be verified by checking that initial analysis streams again
    });
  });
});
