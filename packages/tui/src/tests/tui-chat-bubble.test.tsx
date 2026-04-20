/**
 * ChatBubble TUI component tests
 */
import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatBubble } from '../components/ChatBubble.js';

afterEach(() => {
  cleanup();
});

describe('ChatBubble', () => {
  it('renders reviewerId and model', () => {
    const { lastFrame } = render(
      <ChatBubble
        reviewerId="r1"
        model="llama-3.3"
        stance="agree"
        message="This is a valid concern."
        isDevilsAdvocate={false}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('r1');
    expect(frame).toContain('llama-3.3');
  });

  it('renders agree stance with checkmark icon', () => {
    const { lastFrame } = render(
      <ChatBubble
        reviewerId="r1"
        model="gpt-4o"
        stance="agree"
        message="I agree with this finding."
        isDevilsAdvocate={false}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('AGREE');
    expect(frame).toContain('✅');
  });

  it('renders disagree stance with cross icon', () => {
    const { lastFrame } = render(
      <ChatBubble
        reviewerId="r2"
        model="claude"
        stance="disagree"
        message="The ORM sanitizes inputs here."
        isDevilsAdvocate={false}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('DISAGREE');
    expect(frame).toContain('❌');
  });

  it('renders message content', () => {
    const message = 'This injection pattern is not exploitable here.';
    const { lastFrame } = render(
      <ChatBubble
        reviewerId="r3"
        model="gemini"
        stance="disagree"
        message={message}
        isDevilsAdvocate={false}
      />,
    );
    expect(lastFrame() ?? '').toContain('not exploitable');
  });

  it("renders Devil's Advocate label when isDevilsAdvocate is true", () => {
    const { lastFrame } = render(
      <ChatBubble
        reviewerId="r4"
        model="llama"
        stance="disagree"
        message="Playing devil's advocate here."
        isDevilsAdvocate={true}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain("Devil's Advocate");
  });
});
