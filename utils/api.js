import { useState } from 'react';
import { sendChatMessage } from '../utils/api';

const Chatbot = () => {
    const [messages, setMessages] = useState([]);
    const [threadId, setThreadId] = useState(null);

    const handleSendMessage = async (message) => {
        try {
            const response = await sendChatMessage(message, threadId);
            setMessages([...messages, { role: 'user', content: message }, { role: 'assistant', content: response.run_data }]);
            if (!threadId) {
                setThreadId(response.thread_id); // Save the thread ID for ongoing conversations
            }
        } catch (error) {
            console.error('Error sending message:', error);
        }
    };

    return (
        <div>
            {/* UI for your chatbot, including input and message display */}
        </div>
    );
};

export default Chatbot;
