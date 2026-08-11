output "resource_ids" {
  description = "resourceId de los diez recursos cargados (para referencia/depuración; ningún otro módulo lo consume hoy)."
  value       = keys(local.catalog)
}
