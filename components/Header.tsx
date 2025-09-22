
import React from 'react';

interface HeaderProps {
    quizScore?: number;
    showScore: boolean;
}

const Header: React.FC<HeaderProps> = ({ quizScore, showScore }) => {
    return (
        <header className="py-4 px-2 sm:px-0">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl sm:text-4xl font-bold text-sky-400">
                    Study<span className="text-slate-200">Buddy</span>
                </h1>
                <div className="text-right">
                    {showScore && (
                        <div className="text-lg font-semibold text-sky-400">
                            Score: <span className="text-slate-200">{quizScore}</span>
                        </div>
                    )}
                    <p className="text-xs text-slate-400">Built By Hasith</p>
                </div>
            </div>
        </header>
    );
};

export default Header;
