import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';

export interface EligibilityAnswers {
  recent_illness: boolean;
  recent_travel_malaria: boolean;
  current_medications: string;
  tattoo_or_piercing_recent: boolean;
  pregnant_or_postpartum: boolean;
  recent_surgery: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  defer_days: number;
  reason: string;
  advice: string;
}

const FALLBACK: EligibilityResult = {
  eligible: true,
  defer_days: 0,
  reason: '',
  advice: 'Please consult staff at the donation center before donating.',
};

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

export async function checkDonorEligibility(
  answers: EligibilityAnswers
): Promise<EligibilityResult> {
  const c = getClient();
  if (!c) return FALLBACK;

  const prompt = `You are a blood donation eligibility screening assistant.
Based on these answers, determine if the person is eligible to donate blood today.

Answers:
- Recent illness (last 14 days): ${answers.recent_illness}
- Travel to malaria zone (last 12 months): ${answers.recent_travel_malaria}
- Current medications: ${answers.current_medications || 'none'}
- Tattoo/piercing in last 6 months: ${answers.tattoo_or_piercing_recent}
- Pregnant or postpartum (< 6 months): ${answers.pregnant_or_postpartum}
- Surgery in last 6 months: ${answers.recent_surgery}

Respond ONLY with valid JSON, no markdown, no preamble:
{
  "eligible": true|false,
  "defer_days": 0,
  "reason": "short reason if deferred",
  "advice": "one-sentence friendly advice for the user"
}`;

  try {
    const response = await c.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = response.content[0];
    if (block.type !== 'text') return FALLBACK;

    const text = block.text.trim();
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) return FALLBACK;

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    return {
      eligible: Boolean(parsed.eligible),
      defer_days: Number(parsed.defer_days) || 0,
      reason: String(parsed.reason ?? ''),
      advice: String(parsed.advice ?? FALLBACK.advice),
    };
  } catch (err) {
    console.error('[ai.service] eligibility check failed:', err);
    return FALLBACK;
  }
}
