import React from 'react';

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

export default NoteList;