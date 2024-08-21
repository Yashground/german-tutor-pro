import os
import asyncio
from typing import Optional
from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import httpx

app = FastAPI()
# Increase the timeout to 60 seconds (or whatever is appropriate)
TIMEOUT = 60.0

@app.get("/")
def read_root():
    return {"message": "Hello World, your FastAPI backend is up and running!"}

# Set up CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://german-tutor-pro.vercel.app/"],  # Restrict to your frontend URL
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)

class Message(BaseModel):
    role: str
    content: str
    thread_id: Optional[str] = None  # Optional allows None values

# Set your assistant ID and API key via environment variables for security
ASSISTANT_ID = os.getenv("ASSISTANT_ID", "asst_skwyet59AD0Dk1GtpweGMNBO")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "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")
BASE_URL = "https://api.openai.com/v1/"

async def create_thread():
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BASE_URL}/threads",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
                "OpenAI-Beta": "assistants=v2",
            }
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        data = response.json()
        print(f"Thread created with ID: {data['id']}")
        return data

async def add_message_to_thread(thread_id: str, role: str, content: str):
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        response = await client.post(
            f"{BASE_URL}/threads/{thread_id}/messages",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
                "OpenAI-Beta": "assistants=v2",
            },
            json={
                "role": role,  # Make sure role is passed here
                "content": content
            }
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()

async def run_thread(thread_id: str):
    print(f"Assistant ID being used: {ASSISTANT_ID}")

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        response = await client.post(
            f"{BASE_URL}/threads/{thread_id}/runs",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
                "OpenAI-Beta": "assistants=v2",
                "OpenAI-Organization": "org-LwkWByATbrpDbXRhAgfLdZFI"  # Add this under org id
            },
            json={
                "assistant_id": ASSISTANT_ID
            }
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()

async def check_run_status(thread_id: str, run_id: str):
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/threads/{thread_id}/runs/{run_id}",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
                "OpenAI-Beta": "assistants=v2",
            }
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()

async def get_response_messages(thread_id: str):
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        response = await client.get(
            f"{BASE_URL}/threads/{thread_id}/messages",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
                "OpenAI-Beta": "assistants=v2",
            }
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()

@app.post("/chat/")
async def chat(role: str = Body(...), content: str = Body(...), thread_id: str = Body(None)):
    try:
        # Create a new thread if thread_id is not provided
        if not thread_id:
            thread_data = await create_thread()
            thread_id = thread_data['id']
        
        # Add the user's initial message to the thread
        await add_message_to_thread(thread_id, role, content)
        
        # Run the thread
        run_data = await run_thread(thread_id)
        
        # Polling to check if the run is completed
        while run_data['status'] != 'completed':
            await asyncio.sleep(1)  # Wait for 1 second before polling again
            run_data = await check_run_status(thread_id, run_data['id'])
        
        # Retrieve and format the assistant's response
        response_data = await get_response_messages(thread_id)
        formatted_response = ""

        for message in response_data['data']:
            if message['role'] == 'assistant':
                for content_item in message['content']:
                    if content_item['type'] == 'text':
                        formatted_response += content_item['text']['value'] + "\n\n"

        # Remove the trailing line breaks
        formatted_response = formatted_response.strip()

        return {"message": formatted_response}
    except Exception as e:
        print(f"Error occurred: {e}")
        raise HTTPException(status_code=500, detail=str(e))
