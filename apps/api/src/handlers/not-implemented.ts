// Handler placeholder compartido por los endpoints de EP-03 cuya historia de
// backend todavía no se implementó (US-020, US-023, US-024, US-025), pero
// cuya infraestructura ya existe en Terraform (US-019, PR #45).
//
// Necesario porque, a diferencia de PRs/`terraform plan` (donde
// `var.lambda_artifacts_dir == null` hace que `modules/endpoint` caiga en su
// propio stub 501 generado por Terraform, ver `data.archive_file.stub`),
// `deploy-dev.yml` siempre setea `TF_VAR_lambda_artifacts_dir`: en ese caso
// `local.lambda_zip_path[function_name]` en `environments/dev/main.tf`
// resuelve incondicionalmente a un `.zip` real esperado en disco para
// *cada* función declarada, sin excepción por función. Sin un zip real
// (aunque sea este placeholder) para cada `function_name` que Terraform ya
// declara, `terraform apply` real falla con "no such file or directory" al
// calcular el hash del paquete (`filebase64sha256`).
//
// Cada historia de backend reemplaza la entrada correspondiente en
// `scripts/package-lambdas.mjs` (HANDLERS) por su propio handler real
// cuando la implementa — este archivo deja de usarse función por función,
// no todas a la vez.

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

import { jsonResponse } from '../lib/http';
import { withHandler } from '../middleware/with-handler';

async function handleNotImplemented(
  _event: APIGatewayProxyEvent,
  _ctx: { requestId: string },
): Promise<APIGatewayProxyResult> {
  return jsonResponse(501, {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Endpoint aun no implementado (infraestructura US-019, logica pendiente).',
    },
  });
}

export const handler = withHandler<APIGatewayProxyEvent>('NOT_IMPLEMENTED', handleNotImplemented);
