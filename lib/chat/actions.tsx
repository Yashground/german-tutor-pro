import ReactMarkdown from 'react-markdown';
import 'server-only';
import {
  createAI,
  createStreamableUI,
  getMutableAIState,
  getAIState,
  createStreamableValue,
} from 'ai/rsc';
import { Chat, Message } from '@/lib/types';
import { auth } from '@/auth';
import { saveChat } from '@/app/actions';
import { SpinnerMessage, UserMessage, BotMessage } from '@/components/stocks/message';
import { nanoid } from 'nanoid';

// Function to handle submission of a user's message to the FastAPI backend
async function submitUserMessage(content: string) {
  'use server';

  const aiState = getMutableAIState<typeof AI>();
  let isComplete = false;

  // Set a loading state
  aiState.update({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages,
      {
        id: nanoid(),
        role: 'user',
        content,
      },
      {
        id: nanoid(),
        role: 'system',
        content: 'Loading...',  // Placeholder content while loading
      },
    ],
  });

  let rawFinalContent = '';

  try {
    // Call the FastAPI endpoint using the correct API URL
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,  // Ensure your FastAPI handles this if required
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'user',
        content: content,
        thread_id: null,  // Or pass an existing thread ID if applicable
      }),
    });

    if (!response.ok) {
      const errorMessage = await response.text();
      throw new Error(`API Error: ${errorMessage}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      rawFinalContent += chunk;
    }

    const finalContent = processContent(JSON.parse(rawFinalContent));
    isComplete = true;

    // Update with the final content
    aiState.done({
      ...aiState.get(),
      messages: aiState.get().messages.map(msg => 
        msg.role === 'system' && msg.content === 'Loading...' ? { ...msg, content: finalContent } : msg
      ),
    });

  } catch (error) {
    console.error('Failed to fetch AI response:', error);
    aiState.done({
      ...aiState.get(),
      messages: [
        ...aiState.get().messages,
        {
          id: nanoid(),
          role: 'system',
          content: 'An error occurred while fetching the response. Please try again later.',
        },
      ],
    });
  }
}

// Utility function to process the content and extract the message string
function processContent(rawContent: string | { message: string }): string {
  if (typeof rawContent === 'string') {
    return rawContent.replace(/\\n/g, '\n').replace(/\n/g, '<br/>'); // Convert escaped newlines to actual newlines, and then replace with <br/> tags
  } else if (rawContent && typeof rawContent === 'object' && 'message' in rawContent) {
    return rawContent.message.replace(/\\n/g, '\n').replace(/\n/g, '<br/>'); // Convert escaped newlines to <br/>
  } else {
    return ''; // Fallback if the content isn't in an expected format
  }
}

function MarkdownBotMessage({ content }: { content: string }) {
  return (
    <div
      dangerouslySetInnerHTML={{
        __html: content, // Render the processed content as HTML
      }}
    />
  );
}

// Define the AI state and UI state types
export type AIState = {
  chatId: string;
  messages: Message[];
};

export type UIState = {
  id: string;
  display: React.ReactNode;
}[];

// Create the AI with the defined state and actions
export const AI = createAI<AIState, UIState>({
  actions: {
    submitUserMessage,
  },
  initialUIState: [],
  initialAIState: { chatId: nanoid(), messages: [] },
  onGetUIState: async () => {
    'use server';

    const session = await auth();

    if (session && session.user) {
      const aiState = getAIState() as Chat;

      if (aiState) {
        const uiState = getUIStateFromAIState(aiState);
        return uiState;
      }
    } else {
      return [];
    }
  },
  onSetAIState: async ({ state }) => {
    'use server';

    const session = await auth();

    if (session && session.user) {
      const { chatId, messages } = state;

      const createdAt = new Date();
      const userId = session.user.id as string;
      const path = `/chat/${chatId}`;

      const firstMessageContent = messages[0].content as string;
      const title = firstMessageContent.substring(0, 100);

      const chat: Chat = {
        id: chatId,
        title,
        userId,
        createdAt,
        messages,
        path,
      };

      await saveChat(chat);
    } else {
      return;
    }
  },
});

export const getUIStateFromAIState = (aiState: Chat) => {
  return aiState.messages
    .filter((message) => message.role !== 'system')
    .map((message, index) => ({
      id: `${aiState.chatId}-${index}`,
      display:
        message.role === 'user' ? (
          <UserMessage>{message.content as string}</UserMessage>
        ) : message.role === 'assistant' &&
          typeof message.content === 'string' ? (
          <MarkdownBotMessage content={message.content} />  // Render content with HTML
        ) : null,
    }));
};
