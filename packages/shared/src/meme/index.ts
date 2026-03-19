/**
 * Meme Mode (3.1)
 * Alternate text pools for badges, verdicts, and status messages.
 * Logic unchanged — presentation only.
 */

// ============================================================================
// Random picker
// ============================================================================

function pick<T>(pool: T[]): T {
  if (pool.length === 0) throw new Error('Cannot pick from empty pool');
  return pool[Math.floor(Math.random() * pool.length)];
}

// ============================================================================
// Verdict Messages
// ============================================================================

const VERDICT_POOL: Record<string, { en: string[]; ko: string[] }> = {
  ACCEPT: {
    en: [
      'LGTM ship it \uD83D\uDE80',
      'The mass has been prayed. Deploy in peace.',
      'You may pass. \uD83E\uDDD9',
      'Clean as a whistle. Chef\'s kiss.',
      'No notes. Absolutely flawless. (I\'m lying but it\'s fine)',
    ],
    ko: [
      'LGTM \uD83D\uDE80 배포하세요',
      '이상 무. 배포 허가.',
      '통과! \uD83E\uDDD9',
      '깔끔하네요. 쉐프 키스.',
      '할 말 없음. 완벽. (거짓말이지만 괜찮음)',
    ],
  },
  REJECT: {
    en: [
      'This is fine. \uD83D\uDD25 (Nothing is fine.)',
      'git push --force-with-sadness',
      'This PR has more red flags than a Soviet parade.',
      'Have you tried turning it off and never turning it back on?',
      'I showed this to 5 AIs and we all started crying.',
    ],
    ko: [
      '괜찮아요 \uD83D\uDD25 (괜찮지 않아요)',
      'git push --force-with-sadness',
      '이 PR에 빨간불이 소련 퍼레이드보다 많아요.',
      '껐다가 다시 안 켜보셨어요?',
      'AI 5명한테 보여줬는데 다 울었어요.',
    ],
  },
  NEEDS_HUMAN: {
    en: [
      'Above my pay grade. \uD83E\uDD37',
      '404: Consensus Not Found.',
      'The AIs have spoken... and they said "idk man".',
      'We need an adult.',
      'Even GPT-4o is confused.',
    ],
    ko: [
      '제 연봉으론 판단 불가 \uD83E\uDD37',
      '404: 합의 못 찾음.',
      'AI들이 말했어요... "몰?루"',
      '어른이 필요해요.',
      'GPT-4o도 헷갈려해요.',
    ],
  },
};

// ============================================================================
// Severity Badges
// ============================================================================

const SEVERITY_MEME: Record<string, { en: { label: string; desc: string }; ko: { label: string; desc: string } }> = {
  HARSHLY_CRITICAL: {
    en: { label: 'DEFCON 1', desc: 'DELETE THIS' },
    ko: { label: 'DEFCON 1', desc: '당장 삭제해' },
  },
  CRITICAL: {
    en: { label: 'SIR', desc: 'Sir, this is a production server' },
    ko: { label: 'SIR', desc: '여기 프로덕션인데요' },
  },
  WARNING: {
    en: { label: 'SUS', desc: "I'm not saying it's wrong, but..." },
    ko: { label: 'SUS', desc: '틀렸다는 건 아닌데...' },
  },
  SUGGESTION: {
    en: { label: 'WELL ACTUALLY', desc: 'Not to be that guy, but...' },
    ko: { label: 'WELL ACTUALLY', desc: '그건 아닌데...' },
  },
};

// ============================================================================
// Discussion Events
// ============================================================================

const DISCUSSION_MEME: Record<string, { en: string; ko: string }> = {
  all_agree: { en: 'The Council has spoken', ko: 'AI 회의 결과 만장일치' },
  all_disagree: { en: "We don't do that here", ko: '여기선 안 그래요' },
  majority_pass: { en: 'Democracy has prevailed (barely)', ko: '민주주의 승리 (간신히)' },
  majority_reject: { en: 'Skill issue', ko: '실력 이슈' },
  tie_forced: { en: 'Civil War — moderator pulled rank', ko: '내전 — 모더레이터가 결정' },
  devil_flips: { en: 'Character development arc', ko: '캐릭터 성장 아크' },
  devil_holds: { en: 'Even the devil agrees this is bad', ko: '악마도 이건 나쁘다고 함' },
};

// ============================================================================
// Confidence Badges
// ============================================================================

const CONFIDENCE_MEME = {
  high: { en: "we're pretty sure about this one", ko: '이건 거의 확실' },
  mid: { en: 'trust me bro', ko: 'ㄹㅇㅋㅋ 믿어봐' },
  low: { en: 'vibes-based analysis', ko: '감으로 찾음' },
};

// ============================================================================
// Public API
// ============================================================================

export function getMemeVerdict(decision: string, lang: 'en' | 'ko' = 'en'): string {
  const pool = VERDICT_POOL[decision]?.[lang] ?? VERDICT_POOL[decision]?.en;
  return pool ? pick(pool) : decision;
}

export function getMemeSeverity(severity: string, lang: 'en' | 'ko' = 'en'): { label: string; desc: string } {
  const meme = SEVERITY_MEME[severity];
  if (!meme) return { label: severity, desc: '' };
  return lang === 'ko' ? meme.ko : meme.en;
}

export function getMemeDiscussion(situation: string, lang: 'en' | 'ko' = 'en'): string {
  const meme = DISCUSSION_MEME[situation];
  if (!meme) return situation;
  return lang === 'ko' ? meme.ko : meme.en;
}

export function getMemeConfidence(confidence: number, lang: 'en' | 'ko' = 'en'): string {
  const tier = confidence >= 80 ? 'high' : confidence >= 40 ? 'mid' : 'low';
  return lang === 'ko' ? CONFIDENCE_MEME[tier].ko : CONFIDENCE_MEME[tier].en;
}

export { VERDICT_POOL, SEVERITY_MEME, DISCUSSION_MEME, CONFIDENCE_MEME };
