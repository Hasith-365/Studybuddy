import React, { useState, useEffect, useRef } from 'react';
import { AppState, FlashcardType, ChatMessage, IncorrectAnswer, ModelConfig } from './types';
import * as geminiService from './services/geminiService';
import { QuotaExceededError, isQuotaError } from './services/geminiService';
import { Chat } from '@google/genai';

import Header from './components/Header';
import BackButton from './components/BackButton';
import LoadingSpinner from './components/LoadingSpinner';
import Card from './components/Card';
import FloatingActionButton from './components/FloatingActionButton';
import Flashcard from './components/Flashcard';

const App: React.FC = () => {
    const [appState, setAppState] = useState<AppState>(AppState.HOME);
    const [modelConfig, setModelConfig] = useState<ModelConfig>('balanced');
    const [previousAppState, setPreviousAppState] = useState<AppState>(AppState.HOME);
    const [textbookName, setTextbookName] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [loadingMessage, setLoadingMessage] = useState<string>("Thinking...");
    const [error, setError] = useState<string | null>(null);
    const [quizScore, setQuizScore] = useState<number>(0);
    const [generatedContent, setGeneratedContent] = useState<string>('');
    const [flashcards, setFlashcards] = useState<FlashcardType[]>([]);
    
    // Quiz state
    const [quizSyllabus, setQuizSyllabus] = useState('');
    const [quizQuestions, setQuizQuestions] = useState<string[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [userAnswer, setUserAnswer] = useState('');
    const [feedback, setFeedback] = useState<string | null>(null);
    const [isAnswerEvaluated, setIsAnswerEvaluated] = useState(false);
    const [incorrectAnswers, setIncorrectAnswers] = useState<IncorrectAnswer[]>([]);
    const [showIncorrectAnswersReview, setShowIncorrectAnswersReview] = useState(false);


    // AI Tutor state
    const [chatSession, setChatSession] = useState<Chat | null>(null);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [userChatInput, setUserChatInput] = useState('');
    const chatContainerRef = useRef<HTMLDivElement>(null);
    
    // --- Hoisted State ---
    // State for feature screens that use a single input area
    const [featureInput, setFeatureInput] = useState('');
    const [featureIsEli5, setFeatureIsEli5] = useState(false);
    
    // State for Study Plan screen
    const [studyPlanGoal, setStudyPlanGoal] = useState('');
    const [studyPlanSyllabus, setStudyPlanSyllabus] = useState('');
    const [studyPlanTimeframe, setStudyPlanTimeframe] = useState('');

    // State for Quiz Syllabus screen
    const [quizSyllabusInput, setQuizSyllabusInput] = useState('');
    // --- End Hoisted State ---


    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatHistory]);

    const handleError = (message: string) => {
        setError(message);
        setLoading(false);
        setTimeout(() => setError(null), 5000);
    };

    const navigateTo = (state: AppState, isEli5 = false) => {
        // Reset all feature-specific states to ensure a clean slate
        setGeneratedContent('');
        setFlashcards([]);
        setFeatureInput('');
        setFeatureIsEli5(isEli5); // Set based on navigation target
        setStudyPlanGoal('');
        setStudyPlanSyllabus('');
        setStudyPlanTimeframe('');
        setQuizSyllabusInput('');
        setError(null);

        setAppState(state);
    };

    const resetToMenu = () => {
        setAppState(AppState.MENU);
        setGeneratedContent('');
        setFlashcards([]);
        setError(null);
    };

    const handleStartStudying = async () => {
        if (!textbookName.trim()) {
            handleError("Please enter a textbook name.");
            return;
        }
        setLoading(true);
        setLoadingMessage("Verifying textbook...");
        setError(null);
        try {
            const exists = await geminiService.researchTextbook(textbookName, modelConfig);
            if (exists) {
                setAppState(AppState.MENU);
            } else {
                handleError(`Could not verify the textbook "${textbookName}". Please check the name.`);
            }
        } catch (e) {
             if (e instanceof QuotaExceededError) {
                handleError("You've reached your request limit. Please try again later.");
            } else {
                console.error("Error verifying textbook:", e);
                handleError("An error occurred while verifying the textbook.");
            }
        } finally {
            setLoading(false);
        }
    };
    
    const startQuizFlow = async (syllabus: string) => {
        setQuizSyllabus(syllabus);
        setLoading(true);
        setLoadingMessage("Analyzing textbook type...");
        try {
            const isLanguage = await geminiService.isLanguageTextbook(textbookName, modelConfig);
            setLoading(false);
            if (isLanguage) {
                setAppState(AppState.GRAMMAR_OPTIONS);
            } else {
                await generateAndStartQuiz('No Grammar');
            }
        } catch (e) {
            if (e instanceof QuotaExceededError) {
                handleError("You've reached your request limit. Please try again later.");
            } else {
                console.error("Error analyzing textbook type:", e);
                handleError("Failed to analyze the textbook type.");
            }
            setLoading(false);
            setAppState(AppState.MENU);
        }
    };

    const generateAndStartQuiz = async (grammarPreference: string) => {
        setLoading(true);
        setLoadingMessage("Generating quiz questions...");
        try {
            const questions = await geminiService.generateQuizQuestions(textbookName, quizSyllabus, grammarPreference, modelConfig);
            if (questions.length > 0) {
                setQuizQuestions(questions);
                setCurrentQuestionIndex(0);
                setQuizScore(0);
                setUserAnswer('');
                setFeedback(null);
                setIsAnswerEvaluated(false);
                setIncorrectAnswers([]);
                setShowIncorrectAnswersReview(false);
                setAppState(AppState.QUIZ);
            } else {
                handleError("Could not generate quiz questions.");
                setAppState(AppState.MENU);
            }
        } catch (e) {
            if (e instanceof QuotaExceededError) {
                handleError("You've reached your request limit. Please try again later.");
            } else {
                console.error("Error generating quiz:", e);
                handleError("Could not generate quiz questions.");
            }
            setAppState(AppState.MENU);
        } finally {
            setLoading(false);
        }
    };
    
    const handleAnswerSubmit = async () => {
        setLoading(true);
        setLoadingMessage("Evaluating your answer...");
        try {
            const currentQuestion = quizQuestions[currentQuestionIndex];
            const evaluation = await geminiService.evaluateAnswer(currentQuestion, userAnswer, textbookName, modelConfig);
            setFeedback(evaluation);
            if (evaluation.toLowerCase().startsWith('correct')) {
                setQuizScore(prev => prev + 1);
            } else {
                setIncorrectAnswers(prev => [...prev, {
                    question: currentQuestion,
                    userAnswer: userAnswer,
                    correctAnswerExplanation: evaluation
                }]);
            }
            setIsAnswerEvaluated(true);
        } catch (e) {
            if (e instanceof QuotaExceededError) {
                handleError("You've reached your request limit. Please try again later.");
            } else {
                console.error("Error evaluating answer:", e);
                handleError("Failed to evaluate your answer.");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleNextQuestion = () => {
        if (currentQuestionIndex < quizQuestions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
            setUserAnswer('');
            setFeedback(null);
            setIsAnswerEvaluated(false);
        } else {
            setAppState(AppState.QUIZ_RESULTS);
        }
    };

    const openTutor = () => {
        if (!chatSession) {
            const newChat = geminiService.startTutorChat(textbookName, modelConfig);
            setChatSession(newChat);
        }
        setPreviousAppState(appState);
        setAppState(AppState.AI_TUTOR);
    };

    const handleTutorSend = async () => {
        if (!userChatInput.trim() || !chatSession) return;

        const newUserMessage: ChatMessage = { role: 'user', text: userChatInput };
        setChatHistory(prev => [...prev, newUserMessage]);
        setUserChatInput('');
        setLoading(true);

        try {
            const stream = await chatSession.sendMessageStream({ message: userChatInput });
            let modelResponse = '';
            setChatHistory(prev => [...prev, { role: 'model', text: '' }]);
            
            for await (const chunk of stream) {
                modelResponse += chunk.text;
                setChatHistory(prev => {
                    const newHistory = [...prev];
                    newHistory[newHistory.length - 1].text = modelResponse;
                    return newHistory;
                });
            }
        } catch (e: any) {
            if (isQuotaError(e)) {
                const quotaErrorText = "You've reached your request limit. Please try again later.";
                setChatHistory(prev => {
                    const newHistory = [...prev];
                    const lastMessage = newHistory[newHistory.length - 1];
                    // Overwrite the optimistic empty bubble if it exists
                    if (lastMessage && lastMessage.role === 'model' && lastMessage.text === '') {
                        lastMessage.text = quotaErrorText;
                    } else {
                        newHistory.push({ role: 'model', text: quotaErrorText });
                    }
                    return newHistory;
                });
                // Also show the main error banner for consistency
                handleError(quotaErrorText);
            } else {
                console.error("AI Tutor Error:", e);
                handleError("Sorry, the tutor is having trouble responding right now.");
            }
        } finally {
            setLoading(false);
        }
    };

    const renderFeatureScreen = (title: string, inputLabel: string, placeholder: string, buttonText: string, action: (input: string, isEli5?: boolean) => Promise<string | FlashcardType[]>, isFlashcard: boolean = false, isEli5Option: boolean = false) => {
        const handleSubmit = async () => {
            if (!featureInput.trim()) {
                handleError("Please provide some input.");
                return;
            }
            setLoading(true);
            setLoadingMessage("Generating response...");
            setGeneratedContent('');
            setFlashcards([]);
            try {
                const result = await action(featureInput, featureIsEli5);
                if (isFlashcard) {
                    setFlashcards(result as FlashcardType[]);
                } else {
                    setGeneratedContent(result as string);
                }
            } catch (e) {
                if (e instanceof QuotaExceededError) {
                    handleError("You've reached your request limit. Please try again later.");
                } else {
                    console.error("Error generating content:", e);
                    handleError("An error occurred while generating content.");
                }
            } finally {
                setLoading(false);
            }
        };

        return (
            <div>
                <BackButton onClick={resetToMenu} />
                <h2 className="text-2xl font-bold text-sky-400 mb-4">{title}</h2>
                <textarea
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:outline-none mb-4"
                    rows={4}
                    value={featureInput}
                    onChange={(e) => setFeatureInput(e.target.value)}
                    placeholder={placeholder}
                />
                 {isEli5Option && (
                    <div className="flex items-center mb-4">
                        <input type="checkbox" id="eli5" checked={featureIsEli5} onChange={(e) => setFeatureIsEli5(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500" />
                        <label htmlFor="eli5" className="ml-2 block text-sm text-slate-300">Explain Like I'm 5</label>
                    </div>
                )}
                <button onClick={handleSubmit} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200">
                    {buttonText}
                </button>

                {loading && <LoadingSpinner message={loadingMessage} />}
                {error && <p className="text-red-400 mt-4">{error}</p>}
                
                {generatedContent && !loading && (
                    <div className="mt-6 p-4 bg-slate-800 rounded-lg border border-slate-700">
                        <p className="text-slate-200 whitespace-pre-wrap">{generatedContent}</p>
                    </div>
                )}
                {flashcards.length > 0 && !loading && (
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {flashcards.map((card, index) => <Flashcard key={index} term={card.term} definition={card.definition} />)}
                    </div>
                )}
            </div>
        );
    };

    const renderIncorrectAnswersModal = () => {
        if (!showIncorrectAnswersReview) return null;

        return (
            <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
                <div className="bg-slate-800 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto border border-slate-700 shadow-2xl">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-bold text-sky-400">Review Incorrect Answers</h2>
                        <button onClick={() => setShowIncorrectAnswersReview(false)} className="text-3xl text-slate-400 hover:text-white transition-colors">&times;</button>
                    </div>
                    <div className="space-y-6">
                        {incorrectAnswers.map((item, index) => (
                             <div key={index} className="pb-4 border-b border-slate-600 last:border-b-0">
                                <p className="font-semibold text-slate-300 mb-2">Q: {item.question}</p>
                                <p className="text-red-400 my-1"><span className="font-bold">Your Answer:</span> {item.userAnswer}</p>
                                <p className="text-slate-300 text-sm mt-2"><span className="font-bold text-green-400">Explanation:</span> {item.correctAnswerExplanation.replace(/^(incorrect|correct)\s*[:-]?\s*/i, '')}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    const renderContent = () => {
        switch(appState) {
            case AppState.HOME:
                return (
                    <div className="text-center">
                        <h1 className="text-5xl font-bold text-sky-400 mb-2">StudyBuddy</h1>
                        <p className="text-slate-300 mb-8">Your AI-powered study assistant for any textbook.</p>
                        <div className="max-w-md mx-auto">
                            <input
                                type="text"
                                value={textbookName}
                                onChange={(e) => setTextbookName(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleStartStudying()}
                                placeholder="Enter your textbook's name..."
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                            />
                            <button onClick={handleStartStudying} disabled={loading} className="mt-4 w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200 disabled:bg-slate-600">
                                {loading ? 'Verifying...' : 'Start Studying'}
                            </button>
                            {error && <p className="text-red-400 mt-4">{error}</p>}
                        </div>
                    </div>
                );
            case AppState.MENU:
                const menuItems = [
                    { title: "Make Question Paper", description: "Generate a question paper based on a syllabus you provide.", state: AppState.QUESTION_PAPER },
                    { title: "Quiz Me", description: "Answer questions on key concepts and earn points.", state: AppState.QUIZ_SYLLABUS },
                    { title: "Summarize a Topic", description: "Get a brief summary of any topic.", state: AppState.SUMMARY },
                    { title: "Get Answers for Questions", description: "Input questions and receive detailed answers.", state: AppState.ANSWERS },
                    { title: "Create Flashcards", description: "Generate interactive flashcards for key terms.", state: AppState.FLASHCARDS },
                    { title: "Explain Like I'm 5", description: "Get a super-simple explanation of a complex topic.", state: AppState.SUMMARY, isEli5: true },
                    { title: "Create My Study Plan", description: "Get a day-by-day schedule to guide your learning.", state: AppState.STUDY_PLAN },
                ];
                return (
                    <div>
                        <h2 className="text-2xl font-bold text-slate-200 mb-1">Textbook: <span className="text-sky-400">{textbookName}</span></h2>
                        <p className="text-slate-400 mb-6">Choose a study tool to get started.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {menuItems.map(item => (
                                <Card key={item.title} title={item.title} description={item.description} onClick={() => navigateTo(item.state, !!item.isEli5)} />
                            ))}
                        </div>
                    </div>
                );
            case AppState.STUDY_PLAN:
                const handlePlanSubmit = async () => {
                    if (!studyPlanGoal || !studyPlanSyllabus || !studyPlanTimeframe) {
                        handleError("Please fill all fields.");
                        return;
                    }
                    setLoading(true);
                    setGeneratedContent('');
                    try {
                        const plan = await geminiService.generateStudyPlan(studyPlanGoal, studyPlanSyllabus, studyPlanTimeframe, textbookName, modelConfig);
                        setGeneratedContent(plan);
                    } catch (e) {
                         if (e instanceof QuotaExceededError) {
                            handleError("You've reached your request limit. Please try again later.");
                        } else {
                            console.error("Error generating study plan:", e);
                            handleError("Failed to generate the study plan.");
                        }
                    } finally {
                        setLoading(false);
                    }
                };
                return (
                    <div>
                        <BackButton onClick={resetToMenu} />
                        <h2 className="text-2xl font-bold text-sky-400 mb-4">Create My Study Plan</h2>
                        <input type="text" placeholder="Goal (e.g., 'Mid-term exam')" value={studyPlanGoal} onChange={e => setStudyPlanGoal(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 mb-4 focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-200" />
                        <input type="text" placeholder="Syllabus (e.g., 'Chapters 5-9')" value={studyPlanSyllabus} onChange={e => setStudyPlanSyllabus(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 mb-4 focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-200" />
                        <input type="text" placeholder="Timeframe (e.g., '7 days')" value={studyPlanTimeframe} onChange={e => setStudyPlanTimeframe(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 mb-4 focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-200" />
                        <button onClick={handlePlanSubmit} disabled={loading} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-slate-600">Generate Plan</button>
                        {loading && <LoadingSpinner />}
                        {error && <p className="text-red-400 mt-4">{error}</p>}
                        {generatedContent && !loading && <div className="mt-6 p-4 bg-slate-800 rounded-lg border border-slate-700"><p className="text-slate-200 whitespace-pre-wrap">{generatedContent}</p></div>}
                    </div>
                );

            case AppState.QUESTION_PAPER:
                return renderFeatureScreen("Make Question Paper", "Syllabus", "Enter syllabus (e.g., chapters 1-5)...", "Generate Paper", (syllabus) => geminiService.generateQuestionPaper(textbookName, syllabus, modelConfig));
            
            case AppState.QUIZ_SYLLABUS:
                return (
                    <div>
                        <BackButton onClick={resetToMenu} />
                        <h2 className="text-2xl font-bold text-sky-400 mb-4">Quiz Me</h2>
                        <p className="text-slate-300 mb-4">Enter a syllabus to focus the quiz, or leave blank for a general review.</p>
                        <textarea
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:outline-none mb-4"
                            rows={3}
                            value={quizSyllabusInput}
                            onChange={(e) => setQuizSyllabusInput(e.target.value)}
                            placeholder="e.g., Key concepts from Chapter 3"
                        />
                        <button onClick={() => startQuizFlow(quizSyllabusInput)} disabled={loading} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200 disabled:bg-slate-600">
                             {loading ? 'Analyzing...' : 'Continue'}
                        </button>
                    </div>
                );

            case AppState.GRAMMAR_OPTIONS:
                return (
                    <div>
                        <BackButton onClick={() => setAppState(AppState.QUIZ_SYLLABUS)} />
                        <h2 className="text-2xl font-bold text-sky-400 mb-4">Grammar Options</h2>
                        <p className="text-slate-300 mb-6">This looks like a language textbook. How should we handle grammar questions?</p>
                        <div className="space-y-4">
                            <button onClick={() => generateAndStartQuiz('Full Grammar')} className="w-full text-left p-4 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors">
                                <h3 className="font-bold text-sky-400">Full Grammar</h3>
                                <p className="text-sm text-slate-400">Focus heavily on grammar rules and concepts.</p>
                            </button>
                             <button onClick={() => generateAndStartQuiz('Mixed Review')} className="w-full text-left p-4 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors">
                                <h3 className="font-bold text-sky-400">Mixed Review</h3>
                                <p className="text-sm text-slate-400">A balanced mix of grammar and vocabulary/comprehension.</p>
                            </button>
                             <button onClick={() => generateAndStartQuiz('No Grammar')} className="w-full text-left p-4 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors">
                                <h3 className="font-bold text-sky-400">No Grammar</h3>
                                <p className="text-sm text-slate-400">Avoid specific grammar questions.</p>
                            </button>
                        </div>
                    </div>
                );

            case AppState.QUIZ:
                if (loading && quizQuestions.length === 0) return <LoadingSpinner message={loadingMessage} />;
                if (quizQuestions.length === 0) return <p>Could not load questions.</p>;
                const currentQuestion = quizQuestions[currentQuestionIndex];
                const isCorrect = feedback?.toLowerCase().startsWith('correct');
                return (
                    <div className="relative">
                        {incorrectAnswers.length > 0 && (
                            <button
                                onClick={() => setShowIncorrectAnswersReview(true)}
                                className="absolute -top-14 right-0 bg-red-600 hover:bg-red-700 text-white font-semibold py-1 px-3 rounded-md text-sm transition-colors shadow-lg"
                                aria-label={`You have ${incorrectAnswers.length} incorrect answers, click to review`}
                            >
                                Incorrect Answers ({incorrectAnswers.length})
                            </button>
                        )}
                        <p className="text-slate-400 mb-2">Question {currentQuestionIndex + 1} of {quizQuestions.length}</p>
                        <h2 className="text-xl font-semibold text-slate-200 mb-4">{currentQuestion}</h2>
                        <textarea
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:outline-none mb-4"
                            rows={5}
                            value={userAnswer}
                            onChange={(e) => setUserAnswer(e.target.value)}
                            placeholder="Your answer here..."
                            disabled={isAnswerEvaluated}
                        />
                        {loading && <LoadingSpinner message={loadingMessage} />}
                        {!loading && feedback && (
                            <div className={`p-4 rounded-lg mb-4 border ${isCorrect ? 'bg-green-900/50 border-green-500' : 'bg-red-900/50 border-red-500'}`}>
                                <h3 className={`font-bold text-lg ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>{isCorrect ? 'Correct!' : 'Incorrect'}</h3>
                                <p className="text-slate-300 mt-2">{feedback}</p>
                            </div>
                        )}
                        {!isAnswerEvaluated ? (
                             <button onClick={handleAnswerSubmit} disabled={loading} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200 disabled:bg-slate-600">Submit Answer</button>
                        ) : (
                             <button onClick={handleNextQuestion} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200">
                                {currentQuestionIndex < quizQuestions.length - 1 ? 'Next Question' : 'Finish Quiz'}
                            </button>
                        )}
                    </div>
                );
            case AppState.QUIZ_RESULTS:
                 return (
                    <div className="text-center">
                        <h2 className="text-3xl font-bold text-sky-400 mb-4">Quiz Complete!</h2>
                        <p className="text-xl text-slate-200 mb-6">Your final score is: {quizScore} / {quizQuestions.length}</p>
                        {incorrectAnswers.length > 0 && (
                            <div className="text-left bg-slate-800 p-6 rounded-lg border border-slate-700 mb-6">
                                <h3 className="text-xl font-bold text-slate-200 mb-4">Review Incorrect Answers</h3>
                                {incorrectAnswers.map((item, index) => (
                                    <div key={index} className="mb-4 pb-4 border-b border-slate-600 last:border-b-0">
                                        <p className="font-semibold text-slate-300">Q: {item.question}</p>
                                        <p className="text-red-400 my-1">Your Answer: {item.userAnswer}</p>
                                        <p className="text-green-400 text-sm">{item.correctAnswerExplanation}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                        <button onClick={resetToMenu} className="w-full max-w-xs bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200">Back to Menu</button>
                    </div>
                 );
            case AppState.SUMMARY:
                return renderFeatureScreen("Summarize a Topic", "Topic", "Enter a topic to summarize...", "Summarize", (topic, isEli5) => geminiService.summarizeTopic(textbookName, topic, isEli5 || false, modelConfig), false, true);
            case AppState.ANSWERS:
                return renderFeatureScreen("Get Answers for Questions", "Questions", "Enter one or more questions, each on a new line...", "Get Answers", (questions) => geminiService.getAnswers(textbookName, questions, modelConfig));
            case AppState.FLASHCARDS:
                return renderFeatureScreen("Create Flashcards", "Topic", "Enter a topic for flashcards...", "Create Flashcards", (topic) => geminiService.generateFlashcards(textbookName, topic, modelConfig), true);
            case AppState.AI_TUTOR:
                return (
                    <div className="fixed inset-0 bg-slate-900 z-40 flex flex-col p-4">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-bold text-sky-400">AI Tutor</h2>
                            <button onClick={() => setAppState(previousAppState)} className="text-slate-400 hover:text-white">&times;</button>
                        </div>
                        <div ref={chatContainerRef} className="flex-grow overflow-y-auto mb-4 space-y-4 pr-2">
                             {chatHistory.map((msg, index) => (
                                <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-xl lg:max-w-2xl p-3 rounded-lg ${msg.role === 'user' ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-200'}`}>
                                        <p className="whitespace-pre-wrap">{msg.text}</p>
                                    </div>
                                </div>
                            ))}
                            {loading && <div className="flex justify-start"><div className="p-3 rounded-lg bg-slate-800"><LoadingSpinner message="Tutor is typing..." /></div></div>}
                        </div>
                        <div className="flex items-center">
                            <input
                                type="text"
                                value={userChatInput}
                                onChange={e => setUserChatInput(e.target.value)}
                                onKeyPress={e => e.key === 'Enter' && handleTutorSend()}
                                placeholder="Ask your tutor anything..."
                                className="flex-grow bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                            <button onClick={handleTutorSend} className="ml-2 bg-sky-500 hover:bg-sky-600 text-white p-3 rounded-lg">&rarr;</button>
                        </div>
                    </div>
                );
            default:
                return <p>Error: Unknown app state.</p>;
        }
    };
    
    const showHeaderScore = appState === AppState.QUIZ || appState === AppState.QUIZ_RESULTS;

    return (
        <div className={`min-h-screen text-slate-200 font-sans ${appState === AppState.AI_TUTOR ? 'overflow-hidden' : ''}`}>
            {renderIncorrectAnswersModal()}
            <main className="max-w-4xl mx-auto p-4">
                {appState !== AppState.AI_TUTOR && appState !== AppState.HOME && <Header quizScore={quizScore} showScore={showHeaderScore} />}
                <div className={`mt-6 ${appState === AppState.HOME ? 'flex items-center justify-center h-[60vh]' : ''}`}>
                    {renderContent()}
                </div>
            </main>
            {appState > AppState.HOME && appState !== AppState.AI_TUTOR && <FloatingActionButton onClick={openTutor} />}
        </div>
    );
};

export default App;