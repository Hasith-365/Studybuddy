export enum AppState {
  HOME,
  MENU,
  STUDY_PLAN,
  QUESTION_PAPER,
  QUIZ_SYLLABUS,
  GRAMMAR_OPTIONS,
  QUIZ,
  QUIZ_RESULTS,
  SUMMARY,
  ANSWERS,
  FLASHCARDS,
  AI_TUTOR,
}

export type ModelConfig = 'balanced' | 'fastest';

export interface FlashcardType {
  term: string;
  definition: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface IncorrectAnswer {
  question: string;
  userAnswer: string;
  correctAnswerExplanation: string;
}