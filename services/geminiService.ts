import { GoogleGenAI, Type, Chat, GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { ModelConfig } from './types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

const MODEL_NAME = 'gemini-2.5-flash';

/**
 * Custom error for handling API rate limiting / quota exhaustion.
 */
export class QuotaExceededError extends Error {
    constructor(message = "API quota exceeded. Please check your plan and billing details.") {
        super(message);
        this.name = "QuotaExceededError";
    }
}

/**
 * Checks if a given error is due to resource exhaustion.
 * @param error - The error object.
 * @returns True if the error is a quota error, false otherwise.
 */
export const isQuotaError = (error: any): boolean => {
    const errorMessage = error?.message || error.toString();
    return errorMessage.includes('RESOURCE_EXHAUSTED');
};

/**
 * A wrapper around the `generateContent` call to inject the model name and handle quota errors.
 * @param params - The parameters for the generateContent call.
 * @param modelConfig - The user-selected model configuration ('balanced' or 'fastest').
 * @returns The response from the AI model.
 * @throws {QuotaExceededError} If the API call fails due to quota limits.
 */
const generateContent = async (params: Omit<GenerateContentParameters, 'model'>, modelConfig: ModelConfig): Promise<GenerateContentResponse> => {
    try {
        const dynamicConfig = { ...params.config };
        if (modelConfig === 'fastest') {
            dynamicConfig.thinkingConfig = { thinkingBudget: 0 };
        }

        return await ai.models.generateContent({
            ...params,
            model: MODEL_NAME,
            config: dynamicConfig,
        });
    } catch (error) {
        if (isQuotaError(error)) {
            throw new QuotaExceededError();
        }
        throw error; // Re-throw other errors
    }
};

/**
 * Prepends context to a given prompt, instructing the AI to use its knowledge and search.
 * @param prompt The original prompt.
 * @param textbookName The name of the textbook.
 * @returns The full prompt with context.
 */
const addContextToPrompt = (prompt: string, textbookName: string): string => {
    return `You are an AI assistant for the textbook "${textbookName}". Use your knowledge and Google Search to answer questions and perform tasks related to this textbook. Please perform the following task:\n\n${prompt}`;
};

export const researchTextbook = async (textbookName: string, modelConfig: ModelConfig): Promise<boolean> => {
    const response = await generateContent({
        contents: `Does a textbook with the name "${textbookName}" exist? Please answer with a simple "Yes" or "No", followed by a brief confirmation.`,
        config: {
            tools: [{googleSearch: {}}],
        }
    }, modelConfig);
    const text = response.text.toLowerCase();
    return text.startsWith('yes');
};

export const isLanguageTextbook = async (textbookName: string, modelConfig: ModelConfig): Promise<boolean> => {
    const prompt = `Is the textbook "${textbookName}" primarily for learning a language (like Spanish, French, Japanese, etc.)? Answer with only "Yes" or "No".`;
    const fullPrompt = addContextToPrompt(prompt, textbookName);
    const response = await generateContent({
        contents: fullPrompt,
        config: {
            tools: [{googleSearch: {}}],
        }
    }, modelConfig);
    return response.text.toLowerCase().includes('yes');
};

export const generateStudyPlan = async (goal: string, syllabus: string, timeframe: string, textbookName: string, modelConfig: ModelConfig): Promise<string> => {
    const prompt = `Create a day-by-day study plan.
    Goal: ${goal}
    Syllabus: ${syllabus}
    Timeframe: ${timeframe}
    
    The plan should be structured and actionable. For each day, suggest specific activities a student can do using an app with the following features: 'Quiz Me', 'Create Flashcards', 'Summarize a Topic', 'Get Answers for Questions', 'Explain Like I'm 5'. Format the output clearly with headings for each day.`;
    const fullPrompt = addContextToPrompt(prompt, textbookName);
    const response = await generateContent({ 
        contents: fullPrompt,
        config: {
            tools: [{googleSearch: {}}],
        }
    }, modelConfig);
    return response.text;
};

export const generateQuizQuestions = async (textbookName: string, syllabus: string, grammarPreference: string, modelConfig: ModelConfig): Promise<string[]> => {
    let prompt = `Generate 10 quiz questions.`;
    if (syllabus) {
        prompt += ` Focus on these topics: ${syllabus}.`;
    }
    if (grammarPreference !== 'No Grammar') {
        prompt += ` Include questions about ${grammarPreference === 'Full Grammar' ? 'grammar concepts' : 'a mix of grammar and general concepts'}.`;
    }
    prompt += ` The questions should cover key concepts. The response must be a valid JSON object with a single key "questions" which is an array of question strings. For example: {"questions": ["What is...?"]}`;
    const fullPrompt = addContextToPrompt(prompt, textbookName);

    const response = await generateContent({
        contents: fullPrompt,
        config: {
            tools: [{googleSearch: {}}],
        },
    }, modelConfig);
    
    try {
        const jsonText = response.text.match(/```json\n([\s\S]*?)\n```/)?.[1] || response.text;
        const json = JSON.parse(jsonText);
        return json.questions || [];
    } catch (e) {
        console.error("Failed to parse quiz questions JSON:", e);
        // Fallback: try to parse questions from plain text
        return response.text.split('\n').filter(line => /^\d+\.\s/.test(line));
    }
};

export const evaluateAnswer = async (question: string, answer: string, textbookName: string, modelConfig: ModelConfig): Promise<string> => {
    const prompt = `Question: "${question}"
    User's Answer: "${answer}"
    
    Is the user's answer correct? Start your response with the single word "Correct" or "Incorrect". Then, provide a brief but clear explanation for why the answer is right or wrong.`;
    const fullPrompt = addContextToPrompt(prompt, textbookName);
    const response = await generateContent({ 
        contents: fullPrompt,
        config: {
            tools: [{googleSearch: {}}],
        }
    }, modelConfig);
    return response.text;
};

export const generateFlashcards = async (textbookName: string, topic: string, modelConfig: ModelConfig): Promise<{term: string, definition: string}[]> => {
    const prompt = `Generate a list of 5 to 10 key terms and their definitions related to the topic: "${topic}". The response must be a valid JSON object with a single key "flashcards" which is an array of objects, where each object has "term" and "definition" keys. Example: {"flashcards": [{"term": "Biology", "definition": "The study of life."}]}`;
    const fullPrompt = addContextToPrompt(prompt, textbookName);
    const response = await generateContent({
        contents: fullPrompt,
        config: {
            tools: [{googleSearch: {}}],
        }
    }, modelConfig);
    try {
        const jsonText = response.text.match(/```json\n([\s\S]*?)\n```/)?.[1] || response.text;
        const json = JSON.parse(jsonText);
        return json.flashcards || [];
    } catch (e) {
        console.error("Failed to parse flashcards JSON:", e);
        return [];
    }
};

export const summarizeTopic = async (textbookName: string, topic: string, isEli5Mode: boolean, modelConfig: ModelConfig): Promise<string> => {
    let prompt = `Provide a concise summary of the following topic: "${topic}".`;
    if (isEli5Mode) {
        prompt += " Explain it in a super simple way, like I'm 5 years old.";
    }
    const fullPrompt = addContextToPrompt(prompt, textbookName);
    const response = await generateContent({ 
        contents: fullPrompt,
        config: {
            tools: [{googleSearch: {}}],
        }
    }, modelConfig);
    return response.text;
};

export const getAnswers = async (textbookName: string, questions: string, modelConfig: ModelConfig): Promise<string> => {
    const prompt = `Provide detailed answers for the following questions:\n\n${questions}`;
    const fullPrompt = addContextToPrompt(prompt, textbookName);
    const response = await generateContent({ 
        contents: fullPrompt,
        config: {
            tools: [{googleSearch: {}}],
        }
    }, modelConfig);
    return response.text;
};

export const generateQuestionPaper = async (textbookName: string, syllabus: string, modelConfig: ModelConfig): Promise<string> => {
    const prompt = `Based on the syllabus "${syllabus}", generate a comprehensive question paper. Include a mix of short-answer, long-answer, and multiple-choice questions. Format it like a real exam paper.`;
    const fullPrompt = addContextToPrompt(prompt, textbookName);
    const response = await generateContent({ 
        contents: fullPrompt,
        config: {
            tools: [{googleSearch: {}}],
        }
    }, modelConfig);
    return response.text;
};

export const startTutorChat = (textbookName: string, modelConfig: ModelConfig): Chat => {
    const systemInstruction = `You are a friendly and knowledgeable AI Tutor. Your area of expertise is the textbook "${textbookName}". Your goal is to help the user understand concepts, answer their questions, and guide them in their studies using Google Search to find relevant information when needed. Be encouraging and clear in your explanations.`;

    const dynamicConfig: any = { 
        systemInstruction,
        tools: [{googleSearch: {}}]
    };

    if (modelConfig === 'fastest') {
        dynamicConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    return ai.chats.create({
        model: MODEL_NAME,
        config: dynamicConfig,
    });
};
