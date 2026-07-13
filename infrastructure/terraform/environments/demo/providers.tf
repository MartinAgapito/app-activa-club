terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Backend de estado remoto (infrastructure/terraform/bootstrap aplicado el
  # 2026-07-13 — ver docs/deployment/terraform-infraestructura.md, sección
  # "Backend de estado"). Bucket compartido con dev; se separan por "key".
  backend "s3" {
    bucket         = "activa-club-terraform-state" # output.state_bucket_name de bootstrap
    key            = "demo/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "activa-club-terraform-locks" # output.state_lock_table_name de bootstrap
    encrypt        = true
  }
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
