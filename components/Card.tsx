
import React from 'react';

interface CardProps {
    title: string;
    description: string;
    onClick: () => void;
}

const Card: React.FC<CardProps> = ({ title, description, onClick }) => {
    return (
        <div
            onClick={onClick}
            className="bg-slate-800 p-6 rounded-lg border border-slate-700 cursor-pointer 
                       transform hover:scale-105 hover:border-sky-400 transition-all duration-300 ease-in-out"
        >
            <h3 className="text-xl font-bold text-sky-400 mb-2">{title}</h3>
            <p className="text-slate-300">{description}</p>
        </div>
    );
};

export default Card;
