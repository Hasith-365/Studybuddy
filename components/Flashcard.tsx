import React, { useState } from 'react';

interface FlashcardProps {
    term: string;
    definition: string;
}

const Flashcard: React.FC<FlashcardProps> = ({ term, definition }) => {
    const [isFlipped, setIsFlipped] = useState(false);

    const cardContainerStyle = {
        perspective: '1000px',
    };

    const cardInnerStyle = {
        transformStyle: 'preserve-3d' as 'preserve-3d',
        transition: 'transform 0.6s',
        transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
    };
    
    return (
        <div 
            className="w-full h-full cursor-pointer group" 
            style={cardContainerStyle}
            onClick={() => setIsFlipped(!isFlipped)}
        >
            <div className="relative w-full h-full" style={cardInnerStyle}>
                {/* Front of card */}
                <div className="absolute w-full h-full bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center p-4 text-center backface-hidden">
                    <h3 className="text-xl font-semibold text-sky-400">{term}</h3>
                </div>

                {/* Back of card */}
                <div className="absolute w-full h-full bg-slate-700 border border-sky-500 rounded-lg flex items-center justify-center p-4 text-center backface-hidden" style={{ transform: 'rotateY(180deg)' }}>
                    <p className="text-slate-200">{definition}</p>
                </div>
            </div>
            <style>{`
                .backface-hidden {
                    -webkit-backface-visibility: hidden; /* Safari */
                    backface-visibility: hidden;
                }
            `}</style>
        </div>
    );
};

export default Flashcard;