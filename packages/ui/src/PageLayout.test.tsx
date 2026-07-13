import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageLayout, PageHeader } from './PageLayout';

describe('PageLayout', () => {
  it('renderiza encabezado, contenido y pie', () => {
    render(
      <PageLayout header={<div>Nav</div>} footer={<div>Pie</div>}>
        <PageHeader title="Reservas" description="Consulta tus reservas" />
        <p>Contenido</p>
      </PageLayout>,
    );

    expect(screen.getByText('Nav')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reservas' })).toBeInTheDocument();
    expect(screen.getByText('Contenido')).toBeInTheDocument();
    expect(screen.getByText('Pie')).toBeInTheDocument();
  });
});
