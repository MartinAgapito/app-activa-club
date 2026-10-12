// Muestra de referencia de Drawer (US-063) para /_dev/design-system.

import { useState } from 'react';
import { Button, Card, CardHeader, Drawer, Input, Spinner, type DrawerSide } from '@activa-club/ui';

export function DrawerDemo() {
  const [side, setSide] = useState<DrawerSide | null>(null);
  const [saving, setSaving] = useState(false);

  function save() {
    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      setSide(null);
    }, 1500);
  }

  return (
    <Card>
      <CardHeader
        title="Panel lateral (drawer)"
        description="Detalle desde la derecha o menú desde la izquierda; la lista de fondo queda atenuada."
      />
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => setSide('right')}>
          Abrir detalle (derecha)
        </Button>
        <Button variant="secondary" onClick={() => setSide('left')}>
          Abrir menú (izquierda)
        </Button>
      </div>
      <Drawer
        open={side !== null}
        onOpenChange={(open) => {
          if (!open) setSide(null);
        }}
        side={side ?? 'right'}
        dismissible={!saving}
        title={side === 'left' ? 'Menú' : 'Detalle de la reserva'}
        description={side === 'left' ? undefined : 'Cancha de tenis 1 · sábado 10:00'}
        footer={
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setSide(null)}>
              Cerrar
            </Button>
            <Button isLoading={saving} onClick={save}>
              Guardar nota
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Nota" defaultValue="Traer pelotas nuevas" />
          {saving ? <Spinner /> : null}
          {Array.from({ length: 12 }, (_, i) => (
            <p key={i} className="text-ink-muted">
              Línea de contenido {i + 1} para comprobar el scroll interno con pie fijo.
            </p>
          ))}
        </div>
      </Drawer>
    </Card>
  );
}
