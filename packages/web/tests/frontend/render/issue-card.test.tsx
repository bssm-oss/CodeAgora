import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { IssueCard } from '../../../src/frontend/components/IssueCard.js';

const baseProps = {
  issueTitle: 'Unhandled promise rejection',
  problem: 'The async function lacks error handling.',
  evidence: ['Line 42: await fetchData()', 'No try/catch block present'],
  severity: 'CRITICAL' as const,
  suggestion: 'Wrap the call in a try/catch block.',
  filePath: 'src/api/client.ts',
  lineRange: [40, 50] as [number, number],
  reviewers: ['gpt-4o', 'claude-3'],
};

describe('IssueCard', () => {
  it('renders issue title and severity badge', () => {
    render(<IssueCard {...baseProps} />);
    expect(screen.getByText('Unhandled promise rejection')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('does not show body content when collapsed', () => {
    render(<IssueCard {...baseProps} />);
    expect(screen.queryByText('The async function lacks error handling.')).not.toBeInTheDocument();
    expect(screen.queryByText('Wrap the call in a try/catch block.')).not.toBeInTheDocument();
  });

  it('expands to show problem, evidence, and suggestion on click', () => {
    render(<IssueCard {...baseProps} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('The async function lacks error handling.')).toBeInTheDocument();
    expect(screen.getByText('Line 42: await fetchData()')).toBeInTheDocument();
    expect(screen.getByText('Wrap the call in a try/catch block.')).toBeInTheDocument();
  });

  it('collapses again on second click', () => {
    render(<IssueCard {...baseProps} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.queryByText('The async function lacks error handling.')).not.toBeInTheDocument();
  });

  it('shows reviewer tags when expanded', () => {
    render(<IssueCard {...baseProps} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('claude-3')).toBeInTheDocument();
  });

  it('shows confidence percentage when provided', () => {
    render(<IssueCard {...baseProps} confidence={0.85} />);
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('does not show confidence when not provided', () => {
    render(<IssueCard {...baseProps} />);
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });
});
