terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # -----------------------------------------------------------------------
  # Backend de estado remoto (deshabilitado por ahora — ver
  # docs/deployment/terraform-infraestructura.md, sección "Backend de
  # estado"). Mientras no exista una cuenta AWS designada para el proyecto
  # y no se aplique infrastructure/terraform/bootstrap, Terraform usa el
  # backend local por defecto (estado en .terraform/terraform.tfstate,
  # ignorado por git — ver .gitignore). NO se debe commitear ese archivo.
  #
  # Plan de migración a backend remoto:
  #   1. Aplicar manualmente infrastructure/terraform/bootstrap (una sola
  #      vez, con credenciales elevadas) para crear el bucket S3 + tabla
  #      DynamoDB de lock.
  #   2. Descomentar el bloque backend "s3" de abajo con los nombres reales
  #      (outputs de bootstrap).
  #   3. Ejecutar `terraform init -migrate-state` en este directorio.
  #
  # backend "s3" {
  #   bucket         = "activa-club-terraform-state"   # output.state_bucket_name de bootstrap
  #   key            = "dev/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "activa-club-terraform-locks"   # output.state_lock_table_name de bootstrap
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
