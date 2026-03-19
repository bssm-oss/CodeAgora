import React from 'react';
import { render, screen } from '@testing-library/react';
import { VerdictBanner } from '../../../src/frontend/components/VerdictBanner.js';

describe('VerdictBanner', () => {
  it('renders ACCEPT decision with correct label and class', () => {
    const { container } = render(
      <VerdictBanner decision="ACCEPT" reasoning="The code looks good." />
    );
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('verdict-banner--accept');
  });

  it('renders REJECT decision with reasoning', () => {
    const { container } = render(
      <VerdictBanner decision="REJECT" reasoning="There are critical issues." />
    );
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText('There are critical issues.')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('verdict-banner--reject');
  });

  it('renders NEEDS_HUMAN with questions list', () => {
    const questions = ['Is this intentional?', 'Have you tested edge cases?'];
    render(
      <VerdictBanner
        decision="NEEDS_HUMAN"
        reasoning="Manual review required."
        questionsForHuman={questions}
      />
    );
    expect(screen.getByText('Needs Human Review')).toBeInTheDocument();
    expect(screen.getByText('Is this intentional?')).toBeInTheDocument();
    expect(screen.getByText('Have you tested edge cases?')).toBeInTheDocument();
    expect(screen.getByText('Questions for Human')).toBeInTheDocument();
  });

  it('does not render questions section when questionsForHuman is empty', () => {
    render(
      <VerdictBanner decision="NEEDS_HUMAN" reasoning="Review needed." questionsForHuman={[]} />
    );
    expect(screen.queryByText('Questions for Human')).not.toBeInTheDocument();
  });

  it('does not render questions section when questionsForHuman is omitted', () => {
    render(<VerdictBanner decision="ACCEPT" reasoning="Looks good." />);
    expect(screen.queryByText('Questions for Human')).not.toBeInTheDocument();
  });

  it('always renders reasoning text', () => {
    render(<VerdictBanner decision="REJECT" reasoning="Needs more work." />);
    expect(screen.getByText('Needs more work.')).toBeInTheDocument();
  });
});
