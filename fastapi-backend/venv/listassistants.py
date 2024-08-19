import httpx
import asyncio

# Define your constants
OPENAI_API_KEY = "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"
BASE_URL = "https://api.openai.com/v1/"

# Function to list all assistants
async def list_assistants():
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/assistants",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
                "OpenAI-Beta": "assistants=v2",
                "OpenAI-Organization": "org-LwkWByATbrpDbXRhAgfLdZFI",  # if needed
            }
        )
        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"Failed to list assistants: {response.text}")

# Running the function and printing results
async def main():
    assistants = await list_assistants()
    print(assistants)

# To run the async function
asyncio.run(main())
