# Catálogo de instalaciones del club (US-028, ADR-0010, modelo-dynamodb.md
# §3.7 "Resource"). Datos de infraestructura, no un seed de aplicación: los
# diez recursos fijos del club (RN-RES) se definen una única vez aquí y se
# instancian tanto desde environments/dev como desde environments/prd
# (module "resource_catalog" en cada uno), para que ambos ambientes no
# diverjan.
#
# Un aws_dynamodb_table_item por recurso (PK=RESOURCE#<resourceId>,
# SK=METADATA), con for_each sobre local.catalog en vez de diez bloques
# repetidos. Cada ítem lleva `lifecycle { ignore_changes = [item] }`: eso es
# lo que hace que Terraform CREE el ítem si falta (ambiente nuevo, o alguien
# lo borró a mano) y NUNCA lo sobrescriba una vez que existe. Sin eso, un
# `apply` posterior revertiría a los valores de este archivo cualquier
# edición de aforo/horario/estado que el administrador haya hecho en runtime
# vía `PATCH /resources/{resourceId}` (US-036, RN-ADM-04), rompiendo el
# criterio 2 de idempotencia de US-028.
#
# Quién manda sobre cada campo (detalle completo en ADR-0010 y en la propia
# historia US-028): `resourceId`/`type`/`name`/`blockMinutes`/
# `requiresApproval` los manda este archivo (cambiarlos exige forzar el
# reemplazo del ítem con `terraform apply -replace=...`, lo que también
# restablece los campos de runtime del recurso, deliberado: son reglas de
# negocio RN-RES-01/02). `capacity`/`opensAt`/`closesAt`/`resourceStatus`
# solo reciben aquí su valor INICIAL; a partir del primer `apply` el
# administrador es quien manda sobre ellos.
locals {
  catalog = {
    "futbol-1" = {
      type              = "FUTBOL"
      name              = "Cancha de fútbol 1"
      capacity          = 14
      block_minutes     = 90
      opens_at          = "06:00"
      closes_at         = "22:00"
      requires_approval = false
    }
    "futbol-2" = {
      type              = "FUTBOL"
      name              = "Cancha de fútbol 2"
      capacity          = 14
      block_minutes     = 90
      opens_at          = "06:00"
      closes_at         = "22:00"
      requires_approval = false
    }
    "tenis-1" = {
      type              = "TENIS"
      name              = "Cancha de tenis 1"
      capacity          = 4
      block_minutes     = 60
      opens_at          = "06:00"
      closes_at         = "22:00"
      requires_approval = false
    }
    "tenis-2" = {
      type              = "TENIS"
      name              = "Cancha de tenis 2"
      capacity          = 4
      block_minutes     = 60
      opens_at          = "06:00"
      closes_at         = "22:00"
      requires_approval = false
    }
    "padel-1" = {
      type              = "PADEL"
      name              = "Cancha de pádel 1"
      capacity          = 4
      block_minutes     = 90
      opens_at          = "06:00"
      closes_at         = "22:00"
      requires_approval = false
    }
    "padel-2" = {
      type              = "PADEL"
      name              = "Cancha de pádel 2"
      capacity          = 4
      block_minutes     = 90
      opens_at          = "06:00"
      closes_at         = "22:00"
      requires_approval = false
    }
    "piscina-1" = {
      type              = "PISCINA"
      name              = "Piscina"
      capacity          = 5
      block_minutes     = 120
      opens_at          = "08:00"
      closes_at         = "20:00"
      requires_approval = false
    }
    "parrilla-1" = {
      type              = "PARRILLA"
      name              = "Zona de parrillas 1"
      capacity          = 12
      block_minutes     = 300
      opens_at          = "10:00"
      closes_at         = "22:00"
      requires_approval = true
    }
    "parrilla-2" = {
      type              = "PARRILLA"
      name              = "Zona de parrillas 2"
      capacity          = 12
      block_minutes     = 300
      opens_at          = "10:00"
      closes_at         = "22:00"
      requires_approval = true
    }
    "salon-social" = {
      type              = "SALON_SOCIAL"
      name              = "Salón social"
      capacity          = 30
      block_minutes     = 240
      opens_at          = "10:00"
      closes_at         = "22:00"
      requires_approval = true
    }
  }

  # Marca de tiempo fija (no `timestamp()`): un valor que cambiara en cada
  # `plan` forzaría diff en `createdAt`/`updatedAt` incluso con
  # `ignore_changes = [item]` en la primera creación de cada ambiente nuevo.
  # Es solo el valor inicial: US-036 no expone estos campos por
  # `PATCH /resources/{resourceId}` (el contrato solo permite editar
  # capacity/opensAt/closesAt/resourceStatus), así que no hace falta que
  # reflejen la fecha real de creación del ítem.
  seed_timestamp = "2026-08-09T00:00:00.000Z"
}

resource "aws_dynamodb_table_item" "resource" {
  for_each = local.catalog

  table_name = var.table_name
  hash_key   = "PK"
  range_key  = "SK"

  item = jsonencode({
    PK               = { S = "RESOURCE#${each.key}" }
    SK               = { S = "METADATA" }
    resourceId       = { S = each.key }
    type             = { S = each.value.type }
    name             = { S = each.value.name }
    capacity         = { N = tostring(each.value.capacity) }
    blockMinutes     = { N = tostring(each.value.block_minutes) }
    opensAt          = { S = each.value.opens_at }
    closesAt         = { S = each.value.closes_at }
    requiresApproval = { BOOL = each.value.requires_approval }
    resourceStatus   = { S = "AVAILABLE" }
    createdAt        = { S = local.seed_timestamp }
    updatedAt        = { S = local.seed_timestamp }
  })

  lifecycle {
    # Terraform crea el ítem si falta y nunca lo sobrescribe después:
    # criterio 2 de US-028 (idempotencia) y mecánica central de ADR-0010.
    ignore_changes = [item]
  }
}
