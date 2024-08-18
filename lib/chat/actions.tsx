import 'server-only';


import {
  createAI,
  createStreamableUI,
  getMutableAIState,
  getAIState,
  streamUI,
  createStreamableValue,
} from 'ai/rsc';
import { openai } from '@ai-sdk/openai';

import { z } from 'zod';
import { Chat, Message } from '@/lib/types';
import { auth } from '@/auth';
import { saveChat } from '@/app/actions';
import { SpinnerMessage, UserMessage, BotMessage } from '@/components/stocks/message';
import { nanoid } from 'nanoid';

async function submitUserMessage(content: string) {
  'use server';

  const aiState = getMutableAIState<typeof AI>();

  // Add the user's message to the chat state
  aiState.update({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages,
      {
        id: nanoid(), // This will now correctly generate a unique ID
        role: 'user',
        content,
      },
    ],
  });


  let textStream: undefined | ReturnType<typeof createStreamableValue<string>>;
  let textNode: undefined | React.ReactNode;

  // Call OpenAI API to get the assistant's response
  const result = await streamUI({
    model: openai('gpt-4-mini'), // Use the appropriate model, gpt-4-mini or whatever is required
    
    initial: <SpinnerMessage />,
    system: `\
    You are a German language teacher. Your role is to assist users in learning and practicing the German language. You will help users with grammar, vocabulary, pronunciation, and conversational practice. Be supportive, patient, and provide clear explanations, examples, and exercises for learning. Translate between English and German as needed, explaining any nuances in meaning or usage. Emphasize correct grammar and pronunciation, and encourage regular practice. Use a casual and friendly tone, making learning engaging and fun.

  Follow these structured modules:
  
  - **Module 1: Vocabulary Introduction**:
    1. Introduce key vocabulary for the Scenario which user mentioned or asked for.
    2. Provide words in both German and English, with example sentences.

  - **Module 2: Scenario Presentation**:
    1. Ask the user for a scenario they have in mind and create a simple, engaging scenario.
    2. Introduce key vocabulary before the scenario.
    3. Break down the conversation into parts for easier understanding.
    4. Add interactive elements for practice.
    5. Use simplified language and shorter sentences.
    6. Include brief cultural notes where appropriate.

  - **Module 3: Questions and Comprehension**:
    1. Ask the user questions based on the scenario in German and prompt with a question to show english translation or not.
    2. Encourage the user to respond in German, and provide feedback on their answers and pronunciation.

  - **Module 4: Progression and Difficulty**:
    1. Ensure each chapter builds upon the previous one.
    2. Gradually increase the difficulty and length of chapters.

  - **Module 5: Memory Simulation**:
    1. Greet the user based on their progress.
    2. Offer a recap if it has been a few days since their last session.
    3. Track the user’s progress and provide personalized greetings and options for continuing or reviewing content.
  `,
    messages: [
      ...aiState.get().messages.map((message: any) => ({
        role: message.role,
        content: message.content,
        name: message.name,
      })),
    ],
    text: ({ content, done, delta }) => {
      if (!textStream) {
        textStream = createStreamableValue('');
        textNode = <BotMessage content={textStream.value} />;
      }

      if (done) {
        textStream.done();
        aiState.done({
          ...aiState.get(),
          messages: [
            ...aiState.get().messages,
            {
              id: nanoid(),
              role: 'assistant',
              content,
            },
          ],
        });
      } else {
        textStream.update(delta);
      }

      return textNode;
    },
  });

  return {
    id: nanoid(),
    display: result.value,
  };
}

export type AIState = {
  chatId: string;
  messages: Message[];
};

export type UIState = {
  id: string;
  display: React.ReactNode;
}[];

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
      return;
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
          <BotMessage content={message.content} />
        ) : null,
    }));
};
