output "web_bucket_name" {
  description = "Nombre del bucket privado que contiene el build del SPA."
  value       = aws_s3_bucket.web.id
}

output "cloudfront_distribution_id" {
  description = "ID de la distribución CloudFront, para invalidar caché tras cada despliegue del frontend."
  value       = aws_cloudfront_distribution.web.id
}

output "cloudfront_domain_name" {
  description = "Dominio *.cloudfront.net por el que se sirve el SPA."
  value       = aws_cloudfront_distribution.web.domain_name
}
