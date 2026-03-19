/**
 * Pipeline DSL Parser Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parsePipelineDsl,
  serializePipelineDsl,
  getDefaultPipelineDefinition,
} from '@codeagora/core/pipeline/dsl-parser.js';

describe('parsePipelineDsl', () => {
  // 1. 유효한 YAML → 성공
  it('유효한 YAML → success:true, definition 반환', () => {
    const yaml = `
name: my-pipeline
version: "1.0"
stages:
  - name: review
    type: parallel-reviewers
  - name: moderate
    type: discussion
  - name: verdict
    type: head-verdict
`;
    const result = parsePipelineDsl(yaml);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.definition).toBeDefined();
    expect(result.definition!.name).toBe('my-pipeline');
    expect(result.definition!.version).toBe('1.0');
    expect(result.definition!.stages).toHaveLength(3);
    expect(result.definition!.stages[0].name).toBe('review');
    expect(result.definition!.stages[0].type).toBe('parallel-reviewers');
  });

  // 2. name 누락 → errors
  it('name 누락 → success:false, errors에 메시지 포함', () => {
    const yaml = `
version: "1.0"
stages:
  - name: review
    type: parallel-reviewers
`;
    const result = parsePipelineDsl(yaml);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('name'))).toBe(true);
  });

  // 3. version 누락 → errors
  it('version 누락 → success:false, errors에 메시지 포함', () => {
    const yaml = `
name: my-pipeline
stages:
  - name: review
    type: parallel-reviewers
`;
    const result = parsePipelineDsl(yaml);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('version'))).toBe(true);
  });

  // 4. stages 비어있음 → errors
  it('stages 빈 배열 → success:false, errors에 메시지 포함', () => {
    const yaml = `
name: my-pipeline
version: "1.0"
stages: []
`;
    const result = parsePipelineDsl(yaml);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('stage'))).toBe(true);
  });

  // 5. stages 필드 자체 누락 → errors
  it('stages 필드 누락 → success:false', () => {
    const yaml = `
name: my-pipeline
version: "1.0"
`;
    const result = parsePipelineDsl(yaml);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('stages'))).toBe(true);
  });

  // 6. 잘못된 stage type → errors
  it('잘못된 stage type → success:false, errors에 type 관련 메시지', () => {
    const yaml = `
name: my-pipeline
version: "1.0"
stages:
  - name: review
    type: invalid-type
`;
    const result = parsePipelineDsl(yaml);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('invalid-type') || e.includes('type'))).toBe(true);
  });

  // 7. 잘못된 onError → errors
  it('잘못된 onError 값 → success:false', () => {
    const yaml = `
name: my-pipeline
version: "1.0"
stages:
  - name: review
    type: parallel-reviewers
    onError: explode
`;
    const result = parsePipelineDsl(yaml);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('onError') || e.includes('explode'))).toBe(true);
  });

  // 8. 유효한 onError 값들
  it('유효한 onError 값 (skip, retry, abort) → success:true', () => {
    for (const onError of ['skip', 'retry', 'abort']) {
      const yaml = `
name: my-pipeline
version: "1.0"
stages:
  - name: review
    type: parallel-reviewers
    onError: ${onError}
`;
      const result = parsePipelineDsl(yaml);
      expect(result.success).toBe(true);
      expect(result.definition!.stages[0].onError).toBe(onError);
    }
  });

  // 9. 중복 stage name → errors
  it('중복 stage name → success:false, errors에 duplicate 메시지', () => {
    const yaml = `
name: my-pipeline
version: "1.0"
stages:
  - name: review
    type: parallel-reviewers
  - name: review
    type: discussion
`;
    const result = parsePipelineDsl(yaml);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('duplicate'))).toBe(true);
  });

  // 10. retries 음수 → errors
  it('retries 음수 → success:false', () => {
    const yaml = `
name: my-pipeline
version: "1.0"
stages:
  - name: review
    type: parallel-reviewers
    retries: -1
`;
    const result = parsePipelineDsl(yaml);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('retries'))).toBe(true);
  });

  // 11. retries 0 → errors (양수만 허용)
  it('retries 0 → success:false', () => {
    const yaml = `
name: my-pipeline
version: "1.0"
stages:
  - name: review
    type: parallel-reviewers
    retries: 0
`;
    const result = parsePipelineDsl(yaml);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('retries'))).toBe(true);
  });

  // 12. retries 양수 → 성공
  it('retries 양수 정수 → success:true, retries 값 보존', () => {
    const yaml = `
name: my-pipeline
version: "1.0"
stages:
  - name: review
    type: parallel-reviewers
    retries: 3
`;
    const result = parsePipelineDsl(yaml);
    expect(result.success).toBe(true);
    expect(result.definition!.stages[0].retries).toBe(3);
  });

  // 13. 잘못된 YAML → errors
  it('잘못된 YAML 문자열 → success:false, YAML parse error', () => {
    const yaml = `
name: my-pipeline
version: "1.0"
stages:
  - name: review
    type: [unclosed bracket
`;
    const result = parsePipelineDsl(yaml);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('yaml'))).toBe(true);
  });

  // 14. config 옵션 파싱
  it('stage config 옵션 파싱 → definition에 포함', () => {
    const yaml = `
name: my-pipeline
version: "1.0"
stages:
  - name: review
    type: parallel-reviewers
    config:
      timeout: 30
      maxReviewers: 5
      label: fast
`;
    const result = parsePipelineDsl(yaml);
    expect(result.success).toBe(true);
    const stage = result.definition!.stages[0];
    expect(stage.config).toBeDefined();
    expect(stage.config!['timeout']).toBe(30);
    expect(stage.config!['maxReviewers']).toBe(5);
    expect(stage.config!['label']).toBe('fast');
  });

  // 15. skipIf 옵션 파싱
  it('skipIf 문자열 옵션 파싱 → definition에 포함', () => {
    const yaml = `
name: my-pipeline
version: "1.0"
stages:
  - name: review
    type: parallel-reviewers
    skipIf: "env.CI == 'false'"
`;
    const result = parsePipelineDsl(yaml);
    expect(result.success).toBe(true);
    expect(result.definition!.stages[0].skipIf).toBe("env.CI == 'false'");
  });

  // 16. custom stage type → 성공
  it('custom stage type → success:true', () => {
    const yaml = `
name: my-pipeline
version: "1.0"
stages:
  - name: custom-step
    type: custom
    config:
      handler: my-handler
`;
    const result = parsePipelineDsl(yaml);
    expect(result.success).toBe(true);
    expect(result.definition!.stages[0].type).toBe('custom');
  });
});

describe('serializePipelineDsl', () => {
  // 17. 왕복 테스트 (parse → serialize → parse)
  it('왕복 테스트: parse → serialize → parse 결과 동일', () => {
    const yaml = `
name: roundtrip-pipeline
version: "2.0"
stages:
  - name: review
    type: parallel-reviewers
    retries: 2
    onError: skip
  - name: moderate
    type: discussion
  - name: verdict
    type: head-verdict
`;
    const first = parsePipelineDsl(yaml);
    expect(first.success).toBe(true);

    const serialized = serializePipelineDsl(first.definition!);
    expect(typeof serialized).toBe('string');
    expect(serialized.length).toBeGreaterThan(0);

    const second = parsePipelineDsl(serialized);
    expect(second.success).toBe(true);
    expect(second.definition!.name).toBe(first.definition!.name);
    expect(second.definition!.version).toBe(first.definition!.version);
    expect(second.definition!.stages).toHaveLength(first.definition!.stages.length);
    expect(second.definition!.stages[0].name).toBe('review');
    expect(second.definition!.stages[0].retries).toBe(2);
    expect(second.definition!.stages[0].onError).toBe('skip');
  });
});

describe('getDefaultPipelineDefinition', () => {
  // 18. 3단계 (review, moderate, verdict)
  it('기본 파이프라인: 3단계 (review, moderate, verdict)', () => {
    const def = getDefaultPipelineDefinition();
    expect(def.name).toBe('default');
    expect(def.stages).toHaveLength(3);
    expect(def.stages[0].name).toBe('review');
    expect(def.stages[0].type).toBe('parallel-reviewers');
    expect(def.stages[1].name).toBe('moderate');
    expect(def.stages[1].type).toBe('discussion');
    expect(def.stages[2].name).toBe('verdict');
    expect(def.stages[2].type).toBe('head-verdict');
  });

  // 19. 기본 파이프라인 → 직렬화 → 파싱 성공
  it('기본 파이프라인 직렬화 후 파싱 성공', () => {
    const def = getDefaultPipelineDefinition();
    const yaml = serializePipelineDsl(def);
    const result = parsePipelineDsl(yaml);
    expect(result.success).toBe(true);
    expect(result.definition!.stages).toHaveLength(3);
  });
});
