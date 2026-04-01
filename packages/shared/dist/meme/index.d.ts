/**
 * Meme Mode (3.1)
 * Alternate text pools for badges, verdicts, and status messages.
 * Logic unchanged — presentation only.
 */
declare const VERDICT_POOL: Record<string, {
    en: string[];
    ko: string[];
}>;
declare const SEVERITY_MEME: Record<string, {
    en: {
        label: string;
        desc: string;
    };
    ko: {
        label: string;
        desc: string;
    };
}>;
declare const DISCUSSION_MEME: Record<string, {
    en: string;
    ko: string;
}>;
declare const CONFIDENCE_MEME: {
    high: {
        en: string;
        ko: string;
    };
    mid: {
        en: string;
        ko: string;
    };
    low: {
        en: string;
        ko: string;
    };
};
export declare function getMemeVerdict(decision: string, lang?: 'en' | 'ko'): string;
export declare function getMemeSeverity(severity: string, lang?: 'en' | 'ko'): {
    label: string;
    desc: string;
};
export declare function getMemeDiscussion(situation: string, lang?: 'en' | 'ko'): string;
export declare function getMemeConfidence(confidence: number, lang?: 'en' | 'ko'): string;
export { VERDICT_POOL, SEVERITY_MEME, DISCUSSION_MEME, CONFIDENCE_MEME };
//# sourceMappingURL=index.d.ts.map