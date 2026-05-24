import { CanonicalRecord, PluginPrefs } from './types';
import { ClassificationResult } from './classifier';

export interface LLMProvider {
    id: string;
    name: string;
}

export class LLMClient {
    constructor(private getPrefs: () => PluginPrefs) {}

    async adjudicate(item: any, candidates: CanonicalRecord[]): Promise<ClassificationResult | null> {
        const prefs = this.getPrefs();
        if (!prefs['behavior.use_llm']) return null;

        let apiKey = '';
        let endpoint = '';
        let model = '';
        let provider = '';

        if (prefs['llm.openai.key']) {
            provider = 'openai';
            apiKey = prefs['llm.openai.key'];
            endpoint = 'https://api.openai.com/v1/chat/completions';
            model = 'gpt-4o-mini';
        } else if (prefs['llm.anthropic.key']) {
             provider = 'anthropic';
             apiKey = prefs['llm.anthropic.key'];
             endpoint = 'https://api.anthropic.com/v1/messages';
             model = 'claude-3-haiku-20240307';
        } else if (prefs['llm.gemini.key']) {
             provider = 'gemini';
             apiKey = prefs['llm.gemini.key'];
             endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        } else {
            return null; // No LLM configured
        }

        const prompt = this.buildPrompt(item, candidates);
        
        try {
            const responseText = await this.callAPI(provider, endpoint, apiKey, model, prompt);
            
            // LLM Response must decide if any candidate is actually the same work
            if (responseText.toLowerCase().includes('match: yes')) {
                return {
                    status: 'VERIFIED_WITH_CORRECTIONS',
                    primaryMatches: 0, // LLM doesn't increase primary matches
                    corrections: [], // Simplification: we'd parse corrections from LLM here
                    diagnostic: 'Upgraded by LLM semantic adjudication.'
                };
            }
        } catch (e) {
            Zotero.debug(`LLM API failed: ${e}`);
        }

        return null; // LLM couldn't upgrade it
    }

    private buildPrompt(item: any, candidates: CanonicalRecord[]): string {
         const zTitle = item.getField('title');
         let prompt = `You are a strict academic metadata validator. Determine if the following Zotero item is the exact same work as any of the candidates provided. Account for preprints, translations, and version differences.\n\n`;
         prompt += `Zotero Item:\nTitle: ${zTitle}\n\nCandidates:\n`;
         candidates.forEach((c, i) => {
             prompt += `[${i}] Title: ${c.title}, Authors: ${c.authors.map(a => a.family).join(', ')}, Source: ${c.source}\n`;
         });
         prompt += `\nReply with exactly 'MATCH: YES' if a candidate matches, or 'MATCH: NO' if none match.`;
         return prompt;
    }

    private async callAPI(provider: string, endpoint: string, apiKey: string, model: string, prompt: string): Promise<string> {
        let headers: any = { 'Content-Type': 'application/json' };
        let body: any = {};

        if (provider === 'openai') {
            headers['Authorization'] = `Bearer ${apiKey}`;
            body = { model, messages: [{ role: 'user', content: prompt }] };
        } else if (provider === 'anthropic') {
             headers['x-api-key'] = apiKey;
             headers['anthropic-version'] = '2023-06-01';
             body = { model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] };
        } else if (provider === 'gemini') {
            body = { contents: [{ parts: [{ text: prompt }] }] };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) throw new Error('API Error');

        const data = await response.json();
        
        if (provider === 'openai') return data.choices[0].message.content;
        if (provider === 'anthropic') return data.content[0].text;
        if (provider === 'gemini') return data.candidates[0].content.parts[0].text;

        return '';
    }
}