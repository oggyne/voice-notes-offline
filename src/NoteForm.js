import React, { useState, useEffect } from 'react';

const NoteForm = ({ onSubmit, onCancel, voskInstance, isLoading }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [recognizer, setRecognizer] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!voskInstance) return;

    const initRecognizer = async () => {
      try {
        const rec = new voskInstance.KaldiRecognizer(16000);
        rec.on('result', (message) => {
          if (message.result && message.result.text) {
            setTranscript((prev) => (prev ? prev + ' ' : '') + message.result.text);
          }
        });
        rec.on('partialresult', (message) => {
          if (message.result && message.result.partial) {
            setTranscript(message.result.partial);
          }
        });
        setRecognizer(rec);
      } catch (err) {
        console.error('Failed to initialize recognizer:', err);
        setError('Failed to load speech recognition model');
        alert('Speech recognition unavailable');
      }
    };

    initRecognizer();

    return () => {
      if (recognizer) {
        recognizer.terminate();
      }
    };
  }, [voskInstance]);

  const startRecording = async (rec) => {
    if (!rec) {
      console.warn('No recognizer available');
      return;
    }

    let isRecordingLocal = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      const audioTracks = stream.getAudioTracks();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (event) => {
        if (!isRecordingLocal) return;
        try {
          if (!event.inputBuffer) {
            console.warn('No inputBuffer in event');
            return;
          }
          const inputBuffer = event.inputBuffer;
          rec.acceptWaveform(inputBuffer);
        } catch (err) {
          console.error('Error processing audio:', err);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      isRecordingLocal = true;
      setIsRecording(true);
      setTranscript('');
      console.log('Recording started');

      const cleanup = () => {
        try {
          processor.disconnect();
          source.disconnect();
          audioContext.close();
          stream.getTracks().forEach((track) => track.stop());
          console.log('Recording cleanup completed');
        } catch (err) {
          console.error('Cleanup error:', err);
        }
      };

      setRecognizer((prev) => ({ ...prev, cleanup }));
    } catch (err) {
      console.error('Recording error:', err);
      setError('Failed to access microphone');
      alert('Microphone access denied');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    console.log('stopRecording called');
    if (recognizer && isRecording) {
      setIsRecording(false);
      if (recognizer.cleanup) {
        recognizer.cleanup();
      }
      if (transcript.trim()) {
        onSubmit(transcript);
      }
      setTranscript('');
      console.log('Recording stopped');
    }
  };

  if (error) {
    return (
      <div className="text-red-500 p-4">
        <p>{error}</p>
        <button
          className="px-4 py-2 bg-gray-500 text-white rounded mt-2"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex space-x-2">
        <button
          className={`px-4 py-2 rounded text-white ${
            isRecording ? 'bg-red-500' : isLoading || !recognizer ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-500'
          }`}
          onClick={isRecording ? stopRecording : () => startRecording(recognizer)}
          disabled={isLoading || !recognizer}
        >
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </button>
        <button
          className="px-4 py-2 bg-gray-500 text-white rounded"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      {transcript && (
        <div className="p-2 bg-gray-100 rounded">
          <p className="text-gray-800">{transcript}</p>
        </div>
      )}
    </div>
  );
};

export default NoteForm;