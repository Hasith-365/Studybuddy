
import React from 'react';

interface FloatingActionButtonProps {
    onClick: () => void;
}

const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({ onClick }) => {
    return (
        <button
            onClick={onClick}
            className="fixed bottom-6 right-6 bg-sky-500 hover:bg-sky-600 text-white rounded-full p-4 shadow-lg 
                       transform hover:scale-110 transition-all duration-200 ease-in-out z-50"
            aria-label="Open AI Tutor"
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                <path d="M15 7v2a2 2 0 01-2 2H9.5a.5.5 0 00-.5.5v.5a.5.5 0 00.5.5H11a2 2 0 002-2V7z" />
            </svg>
        </button>
    );
};

export default FloatingActionButton;
