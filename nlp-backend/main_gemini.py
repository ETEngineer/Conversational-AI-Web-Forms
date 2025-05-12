import uvicorn
import json
import os
import logging
import re
import httpx
from fastapi import FastAPI, HTTPException, Request, Form, File, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
import io
from google.cloud import speech
from google.oauth2 import service_account

import google.generativeai as genai
from google.api_core.exceptions import GoogleAPIError

GOOGLE_API_KEY = ""
genai.configure(api_key=GOOGLE_API_KEY)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

sessions: Dict[str, 'SessionData'] = {}

class StartRequest(BaseModel):
    sessionId: str
    labelset: List[str] = Field(..., min_length=1)
    callbackUrl: str

class ExtractedField(BaseModel):
    label: str
    value: str

class LLMResponse(BaseModel):
    extracted_data: List[ExtractedField] = Field(default_factory=list)
    bot_message: str
    next_state: Literal[
        "GREETING", "COLLECTING", "CLARIFYING", "CONFIRMING_SUMMARY",
        "AWAITING_CORRECTION_FIELD", "AWAITING_CORRECTION_VALUE", "COMPLETED", "ERROR"
    ]
    field_to_correct: Optional[str] = None

class SessionData:
    def __init__(self, session_id: str, labelset: List[str], callback_url: str):
        self.session_id = session_id
        self.original_labelset: List[str] = labelset
        self.responses: Dict[str, str] = {}
        self.callback_url = callback_url
        self.state: str = 'GREETING'
        self.field_to_correct: Optional[str] = None
        self.last_question_asked: Optional[str] = None
        self.conversation_history: List[Dict[str, Any]] = []

        model = genai.GenerativeModel('gemini-1.5-flash-latest')
        self.chat = model.start_chat(history=[])

    def get_unanswered_labels(self) -> List[str]:
        return [label for label in self.original_labelset if label not in self.responses]

    def get_next_label_original_case(self) -> Optional[str]:
        unanswered = self.get_unanswered_labels()
        return unanswered[0] if unanswered else None

    def add_history(self, role: Literal["user", "model"], content: str):
        self.conversation_history.append({"role": role, "parts": [{"text": content}]})
        model = genai.GenerativeModel('gemini-1.5-flash-latest')
        self.chat = model.start_chat(history=self.conversation_history)

    def format_summary(self) -> str:
        if not self.responses:
            return "It seems no information has been collected yet."
        summary_parts = ["Okay, here's the information I have:"]

        for label in self.original_labelset:
            if label in self.responses:
                 readable_label = label.replace('_', ' ').title()
                 summary_parts.append(f"- {readable_label}: {self.responses[label]}")

        return "\n".join(summary_parts)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def transcribe_audio_to_text(audio_bytes: bytes, file_format: str = "webm") -> str:
    logger.info(f"Attempting to transcribe audio ({len(audio_bytes)} bytes, format: {file_format})")

    client_file = "speech.json"
    client_credentials = service_account.Credentials.from_service_account_file(client_file)
    client = speech.SpeechClient(credentials=client_credentials)
    audio = speech.RecognitionAudio(content=audio_bytes)
    config = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
        sample_rate_hertz=48000,
        language_code="en-US",
        enable_automatic_punctuation=True,
        use_enhanced=True
    )
    response = client.recognize(config=config, audio=audio)
    if response.results:
        transcribed_text = response.results[0].alternatives[0].transcript
        logger.info(f"Transcription successful: '{transcribed_text}'")
        return transcribed_text
    else:
        logger.warning("STT returned no results.")
        raise HTTPException(status_code=500, detail="Could not transcribe audio: No results.")

    logger.warning("STT placeholder is active. No actual transcription performed.")
    return f"User audio input placeholder text. (Format: {file_format}, Size: {len(audio_bytes)} bytes)"

async def call_gemini_llm(session: SessionData) -> LLMResponse:
    logger.info(f"--- Calling Gemini for Session: {session.session_id}, State: {session.state} ---")
    last_user_message = session.conversation_history[-1]['parts'][0]['text'] if session.conversation_history and session.conversation_history[-1]['role'] == 'user' else "No recent user message."

    unanswered_labels = session.get_unanswered_labels()
    next_label_to_ask = unanswered_labels[0] if unanswered_labels else None
    collected_data_summary = "\n".join([f"- {l}: {session.responses.get(l, '[Missing]')}" for l in session.original_labelset]) if session.original_labelset else "None yet."

    system_instruction = f"""You are a friendly and patient chatbot assistant helping a visually impaired user fill out a form.
Your goal is to collect information for the following fields: {', '.join(session.original_labelset)}.
Be conversational and clear. Ask one question at a time unless the user provides multiple answers.
If the user's response is ambiguous or doesn't directly answer the question, ask for clarification.
When asking about a field, use its readable name (e.g., ask "What is your First Name?" for the label "first_name").

Current Conversation State: {session.state}
Fields yet to be collected: {', '.join(unanswered_labels) if unanswered_labels else "None - all collected!"}
Fields already collected (current state):
{collected_data_summary}

Last user input to analyze: "{last_user_message}"
"""

    if session.state == 'COLLECTING':
        instruction = f"""Analyze the user's last input ("{last_user_message}").
1. Did the user provide information for the field '{session.last_question_asked}' or any other UNANSWERED fields ({', '.join(unanswered_labels)})?
2. Extract all valid field-value pairs found for UNANSWERED fields from the last input. Match extracted values to the ORIGINAL label names in the list: {session.original_labelset}.
3. If the answer for '{session.last_question_asked}' is unclear or missing based on the last input, formulate a `bot_message` asking for clarification on THAT field and set `next_state` to 'CLARIFYING'.
4. If information was extracted from the last input AND there are still unanswered fields, formulate a `bot_message` acknowledging the received info (if any) and asking clearly for the *next* unanswered field: '{next_label_to_ask}'. Set `next_state` to 'COLLECTING'.
5. If information was extracted from the last input AND *all* fields are now answered, formulate a `bot_message` acknowledging the last piece of info and stating you will now summarize. Set `next_state` to 'CONFIRMING_SUMMARY'.
6. If the user's last input seems unrelated or doesn't contain form data, gently guide them back by re-asking for '{session.last_question_asked}'. Set `next_state` to 'COLLECTING'.
7. If the user's input contains date in any form, convert it to a standard format (DD/MM/YYYY) and extract it.
8. If the label is about a name, ask the user to spell out the name and then from the collected user input, just extract then name without any charachters in betweeen them. Also these names are Indian names. Sometimes names could be single letter intials(Example : last name of Harish G is G)
"""
    elif session.state == 'CLARIFYING':
        instruction = f"""The user responded to your clarification request regarding the field '{session.last_question_asked}' with "{last_user_message}".
1. Analyze the new message. Try to extract the value for '{session.last_question_asked}'.
2. If the value is now clear, extract it.
3. Check if *all* fields are now answered.
   - If YES: Formulate a `bot_message` acknowledging the info and stating you will summarize. Set `next_state` to 'CONFIRMING_SUMMARY'.
   - If NO: Formulate a `bot_message` acknowledging the info and asking for the *next* unanswered field: '{next_label_to_ask}'. Set `next_state` to 'COLLECTING'.
4. If the user's response is *still* unclear, formulate a `bot_message` politely stating you're still having trouble and ask again for '{session.last_question_asked}' perhaps phrased differently. Keep `next_state` as 'CLARIFYING'.
5. If the user provided data for *other* unanswered fields instead based on "{last_user_message}", extract that data, acknowledge it, and ask for the next required field ('{next_label_to_ask}' or the still-needed original field). Set `next_state` to 'COLLECTING'.
"""
    elif session.state == 'CONFIRMING_SUMMARY':
         instruction = f"""You just presented the summary of collected data. The user's message ("{last_user_message}") is their response to whether it's correct.
1. Analyze the user's message. Does it indicate confirmation (e.g., "yes", "correct", "looks good", "ok", "submit it")?
2. If YES: Formulate a final `bot_message` confirming submission (e.g., "Great! Submitting the form now."). Set `next_state` to 'COMPLETED'.
3. If NO (e.g., "no", "wrong", "mistake", "change something"): Formulate a `bot_message` asking *which field* needs correction (e.g., "Okay, which field needs to be changed?"). List the available field names if helpful: {', '.join(session.original_labelset)}. Set `next_state` to 'AWAITING_CORRECTION_FIELD'.
4. If the response is unclear: Formulate a `bot_message` asking for a clearer confirmation (e.g., "Sorry, I didn't quite catch that. Is the information correct, yes or no?"). Keep `next_state` as 'CONFIRMING_SUMMARY'.
"""
    elif session.state == 'AWAITING_CORRECTION_FIELD':
        instruction = f"""You asked the user which field to correct. Their message ("{last_user_message}") should contain the name of the field.
1. Analyze the user's message to identify which field label they want to correct. It must be one of: {', '.join(session.original_labelset)}.
2. If a valid field label is identified: Formulate a `bot_message` asking for the *new value* for that specific field (e.g., "Got it. What should the new value for [Field Name] be?"). Set `next_state` to 'AWAITING_CORRECTION_VALUE'. Include the identified field label in the `field_to_correct` JSON field.
3. If no valid field label is identified or the message is unclear: Formulate a `bot_message` asking them again to specify which field from the list ({', '.join(session.original_labelset)}) needs correcting. Keep `next_state` as 'AWAITING_CORRECTION_FIELD'.
"""
    elif session.state == 'AWAITING_CORRECTION_VALUE':
        instruction = f"""You asked the user for the new value for the field '{session.field_to_correct}'. Their message ("{last_user_message}") should contain the new value.
1. Analyze the user's message and extract the new value for '{session.field_to_correct}'.
2. Formulate a `bot_message` acknowledging the update (e.g., "Okay, I've updated [Field Name]. Let me summarize again."). Set `next_state` to 'CONFIRMING_SUMMARY'. Include the extracted value for '{session.field_to_correct}' in the `extracted_data` list.
3. If the new value is unclear: Formulate a `bot_message` asking again for the new value for '{session.field_to_correct}'. Keep `next_state` as 'AWAITING_CORRECTION_VALUE'.
"""
    else:
        logger.error(f"Session {session.session_id} is in unexpected state: {session.state}")
        instruction = "There seems to be an issue with the conversation state. Let's try to get back on track. What information can you provide for the form?"
        session.state = 'COLLECTING'

    prompt_for_this_turn = f"""{system_instruction}

{instruction}

You MUST respond with a single JSON object ONLY, matching this structure:
{{
  "extracted_data": [
    {{"label": "original_label_name", "value": "extracted_value"}},
    //... include all newly extracted pairs this turn, may be empty
  ],
  "bot_message": "The exact message to say to the user next.",
  "next_state": "The calculated next state (e.g., 'COLLECTING', 'CONFIRMING_SUMMARY', etc.)",
  "field_to_correct": "label_name or null" // Only non-null if next_state is AWAITING_CORRECTION_VALUE
}}
Ensure the JSON is valid. Do not include any text outside the JSON object.
"""

    logger.info(f"Sending prompt structure to Gemini for session {session.session_id}. Last user message: '{last_user_message}'")

    try:
        response = await session.chat.send_message_async(prompt_for_this_turn, generation_config=genai.types.GenerationConfig(response_mime_type="application/json"))
        logger.info(f"Gemini Raw Response Text: {response.text}")

        try:
            llm_output_dict = json.loads(response.text)

            parsed_response = LLMResponse(**llm_output_dict)
            logger.info(f"Gemini Parsed Response: {parsed_response.dict()}")
            return parsed_response

        except json.JSONDecodeError as e:
            logger.error(f"Error decoding Gemini JSON response: {e}. Raw text: {response.text}")
            match = re.search(r"```(?:json)?\s*({.*?})\s*```", response.text, re.DOTALL | re.IGNORECASE)
            if match:
                json_str = match.group(1)
                try:
                    llm_output_dict = json.loads(json_str)
                    parsed_response = LLMResponse(**llm_output_dict)
                    logger.info(f"Gemini Parsed Response (Fallback Regex): {parsed_response.dict()}")
                    return parsed_response
                except Exception as inner_e:
                     logger.error(f"Fallback regex parse failed: {inner_e}")
                     pass

            return LLMResponse(
                bot_message="Sorry, I encountered a technical issue processing that. Could you please try rephrasing?",
                next_state=session.state,
                extracted_data=[]
            )
        except Exception as e:
            logger.error(f"Error validating or processing Gemini response: {e}. Raw text: {response.text}")
            return LLMResponse(
                bot_message="Sorry, I had trouble understanding the structure of the response. Let's try that again.",
                next_state=session.state,
                extracted_data=[]
            )

    except GoogleAPIError as e:
        logger.error(f"Gemini API Error: {e}")
        raise HTTPException(status_code=503, detail=f"LLM service unavailable: {e}")
    except Exception as e:
        logger.error(f"Error calling Gemini LLM: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred with the LLM: {e}")

@app.post("/api/conversational-form/start")
async def start_conversation(start_request: StartRequest):

    session_id = start_request.sessionId
    logger.info(f"--- /start endpoint called for Session ID: {session_id} ---")

    if session_id in sessions:
        logger.warning(f"Session {session_id} already exists. Resetting.")
        del sessions[session_id]
    session = SessionData(session_id, start_request.labelset, start_request.callbackUrl)
    sessions[session_id] = session
    logger.info(f"Created/Reset Session {session_id}. Labelset: {session.original_labelset}")

    initial_bot_message = f"Hello! I'm here to help you fill out a form."
    first_label = session.get_next_label_original_case()

    if first_label:
        readable_label = first_label.replace('_', ' ').title()
        first_question = f"Please tell me the information for the fields as I ask for them. Let's start with: What is your {readable_label}?"
        session.state = 'COLLECTING'
        session.last_question_asked = first_label
        session.add_history("model", initial_bot_message)
        session.add_history("model", first_question)
        next_message_to_user = f"{initial_bot_message}\n{first_question}"

    else:
        initial_bot_message += "\nIt looks like there are no questions for this form."
        session.state = 'COMPLETED'
        session.add_history("model", initial_bot_message)
        next_message_to_user = initial_bot_message

    logger.info(f"Session {session.session_id} initialized. State: {session.state}. Sending initial message.")
    return {"message": "Conversation started", "nextQuestion": next_message_to_user, "sessionState": session.state}

@app.post("/api/conversational-form/message")
async def process_message(
    request: Request,
    sessionId: str = Form(...),
    message: Optional[str] = Form(None),
    audio_file: Optional[UploadFile] = File(None),
):
    client_host = request.client.host if request.client else "unknown"
    logger.info(f"--- /message endpoint called for Session: {sessionId}, User IP: {client_host} ---")

    session = sessions.get(sessionId)
    if not session:
        logger.warning(f"Session not found for ID: {sessionId} from {client_host}")
        raise HTTPException(status_code=404, detail="Session not found. Please start a new conversation.")

    if session.state == 'COMPLETED':
        logger.info(f"Session {sessionId} is already completed. Informing user.")
        return {"botMessage": "This conversation is already complete and the form has been submitted.", "sessionState": "COMPLETED"}

    user_message_text = None
    transcribed_text = None

    if audio_file:
        logger.info(f"Received audio file: {audio_file.filename}, content_type: {audio_file.content_type}")
        try:
            audio_bytes = await audio_file.read()
            file_format = audio_file.content_type.split('/')[-1] if audio_file.content_type else audio_file.filename.split('.')[-1] if audio_file.filename else 'unknown'

            transcribed_text = await transcribe_audio_to_text(audio_bytes, file_format=file_format)
            user_message_text = transcribed_text
            logger.info(f"Transcribed text from audio: '{user_message_text}'")

        except HTTPException as e:
            logger.error(f"Audio transcription failed: {e.detail}")
            return {
                 "botMessage": f"Sorry, I couldn't process the audio: {e.detail}",
                 "sessionState": session.state,
                 "transcribedText": "Transcription failed."
            }
        except Exception as e:
            logger.error(f"Unexpected error during audio processing: {e}", exc_info=True)
            return {
                 "botMessage": "Sorry, an unexpected error occurred while processing the audio.",
                 "sessionState": session.state,
                 "transcribedText": "Transcription failed."
            }

    elif message is not None and message.strip():
        user_message_text = message.strip()
        transcribed_text = user_message_text
        logger.info(f"Received text message: '{user_message_text}'")

    else:
        logger.warning(f"Received empty message/audio for session {sessionId}")
        return {
            "botMessage": "I didn't receive any message. Please speak or type.",
            "sessionState": session.state,
            "transcribedText": ""
        }

    if session.state == 'GREETING':
        logger.warning(f"Session {sessionId} in unexpected GREETING state during message.")
        first_label = session.get_next_label_original_case()
        if first_label:
            readable_label = first_label.replace('_', ' ').title()
            recovery_message = f"Sorry, let's restart. What is your {readable_label}?"
            session.state = 'COLLECTING'
            session.last_question_asked = first_label
            session.add_history("model", recovery_message)
            return {"botMessage": recovery_message, "sessionState": session.state, "transcribedText": transcribed_text}
        else:
             session.state = "COMPLETED"
             return {"botMessage": "There are no fields in this form.", "sessionState": session.state, "transcribedText": transcribed_text}

    session.add_history("user", user_message_text)

    llm_response = await call_gemini_llm(session)

    next_bot_message = llm_response.bot_message
    next_state = llm_response.next_state
    extracted_data = llm_response.extracted_data
    field_to_correct_from_llm = llm_response.field_to_correct

    previous_state = session.state
    session.state = next_state
    logger.info(f"Session {sessionId} state transition: {previous_state} -> {session.state}")

    if extracted_data:
        for item in extracted_data:
            if item.label in session.original_labelset and item.value is not None and item.value.strip() != "":
                if previous_state == 'AWAITING_CORRECTION_VALUE' and session.field_to_correct and item.label == session.field_to_correct:
                    logger.info(f"Session {sessionId}: Correcting field '{item.label}' to '{item.value}'")
                    session.responses[item.label] = item.value
                elif session.state != 'AWAITING_CORRECTION_VALUE':
                     logger.info(f"Session {sessionId}: Storing '{item.value}' for label '{item.label}'")
                     session.responses[item.label] = item.value
                else:
                     logger.info(f"Session {sessionId}: LLM extracted data for '{item.label}' but in correction state ({session.field_to_correct}). Ignoring extraction.")

            else:
                logger.warning(f"Session {sessionId}: LLM extracted invalid/unknown data. Label: '{item.label}', Value: '{item.value}'. Ignoring.")

    if next_state == 'AWAITING_CORRECTION_FIELD':
         session.field_to_correct = None
         logger.info(f"Session {sessionId}: State AWAITING_CORRECTION_FIELD. Reset field_to_correct.")
    elif next_state == 'AWAITING_CORRECTION_VALUE' and field_to_correct_from_llm:
        if field_to_correct_from_llm in session.original_labelset:
            session.field_to_correct = field_to_correct_from_llm
            logger.info(f"Session {sessionId}: State AWAITING_CORRECTION_VALUE. Set field_to_correct to '{session.field_to_correct}'")
        else:
            logger.warning(f"Session {sessionId}: LLM suggested correcting unknown field '{field_to_correct_from_llm}'. Ignoring.")
            session.field_to_correct = None

    elif next_state != 'AWAITING_CORRECTION_VALUE' and previous_state == 'AWAITING_CORRECTION_VALUE':
         session.field_to_correct = None
         logger.info(f"Session {sessionId}: Exited correction state. Reset field_to_correct.")

    if previous_state != 'CONFIRMING_SUMMARY' and session.state == 'CONFIRMING_SUMMARY':
        summary_text = session.format_summary()
        confirmation_prompt = "\nPlease review the information above. Is everything correct? (Yes/No)"
        full_summary_message = f"{llm_response.bot_message}\n{summary_text}\n{confirmation_prompt}"

        session.add_history("model", llm_response.bot_message)

        logger.info(f"Session {sessionId}: Transitioned to CONFIRMING_SUMMARY. Sending summary.")
        return {
            "botMessage": full_summary_message,
            "filled": session.responses,
            "remaining": session.get_unanswered_labels(),
            "sessionState": session.state,
            "transcribedText": transcribed_text
        }

    elif previous_state != 'COMPLETED' and session.state == 'COMPLETED':
        logger.info(f"Session {sessionId}: State is COMPLETED. Triggering callback.")
        await send_callback(session)

        if sessionId in sessions:
             try: del sessions[sessionId]
             except KeyError: pass
             logger.info(f"Session {sessionId}: Deleted from memory.")


        session.add_history("model", next_bot_message)
        return {
            "botMessage": next_bot_message,
            "filled": session.responses,
            "remaining": [],
            "sessionState": session.state,
            "transcribedText": transcribed_text
        }

    else:
         session.add_history("model", next_bot_message)
         logger.info(f"Session {sessionId}: Continuing conversation. Sending bot message.")

         return {
            "botMessage": next_bot_message,
            "filled": session.responses,
            "remaining": session.get_unanswered_labels(),
            "sessionState": session.state,
            "transcribedText": transcribed_text
        }


async def send_callback(session: SessionData):
    payload = {
        "formId": session.session_id,
        "responses": session.responses
    }
    logger.info(f"Session {session.session_id}: Preparing to send callback to {session.callback_url}")

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            res = await client.post(session.callback_url, json=payload)
            res.raise_for_status()
            logger.info(f"Callback sent successfully for session {session.session_id}, Response status: {res.status_code}")
        except httpx.TimeoutException:
             logger.error(f"Callback request timed out for session {session.session_id} to {session.callback_url}")
        except httpx.RequestError as exc:
            logger.error(f"Error sending callback request for session {session.session_id} to {session.callback_url}: {exc}")
        except httpx.HTTPStatusError as exc:
            logger.error(f"Callback request failed for session {session.session_id}: Status {exc.response.status_code} - Response: {exc.response.text[:500]}") # Log beginning of response
        except Exception as e:
            logger.exception(f"An unexpected error occurred during callback for session {session.session_id}: {e}", exc_info=True)

@app.get("/")
async def read_root():
    return {"status": "OK", "message": "Gemini Conversational Form Filler API is running."}

@app.get("/api/conversational-form/sessions")
async def list_sessions():
    return {"active_sessions": list(sessions.keys()), "session_details": {k: {"state": s.state, "responses": s.responses, "unanswered": s.get_unanswered_labels(), "last_q": s.last_question_asked} for k, s in sessions.items()}}


if __name__ == "__main__":
    print("Starting Gemini Conversational Form Filler API...")
    print(f"API will run on http://0.0.0.0:8000")
    uvicorn.run("main_gemini:app", host="0.0.0.0", port=8000, reload=True, log_level="info")