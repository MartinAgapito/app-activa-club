import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renderiza el texto de estado', () => {
    render(<Badge variant="danger">Con deuda</Badge>);
    expect(screen.getByText('Con deuda')).toBeInTheDocument();
  });
});
