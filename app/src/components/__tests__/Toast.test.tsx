// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toast } from '../Toast';

describe('Toast', () => {
  it('zeigt keine "show"-Klasse ohne Nachricht', () => {
    const { container } = render(<Toast message={null} />);
    const toast = container.querySelector('#toast');
    expect(toast).not.toHaveClass('show');
  });

  it('zeigt die Nachricht und die "show"-Klasse, wenn eine Nachricht gesetzt ist', () => {
    render(<Toast message="Gespeichert" />);
    expect(screen.getByText('Gespeichert')).toBeInTheDocument();
    expect(screen.getByText('Gespeichert')).toHaveClass('show');
  });
});
