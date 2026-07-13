import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renderiza el inicio institucional en la ruta raíz', async () => {
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /tu club deportivo, ahora en tu bolsillo/i }),
    ).toBeInTheDocument();
  });
});
