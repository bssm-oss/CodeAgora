/**
 * Family Classifier Tests
 */

import { describe, it, expect } from 'vitest';
import { extractFamily, isReasoningModel, getDistilledBaseFamily } from '@codeagora/core/l0/family-classifier.js';

describe('FamilyClassifier', () => {
  describe('extractFamily', () => {
    it('should classify deepseek models', () => {
      expect(extractFamily('deepseek-chat')).toBe('deepseek');
      expect(extractFamily('deepseek-r1')).toBe('deepseek');
      expect(extractFamily('z-ai/deepseek-v3')).toBe('deepseek');
    });

    it('should classify qwen models', () => {
      expect(extractFamily('qwen-2.5-coder-32b-instruct')).toBe('qwen');
      expect(extractFamily('qwen-2.5-32b-instruct')).toBe('qwen');
      expect(extractFamily('qwen-qwq-32b')).toBe('qwen');
    });

    it('should classify llama models', () => {
      expect(extractFamily('llama-3.3-70b-versatile')).toBe('llama');
      expect(extractFamily('meta-llama/llama-4-scout-17b')).toBe('llama');
    });

    it('should classify mistral models', () => {
      expect(extractFamily('mistral-saba-24b')).toBe('mistral');
      expect(extractFamily('mixtral-8x7b')).toBe('mistral');
      expect(extractFamily('codestral-latest')).toBe('mistral');
    });

    it('should classify gemma models', () => {
      expect(extractFamily('gemma2-9b-it')).toBe('gemma');
    });

    it('should classify phi models', () => {
      expect(extractFamily('phi-4')).toBe('phi');
    });

    it('should classify glm models', () => {
      expect(extractFamily('z-ai/glm5')).toBe('glm');
      expect(extractFamily('glm-4.7')).toBe('glm');
    });

    it('should classify kimi as moonshot', () => {
      expect(extractFamily('moonshotai/kimi-k2.5')).toBe('moonshot');
    });

    it('should return unknown for unrecognized models', () => {
      expect(extractFamily('allam-2-7b')).toBe('unknown');
      expect(extractFamily('some-random-model')).toBe('unknown');
    });

    it('should classify distilled models by base family', () => {
      expect(extractFamily('deepseek-r1-distill-llama-70b')).toBe('llama');
      expect(extractFamily('deepseek-r1-distill-qwen-32b')).toBe('qwen');
    });
  });

  describe('isReasoningModel', () => {
    it('should detect R1 models as reasoning', () => {
      expect(isReasoningModel('deepseek-r1')).toBe(true);
      expect(isReasoningModel('deepseek-r1-distill-llama-70b')).toBe(true);
    });

    it('should detect QwQ as reasoning', () => {
      expect(isReasoningModel('qwen-qwq-32b')).toBe(true);
    });

    it('should detect thinking models as reasoning', () => {
      expect(isReasoningModel('some-thinking-model')).toBe(true);
    });

    it('should return false for non-reasoning models', () => {
      expect(isReasoningModel('deepseek-chat')).toBe(false);
      expect(isReasoningModel('llama-3.3-70b-versatile')).toBe(false);
      expect(isReasoningModel('qwen-2.5-coder-32b-instruct')).toBe(false);
    });
  });

  describe('getDistilledBaseFamily', () => {
    it('should extract base family from distilled models', () => {
      expect(getDistilledBaseFamily('deepseek-r1-distill-llama-70b')).toBe('llama');
      expect(getDistilledBaseFamily('deepseek-r1-distill-qwen-32b')).toBe('qwen');
    });

    it('should return null for non-distilled models', () => {
      expect(getDistilledBaseFamily('deepseek-r1')).toBeNull();
      expect(getDistilledBaseFamily('llama-3.3-70b')).toBeNull();
    });
  });
});
