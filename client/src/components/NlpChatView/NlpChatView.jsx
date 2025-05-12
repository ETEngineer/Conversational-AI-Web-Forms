import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { formApi } from '../../services/api';
import './NlpChatView.css';

const NLP_API_URL = process.env.REACT_APP_NLP_API_URL || 'http://localhost:8000/api/conversational-form'; 
const NODE_API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const CALLBACK_URL = `${NODE_API_BASE_URL}/responses/callback`;

const NlpChatView = () => {
  const { formId } = useParams();
  const navigate = useNavigate();
  const [formTitle, setFormTitle] = useState('');
  const [messages, setMessages] = useState([]);
  const [labelset, setLabelset] = useState([]); // to be used to show live application filling process
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const initilizedRef = useRef(false);

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [permissionGranted, setPermissionGranted] = useState(null);

  const [speaking, setSpeaking] = useState(false);


  const addMessage = useCallback((sender, text) => {
    setMessages(prev => [...prev, { sender, text }]);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].sender === 'bot' && !isComplete && !isRecording && !speaking) {
      inputRef.current?.focus();
    }
  }, [messages, isComplete, isRecording, speaking]);

  const initializeChat = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const formResponse = await formApi.getFormById(formId);
      const fetchedForm = formResponse.data.data; 
      if (!fetchedForm || !fetchedForm.questions) {
        throw new Error('Invalid form structure received.');
      }
      setFormTitle(fetchedForm.title);

      const labels = fetchedForm.questions.map(q => q.question).filter(Boolean); 
      if (labels.length === 0) {
         throw new Error('Form has no questions to ask.');
      }
      setLabelset(labels);

      const startPayload = {
        sessionId: formId,
        labelset: labels,
        callbackUrl: CALLBACK_URL
      };

      const nlpStartResponse = await fetch(`${NLP_API_URL}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(startPayload)
      });

      if (!nlpStartResponse.ok) {
        const errorData = await nlpStartResponse.json().catch(() => ({}));
        console.error("NLP Start Error Response Body:", errorData);
        throw new Error(`Failed to start NLP chat: ${errorData.detail || nlpStartResponse.statusText}`);
      }

      const startData = await nlpStartResponse.json();
      addMessage('bot', startData.nextQuestion);

    } catch (err) {
      console.error('Initialization Error:', err);
      setError(`Error initializing chat: ${err.message}`);
      addMessage('bot', 'Sorry, I could not start the conversation.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!initilizedRef.current) {
        initilizedRef.current = true;
        initializeChat();
    }
  }, [formId, addMessage]);


  const startRecording = async () => {
    if (isRecording || isSending || isLoading || isComplete) return;

    setError(null);
    setIsRecording(true);
    audioChunksRef.current = [];

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setPermissionGranted(true);
        const options = { mimeType: 'audio/webm;codecs=opus' };

        const mediaRecorder = new MediaRecorder(stream, options);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunksRef.current.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            setIsRecording(false);
            setIsSending(true);
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
            audioChunksRef.current = [];

            stream.getTracks().forEach(track => track.stop());

            if (audioBlob.size > 0) {
                await sendAudio(audioBlob);
            } else {
                console.warn("No audio data recorded.");
                setIsSending(false);
            }
        };

        mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error:', event.error);
            setError(`Recording error: ${event.error.name}`);
            setIsRecording(false);
            setIsSending(false);
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start();
        console.log('Recording started');

    } catch (err) {
        console.error('Error accessing microphone:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setError('Microphone permission denied. Please allow access in your browser settings.');
            setPermissionGranted(false);
        } else {
             setError(`Error starting recording: ${err.message}`);
        }
        setIsRecording(false);
        setIsSending(false);
    }
  };

  const stopRecording = () => {
    if (isRecording && mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        console.log('Recording stopped');
    }
  };

  const sendAudio = async (audioBlob) => {
      if (isSending) return;
      setIsSending(true);

      const tempMsgId = Date.now();
      setMessages(prev => [...prev, { id: tempMsgId, sender: 'user', text: '...Processing audio...' }]);


      const formData = new FormData();
      formData.append('sessionId', formId);
      formData.append('audio_file', audioBlob, `recording-${tempMsgId}.webm`);

      try {
          const nlpMessageResponse = await fetch(`${NLP_API_URL}/message`, {
            method: 'POST',
            body: formData,
          });

          if (!nlpMessageResponse.ok) {
             const errorData = await nlpMessageResponse.json().catch(() => ({}));
             throw new Error(`Failed to process audio message: ${errorData.detail || nlpMessageResponse.statusText}`);
          }

          const responseData = await nlpMessageResponse.json();

          setMessages(prev => prev.filter(msg => msg.id !== tempMsgId));

          addMessage('user', responseData.transcribedText || 'Audio Input');
          addMessage('bot', responseData.botMessage);


          if (responseData.sessionState === 'COMPLETED') {
            addMessage('bot', 'Thank you for your responses!');
            setIsComplete(true);
            setTimeout(() => {
               addMessage('bot', "Thanks! Redirecting you now...");
            }, 3000);
          }

      } catch (err) {
          console.error('Send Audio Error:', err);
          setError(`Error sending audio: ${err.message}`);
          setMessages(prev => prev.filter(msg => msg.id !== tempMsgId));
          addMessage('bot', 'Sorry, there was an issue processing your audio message.');
      } finally {
          setIsSending(false);
      }
  }

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'j' || event.key === 'J') {
        if (!isRecording) {
          if (document.activeElement === inputRef.current) {
             event.preventDefault();
          }
          startRecording();
        }
      }
    };

    const handleKeyUp = (event) => {
      if (event.key === 'j' || event.key === 'J') {
        if (isRecording) {
          stopRecording();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [isRecording, isSending, isLoading, isComplete]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      console.warn("Text-to-Speech not supported in this browser.");
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.sender === 'bot' && !isComplete) {
       if (speaking) {
           window.speechSynthesis.cancel();
       }
       const utterance = new SpeechSynthesisUtterance(lastMessage.text);
       utterance.onstart = () => setSpeaking(true);
       utterance.onend = () => {
            setSpeaking(false);
             if (!isComplete && !isRecording && inputRef.current) {
                 inputRef.current.focus();
             }
       };
       utterance.onerror = (event) => {
         console.error('SpeechSynthesis error:', event.error);
         setSpeaking(false);
          if (!isComplete && !isRecording && inputRef.current) {
                 inputRef.current.focus();
             }
       };

       setTimeout(() => {
            window.speechSynthesis.speak(utterance);
       }, 100);

    }
    return () => {
        if (window.speechSynthesis && speaking) {
            window.speechSynthesis.cancel();
        }
    };

  }, [messages, isComplete]);

const handleSendMessage = async (e) => {
  e.preventDefault();
  const inputElement = inputRef.current;
  const messageText = inputElement.value.trim();

  if (isRecording || !messageText || isSending || isLoading || isComplete) return;

  addMessage('user', messageText);
  inputElement.value = '';
  setIsSending(true);
  setError(null);

  try {
    const formData = new FormData();
    formData.append('sessionId', formId);
    formData.append('message', messageText);

    const nlpMessageResponse = await fetch(`${NLP_API_URL}/message`, {
      method: 'POST',
      body: formData,
    });


    if (!nlpMessageResponse.ok) {
       const errorData = await nlpMessageResponse.json().catch(() => ({}));
      throw new Error(`Failed to process message: ${errorData.detail || nlpMessageResponse.statusText}`);
    }

    const responseData = await nlpMessageResponse.json();
    addMessage('bot', responseData.botMessage);

    if (responseData.sessionState === 'COMPLETED') {
      setIsComplete(true);
      setTimeout(() => {
         navigate('/');
      }, 5000);
    }
  } catch (err) {
    console.error('Send Message Error:', err);
    setError(`Error sending message: ${err.message}`);
    addMessage('bot', 'Sorry, there was an issue processing your message.');
  } finally {
    setIsSending(false);
  }
};

  return (
    <div className="nlp-chat-container">
      <header className="nlp-chat-header">
        <h1>Chat Form: {formTitle || 'Loading...'}</h1>
      </header>

      <div className="nlp-chat-messages">
        {permissionGranted === false && (
            <div className="message message-bot error-message" role="alert">
                Microphone access denied. Please enable it in your browser settings to use voice input.
            </div>
        )}
         {error && (
            <div className="message message-bot error-message" role="alert">
             Error: {error}
            </div>
          )}

        {messages.map((msg, index) => (
          <div key={msg.id || index} className={`message message-${msg.sender}`}>
            <span className="sender-label">{msg.sender === 'bot' ? 'Bot' : 'You'}:</span>
            <p>{msg.text}</p>
            {msg.sender === 'bot' && (
                 <button
                     className="tts-repeat-button"
                     onClick={() => {
                        if (!('speechSynthesis' in window)) return;
                        window.speechSynthesis.cancel();
                        const utterance = new SpeechSynthesisUtterance(msg.text);
                        window.speechSynthesis.speak(utterance);
                     }}
                     disabled={speaking}
                 >
                     Read
                 </button>
            )}
          </div>
        ))}
        <div ref={chatEndRef} /> 

        {isRecording && (
             <div className="message message-user recording-indicator">
                <span className="sender-label">You (Recording):</span>
                <p className="recording-dots">
                    <span>.</span><span>.</span><span>.</span>
                </p>
            </div>
        )}

        {isSending && !isRecording && (
            <div className="message message-bot message-thinking">
                <span className="sender-label">Bot:</span>
                <p className="thinking-dots">
                    <span>.</span><span>.</span><span>.</span>
                </p>
            </div>
        )}
         {speaking && (
             <div className="message message-bot speaking-indicator">
                 <span className="sender-label">Bot (Speaking):</span>
                 <p>Speaking...</p>
             </div>
         )}

      </div>

      <form onSubmit={handleSendMessage} className="nlp-chat-input-area">
        <input
          ref={inputRef}
          type="text"

          placeholder={isComplete ? "Conversation complete." : (isRecording ? "Recording (Hold J)" : (isLoading ? "Loading..." : "Type or hold J to speak..."))}
          disabled={isLoading || isSending || isComplete || isRecording || speaking}
          style={{ border: isRecording ? '2px solid red' : '' }} 
        />
        <button 
          type="submit"
          disabled={isLoading || isSending || isComplete || isRecording || speaking}
        >
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </form>
       {!isComplete && !isLoading && (
        <div className="voice-hint">
            Hold down the "J" key to speak your message.
        </div>
       )}
    </div>
  );
};

export default NlpChatView;
