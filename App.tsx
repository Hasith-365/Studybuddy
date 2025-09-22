import React, { useState, useEffect, useRef } from 'react';
import { AppState, FlashcardType, ChatMessage, IncorrectAnswer, ModelConfig } from './types';
import * as geminiService from './services/geminiService';
import { QuotaExceededError, isQuotaError } from './services/geminiService';
import { Chat, GenerateContentResponse } from '@google/genai';

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
    const [isLanguageBook, setIsLanguageBook] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [generatedContent, setGeneratedContent] = useState<string>('');
    const [syllabus, setSyllabus] = useState<string>('');

    // Quiz state
    const [quizQuestions, setQuizQuestions] = useState<string[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
    const [userAnswers, setUserAnswers] = useState<string[]>([]);
    const [quizScore, setQuizScore] = useState<number>(0);
    const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
    const [incorrectAnswers, setIncorrectAnswers] = useState<IncorrectAnswer[]>([]);
    const [grammarPreference, setGrammarPreference] = useState('No Grammar');

    // Flashcard state
    const [flashcards, setFlashcards] = useState<FlashcardType[]>([]);
    const [flashcardTopic, setFlashcardTopic] = useState<string>('');

    // Summary state
    const [summaryTopic, setSummaryTopic] = useState<string>('');
    const [isEli5Mode, setIsEli5Mode] = useState<boolean>(false);

    // Answers state
    const [questionsToAnswer, setQuestionsToAnswer] = useState<string>('');
    
    // Study Plan state
    const [studyPlanGoal, setStudyPlanGoal] = useState<string>('');
    const [studyPlanSyllabus, setStudyPlanSyllabus] = useState<string>('');
    const [studyPlanTimeframe, setStudyPlanTimeframe] = useState<string>('');

    // AI Tutor state
    const [chat, setChat] = useState<Chat | null>(null);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [userChatInput, setUserChatInput] = useState<string>('');
    const [isTutorLoading, setIsTutorLoading] = useState<boolean>(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (appState === AppState.AI_TUTOR) {
            const newChat = geminiService.startTutorChat(textbookName, modelConfig);
            setChat(newChat);
        } else {
            setChat(null);
            setChatHistory([]);
        }
    }, [appState]);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatHistory]);

    const handleError = (err: any) => {
        console.error(err);
        if (isQuotaError(err)) {
            setError('API quota exceeded. Please check your plan and billing details.');
        } else {
            setError('An unexpected error occurred. Please try again.');
        }
        setIsLoading(false);
    };

    const handleBackToMenu = () => {
        setAppState(AppState.MENU);
        setError(null);
        setGeneratedContent('');
        // Reset feature-specific states
        setQuizQuestions([]);
        setCurrentQuestionIndex(0);
        setUserAnswers([]);
        setQuizScore(0);
        setFlashcards([]);
        setSyllabus('');
    };
    
    const handleTextbookSubmit = async () => {
        if (!textbookName.trim()) return;
        setIsLoading(true);
        setError(null);
        try {
            const exists = await geminiService.researchTextbook(textbookName, modelConfig);
            if (exists) {
                const isLangBook = await geminiService.isLanguageTextbook(textbookName, modelConfig);
                setIsLanguageBook(isLangBook);
                setAppState(AppState.MENU);
            } else {
                setError(`Could not find a textbook named "${textbookName}". Please check the name and try again.`);
            }
        } catch (err) {
            handleError(err);
        }
        setIsLoading(false);
    };

    const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            handleTextbookSubmit();
        }
    };
    
    // Navigation handlers
    const navigateTo = (state: AppState) => {
        setGeneratedContent(''); // Clear previous content when navigating
        setPreviousAppState(appState);
        setAppState(state);
    }
    
    // Feature handlers
    const handleGenerateStudyPlan = async (goal: string, syllabus: string, timeframe: string) => {
        setIsLoading(true);
        setGeneratedContent('');
        try {
            const plan = await geminiService.generateStudyPlan(goal, syllabus, timeframe, textbookName, modelConfig);
            setGeneratedContent(plan);
        } catch (err) { handleError(err); }
        setIsLoading(false);
    };

    const handleGenerateQuiz = async () => {
        setIsLoading(true);
        setQuizQuestions([]);
        try {
            const questions = await geminiService.generateQuizQuestions(textbookName, syllabus, grammarPreference, modelConfig);
            setQuizQuestions(questions);
            setUserAnswers(new Array(questions.length).fill(''));
            setIncorrectAnswers([]);
            setQuizScore(0);
            setCurrentQuestionIndex(0);
            if (questions.length > 0) {
                setAppState(AppState.QUIZ);
            } else {
                setError("Sorry, I couldn't generate a quiz for that topic. Try being more specific.");
                setAppState(AppState.QUIZ_SYLLABUS);
            }
        } catch (err) { 
            handleError(err);
            setAppState(AppState.QUIZ_SYLLABUS);
        }
        setIsLoading(false);
    };

    const handleAnswerSubmit = async (answer: string) => {
        setIsEvaluating(true);
        const newAnswers = [...userAnswers];
        newAnswers[currentQuestionIndex] = answer;
        setUserAnswers(newAnswers);

        try {
            const evaluation = await geminiService.evaluateAnswer(quizQuestions[currentQuestionIndex], answer, textbookName, modelConfig);
            if (evaluation.toLowerCase().startsWith('correct')) {
                setQuizScore(prev => prev + 1);
            } else {
                setIncorrectAnswers(prev => [...prev, {
                    question: quizQuestions[currentQuestionIndex],
                    userAnswer: answer,
                    correctAnswerExplanation: evaluation,
                }]);
            }

            if (currentQuestionIndex < quizQuestions.length - 1) {
                setCurrentQuestionIndex(prev => prev + 1);
            } else {
                setAppState(AppState.QUIZ_RESULTS);
            }
        } catch (err) {
            handleError(err);
        }
        setIsEvaluating(false);
    };
    
    const handleGenerateFlashcards = async () => {
        if (!flashcardTopic) return;
        setIsLoading(true);
        setFlashcards([]);
        try {
            const cards = await geminiService.generateFlashcards(textbookName, flashcardTopic, modelConfig);
            setFlashcards(cards);
        } catch (err) { handleError(err); }
        setIsLoading(false);
    };

    const handleSummarizeTopic = async () => {
        if (!summaryTopic) return;
        setIsLoading(true);
        setGeneratedContent('');
        try {
            const summary = await geminiService.summarizeTopic(textbookName, summaryTopic, isEli5Mode, modelConfig);
            setGeneratedContent(summary);
        } catch (err) { handleError(err); }
        setIsLoading(false);
    };

    const handleGetAnswers = async () => {
        if (!questionsToAnswer) return;
        setIsLoading(true);
        setGeneratedContent('');
        try {
            const answers = await geminiService.getAnswers(textbookName, questionsToAnswer, modelConfig);
            setGeneratedContent(answers);
        } catch (err) { handleError(err); }
        setIsLoading(false);
    };

    const handleGenerateQuestionPaper = async () => {
        if (!syllabus) return;
        setIsLoading(true);
        setGeneratedContent('');
        try {
            const paper = await geminiService.generateQuestionPaper(textbookName, syllabus, modelConfig);
            setGeneratedContent(paper);
        } catch (err) { handleError(err); }
        setIsLoading(false);
    };

    const handleChatSend = async () => {
        if (!userChatInput.trim() || !chat) return;
        
        const text = userChatInput;
        setUserChatInput('');
        setChatHistory(prev => [...prev, { role: 'user', text }]);
        setIsTutorLoading(true);

        try {
            const response = await chat.sendMessage({ message: text });
            setChatHistory(prev => [...prev, { role: 'model', text: response.text }]);
        } catch (err) {
            handleError(err);
            setChatHistory(prev => [...prev, { role: 'model', text: "Sorry, I encountered an error." }]);
        }
        setIsTutorLoading(false);
    };

    const renderState = () => {
        switch (appState) {
            case AppState.HOME:
                return (
                    <div className="text-center">
                        <h2 className="text-4xl font-bold text-slate-200 mb-4">Welcome to StudyBuddy!</h2>
                        <p className="text-lg text-slate-400 mb-8">Your AI-powered study partner. I'll use Google to learn about your textbook.</p>
                        <p className="text-slate-300 mb-2">Enter the name of your textbook to get started:</p>
                        <input
                            type="text"
                            value={textbookName}
                            onChange={(e) => setTextbookName(e.target.value)}
                            onKeyPress={handleKeyPress}
                            className="w-full max-w-lg p-3 rounded-md bg-slate-800 text-slate-200 border-2 border-slate-700 focus:border-sky-500 focus:outline-none"
                            placeholder="e.g., Campbell Biology, 12th Edition"
                            disabled={isLoading}
                        />
                        {error && <p className="text-red-400 mt-4">{error}</p>}
                        <button
                            onClick={handleTextbookSubmit}
                            className="mt-6 bg-sky-500 text-white font-bold py-3 px-8 rounded-lg hover:bg-sky-600 transition-colors disabled:bg-slate-600"
                            disabled={isLoading || !textbookName.trim()}
                        >
                            {isLoading ? 'Verifying...' : 'Start Studying'}
                        </button>
                    </div>
                );
            case AppState.MENU:
                return (
                    <div>
                        <h2 className="text-2xl font-bold text-slate-200 mb-2">Textbook: <span className="text-sky-400">{textbookName}</span></h2>
                        <p className="text-slate-400 mb-6">What would you like to do?</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <Card title="Quiz Me" description="Test your knowledge on specific topics." onClick={() => navigateTo(AppState.QUIZ_SYLLABUS)} />
                            <Card title="Create Flashcards" description="Generate flashcards for key terms and concepts." onClick={() => navigateTo(AppState.FLASHCARDS)} />
                            <Card title="Summarize a Topic" description="Get a concise summary of any topic, or have it explained simply (ELI5)." onClick={() => navigateTo(AppState.SUMMARY)} />
                            <Card title="Get Answers" description="Ask questions from your textbook and get detailed answers." onClick={() => navigateTo(AppState.ANSWERS)} />
                            <Card title="Generate Question Paper" description="Create a mock exam paper based on your syllabus." onClick={() => navigateTo(AppState.QUESTION_PAPER)} />
                            <Card title="Create Study Plan" description="Get a personalized, day-by-day study plan." onClick={() => navigateTo(AppState.STUDY_PLAN)} />
                        </div>
                    </div>
                );
            case AppState.QUIZ_SYLLABUS:
                return (
                    <div>
                        <BackButton onClick={handleBackToMenu} />
                        <h2 className="text-3xl font-bold text-slate-200 mb-4">Quiz Time!</h2>
                        <p className="text-slate-400 mb-6">What topics should the quiz cover? (e.g., "Chapter 3" or "Cellular Respiration"). Leave blank for a general quiz.</p>
                        <textarea
                            value={syllabus}
                            onChange={(e) => setSyllabus(e.target.value)}
                            className="w-full p-3 rounded-md bg-slate-800 text-slate-200 border-2 border-slate-700 focus:border-sky-500 focus:outline-none"
                            placeholder="Enter topics here..."
                            rows={4}
                        />
                        {isLanguageBook && (
                            <div className="mt-4">
                                <h3 className="text-xl text-slate-300 mb-2">Grammar Preference</h3>
                                <select 
                                    value={grammarPreference} 
                                    onChange={(e) => setGrammarPreference(e.target.value)}
                                    className="w-full p-3 rounded-md bg-slate-800 text-slate-200 border-2 border-slate-700 focus:border-sky-500 focus:outline-none"
                                >
                                    <option value="No Grammar">No Grammar Focus</option>
                                    <option value="Some Grammar">Mix in Some Grammar</option>
                                    <option value="Full Grammar">Focus Heavily on Grammar</option>
                                </select>
                            </div>
                        )}
                        <button onClick={handleGenerateQuiz} className="mt-6 bg-sky-500 text-white font-bold py-2 px-6 rounded-lg hover:bg-sky-600 transition-colors" disabled={isLoading}>
                           {isLoading ? 'Generating...' : 'Start Quiz'}
                        </button>
                    </div>
                );
            case AppState.QUIZ:
                const currentQuestion = quizQuestions[currentQuestionIndex];
                const options = ["A", "B", "C", "D"]; // Placeholder for multiple choice if implemented
                return (
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-bold text-slate-200">Question {currentQuestionIndex + 1}/{quizQuestions.length}</h2>
                            <div className="text-sky-400 font-semibold">Score: {quizScore}</div>
                        </div>
                        <div className="bg-slate-800 p-6 rounded-lg mb-6">
                            <p className="text-lg text-slate-300">{currentQuestion}</p>
                        </div>
                        <div className="flex flex-col space-y-4">
                             <textarea
                                 value={userAnswers[currentQuestionIndex]}
                                 onChange={(e) => {
                                     const newAnswers = [...userAnswers];
                                     newAnswers[currentQuestionIndex] = e.target.value;
                                     setUserAnswers(newAnswers);
                                 }}
                                 className="w-full p-3 rounded-md bg-slate-800 text-slate-200 border-2 border-slate-700 focus:border-sky-500 focus:outline-none"
                                 placeholder="Type your answer here..."
                                 rows={5}
                                 disabled={isEvaluating}
                             />
                             <button
                                 onClick={() => handleAnswerSubmit(userAnswers[currentQuestionIndex])}
                                 className="bg-sky-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-sky-600 transition-colors disabled:bg-slate-600"
                                 disabled={isEvaluating || !userAnswers[currentQuestionIndex]}
                             >
                                 {isEvaluating ? 'Evaluating...' : 'Submit Answer'}
                             </button>
                        </div>
                    </div>
                );

            case AppState.QUIZ_RESULTS:
                 return (
                    <div className="text-center">
                        <h2 className="text-4xl font-bold text-sky-400 mb-4">Quiz Complete!</h2>
                        <p className="text-2xl text-slate-200 mb-8">Your final score is: {quizScore} / {quizQuestions.length}</p>

                        {incorrectAnswers.length > 0 && (
                            <div className="text-left mt-10">
                                <h3 className="text-2xl font-bold text-slate-200 mb-4">Review Your Mistakes:</h3>
                                <div className="space-y-6">
                                    {incorrectAnswers.map((item, index) => (
                                        <div key={index} className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                                            <p className="font-semibold text-slate-300 mb-2">Q: {item.question}</p>
                                            <p className="text-red-400 mb-2"><span className="font-bold">Your Answer:</span> {item.userAnswer}</p>
                                            <p className="text-green-400"><span className="font-bold">Explanation:</span> {item.correctAnswerExplanation.replace(/^(Incorrect\.\s*)/i, '')}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <button onClick={handleBackToMenu} className="mt-8 bg-sky-500 text-white font-bold py-2 px-6 rounded-lg hover:bg-sky-600 transition-colors">
                           Back to Menu
                        </button>
                    </div>
                 );

            case AppState.FLASHCARDS:
                return (
                    <div>
                        <BackButton onClick={handleBackToMenu} />
                        <h2 className="text-3xl font-bold text-slate-200 mb-4">Flashcards</h2>
                        <p className="text-slate-400 mb-6">Enter a topic to generate flashcards for.</p>
                        <div className="flex space-x-2">
                           <input
                               type="text"
                               value={flashcardTopic}
                               onChange={(e) => setFlashcardTopic(e.target.value)}
                               className="flex-grow p-3 rounded-md bg-slate-800 text-slate-200 border-2 border-slate-700 focus:border-sky-500 focus:outline-none"
                               placeholder="e.g., Photosynthesis"
                           />
                           <button onClick={handleGenerateFlashcards} className="bg-sky-500 text-white font-bold py-2 px-6 rounded-lg hover:bg-sky-600" disabled={isLoading || !flashcardTopic}>
                               {isLoading ? 'Generating...' : 'Generate'}
                           </button>
                        </div>
                        {isLoading && <LoadingSpinner message="Creating flashcards..." />}
                        {!isLoading && flashcards.length > 0 && (
                            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {flashcards.map((card, index) => <Flashcard key={index} term={card.term} definition={card.definition} />)}
                            </div>
                        )}
                    </div>
                );

             case AppState.SUMMARY:
                 return (
                     <div>
                         <BackButton onClick={handleBackToMenu} />
                         <h2 className="text-3xl font-bold text-slate-200 mb-4">Summarize a Topic</h2>
                         <p className="text-slate-400 mb-6">Enter a topic you want a summary for.</p>
                         <div className="flex flex-col space-y-4">
                             <textarea
                                 value={summaryTopic}
                                 onChange={(e) => setSummaryTopic(e.target.value)}
                                 className="w-full p-3 rounded-md bg-slate-800 text-slate-200 border-2 border-slate-700 focus:border-sky-500 focus:outline-none"
                                 placeholder="e.g., The Krebs Cycle"
                                 rows={3}
                             />
                             <div className="flex items-center">
                                 <input type="checkbox" id="eli5" checked={isEli5Mode} onChange={(e) => setIsEli5Mode(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500" />
                                 <label htmlFor="eli5" className="ml-2 block text-sm text-slate-300">Explain Like I'm 5</label>
                             </div>
                             <button onClick={handleSummarizeTopic} className="bg-sky-500 text-white font-bold py-2 px-6 rounded-lg hover:bg-sky-600 self-start" disabled={isLoading || !summaryTopic}>
                                 {isLoading ? 'Summarizing...' : 'Summarize'}
                             </button>
                         </div>
                         {isLoading && <LoadingSpinner message="Summarizing..." />}
                         {!isLoading && generatedContent && (
                              <div className="mt-8 bg-slate-800 p-6 rounded-lg prose prose-invert max-w-none">
                                 <p className="text-slate-300 whitespace-pre-wrap">{generatedContent}</p>
                             </div>
                         )}
                     </div>
                 );
            
             case AppState.AI_TUTOR:
                 return (
                     <div className="h-[85vh] flex flex-col">
                         <div className="flex justify-between items-center mb-4">
                           <h2 className="text-3xl font-bold text-slate-200">AI Tutor</h2>
                           <button onClick={() => setAppState(previousAppState)} className="text-slate-400 hover:text-white">&times; Close</button>
                         </div>
                         <div ref={chatContainerRef} className="flex-grow bg-slate-800 rounded-lg p-4 overflow-y-auto space-y-4">
                             {chatHistory.map((msg, index) => (
                                 <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                     <div className={`max-w-xl p-3 rounded-lg ${msg.role === 'user' ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-200'}`}>
                                         {msg.text}
                                     </div>
                                 </div>
                             ))}
                             {isTutorLoading && (
                                <div className="flex justify-start">
                                    <div className="max-w-lg p-3 rounded-lg bg-slate-700 text-slate-200">
                                       <LoadingSpinner message="Thinking..." />
                                    </div>
                                </div>
                             )}
                         </div>
                         <div className="mt-4 flex space-x-2">
                             <input
                                 type="text"
                                 value={userChatInput}
                                 onChange={(e) => setUserChatInput(e.target.value)}
                                 onKeyPress={(e) => e.key === 'Enter' && handleChatSend()}
                                 className="flex-grow p-3 rounded-md bg-slate-700 text-slate-200 border-2 border-slate-600 focus:border-sky-500 focus:outline-none"
                                 placeholder="Ask a question..."
                                 disabled={isTutorLoading}
                             />
                             <button onClick={handleChatSend} className="bg-sky-500 text-white font-bold py-2 px-6 rounded-lg hover:bg-sky-600" disabled={isTutorLoading || !userChatInput}>
                                 Send
                             </button>
                         </div>
                     </div>
                 );
            
            case AppState.STUDY_PLAN:
                return (
                    <div className="w-full max-w-3xl">
                        <BackButton onClick={handleBackToMenu} />
                        <h2 className="text-3xl font-bold text-slate-200 mb-4">Create a Study Plan</h2>
                        <p className="text-slate-400 mb-6">Tell me your goals and I'll create a personalized plan for you.</p>
                        
                        {!generatedContent && !isLoading && (
                            <div className="flex flex-col space-y-4">
                                <div>
                                    <label htmlFor="goal" className="block text-sm font-medium text-slate-300 mb-1">Your Goal</label>
                                    <input
                                        type="text"
                                        id="goal"
                                        value={studyPlanGoal}
                                        onChange={(e) => setStudyPlanGoal(e.target.value)}
                                        className="w-full p-3 rounded-md bg-slate-800 text-slate-200 border-2 border-slate-700 focus:border-sky-500 focus:outline-none"
                                        placeholder="e.g., Ace the midterm exam"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="syllabus" className="block text-sm font-medium text-slate-300 mb-1">Syllabus/Topics</label>
                                    <textarea
                                        id="syllabus"
                                        value={studyPlanSyllabus}
                                        onChange={(e) => setStudyPlanSyllabus(e.target.value)}
                                        className="w-full p-3 rounded-md bg-slate-800 text-slate-200 border-2 border-slate-700 focus:border-sky-500 focus:outline-none"
                                        placeholder="e.g., Chapters 1-5, Photosynthesis, Cell Division"
                                        rows={4}
                                    />
                                </div>
                                 <div>
                                    <label htmlFor="timeframe" className="block text-sm font-medium text-slate-300 mb-1">Timeframe</label>
                                    <input
                                        type="text"
                                        id="timeframe"
                                        value={studyPlanTimeframe}
                                        onChange={(e) => setStudyPlanTimeframe(e.target.value)}
                                        className="w-full p-3 rounded-md bg-slate-800 text-slate-200 border-2 border-slate-700 focus:border-sky-500 focus:outline-none"
                                        placeholder="e.g., 2 weeks, 1 month"
                                    />
                                </div>
                                <button onClick={() => handleGenerateStudyPlan(studyPlanGoal, studyPlanSyllabus, studyPlanTimeframe)} className="bg-sky-500 text-white font-bold py-2 px-6 rounded-lg hover:bg-sky-600 self-start" disabled={isLoading || !studyPlanGoal || !studyPlanSyllabus || !studyPlanTimeframe}>
                                    {isLoading ? 'Generating...' : 'Create Plan'}
                                </button>
                            </div>
                        )}

                        {isLoading && <LoadingSpinner message="Building your plan..." />}
                        {!isLoading && generatedContent && (
                             <div className="mt-8 bg-slate-800 p-6 rounded-lg prose prose-invert max-w-none">
                                <p className="text-slate-300 whitespace-pre-wrap">{generatedContent}</p>
                            </div>
                        )}
                    </div>
                );

            case AppState.ANSWERS:
                return (
                    <div className="w-full max-w-3xl">
                        <BackButton onClick={handleBackToMenu} />
                        <h2 className="text-3xl font-bold text-slate-200 mb-4">Get Answers</h2>
                        <p className="text-slate-400 mb-6">Type your questions below and I'll provide detailed answers.</p>
                        <div className="flex flex-col space-y-4">
                            <textarea
                                value={questionsToAnswer}
                                onChange={(e) => setQuestionsToAnswer(e.target.value)}
                                className="w-full p-3 rounded-md bg-slate-800 text-slate-200 border-2 border-slate-700 focus:border-sky-500 focus:outline-none"
                                placeholder="e.g., 1. What is the powerhouse of the cell?&#10;2. Explain Newton's First Law."
                                rows={8}
                            />
                            <button onClick={handleGetAnswers} className="bg-sky-500 text-white font-bold py-2 px-6 rounded-lg hover:bg-sky-600 self-start" disabled={isLoading || !questionsToAnswer}>
                                {isLoading ? 'Finding answers...' : 'Get Answers'}
                            </button>
                        </div>
                        {isLoading && <LoadingSpinner message="Finding answers..." />}
                        {!isLoading && generatedContent && (
                             <div className="mt-8 bg-slate-800 p-6 rounded-lg prose prose-invert max-w-none">
                                <p className="text-slate-300 whitespace-pre-wrap">{generatedContent}</p>
                            </div>
                        )}
                    </div>
                );

            case AppState.QUESTION_PAPER:
                return (
                    <div className="w-full max-w-3xl">
                        <BackButton onClick={handleBackToMenu} />
                        <h2 className="text-3xl font-bold text-slate-200 mb-4">Generate Question Paper</h2>
                        <p className="text-slate-400 mb-6">Provide the syllabus or topics to be included in the exam paper.</p>
                        <div className="flex flex-col space-y-4">
                            <textarea
                                value={syllabus}
                                onChange={(e) => setSyllabus(e.target.value)}
                                className="w-full p-3 rounded-md bg-slate-800 text-slate-200 border-2 border-slate-700 focus:border-sky-500 focus:outline-none"
                                placeholder="e.g., Chapters 10-15, Thermodynamics, Organic Chemistry Basics"
                                rows={5}
                            />
                            <button onClick={handleGenerateQuestionPaper} className="bg-sky-500 text-white font-bold py-2 px-6 rounded-lg hover:bg-sky-600 self-start" disabled={isLoading || !syllabus}>
                                {isLoading ? 'Generating...' : 'Generate Paper'}
                            </button>
                        </div>
                        {isLoading && <LoadingSpinner message="Generating paper..." />}
                        {!isLoading && generatedContent && (
                             <div className="mt-8 bg-slate-800 p-6 rounded-lg prose prose-invert max-w-none">
                                <p className="text-slate-300 whitespace-pre-wrap">{generatedContent}</p>
                            </div>
                        )}
                    </div>
                );
                 
            default:
                return (
                    <div>
                        <BackButton onClick={handleBackToMenu} />
                        <h2 className="text-2xl text-slate-200">Something went wrong</h2>
                        <p className="text-slate-400">Please go back and try again.</p>
                    </div>
                );
        }
    };
    
    return (
        <div className="container mx-auto px-4 min-h-screen text-slate-200 flex flex-col">
            <Header quizScore={quizScore} showScore={appState === AppState.QUIZ} />
            <main className="flex-grow py-8 flex items-center justify-center">
                {error && appState !== AppState.HOME && <p className="text-red-400 mb-4">{error}</p>}
                <div className="w-full h-full flex items-center justify-center">
                    {renderState()}
                </div>
            </main>
            {appState > AppState.HOME && appState !== AppState.AI_TUTOR && (
                <FloatingActionButton onClick={() => navigateTo(AppState.AI_TUTOR)} />
            )}
        </div>
    );
};

export default App;
