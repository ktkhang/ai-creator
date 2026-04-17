import { VcpmcRecord } from '../../shared/types';

/** Structured search criteria extracted from user's free-form input */
export interface SearchCriteria {
  description: string;
  /** Thematic keywords (tình yêu, mùa hè, quốc khánh...) */
  vcpmcKeywords: string[];
  /** Famous artist/composer names relevant to the theme */
  artistKeywords: string[];
  includeGenres: string[];
  excludeGenres: string[];
  targetAudience: string;
  eraPreference: string;
}

/** A curated song output from the AI agent */
export interface CuratedSong {
  vcpmcTitle: string;
  vcpmcAuthor: string;
  relevanceScore: number; // 1-10
  reason: string;
  genre?: string;
  releaseYear?: number;
}

/**
 * Common interface for all AI providers (Claude, Gemini, …).
 * The orchestrator only speaks to this interface.
 */
export interface IAiAgent {
  extractCriteria(userInput: string): Promise<SearchCriteria>;
  enrichAndCurate(
    records: VcpmcRecord[],
    criteria: SearchCriteria,
    userInput: string,
    minScore?: number
  ): Promise<CuratedSong[]>;
  generateMoreKeywords(
    userInput: string,
    usedKeywords: string[],
    currentCount: number,
    targetCount: number
  ): Promise<string[]>;
}
