const App = () => {
  const [notes, setNotes] = React.useState([]);
  const [showForm, setShowForm] = React.useState(false);
  const [voskInstance, setVoskInstance] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Ініціалізація IndexedDB
  const initDB = () => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('VoiceNotesDB', 1);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        db.createObjectStore('notes', { keyPath: 'id' });
      };
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = () => reject(request.error);
    });
  };

  // Завантаження нотаток з IndexedDB
  const getNotes = async () => {
    try {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('notes', 'readonly');
        const store = tx.objectStore('notes');
        const request = store.getAll();
        request.onsuccess = () => {
          console.log('Loaded notes from IndexedDB:', request.result);
          resolve(request.result);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.error('Failed to load notes:', err);
      return [];
    }
  };

  // Збереження нотатки в IndexedDB
  const saveNote = async (note) => {
    try {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('notes', 'readwrite');
        const store = tx.objectStore('notes');
        store.put(note);
        tx.oncomplete = () => {
          console.log('Saved note to IndexedDB:', note);
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  };

  // Завантаження нотаток при монтуванні
  React.useEffect(() => {
    const loadData = async () => {
      try {
        // Ініціалізація Vosk
        if (typeof Vosk === 'undefined') {
          throw new Error('Vosk library not loaded');
        }
        const model = await Vosk.createModel('/models/vosk-model-small-uk-v3-small.zip');
        setVoskInstance(model);

        // Завантаження нотаток
        const savedNotes = await getNotes();
        setNotes(savedNotes);
      } catch (err) {
        console.error('Initialization error:', err);
        alert('Speech recognition or data loading failed');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const handleNoteSubmit = async (transcript) => {
    const newNote = {
      id: Date.now(),
      content: transcript,
      timestamp: new Date().toLocaleString(),
    };
    setNotes((prevNotes) => [...prevNotes, newNote]);
    await saveNote(newNote); // Збереження в IndexedDB
    setShowForm(false);
  };

  const handleNewNote = () => {
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Voice Notes</h1>
      {isLoading ? (
        <div className="flex justify-center items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-blue-500"></div>
        </div>
      ) : showForm ? (
        <NoteForm
          onSubmit={handleNoteSubmit}
          onCancel={handleCancel}
          voskInstance={voskInstance}
          isLoading={isLoading}
        />
      ) : (
        <>
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded mb-4"
            onClick={handleNewNote}
          >
            New Note
          </button>
          <NoteList notes={notes} />
        </>
      )}
    </div>
  );
};

const NoteForm = ({ onSubmit, onCancel, voskInstance, isLoading }) => {
  const [isRecording, setIsRecording] = React.useState(false);
  const [transcript, setTranscript] = React.useState('');
  const [partialTranscript, setPartialTranscript] = React.useState('');
  const [allPartials, setAllPartials] = React.useState([]); // Зберігаємо всі partialresult
  const [recognizer, setRecognizer] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [isProcessing, setIsProcessing] = React.useState(false);

  React.useEffect(() => {
    if (!voskInstance) return;

    const initRecognizer = async () => {
      try {
        const rec = new voskInstance.KaldiRecognizer(16000);
        rec.on('result', (message) => {
          if (message.result && message.result.text) {
            console.log('Result:', message.result.text);
            setTranscript((prev) => (prev ? prev + ' ' : '') + message.result.text);
          }
        });
        rec.on('partialresult', (message) => {
          if (message.result && message.result.partial) {
            console.log('Partial:', message.result.partial);
            setPartialTranscript(message.result.partial);
            setAllPartials((prev) => [...prev, message.result.partial]); // Додаємо до allPartials
          } else {
            setPartialTranscript('');
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
      // TODO: Замінити ScriptProcessorNode на AudioWorkletNode для майбутньої сумісності
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
      setPartialTranscript('');
      setAllPartials([]);
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
      setIsProcessing(true); // Показати індикатор обробки
      setTimeout(() => {
        // Об’єднуємо transcript і останній allPartials
        const lastPartial = allPartials.length > 0 ? allPartials[allPartials.length - 1] : '';
        const finalTranscript = transcript.trim()
          ? transcript.trim() + (lastPartial.trim() ? ' ' + lastPartial.trim() : '')
          : lastPartial.trim();
        if (finalTranscript) {
          console.log('Submitting transcript:', finalTranscript);
          onSubmit(finalTranscript);
        }
        if (recognizer.cleanup) {
          recognizer.cleanup();
        }
        setTranscript('');
        setPartialTranscript('');
        setAllPartials([]);
        setIsProcessing(false); // Прибрати індикатор обробки
        console.log('Recording stopped');
      }, 3500); // Збільшено затримку до 3500 мс
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
      {(transcript || partialTranscript) && (
        <div className="p-2 bg-gray-100 rounded">
          <p className="text-gray-800">{partialTranscript || transcript}</p>
        </div>
      )}
      {isProcessing && (
        <div className="text-blue-500 text-sm font-semibold animate-pulse">Обробка...</div>
      )}
    </div>
  );
};

const NoteList = ({ notes }) => (
  <div>
    {notes.length === 0 ? (
      <p>No notes yet.</p>
    ) : (
      <ul className="space-y-2">
        {notes.map((note) => (
          <li key={note.id} className="p-2 bg-gray-100 rounded">
            <p>{note.content}</p>
            <p className="text-sm text-gray-500">{note.timestamp}</p>
          </li>
        ))}
      </ul>
    )}
  </div>
);

ReactDOM.render(<App />, document.getElementById('root'));